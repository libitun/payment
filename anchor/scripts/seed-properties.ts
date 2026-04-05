const anchor = require("@anchor-lang/core");
const { Transaction, TransactionInstruction, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const fs = require('fs');

export {}; // Fix redeclaration errors by isolating module scope

async function main() {
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  
  const walletPath = process.env.ANCHOR_WALLET || require('os').homedir() + '/.config/solana/id.json';
  const walletKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const admin = Keypair.fromSecretKey(Uint8Array.from(walletKey));
  
  console.log("Admin address:", admin.publicKey.toBase58());

  const programId = new PublicKey("HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM");
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], programId);
  console.log("Registry PDA:", registryPda.toBase58());

  // 1. Initialize Treasury
  try {
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], programId);
    console.log("Treasury PDA:", treasuryPda.toBase58());

    const initTreasuryData = Buffer.from([124, 186, 211, 195, 85, 165, 129, 166]);
    const initTreasuryIx = new TransactionInstruction({
      keys: [
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: initTreasuryData,
    });

    const tx = new Transaction().add(initTreasuryIx);
    const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin]);
    console.log("Treasury initialized:", sig);
  } catch (err: any) {
    console.log("Treasury already initialized or failed:", err.message);
  }

  // 2. List Properties
  const propertiesToSeed = [
    { id: 'nyc-penthouse-001-v2', totalTokens: 10000, pricePerToken: 0.5, annualYield: 8.4 },
    { id: 'miami-villa-002-v2', totalTokens: 20000, pricePerToken: 0.25, annualYield: 11.2 },
    { id: 'dubai-tower-003-v2', totalTokens: 5000, pricePerToken: 1.0, annualYield: 9.8 },
    { id: 'london-flat-004-v2', totalTokens: 8000, pricePerToken: 0.75, annualYield: 6.2 },
    { id: 'singapore-condo-005-v2', totalTokens: 12000, pricePerToken: 0.6, annualYield: 7.1 },
    { id: 'tokyo-apt-006-v2', totalTokens: 15000, pricePerToken: 0.4, annualYield: 5.8 },
    { id: 'barcelona-penthouse-007-v2', totalTokens: 18000, pricePerToken: 0.35, annualYield: 9.5 }
  ];

  const results: { [key: string]: string } = {};

  for (const prop of propertiesToSeed) {
    console.log(`\nListing ${prop.id}...`);
    
    const tokenMintKeypair = Keypair.generate();
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(prop.id)],
      programId
    );

    // ListPropertyParams serialization:
    // struct ListPropertyParams { id: String, total_tokens: u64, price_per_token_lamports: u64, annual_yield_bps: u16 }
    const idBuffer = Buffer.from(prop.id);
    const dataLen = 4 + idBuffer.length + 8 + 8 + 2;
    const data = Buffer.alloc(8 + dataLen); // 8 bytes discriminator + params

    // Discriminator: [254, 101, 42, 174, 220, 160, 42, 82]
    Buffer.from([254, 101, 42, 174, 220, 160, 42, 82]).copy(data, 0);

    let offset = 8;
    data.writeUint32LE(idBuffer.length, offset); offset += 4;
    idBuffer.copy(data, offset); offset += idBuffer.length;
    data.writeBigUint64LE(BigInt(prop.totalTokens), offset); offset += 8;
    data.writeBigUint64LE(BigInt(prop.pricePerToken * 1e9), offset); offset += 8;
    data.writeUint16LE(Math.round(prop.annualYield * 100), offset);

    const listIx = new TransactionInstruction({
      keys: [
        { pubkey: propertyPda, isSigner: false, isWritable: true },
        { pubkey: tokenMintKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });

    try {
      const tx = new Transaction().add(listIx);
      const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin, tokenMintKeypair]);
      console.log(`Success! Mint: ${tokenMintKeypair.publicKey.toBase58()} | Sig: ${sig}`);
      results[prop.id] = tokenMintKeypair.publicKey.toBase58();
    } catch (err: any) {
      console.error(`Failed to list ${prop.id}:`, err.message);
    }
  }

  console.log("\n--- SEEDING COMPLETE ---");
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('scripts/mints.json', JSON.stringify(results, null, 2));
  console.log("Mints saved to scripts/mints.json");
}

main();
