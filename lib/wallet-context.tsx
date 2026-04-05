'use client'

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, VersionedTransaction, TransactionMessage } from '@solana/web3.js'
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { X, Wallet } from 'lucide-react'
import { PROGRAM_ID as PROGRAM_ID_STR, DEVNET_RPC, COMMITMENT } from './config'
import { properties } from './properties'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SolanaProvider {
  isPhantom?: boolean
  isBackpack?: boolean
  isSolflare?: boolean
  publicKey: PublicKey | { toString(): string } | null
  isConnected: boolean
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signAndSendTransaction(tx: Transaction | { serialize(): Uint8Array } | Uint8Array): Promise<{ signature: string }>
  request(args: { method: string; params?: unknown }): Promise<{ signature: string }>
  signTransaction?(tx: Transaction): Promise<Transaction>
  signAllTransactions?(txs: Transaction[]): Promise<Transaction[]>
}

export type WalletType = 'phantom' | 'backpack' | 'solflare'

export function getSolanaProvider(walletType?: WalletType): SolanaProvider | null {
  if (typeof window === 'undefined') return null
  const win = window as unknown as {
    phantom?: { solana?: SolanaProvider }
    backpack?: SolanaProvider & { isBackpack?: boolean }
    solflare?: SolanaProvider
    solana?: SolanaProvider
  }
  // If a specific wallet is requested, return only that one
  if (walletType === 'solflare') return win.solflare ?? null
  if (walletType === 'backpack') return win.backpack ?? null
  if (walletType === 'phantom') return win.phantom?.solana ?? null
  // Auto-detect: check which was last used
  const lastWallet = typeof window !== 'undefined' ? localStorage.getItem('solestateWalletType') : null
  if (lastWallet === 'solflare' && win.solflare) return win.solflare
  if (lastWallet === 'backpack' && win.backpack) return win.backpack
  if (lastWallet === 'phantom' && win.phantom?.solana) return win.phantom.solana
  // Fallback order
  if (win.phantom?.solana?.isPhantom) return win.phantom.solana
  if (win.backpack) return win.backpack
  if (win.solflare?.isSolflare) return win.solflare
  if (win.solana) return win.solana
  return null
}

function detectAvailableWallets(): { phantom: boolean; backpack: boolean; solflare: boolean } {
  if (typeof window === 'undefined') return { phantom: false, backpack: false, solflare: false }
  const win = window as any
  return {
    phantom: !!win.phantom?.solana?.isPhantom,
    backpack: !!win.backpack,
    solflare: !!win.solflare?.isSolflare,
  }
}

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


// ── Context ───────────────────────────────────────────────────────────────────

export interface WalletContextState {
  connected: boolean
  connecting: boolean
  publicKey: string | null
  balance: number | null
  shortAddress: string | null
  purchases: PurchaseRecord[]
  walletType: WalletType | null
  connect: () => Promise<void>
  connectWithWallet: (type: WalletType) => Promise<void>
  disconnect: () => void
  sendPurchaseTx: (params: {
    lamports: number
    propertyId: string
    propertyName: string
    propertyLocation: string
    propertyImage: string
    tokens: number
    pricePerToken: number
    annualYield: number
  }) => Promise<string>
  getTokenBalance: (tokenMint: string) => Promise<number>
}

const WalletCtx = createContext<WalletContextState>({
  connected: false,
  connecting: false,
  publicKey: null,
  balance: null,
  shortAddress: null,
  purchases: [],
  walletType: null,
  connect: async () => {},
  connectWithWallet: async () => {},
  disconnect: () => {},
  sendPurchaseTx: async () => { throw new Error('Wallet not connected') },
  getTokenBalance: async () => 0,
})

export function useWallet() { return useContext(WalletCtx) }

// ── Smart Contract Setup ──────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR)
const connection = new Connection(DEVNET_RPC, COMMITMENT)

