# Upgrade Smart Contract for On-Chain Purchase History

## Problem
Currently, purchase history is stored in localStorage which:
- Is tied to a specific domain/browser
- Can be cleared by user
- Doesn't sync across devices
- Isn't truly decentralized

## Solution
Add on-chain purchase history tracking to the Solana smart contract.

## Required Smart Contract Changes

### 1. Add New Account Type: `PurchaseRecord`

```rust
#[account]
pub struct PurchaseRecord {
    pub investor: Pubkey,           // 32 bytes
    pub property: Pubkey,            // 32 bytes
    pub token_mint: Pubkey,          // 32 bytes
    pub tokens_purchased: u64,       // 8 bytes
    pub price_per_token_lamports: u64, // 8 bytes
    pub total_paid_lamports: u64,    // 8 bytes
    pub timestamp: i64,              // 8 bytes
    pub signature: String,           // Variable (max 88 bytes for base58 sig)
    pub bump: u8,                    // 1 byte
}
```

### 2. Update `purchase_tokens` Instruction

Add creation of PurchaseRecord account:

```rust
pub fn purchase_tokens(ctx: Context<PurchaseTokens>, token_amount: u64) -> Result<()> {
    // ... existing purchase logic ...
    
    // NEW: Create purchase record
    let purchase_record = &mut ctx.accounts.purchase_record;
    purchase_record.investor = ctx.accounts.investor.key();
    purchase_record.property = ctx.accounts.property.key();
    purchase_record.token_mint = ctx.accounts.token_mint.key();
    purchase_record.tokens_purchased = token_amount;
    purchase_record.price_per_token_lamports = property.price_per_token_lamports;
    purchase_record.total_paid_lamports = total_cost;
    purchase_record.timestamp = Clock::get()?.unix_timestamp;
    purchase_record.bump = ctx.bumps.purchase_record;
    
    Ok(())
}
```

### 3. Add PDA Seeds for Purchase Records

```rust
// PDA: ["purchase", investor_pubkey, property_pubkey, timestamp_bytes]
#[derive(Accounts)]
pub struct PurchaseTokens<'info> {
    // ... existing accounts ...
    
    #[account(
        init,
        payer = investor,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 88 + 1,
        seeds = [
            b"purchase",
            investor.key().as_ref(),
            property.key().as_ref(),
            &Clock::get()?.unix_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub purchase_record: Account<'info, PurchaseRecord>,
}
```

### 4. Frontend: Fetch Purchase History

```typescript
export async function fetchUserPurchaseHistory(wallet: any): Promise<PurchaseRecord[]> {
  const provider = getProvider(wallet)
  const program = new Program(IDL as any, provider)
  const investor = new PublicKey(wallet.publicKey.toString())
  
  // Fetch all PurchaseRecord accounts for this investor
  const purchases = await program.account.purchaseRecord.all([
    {
      memcmp: {
        offset: 8, // After discriminator
        bytes: investor.toBase58(),
      },
    },
  ])
  
  return purchases.map((p: any) => ({
    id: p.publicKey.toBase58(),
    propertyId: p.account.property.toBase58(),
    tokens: p.account.tokensPurchased.toNumber(),
    pricePerToken: p.account.pricePerTokenLamports.toNumber() / 1e9,
    totalSol: p.account.totalPaidLamports.toNumber() / 1e9,
    signature: p.account.signature || p.publicKey.toBase58(),
    timestamp: p.account.timestamp.toNumber() * 1000,
  }))
}
```

## Migration Plan

1. **Deploy Updated Contract** - Deploy new version with PurchaseRecord support
2. **Update IDL** - Replace IDL in `lib/wallet-context.tsx` with new version
3. **Update Frontend** - Use `fetchUserPurchaseHistory()` instead of localStorage
4. **Migrate Existing Data** (optional) - Create admin function to migrate localStorage purchases to blockchain

## Benefits

✅ **True Decentralization** - History stored on Solana blockchain
✅ **Cross-Device Sync** - Access from any device with same wallet
✅ **Permanent Record** - Can't be lost or cleared
✅ **Verifiable** - On-chain proof of all purchases
✅ **Domain Independent** - Works on any domain/deployment

## Cost Estimate

- Each PurchaseRecord account: ~0.002 SOL rent (recoverable)
- Transaction fee: ~0.000005 SOL
- Total per purchase: ~0.002005 SOL on devnet (free)

## Alternative: Event-Based Approach (Cheaper)

Instead of creating accounts, emit events and index them:

```rust
#[event]
pub struct TokensPurchased {
    pub investor: Pubkey,
    pub property: Pubkey,
    pub token_mint: Pubkey,
    pub tokens: u64,
    pub total_cost: u64,
    pub timestamp: i64,
}

// In purchase_tokens:
emit!(TokensPurchased {
    investor: ctx.accounts.investor.key(),
    property: ctx.accounts.property.key(),
    token_mint: ctx.accounts.token_mint.key(),
    tokens: token_amount,
    total_cost: total_cost_lamports,
    timestamp: Clock::get()?.unix_timestamp,
});
```

Then use an indexer (Helius, SimpleHash, or custom) to fetch event history.

**Pros**: No rent cost, cheaper
**Cons**: Requires indexer, events can be harder to query
