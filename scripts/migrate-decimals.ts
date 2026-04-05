import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';
import { properties } from '../lib/properties';

const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');
const keypairPath = require('os').homedir() + '/.config/solana/id.json';
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
);
const wallet = new anchor.Wallet(adminKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
anchor.setProvider(provider);

const PROGRAM_ID = new PublicKey("GRYwL4CWgnV59QtqPaaiH5VZB5hLkJy8GyNd1QpnTp7V");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const IDL = {
  address: "GRYwL4CWgnV59QtqPaaiH5VZB5hLkJy8GyNd1QpnTp7V",
  metadata: { name: "solestate", version: "0.1.0", spec: "0.1.0" },
  accounts: [{ name: "PropertyState", discriminator: [207, 94, 222, 94, 178, 10, 5, 93] }],
  instructions: [
    {
      name: "closeProperty",
      discriminator: [221, 217, 65, 122, 187, 119, 89, 243],
      accounts: [
        { name: "property", writable: true },
        { name: "registry" },
        { name: "admin", writable: true, signer: true },
        { name: "systemProgram" }
      ],
      args: []
    },
    {
      name: "listProperty",
      discriminator: [254, 101, 42, 174, 220, 160, 42, 82],
      accounts: [
        { name: "property", writable: true },
        { name: "tokenMint", writable: true, signer: true },
        { name: "registry", writable: true },
        { name: "admin", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ],
      args: [{ name: "params", type: { defined: { name: "ListPropertyParams" } } }]
    },
    {
      name: "createPropertyMetadata",
      discriminator: [204, 97, 150, 206, 169, 15, 73, 250],
      accounts: [
        { name: "property", writable: true },
        { name: "tokenMint", writable: true },
        { name: "metadataAccount", writable: true },
        { name: "registry" },
        { name: "admin", writable: true, signer: true },
        { name: "tokenMetadataProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ],
      args: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "uri", type: "string" }
      ]
    }
  ],
  types: [
    {
      name: "ListPropertyParams",
      type: { kind: "struct", fields: [
        { name: "id", type: "string" },
        { name: "totalTokens", type: "u64" },
        { name: "pricePerTokenLamports", type: "u64" },
        { name: "annualYieldBps", type: "u16" }
      ]}
    },
    {
      name: "PropertyState",
      type: { kind: "struct", fields: [
        { name: "id", type: "string" },
        { name: "admin", type: "pubkey" },
        { name: "tokenMint", type: "pubkey" },
        { name: "totalTokens", type: "u64" },
        { name: "soldTokens", type: "u64" },
        { name: "pricePerTokenLamports", type: "u64" },
        { name: "annualYieldBps", type: "u16" },
        { name: "isActive", type: "bool" },
        { name: "totalRaisedLamports", type: "u64" },
        { name: "investorCount", type: "u32" },
        { name: "createdAt", type: "i64" },
        { name: "bump", type: "u8" }
      ]}
    }
  ]
};

async function main() {
  const program = new anchor.Program(IDL as any, provider);

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID);
  console.log("Registry:", registryPda.toBase58());

  for (const p of properties) {
    const propertyId = p.id;
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
      PROGRAM_ID
    );

    // --- Step 1: Close existing property if it exists ---
    const existingInfo = await connection.getAccountInfo(propertyPda);
    if (existingInfo) {
      console.log(`\nClosing old property: ${propertyId}...`);
      try {
        await program.methods.closeProperty()
          .accounts({
            property: propertyPda,
            registry: registryPda,
            admin: adminKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`  > Closed successfully!`);
        // Wait a bit for confirmations
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.log(`  > Close failed: ${err.message}`);
      }
    }

    // --- Step 2: Re-create with new mint (decimals = 6) ---
    const newPropertyInfo = await connection.getAccountInfo(propertyPda);
    if (!newPropertyInfo) {
      console.log(`  > Re-listing ${propertyId} with decimals=6...`);

      const tokenMint = Keypair.generate();
      const priceLamports = Math.floor(p.pricePerToken * 1e9);
      const yieldBps = Math.floor(p.annualYield * 100);

      await program.methods.listProperty({
        id: propertyId,
        totalTokens: new anchor.BN(p.totalTokens),
        pricePerTokenLamports: new anchor.BN(priceLamports),
        annualYieldBps: yieldBps,
      })
      .accounts({
        property: propertyPda,
        tokenMint: tokenMint.publicKey,
        registry: registryPda,
        admin: adminKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([tokenMint])
      .rpc();

      console.log(`  > Listed! New Mint: ${tokenMint.publicKey.toBase58()}`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // --- Step 3: Attach Metaplex metadata ---
    const words = p.name.split(" ");
    const symbol = words.length > 1
      ? words.map(w => w[0]).join("").substring(0, 4).toUpperCase()
      : p.name.substring(0, 4).toUpperCase();

    const propAccount = await (program.account as any).propertyState.fetch(propertyPda);
    const actualMint = propAccount.tokenMint as PublicKey;

    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), actualMint.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );

    const metaInfo = await connection.getAccountInfo(metadataPda);
    if (!metaInfo) {
      console.log(`  > Attaching metadata (${p.name} | ${symbol})...`);
      try {
        await program.methods.createPropertyMetadata(p.name, symbol, "")
          .accounts({
            property: propertyPda,
            tokenMint: actualMint,
            metadataAccount: metadataPda,
            registry: registryPda,
            admin: adminKeypair.publicKey,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        console.log(`  > Metadata linked!`);
      } catch (err: any) {
        console.log(`  > Metadata failed: ${err.message}`);
      }
    } else {
      console.log(`  > Metadata already exists`);
    }
  }

  console.log("\n✅ All properties re-created with decimals=6 and metadata synced!");
}

main().catch(console.error);
