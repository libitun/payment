'use client'

import { use, useState, useCallback, useMemo } from 'react'
import { useWallet, getSolanaProvider } from '@/lib/wallet-context'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  MapPin,
  Home,
  Bath,
  Maximize2,
  Calendar,
  TrendingUp,
  Users,
  ChevronRight,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Tag,
  ShieldCheck,
  Coins,
  Check,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import { SellModal } from '@/components/SellModal'
import { createSaleListing } from '@/lib/p2p-market'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import {
  getPropertyById,
  getFundingProgress,
  formatSOL,
  formatUSD,
  properties,
} from '@/lib/properties'
import { PropertyCard } from '@/components/property-card'
import { notFound } from 'next/navigation'

// Locale-safe number formatter — avoids SSR/client locale mismatch
function formatNum(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const statusConfig = {
  active: { label: 'Live — Accepting Investments', color: 'text-accent', dot: 'bg-accent' },
  funded: { label: 'Fully Funded', color: 'text-primary', dot: 'bg-primary' },
  coming_soon: { label: 'Coming Soon', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

type TxStatus = { state: 'success'; sig: string } | { state: 'error'; msg: string } | null

interface PageProps {
  params: Promise<{ id: string }>
}

export default function PropertyDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const property = getPropertyById(id)
  if (!property) notFound()

  const progress = getFundingProgress(property)
  const isFullyFunded = property.soldTokens >= property.totalTokens
  const status = isFullyFunded ? statusConfig.funded : statusConfig[property.status]

  const [tokenAmount, setTokenAmount] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const [txStatus, setTxStatus] = useState<TxStatus>(null)

  const totalCost = tokenAmount * property.pricePerToken
  const monthlyReturn = (totalCost * (property.annualYield / 100)) / 12
  // SOL price proxy: totalCost is in SOL, convert to lamports
  const lamports = Math.round(totalCost * 1e9)

  const { connected, connect, shortAddress, sendPurchaseTx, purchases } = useWallet()
  const [isSellModalOpen, setIsSellModalOpen] = useState(false)

  const userHoldings = useMemo(() => {
    return purchases
      .filter(p => p.propertyId === property.id)
      .reduce((sum, p) => sum + p.tokens, 0)
  }, [purchases, property.id])

  const related = properties.filter((p) => p.id !== property.id).slice(0, 3)

  const handleInvest = useCallback(async () => {
    if (property.status !== 'active' || isFullyFunded) return
    if (!connected) { await connect(); return }
    setPurchasing(true)
    setTxStatus(null)
    try {
      const sig = await sendPurchaseTx({
        lamports,
        propertyId: property.id,
        propertyName: property.name,
        propertyLocation: `${property.location}, ${property.country}`,
        propertyImage: property.image,
        tokens: tokenAmount,
        pricePerToken: property.pricePerToken,
        annualYield: property.annualYield,
      })
      setTxStatus({ state: 'success', sig })
    } catch (err) {
      const code = (err as { code?: number })?.code
      if (code === 4001) {
        setTxStatus(null) // user cancelled in Phantom
      } else {
        const msg = (err as Error)?.message ?? 'Transaction failed'
        setTxStatus({ state: 'error', msg })
      }
    } finally {
      setPurchasing(false)
    }
  }, [connected, connect, sendPurchaseTx, lamports, tokenAmount, property, isFullyFunded])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Breadcrumb */}
        <div className="border-b border-border bg-card/50">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/marketplace" className="hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Marketplace
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground truncate">{property.name}</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: main content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Hero image */}
              <div className="relative h-72 md:h-96 rounded-2xl overflow-hidden">
                <Image
                  src={property.image}
                  alt={property.name}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className={`flex items-center gap-2 text-sm font-medium ${status.color}`}>
                    <div className={`w-2 h-2 rounded-full ${status.dot} animate-pulse`} />
                    {status.label}
                  </div>
                </div>
              </div>

              {/* Title & location */}
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">{property.name}</h1>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{property.location}, {property.country}</span>
                </div>
              </div>

              {/* Property stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {property.bedrooms && (
                  <div className="glass rounded-xl p-4 border-glow">
                    <Home className="w-4 h-4 text-muted-foreground mb-2" />
                    <p className="text-lg font-semibold text-foreground">{property.bedrooms}</p>
                    <p className="text-xs text-muted-foreground">Bedrooms</p>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="glass rounded-xl p-4 border-glow">
                    <Bath className="w-4 h-4 text-muted-foreground mb-2" />
                    <p className="text-lg font-semibold text-foreground">{property.bathrooms}</p>
                    <p className="text-xs text-muted-foreground">Bathrooms</p>
                  </div>
                )}
                <div className="glass rounded-xl p-4 border-glow">
                  <Maximize2 className="w-4 h-4 text-muted-foreground mb-2" />
                  <p className="text-lg font-semibold text-foreground">{formatNum(property.sqft)}</p>
                  <p className="text-xs text-muted-foreground">Sq. ft.</p>
                </div>
                <div className="glass rounded-xl p-4 border-glow">
                  <Calendar className="w-4 h-4 text-muted-foreground mb-2" />
                  <p className="text-lg font-semibold text-foreground">{property.yearBuilt}</p>
                  <p className="text-xs text-muted-foreground">Year Built</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">About this property</h2>
                <p className="text-muted-foreground leading-relaxed">{property.description}</p>
              </div>

              {/* Highlights */}
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Investment Highlights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {property.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex items-start gap-3 glass rounded-xl p-4 border-glow"
                    >
                      <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-accent" />
                      </div>
                      <span className="text-sm text-foreground">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Yield history chart */}
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-4">Yield History</h2>
                <div className="glass rounded-2xl p-6 border-glow">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={property.yieldHistory} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <defs>
                        <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9945ff" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#9945ff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" tick={{ fill: '#6060a0', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6060a0', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#16161f', border: '1px solid rgba(153,69,255,0.3)', borderRadius: '8px', color: '#e8e8f0', fontSize: 12 }}
                        formatter={(value: number) => [`${value}%`, 'Yield']}
                      />
                      <Area type="monotone" dataKey="yield" stroke="#9945ff" strokeWidth={2} fill="url(#yieldGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

            {/* Right: investment panel (sticky) */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                {/* Investment card */}
                <div className="glass rounded-2xl p-6 border-glow">
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Annual Yield</p>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-accent" />
                        <span className="text-2xl font-bold text-accent">{property.annualYield}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Per Token</p>
                      <p className="text-2xl font-bold text-foreground">{formatSOL(property.pricePerToken)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Monthly Rent</p>
                      <p className="text-base font-semibold text-foreground">{formatUSD(property.monthlyRent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Occupancy</p>
                      <p className="text-base font-semibold text-foreground">{property.occupancyRate}%</p>
                    </div>
                  </div>

                  {/* Funding progress */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span>{progress}% funded</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatNum(property.totalTokens - property.soldTokens)} tokens left
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #9945ff, #19fb9b)' }}
                      />
                    </div>
                  </div>

                  {/* Token selector */}
                  {property.status === 'active' && !isFullyFunded && (
                    <div className="mb-6">
                      <label className="text-sm text-muted-foreground block mb-2">
                        Number of tokens
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setTokenAmount(Math.max(1, tokenAmount - 1))}
                          className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors text-lg"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={property.totalTokens - property.soldTokens}
                          value={tokenAmount}
                          onChange={(e) => setTokenAmount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="flex-1 text-center bg-secondary border border-border rounded-lg py-2 text-foreground text-sm focus:outline-none focus:border-primary/50"
                        />
                        <button
                          onClick={() => setTokenAmount(tokenAmount + 1)}
                          className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors text-lg"
                        >
                          +
                        </button>
                      </div>

                      {/* Cost breakdown */}
                      <div className="mt-3 p-3 rounded-xl bg-secondary space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Total cost</span>
                          <span className="text-foreground font-medium">{formatSOL(totalCost)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Est. monthly return</span>
                          <span className="text-accent font-medium">+{formatUSD(monthlyReturn * 180)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Ownership share</span>
                          <span className="text-foreground font-medium">
                            {((tokenAmount / property.totalTokens) * 100).toFixed(4)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invest button */}
                  {property.status === 'active' && !isFullyFunded ? (
                    connected ? (
                      <div className="flex gap-2">
                        <button
                          onClick={handleInvest}
                          disabled={purchasing}
                          className="flex-1 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors glow-purple flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {purchasing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Awaiting Signature...
                            </>
                          ) : (
                            `Invest Now — ${formatSOL(totalCost)}`
                          )}
                        </button>
                        {userHoldings > 0 && (
                          <button
                            onClick={() => setIsSellModalOpen(true)}
                            className="px-4 py-3.5 rounded-xl bg-secondary border border-white/5 text-white/50 hover:text-white hover:bg-secondary/80 transition-all flex items-center justify-center shrink-0"
                            title="Sell your tokens"
                          >
                            <Tag className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={connect}
                        className="w-full py-3.5 rounded-xl bg-secondary border border-primary/40 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
                      >
                        Connect Wallet to Invest
                      </button>
                    )
                  ) : property.status === 'coming_soon' ? (
                    <button className="w-full py-3.5 rounded-xl bg-secondary border border-border text-muted-foreground font-semibold text-sm cursor-not-allowed">
                      Notify Me When Live
                    </button>
                  ) : (
                    <button className="w-full py-3.5 rounded-xl bg-secondary border border-border text-muted-foreground font-semibold text-sm cursor-not-allowed">
                      Fully Funded
                    </button>
                  )}

                  {/* ── Transaction result banner ───────────────────────── */}
                  {txStatus && (
                    <div
                      className={`mt-4 rounded-xl p-4 flex items-start gap-3 border text-sm ${txStatus.state === 'success'
                        ? 'bg-accent/10 border-accent/30'
                        : 'bg-destructive/10 border-destructive/30'
                        }`}
                    >
                      {txStatus.state === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        {txStatus.state === 'success' ? (
                          <>
                            <p className="text-accent font-semibold mb-1">Transaction confirmed</p>
                            <p className="text-muted-foreground text-xs mb-2">
                              {tokenAmount} token{tokenAmount > 1 ? 's' : ''} of {property.name} purchased on devnet.
                            </p>
                            <a
                              href={`https://solscan.io/tx/${txStatus.sig}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline break-all"
                            >
                              {txStatus.sig.slice(0, 20)}...{txStatus.sig.slice(-8)}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </>
                        ) : (
                          <>
                            <p className="text-destructive font-semibold mb-1">Transaction failed</p>
                            <p className="text-muted-foreground text-xs">{txStatus.msg}</p>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => setTxStatus(null)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Connected wallet info */}
                  {connected && shortAddress && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      <span className="font-mono">{shortAddress}</span>
                      <span>— Solana Devnet</span>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Demo on Solana devnet. No real funds involved.</span>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="glass rounded-2xl p-6 border-glow">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Financial Summary</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Target Raise', value: formatUSD(property.targetRaise) },
                      { label: 'Min. Investment', value: formatSOL(property.minInvestment) },
                      { label: 'Appreciation Target', value: `+${property.appreciationTarget}% p.a.` },
                      { label: 'Property Type', value: property.type.charAt(0).toUpperCase() + property.type.slice(1) },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="text-foreground font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Token info */}
                <div className="glass rounded-2xl p-6 border-glow">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Token Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Token Mint</span>
                      <a
                        href={`https://solscan.io/token/${property.tokenMint}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                      >
                        {property.tokenMint.slice(0, 4)}...{property.tokenMint.slice(-4)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Network</span>
                      <span className="text-foreground font-medium">Devnet</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Standard</span>
                      <span className="text-foreground font-medium">SPL</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Supply</span>
                      <span className="text-foreground font-medium">{formatNum(property.totalTokens)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Related properties */}
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-foreground mb-6">More Properties</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <SellModal
        isOpen={isSellModalOpen}
        onClose={() => setIsSellModalOpen(null as any)}
        property={{
          id: property.id,
          name: property.name,
          image: property.image,
          tokenMint: '' // Handled by library
        }}
        maxTokens={userHoldings}
        onSell={async (amt, prc) => {
          const wallet = getSolanaProvider()
          if (!wallet) throw new Error('Wallet not connected')
          const priceLamports = Math.floor(prc * 1e9)
          try {
            const sig = await createSaleListing(wallet, property.id, amt, priceLamports)
            toast.success('Successfully listed for sale!', {
              description: (
                <div className="flex flex-col gap-2">
                  <span>{amt} tokens listed at {prc} SOL each. View in Portfolio &gt; Active Listings</span>
                  <a 
                    href={`https://solscan.io/tx/${sig}?cluster=devnet`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )
            })
          } catch (e: any) {
            toast.error('Failed to create listing', {
              description: e.message
            })
            throw e
          }
        }}
      />
    </div>
  )
}
