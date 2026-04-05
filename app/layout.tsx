import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/lib/wallet-context'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SolEstate — Tokenized Real Estate on Solana',
  description:
    'Invest in fractional real estate backed by blockchain. Buy property tokens, earn rental yield, and trade 24/7 on Solana.',
  keywords: ['Solana', 'real estate', 'tokenization', 'RWA', 'DeFi', 'fractional ownership'],
  authors: [{ name: 'SolEstate' }],
  openGraph: {
    title: 'SolEstate — Tokenized Real Estate on Solana',
    description: 'Fractional real estate ownership powered by Solana blockchain.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground" suppressHydrationWarning>
        {/* suppressHydrationWarning on this div prevents false hydration errors
            caused by browser extensions (e.g. Bitdefender) that add attributes like
            bis_skin_checked="1" to DOM elements before React hydrates. */}
        <div suppressHydrationWarning>
          <WalletProvider>
            {children}
          </WalletProvider>
          <Toaster position="top-right" theme="dark" richColors />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </div>
      </body>
    </html>
  )
}
