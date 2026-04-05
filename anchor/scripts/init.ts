const anchor = require("@anchor-lang/core");
const { Transaction, TransactionInstruction, PublicKey } = require("@solana/web3.js");
const fs = require('fs');
export {}; // Fix redeclaration errors by isolating module scope

async function main() {
  // Use environment variables or local config
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  
  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET || require('os').homedir() + '/.config/solana/id.json';
  const walletKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const admin = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletKey));
  
  console.log("Admin address:", admin.publicKey.toBase58());

  const programId = new PublicKey("HSvH1CMkjiY6ce5B4BjuHNkHdan6sGb9J5d1WUUJf1GM");

  // PDA for registry
  const [registryPda, _bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    programId
  );
  console.log("Registry PDA:", registryPda.toBase58());

  // instruction discriminator: [189, 181, 20, 17, 174, 57, 249, 59]
  const data = Buffer.from([189, 181, 20, 17, 174, 57, 249, 59]);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: registryPda, isSigner: false, isWritable: true },
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(instruction);
  try {
    const signature = await anchor.web3.sendAndConfirmTransaction(connection, tx, [admin]);
    console.log("Registry initialized! Signature:", signature);
  } catch (err) {
    console.error("Initialization failed (it might already be initialized):", err);
  }
}

main();
