'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from './Button'
import { twMerge } from 'tailwind-merge'

interface CopyButtonProps {
  value: string
  label?: string
  format?: (value: string) => string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'outline' | 'ghost'
  className?: string
  onCopy?: (value: string) => void
}

export function CopyButton({
  value,
  label = 'Copy',
  format,
  size = 'md',
  variant = 'outline',
  className,
  onCopy,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopy?.(value)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const displayValue = format ? format(value) : value

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      leftIcon={copied ? <Check className="w-4 h-4 text-crypto-success" /> : <Copy className="w-4 h-4" />}
      className={twMerge('transition-colors', copied && 'border-crypto-success text-crypto-success', className)}
      aria-label={copied ? 'Copied!' : `Copy ${label}`}
    >
      {copied ? 'Copied!' : label}
    </Button>
  )
}

interface CopyableTextProps {
  value: string
  format?: (value: string) => string
  label?: string
  monospace?: boolean
  className?: string
}

export function CopyableText({ value, format, label, monospace = true, className }: CopyableTextProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const displayValue = format ? format(value) : value

  return (
    <div className="flex items-center gap-2">
      <code
        className={twMerge(
          'flex-1 break-all text-crypto-text',
          monospace && 'font-mono text-sm',
          className
        )}
        onClick={handleCopy}
        style={{ cursor: 'pointer' }}
      >
        {displayValue}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        leftIcon={copied ? <Check className="w-3.5 h-3.5 text-crypto-success" /> : <Copy className="w-3.5 h-3.5" />}
        className="h-8 w-8 p-0 transition-colors hover:bg-crypto-primaryDim"
        aria-label={copied ? 'Copied!' : `Copy ${label || 'value'}`}
      />
    </div>
  )
}