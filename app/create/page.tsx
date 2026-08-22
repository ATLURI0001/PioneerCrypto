'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { TokenForm } from '@/components/token/TokenForm'
import { Modal } from '@/components/ui/Modal'
import { addToken } from '@/lib/storage'
import { generateAddress, generateTxHash, generateBlockNumber, generateGasUsed, generateTokenId } from '@/lib/crypto'
import type { Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export default function CreatePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [deployedToken, setDeployedToken] = useState<Token | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (tokenData: Omit<Token, 'id' | 'createdAt' | 'deployedAt' | 'contractAddress' | 'txHash' | 'blockNumber' | 'gasUsed'>) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const now = Date.now()
      const id = generateTokenId()
      const contractAddress = generateAddress()
      const txHash = generateTxHash()
      const blockNumber = generateBlockNumber()
      const gasUsed = generateGasUsed()

      const token: Token = {
        id,
        ...tokenData,
        createdAt: now,
        deployedAt: now,
        contractAddress,
        txHash,
        blockNumber,
        gasUsed,
      }

      addToken(token)
      setDeployedToken(token)
      setShowSuccess(true)
    } catch (err) {
      setError('Failed to create token. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoToToken = () => {
    if (deployedToken) {
      router.push(`/token/${deployedToken.id}`)
    }
  }

  const handleGoToGallery = () => {
    router.push('/gallery')
  }

  const handleCreateAnother = () => {
    setShowSuccess(false)
    setDeployedToken(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-crypto-primaryDim border border-crypto-border text-crypto-primary text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          <span>Token Creator</span>
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-crypto-text">
          Create Your <span className="text-gradient">Custom Token</span>
        </h1>
        <p className="text-crypto-textMuted text-lg max-w-xl mx-auto">
          Design an ERC-20 token with custom parameters. Deploy to a simulated network and interact with it instantly.
        </p>
      </div>

      <Card variant="glass" padding="lg">
        <TokenForm onSubmit={handleSubmit} isLoading={isSubmitting} />
      </Card>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-crypto-error/10 border border-crypto-error/30 rounded-xl text-crypto-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Modal
        isOpen={showSuccess}
        onClose={handleCreateAnother}
        title="Token Deployed Successfully!"
        size="lg"
        showCloseButton={false}
        closeOnOverlayClick={false}
      >
        {deployedToken && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-crypto-success/10 border border-crypto-success/30 rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-crypto-success/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-crypto-success" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-crypto-text">{deployedToken.name} ({deployedToken.symbol})</h3>
                <p className="text-crypto-textMuted text-sm">Deployed to {deployedToken.network}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-crypto-bgSecondary border border-crypto-border rounded-xl">
                <p className="text-xs text-crypto-textMuted uppercase tracking-wide mb-1">Contract Address</p>
                <p className="font-mono text-crypto-text break-all">{deployedToken.contractAddress}</p>
              </div>
              <div className="p-4 bg-crypto-bgSecondary border border-crypto-border rounded-xl">
                <p className="text-xs text-crypto-textMuted uppercase tracking-wide mb-1">Transaction Hash</p>
                <p className="font-mono text-crypto-text break-all">{deployedToken.txHash}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-crypto-bgSecondary border border-crypto-border rounded-xl">
                <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Block</p>
                <p className="font-mono text-crypto-text">{deployedToken.blockNumber?.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-crypto-bgSecondary border border-crypto-border rounded-xl">
                <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Gas Used</p>
                <p className="font-mono text-crypto-text">{deployedToken.gasUsed?.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-crypto-bgSecondary border border-crypto-border rounded-xl">
                <p className="text-xs text-crypto-textMuted uppercase tracking-wide">Network</p>
                <p className="font-mono text-crypto-text capitalize">{deployedToken.network}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button size="lg" onClick={handleGoToToken} className="flex-1" leftIcon={<Sparkles className="w-5 h-5" />}>
                Interact with Token
              </Button>
              <Button variant="outline" size="lg" onClick={handleGoToGallery} className="flex-1">
                View Gallery
              </Button>
              <Button variant="ghost" size="lg" onClick={handleCreateAnother} className="flex-1">
                Create Another
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}