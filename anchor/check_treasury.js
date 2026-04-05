const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
const PROGRAM_ID = new PublicKey('HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM');

async function run() {
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
  console.log('Treasury PDA:', treasuryPda.toBase58());
  const balance = await connection.getBalance(treasuryPda);
  console.log('Treasury Balance:', balance / 1e9, 'SOL');
}
run();
