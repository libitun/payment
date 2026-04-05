import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const PROGRAM_ID = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
const DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec';

const IDLStr = fs.readFileSync('anchor/target/idl/solestate.json', 'utf8');
const IDL = JSON.parse(IDLStr);

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Need to fund the dummy buyer, else we get InsufficientFundsForRent
  // Better use an existing funded wallet. Let's use the payer from the config if available
  const keypairPath = process.env.HOME + '/.config/solana/id.json';
  let buyer;
  if(fs.existsSync(keypairPath)){
    buyer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))));
  } else {
    buyer = Keypair.generate();
    console.log("No funded keypair found, running with dummy (might fail simulation due to 0 funds)");
  }
  
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(buyer), { preflightCommitment: 'confirmed' });
  const program = new anchor.Program(IDL, provider);

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
  const timestampBuffer = new anchor.BN(timestamp).toArrayLike(Buffer, 'le', 8);
  
  const [purchaseRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("purchase_record"),
      buyer.publicKey.toBuffer(),
      propertyPda.toBuffer(),
      timestampBuffer
    ],
    PROGRAM_ID
  );

  const tx = await program.methods
    .purchaseTokensWithHistory(propertyId, new anchor.BN(tokensToBuy), new anchor.BN(timestamp))
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
    .transaction();
    
  tx.feePayer = buyer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  
  try {
    const simulation = await connection.simulateTransaction(tx, [buyer]);
    console.log("Simulation err:", simulation.value.err);
    console.log("Simulation Logs:\n", simulation.value.logs?.join('\n'));
  } catch (e) {
    console.error(e);
  }
}

main();
