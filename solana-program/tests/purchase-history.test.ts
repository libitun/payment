import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddress, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";

describe("Purchase History Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RealEstateTokenization;
  
  let registry: PublicKey;
  let property: PublicKey;
  let tokenMint: PublicKey;
  let buyer: Keypair;
  let seller: Keypair;
  
  const propertyId = "miami-villa-001";

  before(async () => {
    // Создаём кошельки
    buyer = Keypair.generate();
    seller = Keypair.generate();
    
    // Аирдроп SOL
    await provider.connection.requestAirdrop(
      buyer.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      seller.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    
    // Ждём подтверждения
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Создаём Registry
    [registry] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId
    );
    
    // Создаём Property
    [property] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registry.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    // Создаём токен mint
    tokenMint = await createMint(
      provider.connection,
      seller,
      property,
      null,
      6 // decimals
    );
    
    console.log("Registry:", registry.toBase58());
    console.log("Property:", property.toBase58());
    console.log("Token Mint:", tokenMint.toBase58());
  });

  it("Покупка токенов с записью в историю", async () => {
    const tokenAmount = 1000000; // 1 token (с 6 decimals)
    const pricePerToken = 1_000_000_000; // 1 SOL в lamports
    
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Создаём PDA для purchase record
    const [purchaseRecord] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("purchase_record"),
        buyer.publicKey.toBuffer(),
        property.toBuffer(),
        Buffer.from(timestamp.toString())
      ],
      program.programId
    );
    
    // Получаем token accounts
    const propertyTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      property,
      true
    );
    
    const buyerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      buyer.publicKey
    );
    
    // Минтим токены на property account
    await mintTo(
      provider.connection,
      seller,
      tokenMint,
      propertyTokenAccount,
      property,
      10_000_000 // 10 tokens
    );
    
    // Вызываем purchase_tokens_with_history
    const tx = await program.methods
      .purchaseTokensWithHistory(propertyId, new anchor.BN(tokenAmount))
      .accounts({
        purchaseRecord,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        registry,
        property,
        propertyTokenAccount,
        buyerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
    
    console.log("Transaction signature:", tx);
    
    // Проверяем, что запись создана
    const record = await program.account.purchaseRecord.fetch(purchaseRecord);
    
    assert.equal(record.buyer.toBase58(), buyer.publicKey.toBase58());
    assert.equal(record.propertyId, propertyId);
    assert.equal(record.tokenAmount.toNumber(), tokenAmount);
    assert.equal(record.pricePerToken.toNumber(), pricePerToken);
    
    console.log("Purchase Record:", {
      buyer: record.buyer.toBase58(),
      propertyId: record.propertyId,
      tokenAmount: record.tokenAmount.toNumber(),
      timestamp: new Date(record.timestamp.toNumber() * 1000),
    });
  });

  it("Получение всех покупок пользователя", async () => {
    // Фильтруем по buyer
    const records = await program.account.purchaseRecord.all([
      {
        memcmp: {
          offset: 8, // После discriminator
          bytes: buyer.publicKey.toBase58(),
        },
      },
    ]);
    
    console.log(`Найдено ${records.length} покупок для buyer`);
    
    records.forEach((r, i) => {
      console.log(`Покупка ${i + 1}:`, {
        propertyId: r.account.propertyId,
        tokens: r.account.tokenAmount.toNumber() / 1_000_000,
        price: r.account.totalPrice.toNumber() / 1_000_000_000,
        date: new Date(r.account.timestamp.toNumber() * 1000),
      });
    });
    
    assert.isAtLeast(records.length, 1);
  });

  it("Множественные покупки одного пользователя", async () => {
    // Делаем вторую покупку
    const timestamp2 = Math.floor(Date.now() / 1000);
    
    const [purchaseRecord2] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("purchase_record"),
        buyer.publicKey.toBuffer(),
        property.toBuffer(),
        Buffer.from(timestamp2.toString())
      ],
      program.programId
    );
    
    await program.methods
      .purchaseTokensWithHistory(propertyId, new anchor.BN(500000))
      .accounts({
        purchaseRecord: purchaseRecord2,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        registry,
        property,
        // ... остальные аккаунты
      })
      .signers([buyer])
      .rpc();
    
    // Проверяем, что теперь 2 записи
    const records = await program.account.purchaseRecord.all([
      {
        memcmp: {
          offset: 8,
          bytes: buyer.publicKey.toBase58(),
        },
      },
    ]);
    
    assert.equal(records.length, 2);
  });
});
