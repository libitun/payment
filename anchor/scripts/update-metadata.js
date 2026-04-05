/**
 * update-metadata.js
 * Updates token metadata (name, symbol) for all v3 properties
 * to match the naming convention shown in Phantom wallet.
 *
 * Usage: node anchor/scripts/update-metadata.js
 */
const { Connection, Keypair, PublicKey, SystemProgram,
        Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const fs = require("fs");

// ── Constants ─────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
const MPL_METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// sha256("global:update_property_metadata")[0..8]
const DISCRIMINATOR = (() => {
  const c = require("crypto");
  return c.createHash("sha256").update("global:update_property_metadata").digest().slice(0, 8);
})();
console.log("Discriminator:", [...DISCRIMINATOR]);

// Final names exactly as in the Phantom screenshot style
const PROPERTIES = [
  { id: "nyc-penthouse-001-v3",       name: "Manhattan Penthouse",         symbol: "MPT",  mint: "5VrAqKk1L46wxxWEE4AEfNYZcBvitWnHJRxbPVshdKYu" },
  { id: "miami-villa-002-v3",         name: "Miami Beach Villa",            symbol: "MBV",  mint: "2iEwrc1zaocZJQudCx3kNWtZG8f8tJZqwCprXfiba95o" },
  { id: "dubai-tower-003-v3",         name: "Dubai Marina Tower",           symbol: "DMT",  mint: "HotTD9XK2vfZoVePeGY1piw593MtXpyGzXGsys7UvJr2" },
  { id: "london-flat-004-v3",         name: "Mayfair Townhouse",            symbol: "MFT",  mint: "BdYjMXyZj22L587GUHj4giJFznv4YSqt6Q5uiaScTuj1" },
  { id: "singapore-condo-005-v3",     name: "Marina Bay Residences",        symbol: "MBR",  mint: "AmpGg552Zubx21wjBrcw6FjAAo2QJTg2NjsKLa6XoycD" },
  { id: "tokyo-apt-006-v3",           name: "Shibuya Apartments",           symbol: "SBA",  mint: "HKfJwqtZzrCgGJCzTtFbHVhsMYexD1G1K6mqz4Asvdfn" },
  { id: "barcelona-penthouse-007-v3", name: "Barcelona Sea View",           symbol: "BSV",  mint: "CE6cit8w5pLeeQ7NuaNRVVrhkyQd2LWN4m7cj25Zypx7" },
];

// ── Borsh helpers ─────────────────────────────────────────────────────────────
function borshString(str) {
  const buf = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

function encodeArgs(name, symbol, uri) {
  return Buffer.concat([
    Buffer.from(DISCRIMINATOR),
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

  for (const prop of PROPERTIES) {
    process.stdout.write(`  ${prop.symbol.padEnd(4)} ${prop.name.padEnd(30)}... `);

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
        { pubkey: propertyPda,             isSigner: false, isWritable: false }, // property
        { pubkey: metadataAccount,         isSigner: false, isWritable: true  }, // metadata_account
        { pubkey: mintPk,                  isSigner: false, isWritable: false }, // token_mint
        { pubkey: registryPda,             isSigner: false, isWritable: false }, // registry
        { pubkey: admin.publicKey,         isSigner: true,  isWritable: true  }, // admin
        { pubkey: MPL_METADATA,            isSigner: false, isWritable: false }, // token_metadata_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data: encodeArgs(prop.name, prop.symbol, ""),
    });

    try {
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: admin.publicKey }).add(ix);
      tx.sign(admin);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`✓`);
    } catch (err) {
      const msg = err?.message || String(err);
      const logs = err?.logs || [];
      console.log(`✗  ${msg.slice(0, 100)}`);
      if (logs.length) console.log("   Logs:", logs.slice(0, 3).join(" | "));
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
