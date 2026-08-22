'use client'

import { formatDistanceToNow } from 'date-fns'
import { Copy, ExternalLink, Trash2, MoreHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { formatAddress, formatHash, shortenAddress, formatBalance } from '@/lib/crypto'
import type { Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useState } from 'react'
import Link from 'next/link'

interface TokenCardProps {
  token: Token
  onDelete?: (id: string) => void
  onView?: (id: string) => void
  variant?: 'default' | 'compact'
}

export function TokenCard({ token, onDelete, onView, variant = 'default' }: TokenCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const networkColors: Record<string, string> = {
    ethereum: '#627EEA',
    polygon: '#8247E5',
    arbitrum: '#28A0F0',
    optimism: '#FF0420',
    base: '#0052FF',
  }

  const networkColor = networkColors[token.network] || '#00f5ff'

  if (variant === 'compact') {
    return (
      <Link
        href={`/token/${token.id}`}
        className="group flex items-center gap-4 p-4 bg-crypto-bgSecondary border border-crypto-border rounded-xl hover:border-crypto-borderHover hover:shadow-glow-primary transition-all duration-300"
      >
        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br from-crypto-primary/20 to-crypto-accent/20 border border-crypto-border flex-shrink-0">
          {token.logo ? (
            <img src={token.logo} alt={token.name} className="w-10 h-10 rounded object-cover" />
          ) : (
            <span className="font-display font-bold text-crypto-primary text-lg">{token.symbol.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-crypto-text truncate">{token.name}</h3>
            <span className="text-crypto-textMuted text-sm font-mono uppercase">{token.symbol}</span>
            {token.contractAddress && (
              <span className="px-2 py-0.5 text-xs font-mono bg-crypto-bg rounded border border-crypto-border text-crypto-textMuted">
                {shortenAddress(token.contractAddress)}
              </span>
            )}
          </div>
          <p className="text-xs text-crypto-textMuted truncate mt-0.5">
            {token.deployedAt ? `Deployed ${formatDistanceToNow(new Date(token.deployedAt), { addSuffix: true })}` : 'Not deployed'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronDown className="w-4 h-4" />
        </Button>
      </Link>
    )
  }

  return (
    <Card variant="glass" padding="lg" hover className="relative group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gradient-to-br from-crypto-primary/20 to-crypto-accent/20 border border-crypto-border flex-shrink-0 relative overflow-hidden">
            {token.logo ? (
              <img src={token.logo} alt={token.name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-bold text-crypto-primary text-2xl">{token.symbol.charAt(0)}</span>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-crypto-bg/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <h3 className="font-display text-xl font-bold text-crypto-text truncate pr-4">{token.name}</h3>
              <span className="text-crypto-textMuted font-mono text-lg uppercase tracking-wide">{token.symbol}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-medium rounded-full border',
                  token.contractAddress
                    ? 'bg-crypto-success/10 border-crypto-success/30 text-crypto-success'
                    : 'bg-crypto-warning/10 border-crypto-warning/30 text-crypto-warning'
                )}
              >
                {token.contractAddress ? 'Deployed' : 'Draft'}
              </span>
              <span
                className="px-2 py-0.5 text-xs font-medium rounded-full border"
                style={{
                  backgroundColor: `${networkColor}15`,
                  borderColor: `${networkColor}4D`,
                  color: networkColor,
                }}
              >
                {token.network}
              </span>
            </div>

            {token.description && (
              <p className="text-crypto-textMuted text-sm line-clamp-2 mb-3">{token.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-crypto-textMuted">
                <span className="font-mono">{formatBalance(token.totalSupply, token.decimals)}</span>
                <span className="font-mono text-crypto-text">{token.symbol}</span>
              </div>
              {token.deployedAt && (
                <span className="text-crypto-textMuted">
                  Created {formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}
                </span>
              )}
              {token.deployedAt && (
                <span className="text-crypto-textMuted">
                  Deployed {formatDistanceToNow(new Date(token.deployedAt!), { addSuffix: true })}
                </span>
              )}
            </div>

            {token.contractAddress && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <CopyableAddress address={token.contractAddress} label="Contract" />
                {token.txHash && (
                  <CopyableHash hash={token.txHash} label="Tx Hash" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="relative">
            <Button variant="ghost" size="sm" onClick={() => setShowMenu(!showMenu)} className="h-8 w-8 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 z-10 w-40 bg-crypto-bgSecondary border border-crypto-border rounded-lg shadow-card overflow-hidden animate-fade-in">
                <button
                  onClick={() => { onView?.(token.id); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-crypto-text hover:bg-crypto-bg hover:text-crypto-primary flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View & Interact
                </button>
                {token.contractAddress && (
                  <a
                    href={`https://etherscan.io/address/${token.contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 text-left text-sm text-crypto-text hover:bg-crypto-bg hover:text-crypto-primary flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Explorer
                  </a>
                )}
                {onDelete && (
                  <button
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                    className="w-full px-3 py-2 text-left text-sm text-crypto-error hover:bg-crypto-error/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
          <Button
            variant={token.contractAddress ? 'primary' : 'outline'}
            size="sm"
            onClick={() => onView?.(token.id)}
            className="hidden sm:block"
          >
            {token.contractAddress ? 'Interact' : 'Deploy'}
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => { onDelete?.(token.id); setShowDeleteConfirm(false); }}
        title="Delete Token"
        message={`Are you sure you want to delete "${token.name}" (${token.symbol})? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </Card>
  )
}

function CopyableAddress({ address, label }: { address: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={address}>
      <span className="text-xs text-crypto-textMuted uppercase tracking-wide">{label}</span>
      <CopyButton value={address} format={formatAddress} label={label} variant="ghost" size="sm" className="h-7" />
    </div>
  )
}

function CopyableHash({ hash, label }: { hash: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={hash}>
      <span className="text-xs text-crypto-textMuted uppercase tracking-wide">{label}</span>
      <CopyButton value={hash} format={formatHash} label={label} variant="ghost" size="sm" className="h-7" />
    </div>
  )
}