const anchor = require("@anchor-lang/core");
const { Transaction, TransactionInstruction, PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
const fs = require('fs');
const path = require('path');

async function main() {
  const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=dc9dbf9a-7a03-420a-bab5-97e89ebf3aec", "confirmed");
  const walletPath = process.env.ANCHOR_WALLET || require('os').homedir() + '/.config/solana/id.json';
  const walletKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const admin = Keypair.fromSecretKey(Uint8Array.from(walletKey));

  console.log("Admin:", admin.publicKey.toBase58());
  const bal = await connection.getBalance(admin.publicKey);
  console.log("Balance:", bal / 1e9, "SOL\n");

  const programId = new PublicKey("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], programId);
  console.log("Registry PDA:", registryPda.toBase58(), "\n");

  // All properties at 0.001 SOL = 1_000_000 lamports
  const PRICE_LAMPORTS = 1_000_000; // 0.001 SOL

  const propertiesToSeed = [
    { id: 'nyc-penthouse-001-v3',      totalTokens: 10000, price: PRICE_LAMPORTS, annualYieldBps: 840  },
    { id: 'miami-villa-002-v3',        totalTokens: 20000, price: PRICE_LAMPORTS, annualYieldBps: 1120 },
    { id: 'dubai-tower-003-v3',        totalTokens: 5000,  price: PRICE_LAMPORTS, annualYieldBps: 980  },
    { id: 'london-flat-004-v3',        totalTokens: 8000,  price: PRICE_LAMPORTS, annualYieldBps: 620  },
    { id: 'singapore-condo-005-v3',    totalTokens: 12000, price: PRICE_LAMPORTS, annualYieldBps: 710  },
    { id: 'tokyo-apt-006-v3',          totalTokens: 15000, price: PRICE_LAMPORTS, annualYieldBps: 580  },
    { id: 'barcelona-penthouse-007-v3',totalTokens: 18000, price: PRICE_LAMPORTS, annualYieldBps: 950  },
  ];

  const results = {};

  for (const prop of propertiesToSeed) {
    process.stdout.write(`  Listing ${prop.id}... `);

    const tokenMintKp = Keypair.generate();
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(prop.id)],
      programId
    );

    const idBuf = Buffer.from(prop.id);
    const payload = Buffer.alloc(8 + 4 + idBuf.length + 8 + 8 + 2);
    // discriminator for list_property
    Buffer.from([254, 101, 42, 174, 220, 160, 42, 82]).copy(payload, 0);
    let off = 8;
    payload.writeUInt32LE(idBuf.length, off); off += 4;
    idBuf.copy(payload, off); off += idBuf.length;
    payload.writeBigUInt64LE(BigInt(prop.totalTokens), off); off += 8;
    payload.writeBigUInt64LE(BigInt(prop.price), off); off += 8;
    payload.writeUInt16LE(prop.annualYieldBps, off);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: propertyPda,           isSigner: false, isWritable: true  },
        { pubkey: tokenMintKp.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: registryPda,           isSigner: false, isWritable: true  },
        { pubkey: admin.publicKey,       isSigner: true,  isWritable: true  },
        { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY,    isSigner: false, isWritable: false },
      ],
      programId, data: payload,
    });

    try {
      const sig = await anchor.web3.sendAndConfirmTransaction(
        connection, new Transaction().add(ix), [admin, tokenMintKp]
      );
      console.log(`✓  mint=${tokenMintKp.publicKey.toBase58()}`);
      results[prop.id] = tokenMintKp.publicKey.toBase58();
    } catch (err) {
      console.log(`✗  ${err.message ? err.message.slice(0, 80) : err}`);
    }
  }

  console.log("\n=== DONE ===");
  console.log(JSON.stringify(results, null, 2));
  const outPath = path.join(__dirname, 'mints-v3.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("Mints saved to", outPath);
}

main().catch(console.error);
