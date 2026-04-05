const web3 = require('@solana/web3.js');
const fs = require('fs');

async function main() {
  const connection = new web3.Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
  
  // Create dummy buyer
  const buyer = web3.Keypair.generate();
  
  // Airdrop SOL so it doesn't fail rent? Actually airdrop takes long.
  // We can simulate with a dummy wallet or check if simulation error gives details.
  
  // Wait, I can just use a real wallet if it exists
  const keyPath = require('os').homedir() + '/.config/solana/id.json';
  let payer;
  if(fs.existsSync(keyPath)) {
     payer = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  } else {
     payer = buyer;
  }
}
// wait, instead of writing an ad-hoc script and struggling, I can just write a script that sends the tx base64 using raw RPC!
