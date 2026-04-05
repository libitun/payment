import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'

const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.net', 'confirmed')

export interface PurchaseRecord {
  id: string
  propertyId: string
  propertyName: string
  propertyLocation: string
  propertyImage: string
  tokens: number
  pricePerToken: number
  totalSol: number
  signature: string
  timestamp: number
  annualYield: number
}

// Key format: purchases_{walletAddress}
function getStorageKey(walletAddress: string): string {
  return `purchases_${walletAddress}`
}

/**
 * Save purchase history to localStorage (keyed by wallet address)
 */
export function savePurchases(walletAddress: string, purchases: PurchaseRecord[]): void {
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(purchases))
  } catch (e) {
    console.error('Failed to save purchases:', e)
  }
}

/**
 * Load purchase history from localStorage for specific wallet
 */
export function loadPurchases(walletAddress: string): PurchaseRecord[] {
  try {
    const data = localStorage.getItem(getStorageKey(walletAddress))
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Failed to load purchases:', e)
    return []
  }
}

/**
 * Get actual token balances from blockchain
 */
export async function getActualTokenBalances(
  walletAddress: string,
  properties: Array<{ id: string; tokenMint: string; name: string; location: string; image: string; pricePerToken: number; annualYield: number }>
): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  
  try {
    const userPubkey = new PublicKey(walletAddress)
    
    for (const property of properties) {
      try {
        const mintPk = new PublicKey(property.tokenMint)
        const userTokenAccount = getAssociatedTokenAddressSync(
          mintPk,
          userPubkey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
        
        // Check if account exists
        const accountInfo = await connection.getAccountInfo(userTokenAccount)
        if (accountInfo) {
          // Get mint info for decimals
          const mintInfo = await connection.getAccountInfo(mintPk)
          let decimals = 6 // Default
          
          if (mintInfo && mintInfo.data.length >= 44) {
            decimals = mintInfo.data[44]
          }
          
          // Parse token account amount (bytes 64-72)
          const rawAmount = Number(new BN(accountInfo.data.slice(64, 72), 'le'))
          const actualTokens = rawAmount / Math.pow(10, decimals)
          
          if (actualTokens > 0) {
            balances.set(property.id, actualTokens)
          }
        }
      } catch (e) {
        // Property not owned by user
      }
    }
  } catch (e) {
    console.error('Failed to fetch token balances:', e)
  }
  
  return balances
}

/**
 * Sync purchase history with actual blockchain balances
 * Updates token counts in purchase records to match on-chain reality
 */
export async function syncPurchasesWithBlockchain(
  walletAddress: string,
  storedPurchases: PurchaseRecord[],
  properties: Array<{ id: string; tokenMint: string; name: string; location: string; image: string; pricePerToken: number; annualYield: number }>
): Promise<PurchaseRecord[]> {
  // Get actual balances from blockchain
  const actualBalances = await getActualTokenBalances(walletAddress, properties)
  
  // Group purchases by property
  const purchasesByProperty = new Map<string, PurchaseRecord[]>()
  storedPurchases.forEach(purchase => {
    if (!purchasesByProperty.has(purchase.propertyId)) {
      purchasesByProperty.set(purchase.propertyId, [])
    }
    purchasesByProperty.get(purchase.propertyId)!.push(purchase)
  })
  
  // Update token counts based on actual blockchain balances
  const syncedPurchases: PurchaseRecord[] = []
  
  for (const [propertyId, purchases] of purchasesByProperty) {
    const actualBalance = actualBalances.get(propertyId) || 0
    const totalPurchased = purchases.reduce((sum, p) => sum + p.tokens, 0)
    
    if (actualBalance === totalPurchased) {
      // Balance matches - keep all purchases as-is
      syncedPurchases.push(...purchases)
    } else if (actualBalance === 0) {
      // No tokens left - keep history but mark as sold
      syncedPurchases.push(...purchases.map(p => ({ ...p, tokens: 0 })))
    } else if (actualBalance < totalPurchased) {
      // Some tokens sold/transferred - distribute remaining tokens proportionally
      const ratio = actualBalance / totalPurchased
      syncedPurchases.push(...purchases.map(p => ({
        ...p,
        tokens: Math.floor(p.tokens * ratio)
      })))
    } else {
      // More tokens than purchased history shows - add synthetic purchase
      const extraTokens = actualBalance - totalPurchased
      if (extraTokens > 0 && purchases.length > 0) {
        const lastPurchase = purchases[purchases.length - 1]
        syncedPurchases.push(...purchases, {
          ...lastPurchase,
          id: `sync-${propertyId}-${Date.now()}`,
          tokens: extraTokens,
          totalSol: extraTokens * lastPurchase.pricePerToken,
          signature: 'synced-from-blockchain',
          timestamp: Date.now()
        })
      }
    }
  }
  
  return syncedPurchases.sort((a, b) => b.timestamp - a.timestamp)
}
