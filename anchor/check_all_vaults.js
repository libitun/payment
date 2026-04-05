const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
const PROGRAM_ID = new PublicKey('HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM');

async function run() {
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
  const props = [
      'tokyo-apt-006-v2', 'nyc-penthouse-001-v2', 'london-studio-002-v2',
      'berlin-loft-003-v2', 'paris-apartment-004-v2', 'dubai-villa-005-v2'
  ];
  
  let total = 0;
  for (const id of props) {
      const [propertyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(id)],
        PROGRAM_ID
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), propertyPda.toBuffer()],
        PROGRAM_ID
      );
      const balance = await connection.getBalance(vaultPda);
      console.log('Property:', id, 'Vault:', vaultPda.toBase58(), 'Balance:', balance / 1e9, 'SOL');
      total += balance;
  }
  console.log('--- Total SOL in Vaults:', total / 1e9, 'SOL');
}
run();
