use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use anchor_spl::metadata::{
    create_metadata_accounts_v3, CreateMetadataAccountsV3,
    update_metadata_accounts_v2, UpdateMetadataAccountsV2,
    Metadata, mpl_token_metadata::types::DataV2,
};

declare_id!("49yz2fypShXqaGgopGx3vK73ojKdwZnLzydZE2iPBRr7");

// ── Platform constants (outside program module) ──────────────────────────
// 2% platform fee on all P2P secondary market sales
const PLATFORM_FEE_BPS: u64 = 200;

/// Returns bonus yield (basis points) based on lock duration.
fn lockup_bonus_bps(lock_duration_days: u64) -> u16 {
    match lock_duration_days {
        d if d >= 365 => 500,
        d if d >= 180 => 300,
        d if d >= 90  => 200,
        d if d >= 30  => 100,
        _             => 0,
    }
}

// ─────────────────────────────────────────────
// SolEstate — Real World Asset Tokenization
// Network: Solana Devnet
// ─────────────────────────────────────────────

#[program]
pub mod solestate {
    use super::*;

    // ─── 1. Initialize the global registry ───────────────────────────────────

    /// Called once by the platform admin to create the global PropertyRegistry.
    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.admin = ctx.accounts.admin.key();
        registry.property_count = 0;
        registry.total_raised_lamports = 0;
        registry.bump = ctx.bumps.registry;
        msg!("SolEstate registry initialized. Admin: {}", registry.admin);
        Ok(())
    }

    // ─── 2. List a new property ───────────────────────────────────────────────

    /// Admin lists a new real-world property on-chain, creating a PropertyState
    /// PDA and a dedicated SPL token Mint for fractional ownership tokens.
    pub fn list_property(
        ctx: Context<ListProperty>,
        params: ListPropertyParams,
    ) -> Result<()> {
        require!(params.total_tokens > 0, SolEstateError::InvalidTokenCount);
        require!(params.price_per_token_lamports > 0, SolEstateError::InvalidPrice);
        require!(params.annual_yield_bps <= 5000, SolEstateError::YieldTooHigh); // max 50%

        let property = &mut ctx.accounts.property;
        let registry = &mut ctx.accounts.registry;

        property.id = params.id.clone();
        property.admin = ctx.accounts.admin.key();
        property.token_mint = ctx.accounts.token_mint.key();
        property.total_tokens = params.total_tokens;
        property.sold_tokens = 0;
        property.price_per_token_lamports = params.price_per_token_lamports;
        property.annual_yield_bps = params.annual_yield_bps;
        property.is_active = true;
        property.total_raised_lamports = 0;
        property.investor_count = 0;
        property.created_at = Clock::get()?.unix_timestamp;
        property.bump = ctx.bumps.property;

        registry.property_count += 1;

        msg!(
            "Property listed: {} | Tokens: {} | Price: {} lamports | Yield: {}bps",
            params.id,
            params.total_tokens,
            params.price_per_token_lamports,
            params.annual_yield_bps,
        );

        Ok(())
    }

    // ─── 3. Purchase fractional tokens ───────────────────────────────────────

    /// Investor sends SOL, receives fractional property tokens (SPL) in return.
    /// This is the core transaction that gets signed via Phantom.
    pub fn purchase_tokens(
        ctx: Context<PurchaseTokens>,
        token_amount: u64,
    ) -> Result<()> {
        // Validate
        require!(ctx.accounts.property.is_active, SolEstateError::PropertyNotActive);
        require!(token_amount > 0, SolEstateError::InvalidTokenCount);
        require!(
            ctx.accounts.property.sold_tokens + token_amount <= ctx.accounts.property.total_tokens,
            SolEstateError::InsufficientTokensAvailable
        );

        // Calculate SOL cost
        let cost_lamports = ctx.accounts.property
            .price_per_token_lamports
            .checked_mul(token_amount)
            .ok_or(SolEstateError::ArithmeticOverflow)?;

        // Transfer SOL from investor → property vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.investor.key(),
            &ctx.accounts.property_vault.key(),
            cost_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.investor.to_account_info(),
                ctx.accounts.property_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Mint fractional tokens to investor's ATA
        let registry_key = ctx.accounts.registry.key();
        let property_id = ctx.accounts.property.id.clone();
        let property_bump = ctx.accounts.property.bump;
        let seeds = &[
            b"property",
            registry_key.as_ref(),
            property_id.as_bytes(),
            &[property_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.investor_token_account.to_account_info(),
                    authority: ctx.accounts.property.to_account_info(),
                },
                signer_seeds,
            ),
            // decimals = 6: mint token_amount * 10^6 base units
            // so the wallet shows human-readable whole numbers (e.g., 2.000000)
            token_amount.checked_mul(1_000_000).ok_or(SolEstateError::ArithmeticOverflow)?,
        )?;

        // Update state
        ctx.accounts.property.sold_tokens += token_amount;
        ctx.accounts.property.total_raised_lamports += cost_lamports;
        ctx.accounts.property.investor_count += 1;

        // Auto-close when fully funded
        if ctx.accounts.property.sold_tokens == ctx.accounts.property.total_tokens {
            ctx.accounts.property.is_active = false;
            msg!("Property {} fully funded!", ctx.accounts.property.id);
        }

        // Update registry totals
        let registry = &mut ctx.accounts.registry;
        registry.total_raised_lamports += cost_lamports;

        emit!(TokensPurchased {
            property_id: ctx.accounts.property.id.clone(),
            investor: ctx.accounts.investor.key(),
            token_amount,
            cost_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Purchased {} tokens of {} for {} lamports. Investor: {}",
            token_amount,
            ctx.accounts.property.id,
            cost_lamports,
            ctx.accounts.investor.key(),
        );

        Ok(())
    }

    /// Purchase tokens and create a permanent on-chain purchase record.
    pub fn purchase_tokens_with_history(
        ctx: Context<PurchaseTokensWithHistory>,
        property_id: String,
        token_amount: u64,
        timestamp: i64,
    ) -> Result<()> {
        // 1. Perform standard purchase validation
        require!(ctx.accounts.property.is_active, SolEstateError::PropertyNotActive);
        require!(token_amount > 0, SolEstateError::InvalidTokenCount);
        require!(
            ctx.accounts.property.sold_tokens + token_amount <= ctx.accounts.property.total_tokens,
            SolEstateError::InsufficientTokensAvailable
        );

        let cost_lamports = ctx.accounts.property
            .price_per_token_lamports
            .checked_mul(token_amount)
            .ok_or(SolEstateError::ArithmeticOverflow)?;

        // Transfer SOL: buyer → property vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.property_vault.key(),
            cost_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.property_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Mint tokens to buyer
        let registry_key = ctx.accounts.registry.key();
        let prop_id = ctx.accounts.property.id.clone();
        let property_bump = ctx.accounts.property.bump;
        let seeds = &[
            b"property",
            registry_key.as_ref(),
            prop_id.as_bytes(),
            &[property_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.property.to_account_info(),
                },
                signer_seeds,
            ),
            token_amount.checked_mul(1_000_000).ok_or(SolEstateError::ArithmeticOverflow)?,
        )?;

        // Update state
        let property = &mut ctx.accounts.property;
        property.sold_tokens += token_amount;
        property.total_raised_lamports += cost_lamports;
        property.investor_count += 1;
        if property.sold_tokens == property.total_tokens {
            property.is_active = false;
        }

        ctx.accounts.registry.total_raised_lamports += cost_lamports;

        // 2. Initialize PurchaseRecord PDA
        let record = &mut ctx.accounts.purchase_record;
        record.buyer           = ctx.accounts.buyer.key();
        record.property        = ctx.accounts.property.key();
        record.property_id     = property_id;
        record.token_mint      = ctx.accounts.token_mint.key();
        record.token_amount    = token_amount;
        record.price_per_token = ctx.accounts.property.price_per_token_lamports;
        record.total_price     = cost_lamports;
        record.timestamp       = timestamp;
        record.annual_yield    = ctx.accounts.property.annual_yield_bps;

        emit!(TokensPurchased {
            property_id: ctx.accounts.property.id.clone(),
            investor: ctx.accounts.buyer.key(),
            token_amount,
            cost_lamports,
            timestamp,
        });

        msg!("Purchased {} tokens with history. Record PDA: {}", token_amount, record.key());
        Ok(())
    }

    /// Reclaim rent from an old purchase record.
    pub fn close_purchase_record(_ctx: Context<ClosePurchaseRecord>) -> Result<()> {
        msg!("Purchase record closed");
        Ok(())
    }

    // ─── 4. Distribute yield to investors ────────────────────────────────────

    /// Admin distributes rental yield SOL to a single investor proportional
    /// to their token holdings. Called off-chain per investor.
    pub fn distribute_yield(
        ctx: Context<DistributeYield>,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, SolEstateError::InvalidPrice);

        // Transfer yield SOL from vault → investor
        **ctx.accounts.property_vault.try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.investor.try_borrow_mut_lamports()? += amount_lamports;

        emit!(YieldDistributed {
            property_id: ctx.accounts.property.id.clone(),
            investor: ctx.accounts.investor.key(),
            amount_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Yield distributed: {} lamports to {}",
            amount_lamports,
            ctx.accounts.investor.key()
        );

        Ok(())
    }

    // ─── 5. List tokens on P2P secondary market ───────────────────────────────

    /// Investor creates a sell listing for their fractional tokens.
    pub fn create_listing(
        ctx: Context<CreateListing>,
        token_amount: u64,
        price_per_token_lamports: u64,
    ) -> Result<()> {
        require!(token_amount > 0, SolEstateError::InvalidTokenCount);
        require!(price_per_token_lamports > 0, SolEstateError::InvalidPrice);

        // Lock tokens into listing escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.listing_escrow.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_amount,
        )?;

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.property = ctx.accounts.property.key();
        listing.token_mint = ctx.accounts.token_mint.key();
        listing.token_amount = token_amount;
        listing.price_per_token_lamports = price_per_token_lamports;
        listing.is_active = true;
        listing.created_at = Clock::get()?.unix_timestamp;
        listing.bump = ctx.bumps.listing;

        msg!(
            "Listing created: {} tokens at {} lamports each by {}",
            token_amount,
            price_per_token_lamports,
            ctx.accounts.seller.key()
        );

        Ok(())
    }

    // ─── 6. Buy from P2P listing ──────────────────────────────────────────────

    /// Buyer purchases tokens from a secondary market listing.
    pub fn fill_listing(ctx: Context<FillListing>) -> Result<()> {
        let token_amount = ctx.accounts.listing.token_amount;
        let price_per_token_lamports = ctx.accounts.listing.price_per_token_lamports;
        let bump = ctx.accounts.listing.bump;

        require!(ctx.accounts.listing.is_active, SolEstateError::ListingNotActive);

        let total_cost = price_per_token_lamports
            .checked_mul(token_amount)
            .ok_or(SolEstateError::ArithmeticOverflow)?;

        // SOL from buyer → seller
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.seller.key(),
            total_cost,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Tokens from escrow → buyer
        let listing_key = ctx.accounts.listing.key();
        let seeds = &[b"listing", listing_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.listing_escrow.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                signer_seeds,
            ),
            token_amount,
        )?;

        ctx.accounts.listing.is_active = false;

        emit!(ListingFilled {
            listing: ctx.accounts.listing.key(),
            buyer: ctx.accounts.buyer.key(),
            seller: ctx.accounts.seller.key(),
            token_amount,
            total_cost_lamports: total_cost,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── 7. Cancel listing ────────────────────────────────────────────────────

    /// Seller cancels their listing and reclaims escrowed tokens.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let token_amount = ctx.accounts.listing.token_amount;
        let bump = ctx.accounts.listing.bump;

        require!(ctx.accounts.listing.is_active, SolEstateError::ListingNotActive);
        require!(
            ctx.accounts.listing.seller == ctx.accounts.seller.key(),
            SolEstateError::Unauthorized
        );

        let listing_key = ctx.accounts.listing.key();
        let seeds = &[b"listing", listing_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.listing_escrow.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                signer_seeds,
            ),
            token_amount,
        )?;

        ctx.accounts.listing.is_active = false;
        msg!("Listing cancelled by {}", ctx.accounts.seller.key());
        Ok(())
    }

    // ─── 8. Close property (admin-only) ──────────────────────────────────────
    /// Closes a PropertyState PDA and returns rent to the admin.
    /// Used to re-create properties with new mint parameters (e.g., decimals change).
    pub fn close_property(_ctx: Context<CloseProperty>) -> Result<()> {
        msg!("Property closed");
        Ok(())
    }

    // ─── 8. Create Metaplex Metadata for existing or new tokens ──────────────
    pub fn create_property_metadata(
        ctx: Context<CreatePropertyMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let registry_key = ctx.accounts.registry.key();
        let property_id = ctx.accounts.property.id.clone();
        let property_bump = ctx.accounts.property.bump;

        let seeds = &[
            b"property",
            registry_key.as_ref(),
            property_id.as_bytes(),
            &[property_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.key(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    mint_authority: ctx.accounts.property.to_account_info(),
                    payer: ctx.accounts.admin.to_account_info(),
                    update_authority: ctx.accounts.property.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                signer_seeds,
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            true, // is_mutable
            true, // update_authority_is_signer
            None, // collection details
        )?;

        msg!("Metadata created for {}", ctx.accounts.property.id);
        Ok(())
    }

    // ─── 8b. Update Metaplex Metadata (name / symbol / uri) ──────────────────
    pub fn update_property_metadata(
        ctx: Context<UpdatePropertyMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let registry_key  = ctx.accounts.registry.key();
        let property_id   = ctx.accounts.property.id.clone();
        let property_bump = ctx.accounts.property.bump;

        let seeds = &[
            b"property",
            registry_key.as_ref(),
            property_id.as_bytes(),
            &[property_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        update_metadata_accounts_v2(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.key(),
                UpdateMetadataAccountsV2 {
                    metadata: ctx.accounts.metadata_account.to_account_info(),
                    update_authority: ctx.accounts.property.to_account_info(),
                },
                signer_seeds,
            ),
            None,               // new_update_authority
            Some(DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            }),
            None,               // primary_sale_happened
            Some(true),         // is_mutable
        )?;

        msg!("Metadata updated for {}", ctx.accounts.property.id);
        Ok(())
    }

    // ─── 9. Initialize Platform Treasury ─────────────────────────────────────
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.total_collected_lamports = 0;
        treasury.bump = ctx.bumps.treasury;
        msg!("Treasury initialized");
        Ok(())
    }

    // ─── 10. Lock tokens for bonus yield ──────────────────────────────────────
    /// Investor transfers tokens to a PDA vault and earns bonus yield.
    pub fn lock_tokens(
        ctx: Context<LockTokens>,
        token_amount: u64,
        lock_duration_days: u64,
    ) -> Result<()> {
        require!(token_amount > 0, SolEstateError::InvalidTokenCount);
        require!(lock_duration_days >= 30, SolEstateError::LockDurationTooShort);

        let lockup = &mut ctx.accounts.lockup;
        let clock = Clock::get()?;
        lockup.investor       = ctx.accounts.investor.key();
        lockup.property       = ctx.accounts.property.key();
        lockup.token_mint     = ctx.accounts.token_mint.key();
        lockup.locked_tokens  = token_amount;
        lockup.lock_until     = clock.unix_timestamp + (lock_duration_days as i64) * 86400;
        lockup.yield_bonus_bps = lockup_bonus_bps(lock_duration_days);
        lockup.bump           = ctx.bumps.lockup;

        // Transfer tokens from investor ATA → lockup vault PDA
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.investor_token_account.to_account_info(),
                    to: ctx.accounts.lockup_vault.to_account_info(),
                    authority: ctx.accounts.investor.to_account_info(),
                },
            ),
            token_amount * 1_000_000,
        )?;

        msg!(
            "Locked {} tokens for {} days. Bonus yield: +{}bps. Unlock at: {}",
            token_amount, lock_duration_days, lockup.yield_bonus_bps, lockup.lock_until
        );
        Ok(())
    }

    // ─── 11. Unlock tokens after lock period expires ───────────────────────────
    pub fn unlock_tokens(ctx: Context<UnlockTokens>) -> Result<()> {
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= ctx.accounts.lockup.lock_until,
            SolEstateError::LockupNotExpired
        );

        let lockup = &ctx.accounts.lockup;
        let locked = lockup.locked_tokens;
        let investor_key = lockup.investor;
        let property_key = lockup.property;
        let mint_key = lockup.token_mint;
        let bump = lockup.bump;

        // Sign as the lockup PDA
        let seeds = &[
            b"lockup",
            investor_key.as_ref(),
            property_key.as_ref(),
            mint_key.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer tokens from vault → investor
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.lockup_vault.to_account_info(),
                    to: ctx.accounts.investor_token_account.to_account_info(),
                    authority: ctx.accounts.lockup.to_account_info(),
                },
                signer_seeds,
            ),
            locked * 1_000_000,
        )?;

        msg!("Unlocked {} tokens", locked);
        Ok(())
    }

    // ─── 12. Create P2P sale listing ──────────────────────────────────────────
    pub fn create_sale_listing(
        ctx: Context<CreateSaleListing>,
        token_amount: u64,
        price_per_token_lamports: u64,
    ) -> Result<()> {
        require!(token_amount > 0, SolEstateError::InvalidTokenCount);
        require!(price_per_token_lamports > 0, SolEstateError::InvalidPrice);

        let listing = &mut ctx.accounts.sale_listing;
        let clock = Clock::get()?;

        listing.seller                  = ctx.accounts.seller.key();
        listing.property                = ctx.accounts.property.key();
        listing.token_mint              = ctx.accounts.token_mint.key();
        listing.token_amount            = token_amount;
        listing.price_per_token_lamports = price_per_token_lamports;
        listing.is_active               = true;
        listing.created_at              = clock.unix_timestamp;
        listing.bump                    = ctx.bumps.sale_listing;

        // Transfer tokens from seller → escrow vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.listing_vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            token_amount * 1_000_000,
        )?;

        msg!("Sale listing created: {} tokens at {} lamports each", token_amount, price_per_token_lamports);
        Ok(())
    }

    // ─── 13. Cancel P2P sale listing ──────────────────────────────────────────
    pub fn cancel_sale_listing(ctx: Context<CancelSaleListing>) -> Result<()> {
        let listing = &ctx.accounts.sale_listing;
        require!(listing.seller == ctx.accounts.seller.key(), SolEstateError::Unauthorized);

        let seller_key  = listing.seller;
        let property_key = listing.property;
        let mint_key    = listing.token_mint;
        let amount      = listing.token_amount;
        let bump        = listing.bump;

        // Account will be closed automatically via 'close = seller' constraint in the context

        let clock = Clock::get()?;
        let cooldown = &mut ctx.accounts.cooldown;
        cooldown.last_cancel_time = clock.unix_timestamp;
        cooldown.bump = ctx.bumps.cooldown;

        let seeds = &[
            b"sale_listing",
            seller_key.as_ref(),
            property_key.as_ref(),
            mint_key.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Return tokens to seller
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.listing_vault.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.sale_listing.to_account_info(),
                },
                signer_seeds,
            ),
            amount * 1_000_000,
        )?;

        // Close the vault account and return rent to the seller
        token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                anchor_spl::token::CloseAccount {
                    account: ctx.accounts.listing_vault.to_account_info(),
                    destination: ctx.accounts.seller.to_account_info(),
                    authority: ctx.accounts.sale_listing.to_account_info(),
                },
                signer_seeds,
            )
        )?;

        msg!("Listing cancelled, {} tokens returned to seller", amount);
        Ok(())
    }

    // ─── 14. Execute P2P sale (buyer purchases from listing) ──────────────────
    pub fn execute_sale(ctx: Context<ExecuteSale>) -> Result<()> {
        let listing = &ctx.accounts.sale_listing;
        // require!(listing.is_active, SolEstateError::ListingNotActive); // Removed for atomic closure

        let total_cost = listing.price_per_token_lamports
            .checked_mul(listing.token_amount)
            .ok_or(SolEstateError::ArithmeticOverflow)?;

        // Calculate platform fee (2%)
        let fee = total_cost
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(SolEstateError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(SolEstateError::ArithmeticOverflow)?;
        let seller_receives = total_cost.checked_sub(fee).ok_or(SolEstateError::ArithmeticOverflow)?;

        let seller_key  = listing.seller;
        let property_key = listing.property;
        let mint_key    = listing.token_mint;
        let amount      = listing.token_amount;
        let bump        = listing.bump;

        // Transfer SOL: buyer → seller (minus fee)
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.buyer.key(),
                &ctx.accounts.seller.key(),
                seller_receives,
            ),
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer SOL: buyer → treasury (fee)
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.buyer.key(),
                &ctx.accounts.treasury.key(),
                fee,
            ),
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        ctx.accounts.treasury.total_collected_lamports += fee;

        let seeds = &[
            b"sale_listing",
            seller_key.as_ref(),
            property_key.as_ref(),
            mint_key.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer tokens: vault → buyer
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.listing_vault.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.sale_listing.to_account_info(),
                },
                signer_seeds,
            ),
            amount * 1_000_000,
        )?;

        // Close the vault account and return rent to the seller
        token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                anchor_spl::token::CloseAccount {
                    account: ctx.accounts.listing_vault.to_account_info(),
                    destination: ctx.accounts.seller.to_account_info(),
                    authority: ctx.accounts.sale_listing.to_account_info(),
                },
                signer_seeds,
            )
        )?;

        msg!(
            "Sale executed: {} tokens sold for {} lamports. Fee: {} lamports",
            amount, total_cost, fee
        );
        Ok(())
    }
}

