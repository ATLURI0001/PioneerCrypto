import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const spaceGrotesk = Inter({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'TokenForge - Create & Deploy ERC-20 Tokens',
  description: 'Create, deploy, and interact with ERC-20 tokens in a simulated environment. Perfect for learning, prototyping, and testing smart contract interactions.',
  keywords: ['erc20', 'token', 'ethereum', 'smart contract', 'crypto', 'web3', 'blockchain'],
  authors: [{ name: 'TokenForge' }],
  openGraph: {
    title: 'TokenForge - Create & Deploy ERC-20 Tokens',
    description: 'Create, deploy, and interact with ERC-20 tokens in a simulated environment.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} dark`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-crypto-bg text-crypto-text font-sans antialiased">
        <div className="flex flex-col min-h-screen pt-16">
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  )
}