'use client'

import { useState } from 'react'
import { Download, FileCode, FileJson, FileText, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface ExportButtonsProps {
  token: Token
}

const FORMATS = [
  {
    id: 'metadata',
    label: 'Metadata JSON',
    description: 'Token metadata for IPFS/marketplaces (name, symbol, description, image, decimals, supply)',
    icon: FileJson,
  },
  {
    id: 'abi',
    label: 'Contract ABI',
    description: 'Full ERC-20 ABI for frontend integration and contract verification',
    icon: FileCode,
  },
  {
    id: 'solidity',
    label: 'Solidity Contract',
    description: 'OpenZeppelin ERC-20 contract ready for mainnet deployment',
    icon: FileText,
  },
  {
    id: 'all',
    label: 'Complete Package',
    description: 'All of the above in a single export file',
    icon: Download,
  },
] as const

export function ExportButtons({ token }: ExportButtonsProps) {
  const [showModal, setShowModal] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadResults, setDownloadResults] = useState<Record<string, boolean>>({})

  const handleDownload = async (format: 'metadata' | 'abi' | 'solidity' | 'all') => {
    setDownloading(format)
    setDownloadResults(prev => ({ ...prev, [format]: false }))

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, format }),
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const disposition = response.headers.get('Content-Disposition')
      const formatStr = format as string
      let filename = `${token.symbol}-${formatStr}.${formatStr === 'solidity' ? 'sol' : 'json'}`
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setDownloadResults(prev => ({ ...prev, [format]: true }))
    } catch (error) {
      console.error('Download failed:', error)
      setDownloadResults(prev => ({ ...prev, [format]: false }))
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadAll = async () => {
    await handleDownload('all')
  }

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        onClick={() => setShowModal(true)}
        leftIcon={<Download className="w-4 h-4" />}
        className="w-full"
      >
        Export for Deployment
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Export Token"
        description="Choose what to export. All files are ready for production deployment."
        size="lg"
      >
        <div className="space-y-3">
          {FORMATS.map(fmt => (
            <Button
              key={fmt.id}
              variant={downloading === fmt.id ? 'primary' : 'outline'}
              onClick={() => handleDownload(fmt.id)}
              disabled={!!downloading && downloading !== fmt.id}
              className={clsx('w-full justify-start gap-3', downloadResults[fmt.id] && 'border-crypto-success bg-crypto-success/10')}
              leftIcon={downloading === fmt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : downloadResults[fmt.id] ? <Check className="w-4 h-4 text-crypto-success" /> : <fmt.icon className="w-4 h-4" />}
            >
              <div className="flex-1 text-left">
                <p className="font-medium text-crypto-text">{fmt.label}</p>
                <p className="text-xs text-crypto-textMuted">{fmt.description}</p>
              </div>
              {downloading === fmt.id && <span className="text-sm text-crypto-primary">Preparing...</span>}
              {downloadResults[fmt.id] && <span className="text-sm text-crypto-success">Downloaded!</span>}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  )
}