// ─────────────────────────────────────────────
// Account structs
// ─────────────────────────────────────────────

#[account]
pub struct PropertyRegistry {
    pub admin: Pubkey,          // 32
    pub property_count: u32,    // 4
    pub total_raised_lamports: u64, // 8
    pub bump: u8,               // 1
}

impl PropertyRegistry {
    pub const LEN: usize = 8 + 32 + 4 + 8 + 1;
}

#[account]
pub struct PropertyState {
    pub id: String,                      // 4 + 32 max
    pub admin: Pubkey,                   // 32
    pub token_mint: Pubkey,              // 32
    pub total_tokens: u64,               // 8
    pub sold_tokens: u64,                // 8
    pub price_per_token_lamports: u64,   // 8
    pub annual_yield_bps: u16,           // 2  (basis points, 100 = 1%)
    pub is_active: bool,                 // 1
    pub total_raised_lamports: u64,      // 8
    pub investor_count: u32,             // 4
    pub created_at: i64,                 // 8
    pub bump: u8,                        // 1
}

impl PropertyState {
    pub const MAX_ID_LEN: usize = 32;
    pub const LEN: usize = 8
        + (4 + Self::MAX_ID_LEN)  // String
        + 32 + 32                 // admin + mint
        + 8 + 8 + 8               // tokens x2 + price
        + 2 + 1 + 8 + 4 + 8 + 1; // yield, active, raised, investors, ts, bump
}

