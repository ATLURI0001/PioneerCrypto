'use client'

import { useState, useCallback, ChangeEvent, FormEvent } from 'react'
import { FileText, Image, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { TOKEN_DEFAULTS, VALIDATION_RULES, SIMULATED_NETWORKS } from '@/lib/constants'
import { formatBalance, generateAddress } from '@/lib/crypto'
import type { FormErrors, Token } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface TokenFormProps {
  onSubmit: (token: Omit<Token, 'id' | 'createdAt' | 'deployedAt' | 'contractAddress' | 'txHash' | 'blockNumber' | 'gasUsed'>) => void
  initialData?: Partial<Token>
  isLoading?: boolean
}

export function TokenForm({ onSubmit, initialData, isLoading }: TokenFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    symbol: initialData?.symbol || '',
    supply: initialData?.totalSupply || '1000000',
    decimals: initialData?.decimals || TOKEN_DEFAULTS.decimals,
    description: initialData?.description || '',
    logo: initialData?.logo || '',
    network: initialData?.network || SIMULATED_NETWORKS[0].id,
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logo || null)
  const [showSupplyFormatted, setShowSupplyFormatted] = useState(false)

  const validateField = useCallback((name: string, value: string | number): string | undefined => {
    const rules = VALIDATION_RULES[name as keyof typeof VALIDATION_RULES]
    if (!rules) return undefined

    const strValue = String(value)

    if (rules.required && !strValue.trim()) {
      return `${name.charAt(0).toUpperCase() + name.slice(1)} is required`
    }

    if (strValue && 'minLength' in rules && strValue.length < rules.minLength) {
      return `${name} must be at least ${rules.minLength} characters`
    }

    if (strValue && 'maxLength' in rules && strValue.length > rules.maxLength) {
      return `${name} must be no more than ${rules.maxLength} characters`
    }

    if (strValue && 'pattern' in rules && !rules.pattern.test(strValue)) {
      if (name === 'symbol') return 'Symbol must be uppercase letters and numbers only'
      if (name === 'name') return 'Name can only contain letters, numbers, spaces, hyphens, and underscores'
      return 'Invalid format'
    }

    if (name === 'supply' && strValue) {
      const num = BigInt(strValue)
      if (num <= 0) return 'Supply must be greater than 0'
      if (num > BigInt(TOKEN_DEFAULTS.maxSupply)) return `Supply too large (max: ${formatBalance(TOKEN_DEFAULTS.maxSupply, 0)})`
    }

    if (name === 'decimals' && value !== undefined && value !== '') {
      const num = Number(value)
      if (num < VALIDATION_RULES.decimals.min || num > VALIDATION_RULES.decimals.max) {
        return `Decimals must be between ${VALIDATION_RULES.decimals.min} and ${VALIDATION_RULES.decimals.max}`
      }
    }

    return undefined
  }, [])

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const newValue = type === 'number' ? Number(value) : value
    setFormData(prev => ({ ...prev, [name]: newValue }))

    if (touched[name]) {
      const error = validateField(name, newValue)
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }

  const handleBlur = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const newValue = type === 'number' ? Number(value) : value
    setTouched(prev => ({ ...prev, [name]: true }))
    const error = validateField(name, newValue)
    setErrors(prev => ({ ...prev, [name]: error }))
  }

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, logo: 'Logo must be less than 2MB' }))
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setLogoPreview(result)
        setFormData(prev => ({ ...prev, logo: result }))
        setErrors(prev => ({ ...prev, logo: undefined }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveLogo = () => {
    setLogoPreview(null)
    setFormData(prev => ({ ...prev, logo: '' }))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    const newErrors: FormErrors = {}
    let hasErrors = false

    Object.keys(formData).forEach(key => {
      if (key !== 'logo' && key !== 'network') {
        const error = validateField(key, formData[key as keyof typeof formData])
        if (error) {
          newErrors[key as keyof FormErrors] = error
          hasErrors = true
        }
      }
    })

    setErrors(newErrors)
    setTouched(Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {}))

    if (!hasErrors) {
      onSubmit({
        name: formData.name.trim(),
        symbol: formData.symbol.trim().toUpperCase(),
        totalSupply: formData.supply,
        decimals: formData.decimals,
        description: formData.description.trim(),
        logo: formData.logo || null,
        network: formData.network,
      })
    }
  }

  const supplyFormatted = formatBalance(formData.supply, formData.decimals)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-crypto-primary" />
            Token Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Token Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.name ? errors.name : undefined}
              placeholder="e.g., My Awesome Token"
              maxLength={VALIDATION_RULES.name.maxLength}
              autoComplete="off"
            />
            <Input
              label="Symbol"
              name="symbol"
              value={formData.symbol}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.symbol ? errors.symbol : undefined}
              placeholder="e.g., MAT"
              maxLength={VALIDATION_RULES.symbol.maxLength}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Total Supply"
              name="supply"
              type="number"
              value={formData.supply}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.supply ? errors.supply : undefined}
              placeholder="1000000"
              min={VALIDATION_RULES.supply.min}
              max={VALIDATION_RULES.supply.max}
              autoComplete="off"
            />
            <Input
              label="Decimals"
              name="decimals"
              type="number"
              value={formData.decimals}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.decimals ? errors.decimals : undefined}
              min={VALIDATION_RULES.decimals.min}
              max={VALIDATION_RULES.decimals.max}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Textarea
              label="Description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.description ? errors.description : undefined}
              placeholder="Describe your token's purpose, utility, or story..."
              maxLength={VALIDATION_RULES.description.maxLength}
              rows={3}
              autoComplete="off"
            />
            <select
              name="network"
              value={formData.network}
              onChange={handleChange}
              onBlur={handleBlur}
              className={twMerge(
                'w-full bg-crypto-bgSecondary border rounded-lg text-crypto-text px-4 py-2.5 appearance-none',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-crypto-bg',
                'border-crypto-border hover:border-crypto-borderHover focus:border-crypto-primary focus:ring-crypto-primary/50'
              )}
            >
              {SIMULATED_NETWORKS.map(net => (
                <option key={net.id} value={net.id}>{net.name} (Chain ID: {net.chainId})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-crypto-text mb-1.5">Token Logo (Optional)</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                {logoPreview ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden border border-crypto-border relative">
                    <img src={logoPreview} alt="Token logo preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-crypto-bg/80 backdrop-blur text-crypto-textMuted hover:text-crypto-error transition-colors flex items-center justify-center"
                      aria-label="Remove logo"
                    >
                      <Image className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-crypto-border flex items-center justify-center bg-crypto-bgSecondary">
                    <Image className="w-8 h-8 text-crypto-textMuted" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                  id="logo-upload"
                  disabled={isLoading}
                />
                <label
                  htmlFor="logo-upload"
                  className={twMerge(
                    'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-crypto-border text-crypto-text',
                    'hover:bg-crypto-bgSecondary hover:border-crypto-borderHover transition-all cursor-pointer',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Image className="w-4 h-4" />
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </label>
                {errors.logo && <p className="mt-1.5 text-sm text-crypto-error">{errors.logo}</p>}
                <p className="mt-1 text-xs text-crypto-textMuted">PNG, JPG, or GIF up to 2MB. Square aspect ratio recommended.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showSupplyFormatted && (
        <div className="p-4 bg-crypto-primaryDim border border-crypto-border rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-crypto-primary font-mono text-sm">{supplyFormatted}</span>
            <span className="text-crypto-textMuted text-sm">{formData.symbol || 'TOKEN'}</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSupplyFormatted}
              onChange={e => setShowSupplyFormatted(e.target.checked)}
              className="w-4 h-4 rounded border-crypto-border bg-crypto-bgSecondary text-crypto-primary focus:ring-crypto-primary"
            />
            <span className="text-sm text-crypto-textMuted">Show formatted</span>
          </label>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button type="submit" variant="primary" size="lg" loading={isLoading} className="flex-1">
          <Loader2 className="w-5 h-5" />
          Create & Deploy Token
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setShowSupplyFormatted(!showSupplyFormatted)}
          className="flex-1"
        >
          {showSupplyFormatted ? 'Hide Preview' : 'Show Preview'}
        </Button>
      </div>
    </form>
  )
}