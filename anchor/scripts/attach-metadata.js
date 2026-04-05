const anchor = require("@anchor-lang/core");
const { Transaction, TransactionInstruction, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const fs = require('fs');



async function main() {
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  
  const walletPath = process.env.ANCHOR_WALLET || require('os').homedir() + '/.config/solana/id.json';
  const walletKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const admin = Keypair.fromSecretKey(Uint8Array.from(walletKey));
  
  console.log("Admin address:", admin.publicKey.toBase58());

  const programId = new PublicKey("HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM");
  const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], programId);

  const properties = [
    { id: 'nyc-penthouse-001-v2', name: 'Manhattan Penthouse' },
    { id: 'miami-villa-002-v2', name: 'Miami Beach Villa' },
    { id: 'dubai-tower-003-v2', name: 'Dubai Marina Tower' },
    { id: 'london-flat-004-v2', name: 'London Kensington Flat' },
    { id: 'singapore-condo-005-v2', name: 'Singapore Sky Condo' },
    { id: 'tokyo-apt-006-v2', name: 'Tokyo Shibuya Apt' },
    { id: 'barcelona-penthouse-007-v2', name: 'Barcelona Beachside' }
  ];

  for (const prop of properties) {
    console.log(`\nAttaching metadata to ${prop.id}...`);

    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(prop.id)],
      programId
    );

    // Fetch account to get the Mint
    const accountInfo = await connection.getAccountInfo(propertyPda);
    if (!accountInfo) {
      console.log(`Property ${prop.id} NOT found on-chain. Skipping.`);
      continue;
    }

    const mintMap = JSON.parse(fs.readFileSync('scripts/mints.json', 'utf8'));
    const mintAddress = mintMap[prop.id];
    if (!mintAddress) {
       console.log(`No Mint found in map for ${prop.id}. Skipping.`);
       continue;
    }
    
    const tokenMint = new PublicKey(mintAddress);
    console.log(`Found Mint: ${tokenMint.toBase58()}`);

    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
      METADATA_PROGRAM_ID
    );

    // Generate Symbol: First letter of each word
    const symbol = prop.name.split(' ').map(w => w[0]).join('').substring(0, 5).toUpperCase();

    // Instruction data for create_property_metadata(name, symbol, uri)
    const nameBuf = Buffer.from(prop.name);
    const symBuf = Buffer.from(symbol);
    const uriBuf = Buffer.from(""); // Empty URI
    
    const data = Buffer.alloc(8 + 4 + nameBuf.length + 4 + symBuf.length + 4 + uriBuf.length);
    // Discriminator: [204, 97, 150, 206, 169, 15, 73, 250]
    Buffer.from([204, 97, 150, 206, 169, 15, 73, 250]).copy(data, 0);
    
    let offset = 8;
    data.writeUint32LE(nameBuf.length, offset); offset += 4;
    nameBuf.copy(data, offset); offset += nameBuf.length;
    data.writeUint32LE(symBuf.length, offset); offset += 4;
    symBuf.copy(data, offset); offset += symBuf.length;
    data.writeUint32LE(uriBuf.length, offset); offset += 4;
    uriBuf.copy(data, offset); offset += uriBuf.length;

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: propertyPda, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: true },
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: false },
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin]);
      console.log(`Success! Symbol: ${symbol} | Sig: ${sig}`);
    } catch (err) {
      console.log(`Failed to attach metadata: ${err.message}`);
    }
  }

  console.log("\n--- METADATA ATTACHMENT COMPLETE ---");
}

main();