#[account]
pub struct PurchaseRecord {
    pub buyer: Pubkey,            // 32
    pub property: Pubkey,         // 32
    pub property_id: String,      // 4 + 32
    pub token_mint: Pubkey,       // 32
    pub token_amount: u64,        // 8
    pub price_per_token: u64,     // 8
    pub total_price: u64,         // 8
    pub timestamp: i64,           // 8
    pub annual_yield: u16,        // 2
}

impl PurchaseRecord {
    pub const LEN: usize = 8 + 32 + 32 + (4 + 32) + 32 + 8 + 8 + 8 + 8 + 2;
}

#[account]
pub struct Listing {
    pub seller: Pubkey,                  // 32
    pub property: Pubkey,                // 32
    pub token_mint: Pubkey,              // 32
    pub token_amount: u64,               // 8
    pub price_per_token_lamports: u64,   // 8
    pub is_active: bool,                 // 1
    pub created_at: i64,                 // 8
    pub bump: u8,                        // 1
}

impl Listing {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

#[account]
pub struct SaleListing {
    pub seller: Pubkey,                     // 32
    pub property: Pubkey,                   // 32
    pub token_mint: Pubkey,                 // 32
    pub token_amount: u64,                  // 8
    pub price_per_token_lamports: u64,      // 8
    pub is_active: bool,                    // 1
    pub created_at: i64,                    // 8
    pub bump: u8,                           // 1
}

impl SaleListing {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

#[account]
pub struct InvestorLockup {
    pub investor: Pubkey,                   // 32
    pub property: Pubkey,                   // 32
    pub token_mint: Pubkey,                 // 32
    pub locked_tokens: u64,                 // 8
    pub lock_until: i64,                    // 8  (unix timestamp)
    pub yield_bonus_bps: u16,              // 2
    pub bump: u8,                           // 1
}

impl InvestorLockup {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 1;
}

#[account]
pub struct PlatformTreasury {
    pub total_collected_lamports: u64,      // 8
    pub bump: u8,                           // 1
}

impl PlatformTreasury {
    pub const LEN: usize = 8 + 8 + 1;
}


// ─────────────────────────────────────────────
// Context definitions
// ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = PropertyRegistry::LEN,
        seeds = [b"registry"],
        bump
    )]
    pub registry: Account<'info, PropertyRegistry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: ListPropertyParams)]
