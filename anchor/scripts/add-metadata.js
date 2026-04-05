/**
 * add-metadata.js  (raw Borsh, no Anchor Program object)
 *
 * Creates SPL Token Metadata (name, symbol) for all v3 property mints
 * by calling the on-chain createPropertyMetadata instruction directly.
 *
 * Usage: node anchor/scripts/add-metadata.js
 */
const { Connection, Keypair, PublicKey, SystemProgram,
        Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const fs   = require("fs");
const path = require("path");

// ── Constants ─────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
const MPL_METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// sha256("global:create_property_metadata")[0..8]
// Run: node -e "const c=require('crypto');console.log([...c.createHash('sha256').update('global:create_property_metadata').digest()].slice(0,8))"
// Anchor discriminator for create_property_metadata:
const DISCRIMINATOR = Buffer.from([204, 97, 150, 206, 169, 15, 73, 250]);

const PROPERTIES = [
  { id: "nyc-penthouse-001-v3",       name: "Manhattan Penthouse",         symbol: "MNHTN", mint: "5VrAqKk1L46wxxWEE4AEfNYZcBvitWnHJRxbPVshdKYu" },
  { id: "miami-villa-002-v3",         name: "Miami Beach Villa",            symbol: "MIAMI", mint: "2iEwrc1zaocZJQudCx3kNWtZG8f8tJZqwCprXfiba95o" },
  { id: "dubai-tower-003-v3",         name: "Dubai Marina Tower",           symbol: "DUBAI", mint: "HotTD9XK2vfZoVePeGY1piw593MtXpyGzXGsys7UvJr2" },
  { id: "london-flat-004-v3",         name: "Mayfair Georgian Townhouse",   symbol: "MAYFR", mint: "BdYjMXyZj22L587GUHj4giJFznv4YSqt6Q5uiaScTuj1" },
  { id: "singapore-condo-005-v3",     name: "Marina Bay Residences",        symbol: "MRBAY", mint: "AmpGg552Zubx21wjBrcw6FjAAo2QJTg2NjsKLa6XoycD" },
  { id: "tokyo-apt-006-v3",           name: "Shibuya Luxury Apartments",    symbol: "SHBYA", mint: "HKfJwqtZzrCgGJCzTtFbHVhsMYexD1G1K6mqz4Asvdfn" },
  { id: "barcelona-penthouse-007-v3", name: "Barcelona Sea View Penthouse", symbol: "BRCLN", mint: "CE6cit8w5pLeeQ7NuaNRVVrhkyQd2LWN4m7cj25Zypx7" },
];

// ── Borsh helpers ─────────────────────────────────────────────────────────────
function borshString(str) {
  const buf = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

/**
 * Encodes (name, symbol, uri) for createPropertyMetadata.
 * Instruction layout after 8-byte discriminator:
 *   string name  (4-byte LE length prefix + bytes)
 *   string symbol
 *   string uri
 */
function encodeArgs(name, symbol, uri) {
  return Buffer.concat([
    DISCRIMINATOR,
    borshString(name),
    borshString(symbol),
    borshString(uri),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const connection = new Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  const walletPath = process.env.ANCHOR_WALLET || require("os").homedir() + "/.config/solana/id.json";
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));

  console.log("Admin :", admin.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(admin.publicKey)) / 1e9, "SOL\n");

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
  console.log("Registry:", registryPda.toBase58(), "\n");

  for (const prop of PROPERTIES) {
    process.stdout.write(`  ${prop.id}... `);

    const mintPk = new PublicKey(prop.mint);

    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(prop.id)],
      PROGRAM_ID
    );

    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), MPL_METADATA.toBuffer(), mintPk.toBuffer()],
      MPL_METADATA
    );

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: propertyPda,          isSigner: false, isWritable: true  },
        { pubkey: mintPk,               isSigner: false, isWritable: true  },
        { pubkey: metadataAccount,      isSigner: false, isWritable: true  },
        { pubkey: registryPda,          isSigner: false, isWritable: false },
        { pubkey: admin.publicKey,      isSigner: true,  isWritable: true  },
        { pubkey: MPL_METADATA,         isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,   isSigner: false, isWritable: false },
      ],
      data: encodeArgs(prop.name, prop.symbol, ""),
    });

    try {
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: admin.publicKey }).add(ix);
      tx.sign(admin);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`✓  sig: ${sig.slice(0, 20)}...`);
    } catch (err) {
      const msg = err?.message || String(err);
      // 0x0 = "already in use" (metadata already created) — safe to ignore
      if (msg.includes("already in use") || msg.includes("custom program error: 0x0")) {
        console.log("(metadata already exists — skipped)");
      } else {
        console.log(`✗  ${msg.slice(0, 160)}`);
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
