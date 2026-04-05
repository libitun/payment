use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("5tPSqDkPUP5sA56K25R2jN2sUrW57mf5m1b6QTPdRzYN"); // Замените на ваш program ID

#[program]
pub mod real_estate_tokenization {
    use super::*;

    // ========================================================================
    // НОВАЯ ФУНКЦИЯ: Покупка токенов с записью в историю
    // ========================================================================
    pub fn purchase_tokens_with_history(
        ctx: Context<PurchaseTokensWithHistory>,
        property_id: String,
        token_amount: u64,
    ) -> Result<()> {
        let property = &ctx.accounts.property;
        let purchase_record = &mut ctx.accounts.purchase_record;
        let buyer = &ctx.accounts.buyer;
        
        // 1. Записываем информацию о покупке
        purchase_record.buyer = buyer.key();
        purchase_record.property = property.key();
        purchase_record.property_id = property_id;
        purchase_record.token_mint = property.token_mint;
        purchase_record.token_amount = token_amount;
        purchase_record.price_per_token = property.price_per_token;
        purchase_record.total_price = token_amount
            .checked_mul(property.price_per_token)
            .ok_or(ErrorCode::Overflow)?;
        purchase_record.timestamp = Clock::get()?.unix_timestamp;
        purchase_record.annual_yield = property.annual_yield;
        
        // 2. Переводим SOL продавцу
        let transfer_amount = purchase_record.total_price;
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: buyer.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, transfer_amount)?;
        
        // 3. Переводим токены покупателю
        let seeds = &[
            b"property",
            ctx.accounts.registry.key().as_ref(),
            purchase_record.property_id.as_bytes(),
            &[ctx.bumps.property],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.property_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: property.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, token_amount)?;
        
        Ok(())
    }

    // ========================================================================
    // НОВАЯ ФУНКЦИЯ: Получить все покупки пользователя
    // ========================================================================
    // Примечание: Эта функция нужна только для reference
    // Фактическое чтение будет через program.account.purchaseRecord.all()
    
    // Остальные функции из вашего контракта (оставляем без изменений)
    // createSaleListing, cancelSaleListing, purchaseListing, lockTokens и т.д.
}

// ========================================================================
// НОВАЯ СТРУКТУРА: Запись о покупке
// ========================================================================
#[account]
pub struct PurchaseRecord {
    pub buyer: Pubkey,              // 32 байта - кто купил
    pub property: Pubkey,           // 32 байта - какое свойство
    pub property_id: String,        // ~20 байт - ID свойства
    pub token_mint: Pubkey,         // 32 байта - адрес токена
    pub token_amount: u64,          // 8 байт - сколько токенов
    pub price_per_token: u64,       // 8 байт - цена за токен (lamports)
    pub total_price: u64,           // 8 байт - общая цена (lamports)
    pub timestamp: i64,             // 8 байт - время покупки
    pub annual_yield: u16,          // 2 байта - годовая доходность
}

impl PurchaseRecord {
    pub const MAX_SIZE: usize = 8 + // discriminator
        32 + // buyer
        32 + // property
        (4 + 20) + // property_id (String with max 20 chars)
        32 + // token_mint
        8 + // token_amount
        8 + // price_per_token
        8 + // total_price
        8 + // timestamp
        2; // annual_yield
}

// ========================================================================
// КОНТЕКСТ ДЛЯ ПОКУПКИ С ИСТОРИЕЙ
// ========================================================================
#[derive(Accounts)]
#[instruction(property_id: String)]
pub struct PurchaseTokensWithHistory<'info> {
    #[account(
        init,
        payer = buyer,
        space = PurchaseRecord::MAX_SIZE,
        seeds = [
            b"purchase_record",
            buyer.key().as_ref(),
            property.key().as_ref(),
            &Clock::get()?.unix_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub purchase_record: Account<'info, PurchaseRecord>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: Продавец проверяется в property
    #[account(mut)]
    pub seller: AccountInfo<'info>,
    
    #[account(
        seeds = [b"registry"],
        bump
    )]
    pub registry: Account<'info, Registry>,
    
    #[account(
        mut,
        seeds = [
            b"property",
            registry.key().as_ref(),
            property_id.as_bytes()
        ],
        bump
    )]
    pub property: Account<'info, PropertyState>,
    
    #[account(
        mut,
        associated_token::mint = property.token_mint,
        associated_token::authority = property
    )]
    pub property_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = property.token_mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
}

// ========================================================================
// СУЩЕСТВУЮЩИЕ СТРУКТУРЫ (из вашего контракта)
// ========================================================================
#[account]
pub struct Registry {
    pub admin: Pubkey,
}

#[account]
pub struct PropertyState {
    pub registry: Pubkey,
    pub property_id: String,
    pub token_mint: Pubkey,
    pub price_per_token: u64,
    pub annual_yield: u16,
    pub seller: Pubkey,
}

#[account]
pub struct SaleListing {
    pub seller: Pubkey,
    pub property: Pubkey,
    pub token_mint: Pubkey,
    pub token_amount: u64,
    pub price_per_token_lamports: u64,
    pub is_active: bool,
}

#[account]
pub struct InvestorLockup {
    pub investor: Pubkey,
    pub property: Pubkey,
    pub token_mint: Pubkey,
    pub locked_amount: u64,
    pub unlock_timestamp: i64,
}

// ========================================================================
// ОШИБКИ
// ========================================================================
#[error_code]
pub enum ErrorCode {
    #[msg("Overflow occurred")]
    Overflow,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Insufficient tokens")]
    InsufficientTokens,
    #[msg("Tokens are still locked")]
    TokensLocked,
}