pub struct ListProperty<'info> {
    #[account(
        init,
        payer = admin,
        space = PropertyState::LEN,
        seeds = [b"property", registry.key().as_ref(), params.id.as_bytes()],
        bump
    )]
    pub property: Box<Account<'info, PropertyState>>,

    /// New SPL mint for this property's fractional tokens
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,         // fungible — shows in Tokens tab in Phantom
        mint::authority = property, // PDA controls minting
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut, seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct PurchaseTokens<'info> {
    #[account(
        mut,
        seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()],
        bump = property.bump
    )]
    pub property: Box<Account<'info, PropertyState>>,

    #[account(
        mut,
        constraint = token_mint.key() == property.token_mint
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    /// Investor's Associated Token Account for this property's mint
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = token_mint,
        associated_token::authority = investor,
    )]
    pub investor_token_account: Box<Account<'info, TokenAccount>>,

    /// Property vault receives SOL payments
    #[account(
        mut,
        seeds = [b"vault", property.key().as_ref()],
        bump
    )]
    /// CHECK: PDA vault, no data needed
    pub property_vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub investor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(property_id: String, token_amount: u64, timestamp: i64)]
pub struct PurchaseTokensWithHistory<'info> {
    #[account(
        init,
        payer = buyer,
        space = PurchaseRecord::LEN,
        seeds = [b"purchase_record", buyer.key().as_ref(), property.key().as_ref(), &timestamp.to_le_bytes()],
        bump
    )]
    pub purchase_record: Box<Account<'info, PurchaseRecord>>,

    #[account(
        mut,
        seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()],
        bump = property.bump
    )]
    pub property: Box<Account<'info, PropertyState>>,

    #[account(mut, constraint = token_mint.key() == property.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, seeds = [b"vault", property.key().as_ref()], bump)]
    /// CHECK: PDA vault
    pub property_vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClosePurchaseRecord<'info> {
    #[account(
        mut, 
        close = buyer, 
        constraint = purchase_record.buyer == buyer.key() @ SolEstateError::Unauthorized
    )]
    pub purchase_record: Account<'info, PurchaseRecord>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeYield<'info> {
    #[account(mut, seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Account<'info, PropertyState>,

    #[account(
        mut,
        seeds = [b"vault", property.key().as_ref()],
        bump,
    )]
    /// CHECK: PDA vault
    pub property_vault: UncheckedAccount<'info>,

    /// CHECK: investor receiving yield
    #[account(mut)]
    pub investor: UncheckedAccount<'info>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, PropertyRegistry>,

    #[account(mut, constraint = admin.key() == registry.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(
        init,
        payer = seller,
        space = Listing::LEN,
        seeds = [b"listing", property.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        init,
        payer = seller,
        token::mint = token_mint,
        token::authority = listing,
        seeds = [b"escrow", listing.key().as_ref()],
        bump
    )]
    pub listing_escrow: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    pub property: Box<Account<'info, PropertyState>>,

    #[account(constraint = token_mint.key() == property.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FillListing<'info> {
    #[account(
        mut,
        seeds = [b"listing", property.key().as_ref(), listing.seller.as_ref()],
        bump = listing.bump,
        constraint = listing.is_active
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        mut,
        seeds = [b"escrow", listing.key().as_ref()],
        bump,
    )]
    pub listing_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: receives SOL
    #[account(mut, constraint = seller.key() == listing.seller)]
    pub seller: UncheckedAccount<'info>,

    pub property: Box<Account<'info, PropertyState>>,
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub buyer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        seeds = [b"listing", property.key().as_ref(), seller.key().as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"escrow", listing.key().as_ref()],
        bump,
    )]
    pub listing_escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub property: Account<'info, PropertyState>,

    #[account(mut)]
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────
// Instruction params
// ─────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ListPropertyParams {
    pub id: String,                    // e.g. "nyc-penthouse-001"
    pub total_tokens: u64,             // e.g. 10000
    pub price_per_token_lamports: u64, // e.g. 500_000_000 (0.5 SOL)
    pub annual_yield_bps: u16,         // e.g. 840 = 8.4%
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────

