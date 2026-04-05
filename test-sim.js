const { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, TransactionInstruction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Program, AnchorProvider, BN } = require('@coral-xyz/anchor');
const fs = require('fs');

async function main() {
  const DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec';
  const PROGRAM_ID = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  const IDLStr = fs.readFileSync('lib/wallet-context.tsx', 'utf8');
  // Just extract IDL from wallet-context
  const idlMatch = IDLStr.match(/export const IDL = ({[\s\S]*?});\n\n/);
  if (!idlMatch) throw new Error("IDL not found");
  const IDL = eval('(' + idlMatch[1] + ')');

  // Let's use the local devnet wallet so rent isn't an issue
  const keyPath = process.env.HOME + '/.config/solana/id.json';
  let buyer;
  if(fs.existsSync(keyPath)) {
     buyer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  } else {
     buyer = Keypair.generate();
     console.log("Using NEW dummy wallet. Might fail due to rent.");
  }

  const provider = new AnchorProvider(connection, { publicKey: buyer.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs }, { preflightCommitment: 'confirmed' });
  const program = new Program(IDL, provider);

  // We need an active property, e.g., miami-villa-002-v3
  const propertyId = "miami-villa-002-v3"; 
  const tokensToBuy = 1;

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
  
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  );
  
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), propertyPda.toBuffer()],
    PROGRAM_ID
  );

  let propAccount;
  try {
    propAccount = await program.account.propertyState.fetch(propertyPda);
  } catch (err) {
    console.error("Failed to fetch property:", err);
    return;
  }
  
  const tokenMint = propAccount.tokenMint;

  const investorTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    buyer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const timestamp = Math.floor(Date.now() / 1000);
  const timestampBuffer = new BN(timestamp).toArrayLike(Buffer, 'le', 8);
  
  const [purchaseRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("purchase_record"),
      buyer.publicKey.toBuffer(),
      propertyPda.toBuffer(),
      timestampBuffer
    ],
    PROGRAM_ID
  );

  const ix = await program.methods
    .purchaseTokensWithHistory(propertyId, new BN(tokensToBuy), new BN(timestamp))
    .accounts({
      purchaseRecord: purchaseRecordPda,
      property: propertyPda,
      tokenMint: tokenMint,
      buyerTokenAccount: investorTokenAccount,
      propertyVault: vaultPda,
      registry: registryPda,
      buyer: buyer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
    
  const tx = new Transaction().add(ix);
  tx.feePayer = buyer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  
  try {
    const simulation = await connection.simulateTransaction(tx, [buyer]);
    console.log("=== SIMULATION RESULT ===");
    console.log("Error:", simulation.value.err);
    console.log("Logs:\n", simulation.value.logs?.join('\n'));
  } catch (e) {
    console.error("RPC Error:", e);
  }
}

main();
