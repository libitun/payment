import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Solestate } from "../target/types/solestate";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";

describe("SolEstate", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solestate as Program<Solestate>;
  const admin = provider.wallet as anchor.Wallet;
  const investor = Keypair.generate();
  const tokenMint = Keypair.generate();

  const PROPERTY_ID = "nyc-penthouse-001";
  const PRICE_PER_TOKEN = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL per token (devnet)
  const TOTAL_TOKENS = 10000;
  const ANNUAL_YIELD_BPS = 840; // 8.4%

  let registryPda: PublicKey;
  let propertyPda: PublicKey;
  let vaultPda: PublicKey;

  before(async () => {
    // Airdrop to investor
    await provider.connection.requestAirdrop(
      investor.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await new Promise((r) => setTimeout(r, 1000));

    // Derive PDAs
    [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId
    );

    [propertyPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("property"),
        registryPda.toBuffer(),
        Buffer.from(PROPERTY_ID),
      ],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), propertyPda.toBuffer()],
      program.programId
    );
  });

  it("Initializes the registry", async () => {
    await program.methods
      .initializeRegistry()
      .accounts({
        registry: registryPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const registry = await program.account.propertyRegistry.fetch(registryPda);
    assert.ok(registry.admin.equals(admin.publicKey));
    assert.equal(registry.propertyCount, 0);
    console.log("Registry initialized:", registryPda.toBase58());
  });

  it("Lists a new property", async () => {
    await program.methods
      .listProperty({
        id: PROPERTY_ID,
        totalTokens: new anchor.BN(TOTAL_TOKENS),
        pricePerTokenLamports: new anchor.BN(PRICE_PER_TOKEN),
        annualYieldBps: ANNUAL_YIELD_BPS,
      })
      .accounts({
        property: propertyPda,
        tokenMint: tokenMint.publicKey,
        registry: registryPda,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([tokenMint])
      .rpc();

    const property = await program.account.propertyState.fetch(propertyPda);
    assert.equal(property.id, PROPERTY_ID);
    assert.equal(property.totalTokens.toNumber(), TOTAL_TOKENS);
    assert.equal(property.soldTokens.toNumber(), 0);
    assert.ok(property.isActive);
    console.log("Property listed:", propertyPda.toBase58());
    console.log("Token mint:", tokenMint.publicKey.toBase58());
  });

  it("Investor purchases 10 tokens", async () => {
    const investorAta = await getAssociatedTokenAddress(
      tokenMint.publicKey,
      investor.publicKey
    );

    const TOKEN_AMOUNT = 10;

    await program.methods
      .purchaseTokens(new anchor.BN(TOKEN_AMOUNT))
      .accounts({
        property: propertyPda,
        tokenMint: tokenMint.publicKey,
        investorTokenAccount: investorAta,
        propertyVault: vaultPda,
        registry: registryPda,
        investor: investor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investor])
      .rpc();

    const property = await program.account.propertyState.fetch(propertyPda);
    assert.equal(property.soldTokens.toNumber(), TOKEN_AMOUNT);

    const tokenBalance = await provider.connection.getTokenAccountBalance(investorAta);
    assert.equal(tokenBalance.value.uiAmount, TOKEN_AMOUNT);

    console.log(
      `Purchased ${TOKEN_AMOUNT} tokens. Vault balance:`,
      await provider.connection.getBalance(vaultPda)
    );
  });

  it("Creates a P2P sell listing", async () => {
    const investorAta = await getAssociatedTokenAddress(
      tokenMint.publicKey,
      investor.publicKey
    );

    const [listingPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), propertyPda.toBuffer(), investor.publicKey.toBuffer()],
      program.programId
    );

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), listingPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createListing(
        new anchor.BN(5),                       // sell 5 tokens
        new anchor.BN(0.12 * LAMPORTS_PER_SOL)  // at 0.12 SOL each (premium)
      )
      .accounts({
        listing: listingPda,
        listingEscrow: escrowPda,
        sellerTokenAccount: investorAta,
        property: propertyPda,
        tokenMint: tokenMint.publicKey,
        seller: investor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([investor])
      .rpc();

    const listing = await program.account.listing.fetch(listingPda);
    assert.equal(listing.tokenAmount.toNumber(), 5);
    assert.ok(listing.isActive);
    console.log("Listing created:", listingPda.toBase58());
  });
});
