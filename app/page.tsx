'use client'

import Link from 'next/link'
import { Sparkles, LayoutGrid, Terminal, Shield, ArrowRight, Code2, Globe, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Create Tokens',
    description: 'Design custom ERC-20 tokens with name, symbol, supply, decimals, and metadata. Full validation and preview.',
    href: '/create',
  },
  {
    icon: Terminal,
    title: 'Simulate Deployment',
    description: 'Deploy to simulated networks (Ethereum, Polygon, Arbitrum, Optimism, Base) with realistic tx hashes and contract addresses.',
    href: '/create',
  },
  {
    icon: Code2,
    title: 'Interactive Contracts',
    description: 'Call transfer, approve, transferFrom, balanceOf, and allowance on your deployed tokens with a simulated wallet.',
    href: '/gallery',
  },
  {
    icon: LayoutGrid,
    title: 'Token Gallery',
    description: 'Browse all your created tokens, filter by network, search by name/symbol, and manage your portfolio.',
    href: '/gallery',
  },
  {
    icon: Shield,
    title: 'Export for Production',
    description: 'Download Solidity contracts (OpenZeppelin), ABIs, and metadata JSON ready for real mainnet deployment.',
    href: '/gallery',
  },
  {
    icon: Zap,
    title: 'Zero Setup',
    description: 'Runs entirely in your browser with localStorage persistence. No wallet connection, no gas fees, no risk.',
    href: '/create',
  },
]

const NETWORKS = [
  { name: 'Ethereum', chainId: 1, color: '#627EEA' },
  { name: 'Polygon', chainId: 137, color: '#8247E5' },
  { name: 'Arbitrum', chainId: 42161, color: '#28A0F0' },
  { name: 'Optimism', chainId: 10, color: '#FF0420' },
  { name: 'Base', chainId: 8453, color: '#0052FF' },
]

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="text-center space-y-8 animate-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-crypto-primaryDim border border-crypto-border text-crypto-primary text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-crypto-primary animate-pulse" />
          <span>Simulator v1.0 — Educational purposes only</span>
        </div>
        <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tight">
          <span className="text-crypto-text">Create & Deploy</span>
          <br />
          <span className="text-gradient">ERC-20 Tokens</span>
          <span className="text-crypto-text"> Instantly</span>
        </h1>
        <p className="text-xl text-crypto-textMuted max-w-2xl mx-auto text-balance">
          Design, deploy, and interact with custom tokens in a realistic simulated environment.
          Perfect for learning, prototyping, and testing — zero risk, zero gas fees.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="group w-full sm:w-auto">
            <Link href="/create">
              <Sparkles className="w-5 h-5 mr-2" />
              Create Your First Token
              <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/gallery">
              <LayoutGrid className="w-5 h-5 mr-2" />
              View Token Gallery
            </Link>
          </Button>
        </div>
        <div className="flex items-center justify-center gap-8 text-sm text-crypto-textMuted">
          {NETWORKS.map(net => (
            <span key={net.name} className="flex items-center gap-1.5" style={{ color: net.color }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: net.color }} />
              {net.name} (Chain ID: {net.chainId})
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="features-heading">
        <h2 id="features-heading" className="font-display text-3xl font-bold text-center text-crypto-text">
          Everything You Need to <span className="text-gradient">Build Tokens</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => (
            <Card
              key={feature.title}
              variant="glass"
              padding="lg"
              hover
              className="animate-in"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <CardContent className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-crypto-primaryDim border border-crypto-border flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-crypto-primary" />
                </div>
                <h3 className="font-display text-xl font-semibold text-crypto-text">{feature.title}</h3>
                <p className="text-crypto-textMuted">{feature.description}</p>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link href={feature.href}>Try it out <ArrowRight className="w-4 h-4 ml-1" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className="font-display text-3xl font-bold text-center text-crypto-text">
          How It <span className="text-gradient">Works</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Design Your Token',
              description: 'Fill in name, symbol, total supply, decimals, description, and upload a logo. Real-time validation ensures valid ERC-20 parameters.',
            },
            {
              step: '02',
              title: 'Simulate Deployment',
              description: 'Choose a network and deploy. Get a realistic transaction hash, contract address, block number, and gas usage — just like mainnet.',
            },
            {
              step: '03',
              title: 'Interact & Export',
              description: 'Call contract functions (transfer, approve, balanceOf) with a simulated wallet. Export Solidity code, ABI, and metadata for real deployment.',
            },
          ].map((step, i) => (
            <Card key={step.title} variant="glass" padding="lg" className="relative animate-in" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="absolute -top-3 left-6 w-10 h-10 rounded-xl bg-crypto-primary/20 border border-crypto-primary flex items-center justify-center font-display font-bold text-crypto-primary text-lg">
                {step.step}
              </div>
              <div className="pt-6 space-y-3">
                <h3 className="font-display text-xl font-semibold text-crypto-text">{step.title}</h3>
                <p className="text-crypto-textMuted">{step.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6 border-t border-crypto-border pt-16" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="font-display text-3xl font-bold text-center text-crypto-text">
          Ready to <span className="text-gradient">Create Your Token</span>?
        </h2>
        <p className="text-crypto-textMuted text-center max-w-xl mx-auto">
          Join thousands of developers learning and prototyping with TokenForge. Start building in seconds.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="xl" className="w-full sm:w-auto group">
            <Link href="/create">
              <Sparkles className="w-6 h-6 mr-2" />
              Create Token Now
              <ArrowRight className="w-6 h-6 ml-2 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl" className="w-full sm:w-auto">
            <Link href="/gallery">
              <LayoutGrid className="w-6 h-6 mr-2" />
              Browse Gallery
            </Link>
          </Button>
        </div>
        <p className="text-center text-sm text-crypto-textMuted mt-6">
          <strong className="text-crypto-warning">Disclaimer:</strong> This is a simulation for educational purposes only.
          No real blockchain transactions occur. Do not send real funds to generated addresses.
        </p>
      </section>
    </div>
  )
}