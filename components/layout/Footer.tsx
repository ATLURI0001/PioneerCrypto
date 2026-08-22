'use client'

import Link from 'next/link'
import { Github, Twitter, Globe, Shield } from 'lucide-react'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-crypto-bgSecondary/50 bg-crypto-bg/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-crypto-primary to-crypto-accent flex items-center justify-center">
                <Shield className="w-5 h-5 text-crypto-bg" />
              </div>
              <span className="font-display text-xl font-bold text-crypto-text">TokenForge</span>
            </div>
            <p className="text-crypto-textMuted max-w-sm">
              Create, deploy, and interact with ERC-20 tokens in a simulated environment.
              Perfect for learning, prototyping, and testing smart contract interactions.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-crypto-text mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-crypto-textMuted">
              <li><Link href="/create" className="hover:text-crypto-primary transition-colors">Create Token</Link></li>
              <li><Link href="/gallery" className="hover:text-crypto-primary transition-colors">Token Gallery</Link></li>
              <li><a href="https://docs.openzeppelin.com/contracts/4.x/erc20" target="_blank" rel="noopener noreferrer" className="hover:text-crypto-primary transition-colors flex items-center gap-1">OpenZeppelin ERC-20 <Globe className="w-3 h-3" /></a></li>
              <li><a href="https://eips.ethereum.org/EIPS/eip-20" target="_blank" rel="noopener noreferrer" className="hover:text-crypto-primary transition-colors flex items-center gap-1">EIP-20 Standard <Globe className="w-3 h-3" /></a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-crypto-text mb-4">Connect</h4>
            <div className="flex items-center gap-4">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-crypto-textMuted hover:text-crypto-primary transition-colors" aria-label="GitHub">
                <Github className="w-5 h-5" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-crypto-textMuted hover:text-crypto-primary transition-colors" aria-label="Twitter">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-crypto-bgSecondary/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-crypto-textMuted">
            © {currentYear} TokenForge. Built for education and prototyping.
          </p>
          <p className="text-sm text-crypto-textMuted">
            <strong className="text-crypto-warning">Not for real funds.</strong> This is a simulation only.
          </p>
        </div>
      </div>
    </footer>
  )
}