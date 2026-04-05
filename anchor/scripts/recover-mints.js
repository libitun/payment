const anchor = require("@anchor-lang/core");
const { PublicKey } = require("@solana/web3.js");
const fs = require('fs');

async function main() {
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  const programId = new PublicKey("HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM");

  // Fetch ALL accounts owned by our program
  const accounts = await connection.getProgramAccounts(programId);
  console.log(`Found ${accounts.length} accounts total`);

  const results = {};
  
  // Property account discriminator (first 8 bytes of a Property account)
  // We can derive it or just look at our dump: cf 5e de 5e b2 0a 05 5d
  const propertyDisc = [0xcf, 0x5e, 0xde, 0x5e, 0xb2, 0x0a, 0x05, 0x5d];

  for (const acc of accounts) {
    const data = acc.account.data;
    
    // Check if it's a Property account
    if (data.slice(0, 8).equals(Buffer.from(propertyDisc))) {
      // Decode: Disc(8) + StringLen(4) + String(N) + Pubkey(32)
      const idLen = data.readUint32LE(8);
      const id = data.slice(12, 12 + idLen).toString();
      const mint = new PublicKey(data.slice(12 + idLen, 12 + idLen + 32));
      
      results[id] = mint.toBase58();
      console.log(`Property: ${id} | Mint: ${mint.toBase58()}`);
    }
  }

  fs.writeFileSync('scripts/mints.json', JSON.stringify(results, null, 2));
  console.log("\nSuccess! Mints saved to scripts/mints.json");
}

main().catch(console.error);
