'use client'

import React, { useState } from 'react'
import { X, Loader2, Coins, ArrowRight, Building2, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react'
import Image from 'next/image'

interface Property {
  id: string
  name: string
  image: string
  tokenMint: string
}

interface SellModalProps {
  isOpen: boolean
  onClose: () => void
  property: Property
  maxTokens: number
  onSell: (amount: number, price: number) => Promise<void>
}

export function SellModal({ isOpen, onClose, property, maxTokens, onSell }: SellModalProps) {
  const [amount, setAmount] = useState<number>(1)
  const [price, setPrice] = useState<number>(0.01)
  const [isSelling, setIsSelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSell = async () => {
    setError(null)
    setSuccess(false)
    if (amount <= 0 || amount > maxTokens) return setError('Invalid amount')
    if (price <= 0) return setError('Invalid price')
    
    setIsSelling(true)
    try {
      await onSell(amount, price)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (e: any) {
      console.error(e)
      setError(e.message || 'An unexpected error occurred')
    } finally {
      setIsSelling(false)
    }
  }

  const totalValue = (amount * price).toFixed(4)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0b] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative h-32 w-full">
          <Image 
            src={property.image} 
            alt={property.name} 
            fill 
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0b] to-transparent" />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-6">
            <h3 className="text-xl font-bold text-white leading-tight">List for Sale</h3>
            <p className="text-xs text-white/60 flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />
              {property.name}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            {/* Amount Input */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Number of Tokens</label>
                <span className="text-[10px] text-accent/80 font-mono">Available: {maxTokens}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAmount(Math.max(1, amount - 1))}
                  disabled={amount <= 1}
                  className="w-10 h-10 bg-[#121214] border border-white/5 rounded-lg text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-lg font-bold"
                >
                  −
                </button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (val >= 1 && val <= maxTokens) setAmount(val)
                    }}
                    max={maxTokens}
                    min={1}
                    className="w-full bg-[#121214] border border-white/5 rounded-xl px-4 py-3 text-white text-center focus:outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <button
                  onClick={() => setAmount(Math.min(maxTokens, amount + 1))}
                  disabled={amount >= maxTokens}
                  className="w-10 h-10 bg-[#121214] border border-white/5 rounded-lg text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-lg font-bold"
                >
                  +
                </button>
                <button 
                  onClick={() => setAmount(maxTokens)}
                  className="px-3 py-3 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors bg-primary/10 hover:bg-primary/20 rounded-lg border border-primary/20"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Price Input */}
            <div>
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5 block">Price Per Token (SOL)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full bg-[#121214] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors pr-12"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                   <Coins className="w-4 h-4 text-accent" />
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Total Listing Value</span>
              <span className="text-white font-bold text-lg">{totalValue} <span className="text-xs font-normal text-white/40">SOL</span></span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-white/40">
              <ShieldCheck className="w-3 h-3 text-accent" />
              <span>Listing will be secured in escrow until sold</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 animate-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-start gap-2 animate-in slide-in-from-top-2 duration-200">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <p className="text-xs text-green-400 leading-relaxed">Successfully listed for sale! Check Active Listings below.</p>
            </div>
          )}

          {/* Action */}
          <button
            onClick={handleSell}
            disabled={isSelling || amount <= 0 || amount > maxTokens}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
          >
            {isSelling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Confirming in Wallet...
              </>
            ) : (
              <>
                List Now
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
