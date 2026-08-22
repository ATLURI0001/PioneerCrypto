'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Copy, Loader2, Sparkles, AlertCircle, Download } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { ContractInteractor } from '@/components/token/ContractInteractor'
import { CopyableText } from '@/components/ui/CopyButton'
import { ExportButtons } from '@/components/token/ExportButtons'
import { getToken } from '@/lib/storage'
import { formatAddress, formatHash, shortenAddress } from '@/lib/crypto'
import type { Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const NETWORK_EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io',
  polygon: 'https://polygonscan.com',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
  base: 'https://basescan.org',
}

export default function TokenPage() {
  const params = useParams()
  const router = useRouter()
  const tokenId = params.id as string

  const [token, setToken] = useState<Token | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchToken = () => {
      const storedToken = getToken(tokenId)
      if (storedToken) {
        setToken(storedToken)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    }

    fetchToken()
  }, [tokenId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 mx-auto text-crypto-primary animate-spin" />
          <p className="text-crypto-textMuted">Loading token...</p>
        </div>
      </div>
    )
  }

  if (notFound || !token) {
    return (
      <div className="text-center py-16 space-y-6 animate-in">
        <AlertCircle className="w-16 h-16 mx-auto text-crypto-error/50" />
        <h1 className="font-display text-3xl font-bold text-crypto-text">Token Not Found</h1>
        <p className="text-crypto-textMuted max-w-md mx-auto">
          The token you're looking for doesn't exist or may have been deleted.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild leftIcon={<ArrowLeft className="w-4 h-4" />}>
            <Link href="/gallery">Back to Gallery</Link>
          </Button>
          <Button asChild variant="outline" leftIcon={<Sparkles className="w-4 h-4" />}>
            <Link href="/create">Create New Token</Link>
          </Button>
        </div>
      </div>
    )
  }

  const explorerUrl = NETWORK_EXPLORERS[token.network] || NETWORK_EXPLORERS.ethereum
  const contractUrl = token.contractAddress ? `${explorerUrl}/address/${token.contractAddress}` : null
  const txUrl = token.txHash ? `${explorerUrl}/tx/${token.txHash}` : null

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/gallery">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Gallery
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="font-display text-3xl font-bold text-crypto-text">{token.name}</h1>
            <span className="text-crypto-textMuted font-mono text-xl uppercase tracking-wide">{token.symbol}</span>
            {token.contractAddress && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-crypto-success/10 border border-crypto-success/30 text-crypto-success">
                Deployed
              </span>
            )}
            {!token.contractAddress && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-crypto-warning/10 border border-crypto-warning/30 text-crypto-warning">
                Draft
              </span>
            )}
            <span
              className="px-3 py-1 text-sm font-medium rounded-full border"
              style={{
                backgroundColor: `hsl(from ${token.network === 'ethereum' ? '#627EEA' : token.network === 'polygon' ? '#8247E5' : token.network === 'arbitrum' ? '#28A0F0' : token.network === 'optimism' ? '#FF0420' : '#0052FF'} h s l / 0.1)`,
                borderColor: `hsl(from ${token.network === 'ethereum' ? '#627EEA' : token.network === 'polygon' ? '#8247E5' : token.network === 'arbitrum' ? '#28A0F0' : token.network === 'optimism' ? '#FF0420' : '#0052FF'} h s l / 0.3)`,
                color: token.network === 'ethereum' ? '#627EEA' : token.network === 'polygon' ? '#8247E5' : token.network === 'arbitrum' ? '#28A0F0' : token.network === 'optimism' ? '#FF0420' : '#0052FF',
              }}
            >
              {token.network}
            </span>
          </div>
          {token.description && (
            <p className="text-crypto-textMuted">{token.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="glass" padding="md">
          <CardHeader className="pb-2">
            <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Total Supply</p>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-crypto-text">{token.totalSupply}</p>
            <p className="text-sm text-crypto-textMuted">({token.totalSupply} raw)</p>
          </CardContent>
        </Card>

        <Card variant="glass" padding="md">
          <CardHeader className="pb-2">
            <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Decimals</p>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-crypto-text">{token.decimals}</p>
          </CardContent>
        </Card>

        <Card variant="glass" padding="md">
          <CardHeader className="pb-2">
            <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Created</p>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-lg font-medium text-crypto-text">
              {new Date(token.createdAt).toLocaleDateString()}
            </p>
            <p className="text-sm text-crypto-textMuted">
              {new Date(token.createdAt).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>

        <Card variant="glass" padding="md">
          <CardHeader className="pb-2">
            <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Status</p>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-lg font-medium text-crypto-text">
              {token.deployedAt ? 'Deployed' : 'Draft'}
            </p>
            {token.deployedAt && (
              <p className="text-sm text-crypto-textMuted">
                {new Date(token.deployedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {token.contractAddress && (
        <>
          <Card variant="glass" padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-crypto-primary" />
                Deployment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-crypto-textMuted uppercase tracking-wide">Contract Address</label>
                  <CopyableText
                    value={token.contractAddress!}
                    format={formatAddress}
                    label="Contract Address"
                    monospace
                  />
                  {contractUrl && (
                    <a href={contractUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-crypto-primary hover:underline flex items-center gap-1">
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-crypto-textMuted uppercase tracking-wide">Transaction Hash</label>
                  <CopyableText
                    value={token.txHash!}
                    format={formatHash}
                    label="Transaction Hash"
                    monospace
                  />
                  {txUrl && (
                    <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-crypto-primary hover:underline flex items-center gap-1">
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-crypto-border">
                <div className="text-center">
                  <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Block Number</p>
                  <p className="font-mono text-lg font-medium text-crypto-text">{token.blockNumber?.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Gas Used</p>
                  <p className="font-mono text-lg font-medium text-crypto-text">{token.gasUsed?.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Network</p>
                  <p className="font-mono text-lg font-medium text-crypto-text capitalize">{token.network}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Explorer</p>
                  <p className="font-mono text-lg font-medium text-crypto-text">{token.network}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass" padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-crypto-primary" />
                Export for Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExportButtons token={token} />
            </CardContent>
          </Card>
        </>
      )}

      <ContractInteractor token={token} />
    </div>
  )
}