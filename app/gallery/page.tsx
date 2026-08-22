'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Filter, Grid, List, Trash2, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { TokenCard } from '@/components/token/TokenCard'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { getTokens, deleteToken } from '@/lib/storage'
import type { Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const NETWORKS = [
  { id: 'all', name: 'All Networks' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'optimism', name: 'Optimism' },
  { id: 'base', name: 'Base' },
]

export default function GalleryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [tokens, setTokens] = useState<Token[]>([])
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [networkFilter, setNetworkFilter] = useState(searchParams.get('network') || 'all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(searchParams.get('view') as 'grid' | 'list' || 'grid')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ token: Token } | null>(null)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'symbol'>('newest')

  useEffect(() => {
    const storedTokens = getTokens()
    setTokens(storedTokens)
  }, [])

  const filteredTokens = useMemo(() => {
    let result = [...tokens]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.symbol.toLowerCase().includes(query)
      )
    }

    if (networkFilter !== 'all') {
      result = result.filter(t => t.network === networkFilter)
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return b.createdAt - a.createdAt
        case 'oldest': return a.createdAt - b.createdAt
        case 'name': return a.name.localeCompare(b.name)
        case 'symbol': return a.symbol.localeCompare(b.symbol)
      }
    })

    return result
  }, [tokens, searchQuery, networkFilter, sortBy])

  const deployedCount = tokens.filter(t => t.contractAddress).length
  const draftCount = tokens.filter(t => !t.contractAddress).length

  const handleDelete = (id: string) => {
    const token = tokens.find(t => t.id === id)
    if (token) setShowDeleteConfirm({ token })
  }

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      deleteToken(showDeleteConfirm.token.id)
      setTokens(prev => prev.filter(t => t.id !== showDeleteConfirm.token.id))
      setShowDeleteConfirm(null)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('search', value)
    else params.delete('search')
    router.push(`/gallery?${params.toString()}`, { scroll: false })
  }

  const handleNetworkChange = (network: string) => {
    setNetworkFilter(network)
    const params = new URLSearchParams(searchParams.toString())
    if (network !== 'all') params.set('network', network)
    else params.delete('network')
    router.push(`/gallery?${params.toString()}`, { scroll: false })
  }

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', mode)
    router.push(`/gallery?${params.toString()}`, { scroll: false })
  }

  const handleCreateNew = () => {
    router.push('/create')
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-crypto-text">Token Gallery</h1>
          <p className="text-crypto-textMuted mt-1">
            {tokens.length} token{tokens.length !== 1 ? 's' : ''} total
            <span className="mx-2 text-crypto-border">·</span>
            {deployedCount} deployed
            <span className="mx-2 text-crypto-border">·</span>
            {draftCount} draft{tokens.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={handleCreateNew} leftIcon={<Plus className="w-4 h-4" />}>
          <Sparkles className="w-4 h-4 mr-2" />
          Create New Token
        </Button>
      </div>

      <Card variant="glass" padding="md">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crypto-textMuted" />
            <Input
              placeholder="Search by name or symbol..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-crypto-textMuted">Network:</label>
            <select
              value={networkFilter}
              onChange={e => handleNetworkChange(e.target.value)}
              className="bg-crypto-bgSecondary border border-crypto-border rounded-lg px-3 py-2 text-sm text-crypto-text focus:outline-none focus:ring-2 focus:ring-crypto-primary/50 appearance-none"
            >
              {NETWORKS.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-crypto-textMuted">Sort:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-crypto-bgSecondary border border-crypto-border rounded-lg px-3 py-2 text-sm text-crypto-text focus:outline-none focus:ring-2 focus:ring-crypto-primary/50 appearance-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
              <option value="symbol">Symbol (A-Z)</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-crypto-bgSecondary border border-crypto-border rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={clsx(
                'p-2 rounded transition-colors',
                viewMode === 'grid' ? 'bg-crypto-primary text-crypto-bg' : 'text-crypto-textMuted hover:text-crypto-text'
              )}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={clsx(
                'p-2 rounded transition-colors',
                viewMode === 'list' ? 'bg-crypto-primary text-crypto-bg' : 'text-crypto-textMuted hover:text-crypto-text'
              )}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {filteredTokens.length === 0 ? (
        <Card variant="glass" padding="xl" className="text-center">
          <CardContent className="space-y-4">
            <Sparkles className="w-16 h-16 mx-auto text-crypto-textMuted/30" />
            <h3 className="font-display text-xl font-semibold text-crypto-text">
              {searchQuery || networkFilter !== 'all' ? 'No tokens found' : 'No tokens yet'}
            </h3>
            <p className="text-crypto-textMuted">
              {searchQuery || networkFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first token to get started'}
            </p>
            {!searchQuery && networkFilter === 'all' && (
              <Button onClick={handleCreateNew} leftIcon={<Plus className="w-4 h-4" />}>
                <Sparkles className="w-4 h-4 mr-2" />
                Create Your First Token
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={clsx(
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
        )}>
          {filteredTokens.map((token, index) => (
            <TokenCard
              key={token.id}
              token={token}
              variant={viewMode === 'list' ? 'compact' : 'default'}
              onDelete={handleDelete}
              onView={id => router.push(`/token/${id}`)}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Delete Token"
        message={showDeleteConfirm
          ? `Are you sure you want to delete "${showDeleteConfirm.token.name}" (${showDeleteConfirm.token.symbol})? This action cannot be undone.`
          : ''}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}