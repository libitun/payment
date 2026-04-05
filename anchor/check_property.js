const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
const PROGRAM_ID = new PublicKey('HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM');

async function run() {
  // Compute Registry PDA
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
  
  // Try a common property ID from seed-properties.ts (e.g., 'tokyo-apt-006-v2')
  const propId = 'tokyo-apt-006-v2';
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propId)],
    PROGRAM_ID
  );
  
  console.log('Property PDA:', propertyPda.toBase58());
  const info = await connection.getAccountInfo(propertyPda);
  if (info) {
      console.log('Property exists! Balance:', info.lamports / 1e9, 'SOL');
  } else {
      console.log('Property not found.');
  }
}
run();