export const IDL = {
  address: PROGRAM_ID_STR,
  metadata: { name: "solestate", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "purchaseTokens",
      discriminator: [142, 1, 16, 160, 115, 120, 55, 254],
      accounts: [
        { name: "property", writable: true },
        { name: "tokenMint", writable: true },
        { name: "investorTokenAccount", writable: true },
        { name: "propertyVault", writable: true },
        { name: "registry", writable: true },
        { name: "investor", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" }
      ],
      args: [{ name: "tokenAmount", type: "u64" }]
    },
    {
      name: "lockTokens",
      discriminator: [136, 11, 32, 232, 161, 117, 54, 211],
      accounts: [
        { name: "lockup", writable: true },
        { name: "lockupVault", writable: true },
        { name: "investorTokenAccount", writable: true },
        { name: "property", writable: true },
        { name: "tokenMint" },
        { name: "registry" },
        { name: "investor", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ],
      args: [{ name: "tokenAmount", type: "u64" }, { name: "lockDurationDays", type: "u64" }]
    },
    {
      name: "unlockTokens",
      discriminator: [233, 35, 95, 159, 37, 185, 47, 88],
      accounts: [
        { name: "lockup", writable: true },
        { name: "lockupVault", writable: true },
        { name: "investorTokenAccount", writable: true },
        { name: "property" },
        { name: "tokenMint" },
        { name: "registry" },
        { name: "investor", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" }
      ],
      args: []
    },
    {
      name: "createSaleListing",
      discriminator: [73, 149, 159, 221, 165, 15, 130, 126],
      accounts: [
        { name: "saleListing", writable: true },
        { name: "listingVault", writable: true },
        { name: "sellerTokenAccount", writable: true },
        { name: "property" },
        { name: "tokenMint" },
        { name: "registry" },
        { name: "seller", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "rent" },
        { name: "cooldown" }
      ],
      args: [{ name: "tokenAmount", type: "u64" }, { name: "price", type: "u64" }]
    },
    {
      name: "cancelSaleListing",
      discriminator: [225, 101, 236, 250, 241, 94, 141, 24],
      accounts: [
        { name: "saleListing", writable: true },
        { name: "listingVault", writable: true },
        { name: "sellerTokenAccount", writable: true },
        { name: "property" },
        { name: "tokenMint" },
        { name: "registry" },
        { name: "seller", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "cooldown", writable: true }
      ],
      args: []
    },
    {
      name: "executeSale",
      discriminator: [37, 74, 217, 157, 79, 49, 35, 6],
      accounts: [
        { name: "saleListing", writable: true },
        { name: "listingVault", writable: true },
        { name: "buyerTokenAccount", writable: true },
        { name: "treasury", writable: true },
        { name: "property" },
        { name: "tokenMint" },
        { name: "registry" },
        { name: "seller", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" }
      ],
      args: []
    },
    {
      name: "purchaseTokensWithHistory",
      discriminator: [127, 251, 9, 12, 102, 7, 71, 36],
      accounts: [
        { name: "purchaseRecord", writable: true },
        { name: "property", writable: true },
        { name: "tokenMint", writable: true },
        { name: "buyerTokenAccount", writable: true },
        { name: "propertyVault", writable: true },
        { name: "registry", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "tokenProgram" },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ],
      args: [
        { name: "_id", type: "string" },
        { name: "tokenAmount", type: "u64" },
        { name: "timestamp", type: "i64" }
      ]
    },
    {
      name: "closePurchaseRecord",
      discriminator: [111, 230, 169, 137, 246, 203, 104, 255],
      accounts: [
        { name: "purchaseRecord", writable: true },
        { name: "buyer", writable: true, signer: true },
        { name: "systemProgram" }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "PropertyState",
      discriminator: [207, 94, 222, 94, 178, 10, 5, 93]
    },
    {
      name: "SaleListing",
      discriminator: [167, 97, 203, 156, 150, 97, 238, 220]
    },
    {
      name: "InvestorLockup",
      discriminator: [187, 129, 166, 32, 119, 34, 244, 201]
    },
    {
      name: "PurchaseRecord",
      discriminator: [239, 38, 40, 199, 4, 96, 209, 2]
    }
  ],
  types: [
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
    },
    {
      name: "SaleListing",
      type: {
        kind: "struct",
        fields: [
          { name: "seller", type: "pubkey" },
          { name: "property", type: "pubkey" },
          { name: "tokenMint", type: "pubkey" },
          { name: "tokenAmount", type: "u64" },
          { name: "pricePerTokenLamports", type: "u64" },
          { name: "isActive", type: "bool" },
          { name: "createdAt", type: "i64" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "InvestorLockup",
      type: {
        kind: "struct",
        fields: [
          { name: "investor", type: "pubkey" },
          { name: "property", type: "pubkey" },
          { name: "tokenMint", type: "pubkey" },
          { name: "lockedTokens", type: "u64" },
          { name: "lockUntil", type: "i64" },
          { name: "yieldBonusBps", type: "u16" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "PurchaseRecord",
      // IMPORTANT: The field order MUST exactly match the smart contract struct in lib.rs
      // otherwise Anchor will read bytes from the wrong offsets (mismatched memory layout).
      discriminator: [239, 38, 40, 199, 4, 96, 209, 2],
      type: {
        kind: "struct",
        fields: [
          { name: "buyer", type: "pubkey" },
          { name: "property", type: "pubkey" },
          { name: "propertyId", type: "string" },
          { name: "tokenMint", type: "pubkey" },
          { name: "tokenAmount", type: "u64" },
          { name: "pricePerToken", type: "u64" },
          { name: "totalPrice", type: "u64" },
          { name: "timestamp", type: "i64" },
          { name: "annualYield", type: "u16" }
        ]
      }
    }
  ]
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([])
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)

  const fetchPurchaseHistory = useCallback(async (walletAddr: string) => {
    try {
      const p = getSolanaProvider()
      if (!p) return
      
      const provider = new AnchorProvider(connection, p as any, { preflightCommitment: 'confirmed' })
      const program = new Program(IDL as any, provider)
      const userPk = new PublicKey(walletAddr)
      const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)

      // ── 1. Fetch on-chain PurchaseRecord accounts (purchases WITH history) ──
      let onChainRecords: PurchaseRecord[] = []
      try {
        const records = await (program.account as any).purchaseRecord.all([
          { memcmp: { offset: 8, bytes: walletAddr } }
        ])
        onChainRecords = records.map((r: any) => {
          const acc = r.account as any
          const property = properties.find((p) => {
            const [pda] = PublicKey.findProgramAddressSync(
              [Buffer.from("property"), registryPda.toBuffer(), Buffer.from(p.id)],
              PROGRAM_ID
            )
            return pda.equals(acc.property)
          })
          if (!property) return null
          const tokenAmountRaw = acc.tokenAmount || acc.token_amount
          const tokens = tokenAmountRaw ? Number(tokenAmountRaw.toString()) : 0
          const timestampRaw = acc.timestamp
          const timestampMs = timestampRaw ? Number(timestampRaw.toString()) * 1000 : Date.now()
          return {
            id: r.publicKey.toBase58(),
            propertyId: property.id,
            propertyName: property.name,
            propertyLocation: property.location,
            propertyImage: property.image,
            tokens,
            pricePerToken: property.pricePerToken,
            totalSol: tokens * property.pricePerToken,
            signature: r.publicKey.toBase58(),
            timestamp: timestampMs,
            annualYield: property.annualYield,
          }
        }).filter((p: PurchaseRecord | null): p is PurchaseRecord => p !== null)
      } catch (e) {
        console.warn('[SolEstate] PurchaseRecord fetch failed, falling back to ATA scan:', e)
      }

      // ── 2. ATA balance fallback for old purchases (purchase_tokens without history) ──
      // For each known property mint, check if user has a token balance.
      // This catches tokens bought before PurchaseRecord was introduced.
      const ataResults: PurchaseRecord[] = []
      const propertiesWithMint = properties.filter(prop => prop.tokenMint)
      await Promise.all(
        propertiesWithMint.map(async (property) => {
          try {
            const mintPk = new PublicKey(property.tokenMint)
            const ata = getAssociatedTokenAddressSync(mintPk, userPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
            const info = await connection.getAccountInfo(ata)
            if (!info || info.data.length < 72) return
            const rawAmount = info.data.readBigUInt64LE(64)
            const tokens = Number(rawAmount) / 1_000_000
            if (tokens <= 0) return
            // Only add if there's no existing on-chain record covering this property
            const alreadyCovered = onChainRecords.some(r => r.propertyId === property.id)
            if (alreadyCovered) return
            ataResults.push({
              id: `ata-${property.id}`,
              propertyId: property.id,
              propertyName: property.name,
              propertyLocation: property.location,
              propertyImage: property.image,
              tokens,
              pricePerToken: property.pricePerToken,
              totalSol: tokens * property.pricePerToken,
              signature: '',
              timestamp: 0, // Unknown — token was purchased before history tracking
              annualYield: property.annualYield,
            })
          } catch { /* ATA doesn't exist for this mint — skip */ }
        })
      )

      const allPurchases = [...onChainRecords, ...ataResults]
      allPurchases.sort((a, b) => b.timestamp - a.timestamp)
      setPurchases(allPurchases)
    } catch (err) {
      console.error('[SolEstate] Failed to fetch purchase history:', err)
      setPurchases([])
    }
  }, [])

  useEffect(() => {
    if (publicKey) {
      fetchPurchaseHistory(publicKey)
    } else {
      setPurchases([])
    }
  }, [publicKey, fetchPurchaseHistory])

  const refreshBalance = useCallback(async (addr: string) => {
    try {
      const b = await connection.getBalance(new PublicKey(addr))
      setBalance(b / 1e9)
    } catch { /* noop */ }
  }, [])

  // Re-attach on mount if already approved
  useEffect(() => {
    const autoConnect = async () => {
      const lastWalletType = typeof window !== 'undefined' ? localStorage.getItem('solestateWalletType') as WalletType : null
      const p = getSolanaProvider(lastWalletType || undefined)
      if (!p) return

      // Check if user previously connected (stored in localStorage)
      const wasConnected = typeof window !== 'undefined' && localStorage.getItem('solestateWalletConnected') === 'true'
      
      if (wasConnected) {
        try {
          // Silently reconnect without showing approval popup
          await p.connect({ onlyIfTrusted: true })
        } catch (err) {
          // If silent connect fails, clear the flag
          console.log('[v0] Silent reconnect failed:', err)
          localStorage.removeItem('solestateWalletConnected')
          localStorage.removeItem('solestateWalletType')
          return
        }
      }

      // If wallet is already connected, set state
      if (p.isConnected && p.publicKey) {
        const addr = p.publicKey.toString()
        setPublicKey(addr)
        setConnected(true)
        setWalletType(lastWalletType || 'phantom')
        refreshBalance(addr)
        // Ensure flag is set
        if (typeof window !== 'undefined') {
          localStorage.setItem('solestateWalletConnected', 'true')
          localStorage.setItem('solestateWalletType', lastWalletType || 'phantom')
        }
      }
    }

    autoConnect()
  }, [refreshBalance])

  const connect = useCallback(async () => {
    const wallets = detectAvailableWallets()
    const installedCount = Object.values(wallets).filter(Boolean).length
    
    if (installedCount > 1) {
      setShowWalletModal(true)
      return
    }

    let target: WalletType = 'phantom'
    if (wallets.backpack) target = 'backpack'
    else if (wallets.solflare) target = 'solflare'
    
    await connectWithWallet(target)
  }, [])

  const connectWithWallet = useCallback(async (type: WalletType) => {
    setShowWalletModal(false)
    setConnecting(true)
    const p = getSolanaProvider(type)
    if (!p) {
      if (type === 'backpack') window.open('https://backpack.app/', '_blank')
      else if (type === 'solflare') window.open('https://solflare.com/', '_blank')
      else window.open('https://phantom.app/', '_blank')
      setConnecting(false)
      return
    }
    try {
      const res = await p.connect() as any
      const pk = res?.publicKey || p.publicKey
      if (!pk) throw new Error('Failed to get public key')
      const addr = pk.toString()
      setPublicKey(addr)
      setConnected(true)
      setWalletType(type)
      refreshBalance(addr)
      if (typeof window !== 'undefined') {
        localStorage.setItem('solestateWalletConnected', 'true')
        localStorage.setItem('solestateWalletType', type)
      }
    } catch (err) {
      const code = (err as { code?: number })?.code
      if (code !== 4001) console.error('[SolEstate] Wallet connect error:', err)
    } finally {
      setConnecting(false)
    }
  }, [refreshBalance])

  const disconnect = useCallback(() => {
    getSolanaProvider(walletType || undefined)?.disconnect().catch(() => {})
    setConnected(false)
    setPublicKey(null)
    setBalance(null)
    setWalletType(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('solestateWalletConnected')
      localStorage.removeItem('solestateWalletType')
    }
  }, [walletType])

  const sendPurchaseTx = useCallback(async (params: {
    lamports: number
    propertyId: string
    propertyName: string
    propertyLocation: string
    propertyImage: string
    tokens: number
    pricePerToken: number
    annualYield: number
  }): Promise<string> => {
    const wallet = getSolanaProvider(walletType || undefined)
    if (!wallet || !wallet.publicKey) throw new Error('Wallet not connected')

    const fromAddress = new PublicKey(wallet.publicKey.toString())

    // 1. Setup Anchor Provider
    const anchorProvider = new AnchorProvider(
      connection,
      wallet as any,
      { preflightCommitment: 'confirmed' }
    )
    const program = new Program(IDL as any, anchorProvider)

    // 2. Compute PDAs
    const REGISTRY_SEED = Buffer.from("registry")
    const [registryPda] = PublicKey.findProgramAddressSync([REGISTRY_SEED], PROGRAM_ID)

    const propIdBuffer = Buffer.from(params.propertyId)
    const [propertyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), registryPda.toBuffer(), propIdBuffer],
      PROGRAM_ID
    )

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), propertyPda.toBuffer()],
      PROGRAM_ID
    )

    // 3. Fetch PropertyState to get the tokenMint
    const propAccount = await (program.account as any).propertyState.fetch(propertyPda)
    const tokenMint = propAccount.tokenMint as PublicKey

    // 4. Compute Investor's Associated Token Account
    const investorTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      fromAddress,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // 5. Invoke purchaseTokensWithHistory
    const timestamp = Math.floor(Date.now() / 1000)
    
    // Compute PurchaseRecord PDA using BN for compatibility
    const timestampBuffer = new BN(timestamp).toArrayLike(Buffer, 'le', 8)
    
    const [purchaseRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("purchase_record"),
        fromAddress.toBuffer(),
        propertyPda.toBuffer(),
        timestampBuffer
      ],
      PROGRAM_ID
    )

    const ix = await (program.methods as any)
      .purchaseTokensWithHistory(params.propertyId, new BN(params.tokens), new BN(timestamp))
      .accounts({
        purchaseRecord: purchaseRecordPda,
        property: propertyPda,
        tokenMint: tokenMint,
        buyerTokenAccount: investorTokenAccount,
        propertyVault: vaultPda,
        registry: registryPda,
        buyer: fromAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction()

    // Build transaction using VersionedTransaction (Phantom prefers this and it fixes many false-positive simulation errors)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    
    const messageV0 = new TransactionMessage({
      payerKey: fromAddress,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message()

    const tx = new VersionedTransaction(messageV0)

    // ── Pre-flight balance check ──────────────────────────────────────────────
    const walletBalance = await connection.getBalance(fromAddress)
    const requiredLamports = params.lamports + 5_000_000 // token price + ~0.005 SOL rent buffer
    if (walletBalance < requiredLamports) {
      throw new Error(
        `Insufficient SOL. Need ${(requiredLamports / 1e9).toFixed(4)} SOL ` +
        `(${(params.lamports / 1e9).toFixed(4)} for tokens + ~0.005 for rent/fees), ` +
        `but wallet has ${(walletBalance / 1e9).toFixed(4)} SOL.`
      )
    }

    // ── Own simulation before sending to Phantom ──────────────────────────────
    try {
      const sim = await connection.simulateTransaction(tx, { sigVerify: false })
      const logs = (sim.value.logs ?? []).join('\n')
      console.info('[SolEstate] Simulation result:', sim.value.err ?? 'OK', '\nLogs:\n' + logs)
      if (sim.value.err) {
        if (logs.includes('InsufficientFundsForRent')) {
          throw new Error('Not enough SOL to pay for Solana account rent. Top up at faucet.solana.com.')
        }
        if (logs.includes('PropertyNotActive')) {
          throw new Error(`"${params.propertyName}" is not currently accepting investments. Please refresh.`)
        }
        if (logs.includes('InsufficientTokensAvailable')) {
          throw new Error(`Not enough tokens left in "${params.propertyName}". Try a smaller amount.`)
        }
        throw new Error(
          `Smart contract rejected the transaction. ` +
          `Buying ${params.tokens} token(s) of "${params.propertyName}" for ${(params.lamports / 1e9).toFixed(4)} SOL. ` +
          `Error: ${JSON.stringify(sim.value.err)}`
        )
      }
    } catch (simErr: any) {
      if (simErr.message?.includes('token') || simErr.message?.includes('SOL') ||
          simErr.message?.includes('rent') || simErr.message?.includes('Smart contract')) {
        throw simErr // Re-throw our friendly errors
      }
      console.warn('[SolEstate] simulateTransaction RPC failed (non-fatal):', simErr)
    }

    // ── Send to Provider ──────────────────────────────────────────────────────
    let signature: string
    try {
      const result = await wallet.signAndSendTransaction(tx)
      signature = result.signature
    } catch (err: any) {
      if (err?.code === 4001) throw err // User cancelled — re-throw as-is
      const logs: string[] = err?.logs ?? []
      const logStr = Array.isArray(logs) ? logs.join('\n') : String(err?.message ?? '')
      if (logStr.includes('InsufficientFundsForRent') || logStr.includes('insufficient lamports')) {
        throw new Error('Not enough SOL for rent. Top up your wallet at faucet.solana.com.')
      }
      if (logStr.includes('PropertyNotActive')) throw new Error('Property is not active.')
      if (logStr.includes('InsufficientTokensAvailable')) throw new Error('Tokens sold out.')
      throw new Error(err?.message ?? 'Transaction failed. Check your SOL balance and try again.')
    }

    // 6. Record purchase in local State
    const record: PurchaseRecord = {
      id: signature,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      propertyLocation: params.propertyLocation,
      propertyImage: params.propertyImage,
      tokens: params.tokens,
      pricePerToken: params.pricePerToken,
      totalSol: params.lamports / 1e9,
      signature,
      timestamp: Date.now(),
      annualYield: params.annualYield,
    }
    setPurchases((prev) => [record, ...prev])

    // 7. Refresh SOL balance
    refreshBalance(fromAddress.toBase58())

    return signature
  }, [refreshBalance])

  const getTokenBalance = useCallback(async (mintStr: string) => {
    if (!publicKey) return 0
    try {
      const mintPk = new PublicKey(mintStr)
      const userPk = new PublicKey(publicKey)
      const ata = getAssociatedTokenAddressSync(mintPk, userPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
      
      const info = await connection.getAccountInfo(ata)
      if (!info || info.data.length < 72) return 0
      
      // SPL tokens use base units. In this dapp, property tokens have 6 decimals.
      // We divide by 1,000,000 to get the human-readable amount.
      const amount = info.data.readBigUInt64LE(64)
      return Number(amount.toString()) / 1_000_000
    } catch (err) {
      console.error('[SolEstate] Failed to fetch token balance:', err)
      return 0
    }
  }, [publicKey])

  const shortAddress = useMemo(() =>
    publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null,
    [publicKey]
  )

  const value = useMemo<WalletContextState>(
    () => ({ connected, connecting, publicKey, balance, shortAddress, purchases, walletType, connect, connectWithWallet, disconnect, sendPurchaseTx, getTokenBalance }),
    [connected, connecting, publicKey, balance, shortAddress, purchases, walletType, connect, connectWithWallet, disconnect, sendPurchaseTx, getTokenBalance]
  )

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setShowWalletModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Wallet className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Connect Wallet</h2>
            </div>
            <div className="space-y-3">
              <button 
                onClick={() => connectWithWallet('phantom')}
                className="w-full h-14 rounded-xl border border-white/5 bg-secondary flex items-center justify-between px-4 hover:bg-secondary/80 hover:border-primary/40 transition-all font-medium text-foreground"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <img src="https://phantom.app/favicon.ico" alt="Phantom" className="w-5 h-5 rounded-sm" />
                  </div>
                  Phantom
                </div>
                {typeof window !== 'undefined' && !(window as any).phantom?.solana?.isPhantom && (
                  <span className="text-xs text-muted-foreground">Install</span>
                )}
              </button>
              
              <button 
                onClick={() => connectWithWallet('backpack')}
                className="w-full h-14 rounded-xl border border-white/5 bg-secondary flex items-center justify-between px-4 hover:bg-secondary/80 hover:border-primary/40 transition-all font-medium text-foreground"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <img src="https://backpack.app/favicon.ico" alt="Backpack" className="w-5 h-5 rounded-sm" />
                  </div>
                  Backpack
                </div>
                {typeof window !== 'undefined' && !(window as any).backpack && (
                  <span className="text-xs text-muted-foreground">Install</span>
                )}
              </button>

              <button 
                onClick={() => connectWithWallet('solflare')}
                className="w-full h-14 rounded-xl border border-white/5 bg-secondary flex items-center justify-between px-4 hover:bg-secondary/80 hover:border-primary/40 transition-all font-medium text-foreground"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <img src="https://solflare.com/favicon.ico" alt="Solflare" className="w-5 h-5 rounded-sm" />
                  </div>
                  Solflare
                </div>
                {typeof window !== 'undefined' && !(window as any).solflare?.isSolflare && (
                  <span className="text-xs text-muted-foreground">Install</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </WalletCtx.Provider>
  )
}