#[event]
pub struct TokensPurchased {
    pub property_id: String,
    pub investor: Pubkey,
    pub token_amount: u64,
    pub cost_lamports: u64,
    pub timestamp: i64,
}

#[event]
pub struct YieldDistributed {
    pub property_id: String,
    pub investor: Pubkey,
    pub amount_lamports: u64,
    pub timestamp: i64,
}

#[event]
pub struct ListingFilled {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub token_amount: u64,
    pub total_cost_lamports: u64,
    pub timestamp: i64,
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────


#[derive(Accounts)]
pub struct CloseProperty<'info> {
    #[account(
        mut,
        close = admin, // rent is returned to admin
        seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()],
        bump = property.bump,
        constraint = property.admin == admin.key() @ SolEstateError::Unauthorized,
    )]
    pub property: Box<Account<'info, PropertyState>>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePropertyMetadata<'info> {
    #[account(
        mut,
        seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()],
        bump = property.bump
    )]
    pub property: Box<Account<'info, PropertyState>>,

    #[account(mut, constraint = token_mint.key() == property.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Metaplex Metadata PDA
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            token_mint.key().as_ref()
        ],
        seeds::program = token_metadata_program.key(),
        bump,
    )]
    pub metadata_account: UncheckedAccount<'info>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdatePropertyMetadata<'info> {
    #[account(
        seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()],
        bump = property.bump
    )]
    pub property: Box<Account<'info, PropertyState>>,

    /// CHECK: Metaplex Metadata PDA — will be mutated via CPI
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            token_mint.key().as_ref()
        ],
        seeds::program = token_metadata_program.key(),
        bump,
    )]
    pub metadata_account: UncheckedAccount<'info>,

    #[account(constraint = token_mint.key() == property.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = admin,
        space = PlatformTreasury::LEN,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, PlatformTreasury>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockTokens<'info> {
    #[account(
        init,
        payer = investor,
        space = InvestorLockup::LEN,
        seeds = [b"lockup", investor.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub lockup: Box<Account<'info, InvestorLockup>>,

    /// CHECK: token vault owned by lockup PDA
    #[account(
        init,
        payer = investor,
        token::mint = token_mint,
        token::authority = lockup,
        seeds = [b"lockup_vault", investor.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub lockup_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = investor_token_account.owner == investor.key())]
    pub investor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut, seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Box<Account<'info, PropertyState>>,

    pub token_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub investor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    #[account(
        mut,
        close = investor,
        seeds = [b"lockup", investor.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump = lockup.bump
    )]
    pub lockup: Box<Account<'info, InvestorLockup>>,

    #[account(
        mut,
        seeds = [b"lockup_vault", investor.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub lockup_vault: Account<'info, TokenAccount>,

    #[account(mut, constraint = investor_token_account.owner == investor.key())]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Box<Account<'info, PropertyState>>,

    pub token_mint: Account<'info, Mint>,
    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub investor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateSaleListing<'info> {
    #[account(
        init,
        payer = seller,
        space = SaleListing::LEN,
        seeds = [b"sale_listing", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub sale_listing: Box<Account<'info, SaleListing>>,

    /// Token escrow vault owned by the sale_listing PDA
    #[account(
        init_if_needed,
        payer = seller,
        token::mint = token_mint,
        token::authority = sale_listing,
        seeds = [b"listing_vault", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub listing_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = seller_token_account.owner == seller.key())]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Box<Account<'info, PropertyState>>,

    pub token_mint: Box<Account<'info, Mint>>,
    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: Read-only — we manually inspect the cooldown timestamp if initialized.
    /// PDA seeds are verified via the constraint below.
    #[account(
        seeds = [b"cooldown", seller.key().as_ref(), property.key().as_ref()],
        bump
    )]
    pub cooldown: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelSaleListing<'info> {
    #[account(
        mut,
        close = seller,
        seeds = [b"sale_listing", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump = sale_listing.bump
    )]
    pub sale_listing: Account<'info, SaleListing>,

    #[account(
        mut,
        seeds = [b"listing_vault", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub listing_vault: Account<'info, TokenAccount>,

    #[account(mut, constraint = seller_token_account.owner == seller.key())]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Box<Account<'info, PropertyState>>,

    pub token_mint: Account<'info, Mint>,
    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    #[account(mut)]
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    #[account(
        init_if_needed,
        payer = seller,
        space = ListingCooldown::LEN,
        seeds = [b"cooldown", seller.key().as_ref(), property.key().as_ref()],
        bump
    )]
    pub cooldown: Box<Account<'info, ListingCooldown>>,
}

