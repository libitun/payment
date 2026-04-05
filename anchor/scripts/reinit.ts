const anchor = require("@anchor-lang/core");
const { Transaction, TransactionInstruction, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const fs = require('fs');
export {};

async function main() {
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");

  const walletPath = process.env.ANCHOR_WALLET || require('os').homedir() + '/.config/solana/id.json';
  const walletKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const admin = Keypair.fromSecretKey(Uint8Array.from(walletKey));

  console.log("Admin address:", admin.publicKey.toBase58());

  // ──────────────────────────────────────────────────────────
  // NEW Program ID
  // ──────────────────────────────────────────────────────────
  const programId = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], programId);
  const [treasuryPda]  = PublicKey.findProgramAddressSync([Buffer.from("treasury")], programId);

  console.log("Registry PDA:", registryPda.toBase58());
  console.log("Treasury PDA:", treasuryPda.toBase58());

  // ── 1. Initialize Registry ──────────────────────────────
  console.log("\n[1/3] Initializing Registry...");
  try {
    // Discriminator for initialize_registry: sha256("global:initialize_registry")[0..8]
    const data = Buffer.from([189, 181, 20, 17, 174, 57, 249, 59]);
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });
    const sig = await anchor.web3.sendAndConfirmTransaction(connection, new Transaction().add(ix), [admin]);
    console.log("  ✓ Registry initialized:", sig);
  } catch (err: any) {
    console.log("  ⚠ Registry:", err.message?.slice(0, 120));
  }

  // ── 2. Initialize Treasury ─────────────────────────────
  console.log("\n[2/3] Initializing Treasury...");
  try {
    // Discriminator for initialize_treasury: sha256("global:initialize_treasury")[0..8]
    const data = Buffer.from([124, 186, 211, 195, 85, 165, 129, 166]);
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });
    const sig = await anchor.web3.sendAndConfirmTransaction(connection, new Transaction().add(ix), [admin]);
    console.log("  ✓ Treasury initialized:", sig);
  } catch (err: any) {
    console.log("  ⚠ Treasury:", err.message?.slice(0, 120));
  }

  // ── 3. Seed Properties ────────────────────────────────────
  console.log("\n[3/3] Seeding Properties...");

  const propertiesToSeed = [
    { id: 'nyc-penthouse-001-v2',      totalTokens: 10000, pricePerToken: 0.5,  annualYield: 8.4  },
    { id: 'miami-villa-002-v2',        totalTokens: 20000, pricePerToken: 0.25, annualYield: 11.2 },
    { id: 'dubai-tower-003-v2',        totalTokens: 5000,  pricePerToken: 1.0,  annualYield: 9.8  },
    { id: 'london-flat-004-v2',        totalTokens: 8000,  pricePerToken: 0.75, annualYield: 6.2  },
    { id: 'singapore-condo-005-v2',    totalTokens: 12000, pricePerToken: 0.6,  annualYield: 7.1  },
    { id: 'tokyo-apt-006-v2',          totalTokens: 15000, pricePerToken: 0.4,  annualYield: 5.8  },
    { id: 'barcelona-penthouse-007-v2',totalTokens: 18000, pricePerToken: 0.35, annualYield: 9.5  },
  ];

  const results: { [key: string]: string } = {};

  for (const prop of propertiesToSeed) {
    process.stdout.write(`  Listing ${prop.id}... `);

    const tokenMintKeypair = Keypair.generate();
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(prop.id)],
      programId
    );

    // Borsh-encode ListPropertyParams { id: String, total_tokens: u64, price_per_token_lamports: u64, annual_yield_bps: u16 }
    const idBuf = Buffer.from(prop.id);
    const payload = Buffer.alloc(8 + 4 + idBuf.length + 8 + 8 + 2);
    // Discriminator for list_property: sha256("global:list_property")[0..8]
    Buffer.from([254, 101, 42, 174, 220, 160, 42, 82]).copy(payload, 0);
    let off = 8;
    payload.writeUInt32LE(idBuf.length, off); off += 4;
    idBuf.copy(payload, off); off += idBuf.length;
    payload.writeBigUInt64LE(BigInt(prop.totalTokens), off); off += 8;
    payload.writeBigUInt64LE(BigInt(Math.round(prop.pricePerToken * 1e9)), off); off += 8;
    payload.writeUInt16LE(Math.round(prop.annualYield * 100), off);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: propertyPda,                isSigner: false, isWritable: true  },
        { pubkey: tokenMintKeypair.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: registryPda,                isSigner: false, isWritable: true  },
        { pubkey: admin.publicKey,            isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM_ID,           isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,         isSigner: false, isWritable: false },
      ],
      programId,
      data: payload,
    });

    try {
      const sig = await anchor.web3.sendAndConfirmTransaction(
        connection, new Transaction().add(ix), [admin, tokenMintKeypair]
      );
      console.log(`✓ mint: ${tokenMintKeypair.publicKey.toBase58()}`);
      results[prop.id] = tokenMintKeypair.publicKey.toBase58();
    } catch (err: any) {
      console.log(`✗ ${err.message?.slice(0, 80)}`);
    }
  }

  console.log("\n=== DONE ===");
  console.log(JSON.stringify(results, null, 2));

  const outPath = require('path').join(__dirname, 'mints.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("Mints saved to", outPath);
}

main().catch(console.error);
