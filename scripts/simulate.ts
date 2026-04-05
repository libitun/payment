import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const PROGRAM_ID = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7"); // Let's try 49yz first and if it fails, GRYw
const DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec';

const IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "solestate", version: "0.1.0", spec: "0.1.0" },
  accounts: [
    {
      name: "PropertyState",
      discriminator: [207, 94, 222, 94, 178, 10, 5, 93]
    }
  ],
  instructions: [
    {
      name: "purchaseTokensWithHistory",
      discriminator: [127, 251, 9, 12, 102, 7, 71, 36],
      accounts: [
        { name: "purchaseRecord", writable: true },
        { name: "property", writable: true },
        { name: "tokenMint", writable: true },
        { name: "buyerTokenAccount", writable: true },
        { name: "propertyVault", writable: true },
        { name: "registry", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ],
      args: [
        { name: "_id", type: "string" },
        { name: "tokenAmount", type: "u64" },
        { name: "timestamp", type: "i64" }
      ]
    }
  ]
};

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Use a dummy keypair as the buyer
  const buyer = Keypair.generate();
  
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(buyer), { preflightCommitment: 'confirmed' });
  const program = new anchor.Program(IDL as any, provider);

  const propertyId = "miami-villa-002-v3"; // Let's guess a property ID, or find one from properties.ts
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
    // @ts-ignore
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
    console.log("Simulation Result:", simulation.value.err);
    console.log("Simulation Logs:\n", simulation.value.logs?.join('\n'));
  } catch (e) {
    console.error(e);
  }
}

main();
