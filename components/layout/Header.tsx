'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Sparkles, LayoutGrid, Terminal, Download } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/create', label: 'Create', icon: Sparkles, description: 'Create new token' },
  { href: '/gallery', label: 'Gallery', icon: LayoutGrid, description: 'View your tokens' },
  { href: '/gallery?view=deployed', label: 'Deployed', icon: Terminal, description: 'Deployed tokens' },
] as const

export function Header() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-crypto-bg/80 backdrop-blur-lg border-b border-crypto-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" aria-label="Token Creator Home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-crypto-primary to-crypto-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-crypto-bg" />
            </div>
            <span className="font-display text-xl font-bold text-crypto-text hidden sm:block">
              TokenForge
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/create' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={twMerge(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-crypto-primaryDim text-crypto-primary border border-crypto-borderHover'
                      : 'text-crypto-textMuted hover:text-crypto-text hover:bg-crypto-bgSecondary'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.description}
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-crypto-textMuted hover:text-crypto-primary hover:bg-crypto-bgSecondary transition-colors"
              aria-label="View on GitHub"
            >
              <Download className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}