#[derive(Accounts)]
pub struct ExecuteSale<'info> {
    #[account(
        mut,
        close = seller,
        seeds = [b"sale_listing", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump = sale_listing.bump
    )]
    pub sale_listing: Account<'info, SaleListing>,

    #[account(
        mut,
        seeds = [b"listing_vault", seller.key().as_ref(), property.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub listing_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, PlatformTreasury>,

    #[account(seeds = [b"property", registry.key().as_ref(), property.id.as_bytes()], bump = property.bump)]
    pub property: Box<Account<'info, PropertyState>>,

    pub token_mint: Account<'info, Mint>,
    #[account(seeds = [b"registry"], bump = registry.bump)]
    pub registry: Box<Account<'info, PropertyRegistry>>,

    /// CHECK: just receiving SOL
    #[account(mut, constraint = seller.key() == sale_listing.seller)]
    pub seller: UncheckedAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum SolEstateError {
    #[msg("Property is not active for investment")]
    PropertyNotActive,
    #[msg("Insufficient tokens available")]
    InsufficientTokensAvailable,
    #[msg("Invalid token count")]
    InvalidTokenCount,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Yield percentage too high (max 50%)")]
    YieldTooHigh,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Lock duration must be at least 30 days")]
    LockDurationTooShort,
    #[msg("Lockup period has not expired yet")]
    LockupNotExpired,
    #[msg("You must wait 24 hours after cancelling a listing before relisting")]
    CooldownActive,
}

#[account]
pub struct ListingCooldown {
    pub last_cancel_time: i64,
    pub bump: u8,
}

impl ListingCooldown {
    pub const LEN: usize = 8 + 8 + 1;
}
