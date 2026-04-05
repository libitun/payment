# Руководство по деплою обновлённого смарт-контракта

## Что добавлено

1. **PurchaseRecord** - новая структура для хранения истории покупок on-chain
2. **purchase_tokens_with_history** - новая функция для покупки с записью в историю
3. Каждая покупка создаёт отдельный аккаунт с PDA: `["purchase_record", buyer, property, timestamp]`

## Шаги деплоя

### 1. Подготовка проекта

```bash
# Создайте новый Anchor проект или используйте существующий
anchor init real_estate_tokenization
cd real_estate_tokenization

# Скопируйте код из lib.rs в programs/real_estate_tokenization/src/lib.rs
```

### 2. Обновите Cargo.toml

```toml
[package]
name = "real-estate-tokenization"
version = "0.2.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "real_estate_tokenization"

[features]
no-entrypoint = []
no-idl = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
```

### 3. Обновите Anchor.toml

```toml
[features]
seeds = false
skip-lint = false

[programs.devnet]
real_estate_tokenization = "5tPSqDkPUP5sA56K25R2jN2sUrW57mf5m1b6QTPdRzYN"

[programs.mainnet]
# real_estate_tokenization = "ВАША_MAINNET_ПРОГРАММА"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

### 4. Билд и деплой

```bash
# Установите зависимости
yarn install

# Соберите программу
anchor build

# Получите program ID
solana address -k target/deploy/real_estate_tokenization-keypair.json

# Обновите program ID в lib.rs (declare_id!) и Anchor.toml

# Пересоберите с правильным ID
anchor build

# Деплой на devnet
anchor deploy --provider.cluster devnet

# Или на mainnet (требует SOL для деплоя)
# anchor deploy --provider.cluster mainnet
```

### 5. Проверка деплоя

```bash
# Проверьте программу
solana program show ВАША_ПРОГРАММА_ID --url devnet

# Посмотрите баланс программы
solana balance ВАША_ПРОГРАММА_ID --url devnet
```

## Обновление фронтенда

После успешного деплоя обновите код фронтенда:

### 1. Обновите PROGRAM_ID

```typescript
// lib/wallet-context.tsx или lib/p2p-market.ts
const PROGRAM_ID = new PublicKey('ВАШ_НОВЫЙ_PROGRAM_ID')
```

### 2. Добавьте функцию для чтения истории покупок

```typescript
// lib/purchase-history.ts
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

export async function fetchPurchaseHistory(wallet: any, buyerAddress: string) {
  const provider = new AnchorProvider(connection, wallet, {})
  const program = new Program(IDL, provider)
  
  // Получаем все PurchaseRecord для этого покупателя
  const records = await program.account.purchaseRecord.all([
    {
      memcmp: {
        offset: 8, // После discriminator
        bytes: buyerAddress, // Фильтр по buyer
      },
    },
  ])
  
  return records.map(r => ({
    buyer: r.account.buyer.toBase58(),
    propertyId: r.account.propertyId,
    tokenAmount: r.account.tokenAmount.toNumber(),
    pricePerToken: r.account.pricePerToken.toNumber() / 1e9,
    totalPrice: r.account.totalPrice.toNumber() / 1e9,
    timestamp: r.account.timestamp.toNumber() * 1000, // Convert to ms
    annualYield: r.account.annualYield,
  }))
}
```

### 3. Используйте новую функцию покупки

```typescript
// lib/wallet-context.tsx - функция purchaseTokens
export async function purchaseTokensWithHistory(
  wallet: any,
  propertyId: string,
  tokenAmount: number
) {
  const provider = getProvider(wallet)
  const program = new Program(IDL, provider)
  
  const buyer = wallet.publicKey
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    PROGRAM_ID
  )
  
  const [propertyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(propertyId)],
    PROGRAM_ID
  )
  
  const property = await program.account.propertyState.fetch(propertyPda)
  const timestamp = Math.floor(Date.now() / 1000)
  
  const [purchaseRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("purchase_record"),
      buyer.toBuffer(),
      propertyPda.toBuffer(),
      Buffer.from(timestamp.toString())
    ],
    PROGRAM_ID
  )
  
  return await program.methods.purchaseTokensWithHistory(propertyId, new BN(tokenAmount))
    .accounts({
      purchaseRecord: purchaseRecordPda,
      buyer,
      seller: property.seller,
      registry: registryPda,
      property: propertyPda,
      // ... остальные аккаунты
    })
    .rpc()
}
```

## Миграция существующих данных

Если у вас уже есть покупки в localStorage, можете создать скрипт миграции:

```typescript
// scripts/migrate-to-blockchain.ts
import { fetchPurchaseHistory } from '../lib/purchase-history'

async function migrate() {
  const wallet = window.phantom?.solana
  if (!wallet) throw new Error('Wallet not connected')
  
  // Загружаем из localStorage
  const localPurchases = JSON.parse(localStorage.getItem('solestate_purchases_' + wallet.publicKey) || '[]')
  
  // Загружаем из блокчейна
  const blockchainPurchases = await fetchPurchaseHistory(wallet, wallet.publicKey.toBase58())
  
  console.log('Local:', localPurchases.length)
  console.log('Blockchain:', blockchainPurchases.length)
  
  // Новые покупки делайте через purchaseTokensWithHistory
  // Старые покупки останутся в localStorage как legacy data
}
```

## Стоимость хранения

Каждая покупка создаёт аккаунт ~200 байт:
- Стоимость: ~0.0015 SOL (rent-exempt)
- Это автоматически списывается с покупателя при покупке
- Покупатель может закрыть старые записи и вернуть SOL через функцию `close_purchase_record`

## Дополнительная функция (опционально)

Добавьте возможность закрывать старые записи:

```rust
pub fn close_purchase_record(ctx: Context<ClosePurchaseRecord>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct ClosePurchaseRecord<'info> {
    #[account(
        mut,
        close = buyer,
        constraint = purchase_record.buyer == buyer.key()
    )]
    pub purchase_record: Account<'info, PurchaseRecord>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
}
```

## Поддержка

При возникновении проблем:
1. Проверьте логи: `solana logs --url devnet`
2. Проверьте баланс: Убедитесь, что у buyer достаточно SOL
3. Проверьте версии: Anchor 0.29.0, Solana 1.17+
