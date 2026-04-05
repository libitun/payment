const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
const PROGRAM_ID = new PublicKey('HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM');

async function run() {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: 114 } // Size of SaleListing (if I recall correctly?) No, let's use memcmp for discriminator
    ]
  });
  console.log('Total Program Accounts:', accounts.length);
  for (const acc of accounts) {
      console.log('Account:', acc.pubkey.toBase58(), 'Balance:', acc.account.lamports / 1e9, 'SOL');
  }
}
run();
