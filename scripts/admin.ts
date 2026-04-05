import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';
import { properties } from '../lib/properties';

// Инициализация
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec', 'confirmed');

// Загрузка ключа деплоера (Админа)
const keypairPath = require('os').homedir() + '/.config/solana/id.json';
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
);

const wallet = new anchor.Wallet(adminKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });
anchor.setProvider(provider);

const PROGRAM_ID = new PublicKey("GRYwL4CWgnV59QtqPaaiH5VZB5hLkJy8GyNd1QpnTp7V");

// Полный IDL, включая функции для админа
const IDL = {
  address: "GRYwL4CWgnV59QtqPaaiH5VZB5hLkJy8GyNd1QpnTp7V",
  metadata: { name: "solestate", version: "0.1.0", spec: "0.1.0" },
  accounts: [
    {
      name: "PropertyState",
      discriminator: [207, 94, 222, 94, 178, 10, 5, 93]
    }
  ],
  instructions: [
    {
      name: "initializeRegistry",
      discriminator: [189, 181, 20, 17, 174, 57, 249, 59],
      accounts: [
        { name: "registry", writable: true },
        { name: "admin", writable: true, signer: true },
        { name: "systemProgram" }
      ],
      args: []
    },
    {
      name: "initializeTreasury",
      discriminator: [124, 186, 211, 195, 85, 165, 129, 166],
      accounts: [
        { name: "treasury", writable: true },
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
      args: [
        {
          name: "params",
          type: {
            defined: { name: "ListPropertyParams" }
          }
        }
      ]
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
      type: {
        kind: "struct",
        fields: [
          { name: "id", type: "string" },
          { name: "totalTokens", type: "u64" },
          { name: "pricePerTokenLamports", type: "u64" },
          { name: "annualYieldBps", type: "u16" }
        ]
      }
    },
    {
      name: "PropertyState",
      type: {
        kind: "struct",
        fields: [
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
        ]
      }
    }
  ]
};

async function main() {
  const program = new anchor.Program(IDL as any, provider);

  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    PROGRAM_ID
  );

  console.log("Checking if registry is initialized...");
  let registryInfo = await connection.getAccountInfo(registryPda);

  if (!registryInfo) {
    console.log("Initializing registry...");
    await program.methods.initializeRegistry()
      .accounts({
        registry: registryPda,
        admin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Registry initialized at:", registryPda.toBase58());
  } else {
    console.log("Registry already initialized at:", registryPda.toBase58());
  }

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );

  console.log("Checking if treasury is initialized...");
  let treasuryInfo = await connection.getAccountInfo(treasuryPda);

  if (!treasuryInfo) {
    console.log("Initializing treasury...");
    await program.methods.initializeTreasury()
      .accounts({
        treasury: treasuryPda,
        admin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Treasury initialized at:", treasuryPda.toBase58());
  } else {
    console.log("Treasury already initialized at:", treasuryPda.toBase58());
  }


  console.log(`\nFound ${properties.length} properties in the frontend config. Syncing to blockchain...`);

  for (const p of properties) {
    const propertyId = p.id;
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
      PROGRAM_ID
    );

    let propertyInfo = await connection.getAccountInfo(propertyPda);
    if (!propertyInfo) {
      console.log(`\nListing property: ${propertyId}...`);
      
      const tokenMint = Keypair.generate();
      console.log(`  > Generated Mint: ${tokenMint.publicKey.toBase58()}`);

      // Преобразуем цену из SOL в lamports (1 SOL = 1_000_000_000). 
      // Добавим Math.floor на всякий случай для безопасной конвертации.
      const priceLamports = Math.floor(p.pricePerToken * 1e9);
      // AnnualYieldBps = annualYield * 100
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
        
      console.log(`  > Property ${propertyId} successfully listed!`);
    } else {
      console.log(`Property ${propertyId} is already listed!`);
    }

    // --- Добавление Метаданных ---
    // Формируем короткий Symbol (например из аббревиатуры)
    const words = p.name.split(" ");
    const symbol = words.length > 1 
        ? words.map(w => w[0]).join("").substring(0, 4).toUpperCase() 
        : p.name.substring(0, 4).toUpperCase();
        
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    
    // Получаем реальный tokenMint со смарт-контракта
    const propAccount = await (program.account as any).propertyState.fetch(propertyPda);
    const actualTokenMint = propAccount.tokenMint as PublicKey;

    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        actualTokenMint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    let metadataInfo = await connection.getAccountInfo(metadataPda);
    if (!metadataInfo) {
      console.log(`  > Attaching Metaplex metadata (Name: ${p.name}, Symbol: ${symbol})...`);
      try {
        await program.methods.createPropertyMetadata(
          p.name,
          symbol,
          "https://arweave.net/qN-gB1x_aBvPZ8I7g1mIfc2T7t--sR0TGEWeF4bM7kU" // Placeholder URI
        )
        .accounts({
          property: propertyPda,
          tokenMint: actualTokenMint,
          metadataAccount: metadataPda,
          registry: registryPda,
          admin: adminKeypair.publicKey,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
        console.log(`  > Metadata linked successfully!`);
      } catch (err: any) {
        console.log(`  > Failed to link metadata: ${err.message}`);
      }
    } else {
      console.log(`  > Metadata already exists for ${p.id}`);
    }

  }

  console.log("\nAll properties and their metadata are synced!");
}

main().catch(console.error);
