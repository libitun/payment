'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ExternalLink, RefreshCw, Info } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useWallet } from '@/lib/wallet-context'
import { properties, formatSOL } from '@/lib/properties'

// ── Mock order book data ───────────────────────────────────────────────────────

interface Listing {
  id: string
  propertyId: string
  propertyName: string
  location: string
  tokenMint: string
  seller: string
  tokens: number
  pricePerToken: number    // SOL
  originalPrice: number    // SOL (primary market price)
  change24h: number        // %
  volume24h: number        // SOL
  listedAt: string
  type: 'ask' | 'bid'
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

const MOCK_LISTINGS: Listing[] = [
  {
    id: 'l1', propertyId: 'nyc-penthouse', propertyName: 'Manhattan Penthouse',
    location: 'New York, USA', tokenMint: '7xKXtg2CW87d97TX8NcxvFiYEh4ZHUPMTE3XpBMpEDKV',
    seller: 'H4xPqW8LMNBv2RKs', tokens: 5, pricePerToken: 12.4, originalPrice: 12.0,
    change24h: 3.3, volume24h: 62, listedAt: '2 hours ago', type: 'ask',
  },
  {
    id: 'l2', propertyId: 'miami-villa', propertyName: 'Miami Beach Villa',
    location: 'Miami, USA', tokenMint: '3mZkP9nX4TqRsV7YwLcH6BuNpFjKWA2eDxGhCyM5oQi',
    seller: 'K9mLqV3RpXnWs4Bt', tokens: 10, pricePerToken: 8.9, originalPrice: 9.2,
    change24h: -3.3, volume24h: 89, listedAt: '5 hours ago', type: 'ask',
  },
  {
    id: 'l3', propertyId: 'dubai-tower', propertyName: 'Dubai Marina Tower',
    location: 'Dubai, UAE', tokenMint: 'AqBw5nTmXLRy9PKjVcMz4FgEh7DsUoN6YiWp3kCx8Jf',
    seller: 'P2kZwQ7MtRsXn5Lv', tokens: 20, pricePerToken: 6.75, originalPrice: 6.5,
    change24h: 3.8, volume24h: 135, listedAt: '1 day ago', type: 'ask',
  },
  {
    id: 'l4', propertyId: 'london-flat', propertyName: 'Mayfair Townhouse',
    location: 'London, UK', tokenMint: 'CnRx6sEjVWQp4HbKyMdTL9AfNm2oUiZ5gcPw8FqD3Yt',
    seller: 'M7tYqR2WpXsKn8Lv', tokens: 3, pricePerToken: 15.1, originalPrice: 15.0,
    change24h: 0.7, volume24h: 45.3, listedAt: '3 hours ago', type: 'ask',
  },
  {
    id: 'l5', propertyId: 'singapore-condo', propertyName: 'Marina Bay Condo',
    location: 'Singapore', tokenMint: 'DqWv7rFkTNLP5XcMjBsYA4EnGm3pRiZ6ohKd2gU9Cw',
    seller: 'J3nXqL8WrMsPt5Kv', tokens: 8, pricePerToken: 11.0, originalPrice: 11.5,
    change24h: -4.3, volume24h: 88, listedAt: '6 hours ago', type: 'ask',
  },
  {
    id: 'l6', propertyId: 'nyc-penthouse', propertyName: 'Manhattan Penthouse',
    location: 'New York, USA', tokenMint: '7xKXtg2CW87d97TX8NcxvFiYEh4ZHUPMTE3XpBMpEDKV',
    seller: 'B8vZpK4QmNtRs6Lw', tokens: 2, pricePerToken: 12.1, originalPrice: 12.0,
    change24h: 0.8, volume24h: 24.2, listedAt: '12 hours ago', type: 'ask',
  },
  {
    id: 'l7', propertyId: 'tokyo-apt', propertyName: 'Shibuya Apartments',
    location: 'Tokyo, Japan', tokenMint: 'FmPv8sGjTQLN6YcKxBzWA5EnRd3oUiZ7ihMe2fT9Dw',
    seller: 'N4kXqW7MrLsVp2Bt', tokens: 15, pricePerToken: 5.3, originalPrice: 5.0,
    change24h: 6.0, volume24h: 79.5, listedAt: '4 hours ago', type: 'ask',
  },
  {
    id: 'l8', propertyId: 'barcelona-penthouse', propertyName: 'Barcelona Penthouse',
    location: 'Barcelona, Spain', tokenMint: 'GnQw9tHkUROL7XdLyNcVA6FpMd4rUiZ8jnKe3hV0Ew',
    seller: 'Q5mYrK3WpNsXt8Lv', tokens: 6, pricePerToken: 7.8, originalPrice: 8.0,
    change24h: -2.5, volume24h: 46.8, listedAt: '8 hours ago', type: 'ask',
  },
]

type SortKey = 'pricePerToken' | 'change24h' | 'volume24h' | 'tokens'
type SortDir = 'asc' | 'desc'

export default function MarketPage() {
  const { connected, connect, shortAddress } = useWallet()
  const [sortKey, setSortKey] = useState<SortKey>('volume24h')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filter, setFilter] = useState<'all' | 'gains' | 'losses' | 'buy' | 'sell'>('all')
  const [buyModal, setBuyModal] = useState<Listing | null>(null)
  const [buyAmount, setBuyAmount] = useState(1)
  const [bought, setBought] = useState<string | null>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let list = [...MOCK_LISTINGS]
    if (filter === 'gains') list = list.filter((l) => l.change24h > 0)
    if (filter === 'losses') list = list.filter((l) => l.change24h < 0)
    if (filter === 'buy') list = list.filter((l) => l.type === 'bid')
    if (filter === 'sell') list = list.filter((l) => l.type === 'ask')
    list.sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [sortKey, sortDir, filter])

  const totalVolume = MOCK_LISTINGS.reduce((s, l) => s + l.volume24h, 0)
  const avgChange = MOCK_LISTINGS.reduce((s, l) => s + l.change24h, 0) / MOCK_LISTINGS.length

  function handleBuy() {
    if (!connected) { connect(); return }
    setBought(buyModal!.id)
    setTimeout(() => { setBought(null); setBuyModal(null) }, 2500)
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary" />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Header */}
        <section className="border-b border-border bg-card/40">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">Secondary Market</p>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">P2P Token Exchange</h1>
                <p className="text-muted-foreground mt-2 max-w-xl">
                  Trade tokenized real estate 24/7. Buy and sell SPL property tokens directly from other investors — no lock-up period.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground glass rounded-xl px-4 py-3 border border-border">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span>Solana Devnet</span>
                <span className="text-border">|</span>
                <RefreshCw className="w-3 h-3" />
                <span>Live mock data</span>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {[
                { label: '24h Volume', value: `${totalVolume.toFixed(0)} SOL` },
                { label: 'Active Listings', value: `${MOCK_LISTINGS.length}` },
                { label: 'Avg 24h Change', value: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%`, accent: avgChange > 0 },
                { label: 'Properties Listed', value: `${new Set(MOCK_LISTINGS.map((l) => l.propertyId)).size}` },
              ].map((s) => (
                <div key={s.label} className="glass rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.accent !== undefined ? (s.accent ? 'text-accent' : 'text-red-400') : 'text-foreground'}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Listings table */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          {/* Filter tabs */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 glass rounded-xl p-1 border border-border">
              {(['all', 'buy', 'sell', 'gains', 'losses'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                    filter === f
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'gains' ? 'Gainers' : f === 'losses' ? 'Losers' : f === 'buy' ? 'Buy' : f === 'sell' ? 'Sell' : 'All'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5" />
              <span>Prices shown in SOL</span>
            </div>
          </div>

          {/* Table */}
          <div className="glass rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="text-left px-5 py-3.5 text-xs text-muted-foreground font-medium">Property</th>
                    <th className="px-4 py-3.5">
                      <button
                        onClick={() => toggleSort('pricePerToken')}
                        className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground mx-auto"
                      >
                        Price / Token <SortIcon k="pricePerToken" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5">
                      <button
                        onClick={() => toggleSort('change24h')}
                        className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground mx-auto"
                      >
                        24h Change <SortIcon k="change24h" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5">
                      <button
                        onClick={() => toggleSort('volume24h')}
                        className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground mx-auto"
                      >
                        24h Volume <SortIcon k="volume24h" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5">
                      <button
                        onClick={() => toggleSort('tokens')}
                        className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground mx-auto"
                      >
                        Tokens <SortIcon k="tokens" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3.5 text-xs text-muted-foreground font-medium">Seller</th>
                    <th className="text-left px-4 py-3.5 text-xs text-muted-foreground font-medium">Listed</th>
                    <th className="px-4 py-3.5 text-xs text-muted-foreground font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((listing, i) => {
                    const diff = listing.pricePerToken - listing.originalPrice
                    const isUp = listing.change24h >= 0
                    return (
                      <tr
                        key={listing.id}
                        className={`border-b border-border/50 hover:bg-secondary/20 transition-colors ${i % 2 === 0 ? '' : 'bg-secondary/5'}`}
                      >
                        {/* Property */}
                        <td className="px-5 py-4">
                          <Link href={`/marketplace/${listing.propertyId}`} className="group">
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {listing.propertyName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{listing.location}</p>
                          </Link>
                        </td>

                        {/* Price */}
                        <td className="px-4 py-4 text-center">
                          <p className="font-semibold text-foreground">{formatSOL(listing.pricePerToken)}</p>
                          <p className={`text-xs mt-0.5 ${diff >= 0 ? 'text-accent' : 'text-red-400'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)} vs primary
                          </p>
                        </td>

                        {/* 24h Change */}
                        <td className="px-4 py-4 text-center">
                          <div className={`flex items-center justify-center gap-1 font-semibold ${isUp ? 'text-accent' : 'text-red-400'}`}>
                            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {isUp ? '+' : ''}{listing.change24h.toFixed(2)}%
                          </div>
                        </td>

                        {/* Volume */}
                        <td className="px-4 py-4 text-center">
                          <p className="text-foreground">{listing.volume24h.toFixed(1)} SOL</p>
                        </td>

                        {/* Tokens */}
                        <td className="px-4 py-4 text-center">
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                            {listing.tokens}
                          </span>
                        </td>

                        {/* Seller */}
                        <td className="px-4 py-4">
                          <a
                            href={`https://solscan.io/account/${listing.seller}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            {shortAddr(listing.seller)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>

                        {/* Listed */}
                        <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {listing.listedAt}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => { setBuyModal(listing); setBuyAmount(1) }}
                            className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-colors whitespace-nowrap"
                          >
                            Buy
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* How it works note */}
          <div className="mt-6 glass rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">How the P2P Market Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">1</span>
                <span>Investors list their SPL property tokens at any price they choose — above or below the primary market rate.</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">2</span>
                <span>Buyers connect a Solana wallet (Phantom/Solflare) and purchase tokens instantly via on-chain SPL transfer.</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">3</span>
                <span>Rental yield accrues to the new token holder from the next distribution cycle automatically.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Buy Modal */}
      {buyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl border border-border p-6 w-full max-w-md shadow-2xl">
            {bought === buyModal.id ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-accent" />
                </div>
                <p className="text-lg font-bold text-foreground">Purchase Queued!</p>
                <p className="text-sm text-muted-foreground text-center">
                  Your order for {buyAmount} token{buyAmount > 1 ? 's' : ''} of {buyModal.propertyName} has been submitted on Solana devnet.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{buyModal.propertyName}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{buyModal.location}</p>
                  </div>
                  <button
                    onClick={() => setBuyModal(null)}
                    className="text-muted-foreground hover:text-foreground text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Order details */}
                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Price per token</span>
                    <span className="font-semibold text-foreground">{formatSOL(buyModal.pricePerToken)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Available tokens</span>
                    <span className="text-foreground">{buyModal.tokens}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Seller</span>
                    <span className="font-mono text-xs text-muted-foreground">{shortAddr(buyModal.seller)}</span>
                  </div>
                </div>

                {/* Token amount */}
                <div className="mb-5">
                  <label className="text-xs text-muted-foreground block mb-2">Quantity</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))}
                      className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20 text-lg"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={buyModal.tokens}
                      value={buyAmount}
                      onChange={(e) => setBuyAmount(Math.min(buyModal.tokens, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="flex-1 text-center bg-secondary border border-border rounded-lg py-2 text-foreground text-sm focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={() => setBuyAmount(Math.min(buyModal.tokens, buyAmount + 1))}
                      className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20 text-lg"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-secondary space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total cost</span>
                      <span className="font-semibold text-foreground">{formatSOL(buyAmount * buyModal.pricePerToken)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">vs primary market</span>
                      <span className={buyModal.pricePerToken >= buyModal.originalPrice ? 'text-red-400' : 'text-accent'}>
                        {buyModal.pricePerToken >= buyModal.originalPrice ? '+' : ''}
                        {((buyModal.pricePerToken - buyModal.originalPrice) / buyModal.originalPrice * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBuy}
                  className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors glow-purple"
                >
                  {connected ? `Buy ${buyAmount} Token${buyAmount > 1 ? 's' : ''} — ${formatSOL(buyAmount * buyModal.pricePerToken)}` : 'Connect Wallet to Buy'}
                </button>

                {connected && (
                  <p className="mt-2 text-center text-xs text-muted-foreground font-mono">{shortAddress}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
