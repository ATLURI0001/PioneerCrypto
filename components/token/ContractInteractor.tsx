'use client'

import { useState, useEffect, useCallback } from 'react'
import { Copy, Send, Wallet, Loader2, ArrowRightLeft, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { formatBalance, parseBalance, formatAddress, formatHash, generateAddress, isValidAddress } from '@/lib/crypto'
import { createInitialContractState, balanceOf, transfer, approve, transferFrom, allowance, createTransaction } from '@/lib/contract'
import { getWalletAddresses, addWalletAddress } from '@/lib/storage'
import type { Token, Transaction, ContractState } from '@/lib/types'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface ContractInteractorProps {
  token: Token
}

const PREDEFINED_ADDRESSES = [
  { label: 'Deployer', address: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4' },
  { label: 'Alice', address: '0xA1B2C3D4E5F6789012345678901234567890ABCD' },
  { label: 'Bob', address: '0xB2C3D4E5F6789012345678901234567890ABCDEF' },
  { label: 'Charlie', address: '0xC3D4E5F6789012345678901234567890ABCDEF01' },
]

export function ContractInteractor({ token }: ContractInteractorProps) {
  const [contractState, setContractState] = useState<ContractState | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [walletAddresses, setWalletAddresses] = useState<string[]>([])
  const [tab, setTab] = useState<'transfer' | 'approve' | 'transferFrom' | 'balance' | 'allowance'>('transfer')

  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [approveSpender, setApproveSpender] = useState('')
  const [approveAmount, setApproveAmount] = useState('')
  const [transferFromOwner, setTransferFromOwner] = useState('')
  const [transferFromSpender, setTransferFromSpender] = useState('')
  const [transferFromAmount, setTransferFromAmount] = useState('')
  const [balanceAddress, setBalanceAddress] = useState('')
  const [allowanceOwner, setAllowanceOwner] = useState('')
  const [allowanceSpender, setAllowanceSpender] = useState('')

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [showDeleteTxConfirm, setShowDeleteTxConfirm] = useState<{ id: string } | null>(null)

  useEffect(() => {
    if (!contractState) {
      const initialState = createInitialContractState(token)
      setContractState(initialState)
      setSelectedAddress(initialState.balances ? Object.keys(initialState.balances)[0] : '')
    }

    const savedAddresses = getWalletAddresses()
    const allAddresses = [...new Set([...PREDEFINED_ADDRESSES.map(a => a.address), ...savedAddresses])]
    setWalletAddresses(allAddresses)

    if (!selectedAddress && allAddresses.length > 0) {
      setSelectedAddress(allAddresses[0])
    }
  }, [token])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const showSuccess = (message: string) => setToast({ message, type: 'success' })
  const showError = (message: string) => setToast({ message, type: 'error' })

  const getBalance = useCallback((address: string) => {
    if (!contractState) return '0'
    return balanceOf(contractState, address)
  }, [contractState])

  const getAllowance = useCallback((owner: string, spender: string) => {
    if (!contractState) return '0'
    return allowance(contractState, owner, spender)
  }, [contractState])

  const handleTransfer = async () => {
    if (!contractState || !transferTo || !transferAmount) return
    if (!isValidAddress(transferTo)) { showError('Invalid recipient address'); return }

    const amount = parseBalance(transferAmount, token.decimals).toString()
    const fromBalance = BigInt(getBalance(selectedAddress))
    if (fromBalance < BigInt(amount)) { showError('Insufficient balance'); return }

    setLoading(true)
    await new Promise(r => setTimeout(r, 500))

    const result = transfer(contractState, selectedAddress, transferTo, amount)
    if (result.success) {
      setContractState(result.newState)
      const tx = createTransaction('transfer', selectedAddress, transferTo, amount)
      setTransactions(prev => [tx, ...prev])
      showSuccess(`Transferred ${transferAmount} ${token.symbol} to ${formatAddress(transferTo)}`)
      setTransferAmount('')
      setTransferTo('')
    } else {
      showError(result.error || 'Transfer failed')
    }
    setLoading(false)
  }

  const handleApprove = async () => {
    if (!contractState || !approveSpender || !approveAmount) return
    if (!isValidAddress(approveSpender)) { showError('Invalid spender address'); return }

    const amount = parseBalance(approveAmount, token.decimals).toString()
    setLoading(true)
    await new Promise(r => setTimeout(r, 500))

    const result = approve(contractState, selectedAddress, approveSpender, amount)
    if (result.success) {
      setContractState(result.newState)
      const tx = createTransaction('approve', selectedAddress, approveSpender, amount)
      setTransactions(prev => [tx, ...prev])
      showSuccess(`Approved ${approveAmount} ${token.symbol} for ${formatAddress(approveSpender)}`)
      setApproveAmount('')
      setApproveSpender('')
    } else {
      showError(result.error || 'Approve failed')
    }
    setLoading(false)
  }

  const handleTransferFrom = async () => {
    if (!contractState || !transferFromOwner || !transferFromSpender || !transferFromAmount) return
    if (!isValidAddress(transferFromOwner) || !isValidAddress(transferFromSpender)) { showError('Invalid address'); return }

    const amount = parseBalance(transferFromAmount, token.decimals).toString()
    setLoading(true)
    await new Promise(r => setTimeout(r, 500))

    const result = transferFrom(contractState, transferFromSpender, transferFromOwner, transferFromSpender, amount)
    if (result.success) {
      setContractState(result.newState)
      const tx = createTransaction('transferFrom', transferFromOwner, transferFromSpender, amount, { owner: transferFromOwner, spender: transferFromSpender })
      setTransactions(prev => [tx, ...prev])
      showSuccess(`Transferred ${transferFromAmount} ${token.symbol} from ${formatAddress(transferFromOwner)}`)
      setTransferFromAmount('')
      setTransferFromOwner('')
      setTransferFromSpender('')
    } else {
      showError(result.error || 'TransferFrom failed')
    }
    setLoading(false)
  }

  const handleCheckBalance = () => {
    if (!balanceAddress) { showError('Enter an address'); return }
    if (!isValidAddress(balanceAddress)) { showError('Invalid address'); return }
    const bal = getBalance(balanceAddress)
    showSuccess(`Balance: ${formatBalance(bal, token.decimals)} ${token.symbol}`)
  }

  const handleCheckAllowance = () => {
    if (!allowanceOwner || !allowanceSpender) { showError('Enter both addresses'); return }
    if (!isValidAddress(allowanceOwner) || !isValidAddress(allowanceSpender)) { showError('Invalid address'); return }
    const allow = getAllowance(allowanceOwner, allowanceSpender)
    showSuccess(`Allowance: ${formatBalance(allow, token.decimals)} ${token.symbol}`)
  }

  const handleAddAddress = () => {
    if (!newAddress.trim()) return
    if (!isValidAddress(newAddress)) { showError('Invalid Ethereum address'); return }
    addWalletAddress(newAddress)
    setWalletAddresses(prev => [...new Set([...prev, newAddress])])
    setNewAddress('')
    setShowAddAddress(false)
    showSuccess('Address added to wallet')
  }

  const handleGenerateAddress = () => {
    const addr = generateAddress()
    setNewAddress(addr)
  }

  const formatTxType = (type: Transaction['type']) => {
    const icons: Record<Transaction['type'], React.ReactNode> = {
      deploy: <Wallet className="w-3.5 h-3.5" />,
      transfer: <Send className="w-3.5 h-3.5" />,
      approve: <ArrowRightLeft className="w-3.5 h-3.5" />,
      transferFrom: <ArrowRightLeft className="w-3.5 h-3.5" />,
      mint: <Wallet className="w-3.5 h-3.5" />,
      burn: <Trash2 className="w-3.5 h-3.5" />,
    }
    const colors: Record<Transaction['type'], string> = {
      deploy: 'text-crypto-primary',
      transfer: 'text-crypto-success',
      approve: 'text-crypto-warning',
      transferFrom: 'text-crypto-accent',
      mint: 'text-crypto-primary',
      burn: 'text-crypto-error',
    }
    return (
      <span className={clsx('flex items-center gap-1.5 font-medium capitalize', colors[type])}>
        {icons[type]}
        {type}
      </span>
    )
  }

  const formatTxStatus = (status: Transaction['status']) => {
    const configs = {
      success: { icon: CheckCircle, color: 'text-crypto-success', bg: 'bg-crypto-success/10' },
      pending: { icon: Clock, color: 'text-crypto-warning', bg: 'bg-crypto-warning/10' },
      failed: { icon: AlertCircle, color: 'text-crypto-error', bg: 'bg-crypto-error/10' },
    }
    const { icon: Icon, color, bg } = configs[status]
    return (
      <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', color, bg)}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    )
  }

  if (!contractState) return null

  const deployerBalance = getBalance(Object.keys(contractState.balances)[0])

  return (
    <div className="space-y-6">
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-crypto-primary" />
            Contract Interaction
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-crypto-bgSecondary/50 border border-crypto-border rounded-xl">
              <p className="text-xs text-crypto-textMuted uppercase tracking-wide mb-1">Total Supply</p>
              <p className="font-mono text-lg text-crypto-text">{formatBalance(contractState.totalSupply, token.decimals)} <span className="text-crypto-textMuted font-sans">{token.symbol}</span></p>
            </div>
            <div className="p-4 bg-crypto-bgSecondary/50 border border-crypto-border rounded-xl">
              <p className="text-xs text-crypto-textMuted uppercase tracking-wide mb-1">Your Balance</p>
              <p className="font-mono text-lg text-crypto-success">{formatBalance(getBalance(selectedAddress), token.decimals)} <span className="text-crypto-textMuted font-sans">{token.symbol}</span></p>
            </div>
            <div className="p-4 bg-crypto-bgSecondary/50 border border-crypto-border rounded-xl">
              <p className="text-xs text-crypto-textMuted uppercase tracking-wide mb-1">Deployer Balance</p>
              <p className="font-mono text-lg text-crypto-text">{formatBalance(deployerBalance, token.decimals)} <span className="text-crypto-textMuted font-sans">{token.symbol}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-crypto-textMuted">
              <span>Wallet:</span>
              <select
                value={selectedAddress}
                onChange={e => setSelectedAddress(e.target.value)}
                className="bg-crypto-bgSecondary border border-crypto-border rounded-lg px-3 py-1.5 text-sm text-crypto-text focus:outline-none focus:ring-2 focus:ring-crypto-primary/50"
              >
                {walletAddresses.map(addr => (
                  <option key={addr} value={addr}>
                    {PREDEFINED_ADDRESSES.find(p => p.address === addr)?.label || formatAddress(addr)}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" size="sm" onClick={() => setShowAddAddress(true)} leftIcon={<Wallet className="w-4 h-4" />}>
              Add Address
            </Button>
            <Button variant="ghost" size="sm" onClick={handleGenerateAddress} leftIcon={<Loader2 className="w-4 h-4" />}>
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b border-crypto-border pb-1" role="tablist">
        {(['transfer', 'approve', 'transferFrom', 'balance', 'allowance'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 rounded-t-lg text-sm font-medium transition-all',
              tab === t
                ? 'bg-crypto-primaryDim text-crypto-primary border-b-2 border-crypto-primary'
                : 'text-crypto-textMuted hover:text-crypto-text'
            )}
          >
            {t.charAt(0).toUpperCase() + t.slice(1).replace('From', ' From')}
          </button>
        ))}
      </div>

      <Card variant="glass" padding="lg">
        <CardContent className="space-y-4">
          {tab === 'transfer' && (
            <div className="space-y-4 max-w-md">
              <h4 className="font-medium text-crypto-text">Transfer Tokens</h4>
              <Input
                label="To Address"
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Input
                label="Amount"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                placeholder="100"
                type="number"
                step="0.000000000000000001"
                leftIcon={<Send className="w-4 h-4" />}
              />
              <Button variant="primary" onClick={handleTransfer} loading={loading} leftIcon={<Send className="w-4 h-4" />} className="w-full">
                Transfer
              </Button>
            </div>
          )}

          {tab === 'approve' && (
            <div className="space-y-4 max-w-md">
              <h4 className="font-medium text-crypto-text">Approve Spending</h4>
              <Input
                label="Spender Address"
                value={approveSpender}
                onChange={e => setApproveSpender(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Input
                label="Amount"
                value={approveAmount}
                onChange={e => setApproveAmount(e.target.value)}
                placeholder="100"
                type="number"
                step="0.000000000000000001"
                leftIcon={<ArrowRightLeft className="w-4 h-4" />}
              />
              <Button variant="primary" onClick={handleApprove} loading={loading} leftIcon={<ArrowRightLeft className="w-4 h-4" />} className="w-full">
                Approve
              </Button>
            </div>
          )}

          {tab === 'transferFrom' && (
            <div className="space-y-4 max-w-md">
              <h4 className="font-medium text-crypto-text">Transfer From (as Spender)</h4>
              <Input
                label="From Address (Owner)"
                value={transferFromOwner}
                onChange={e => setTransferFromOwner(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Input
                label="Your Address (Spender)"
                value={transferFromSpender}
                onChange={e => setTransferFromSpender(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Input
                label="Amount"
                value={transferFromAmount}
                onChange={e => setTransferFromAmount(e.target.value)}
                placeholder="100"
                type="number"
                step="0.000000000000000001"
                leftIcon={<ArrowRightLeft className="w-4 h-4" />}
              />
              <Button variant="primary" onClick={handleTransferFrom} loading={loading} leftIcon={<ArrowRightLeft className="w-4 h-4" />} className="w-full">
                Transfer From
              </Button>
            </div>
          )}

          {tab === 'balance' && (
            <div className="space-y-4 max-w-md">
              <h4 className="font-medium text-crypto-text">Check Balance</h4>
              <Input
                label="Address"
                value={balanceAddress}
                onChange={e => setBalanceAddress(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Button variant="outline" onClick={handleCheckBalance} leftIcon={<Loader2 className="w-4 h-4" />} className="w-full">
                Check Balance
              </Button>
            </div>
          )}

          {tab === 'allowance' && (
            <div className="space-y-4 max-w-md">
              <h4 className="font-medium text-crypto-text">Check Allowance</h4>
              <Input
                label="Owner Address"
                value={allowanceOwner}
                onChange={e => setAllowanceOwner(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Input
                label="Spender Address"
                value={allowanceSpender}
                onChange={e => setAllowanceSpender(e.target.value)}
                placeholder="0x..."
                leftIcon={<Wallet className="w-4 h-4" />}
              />
              <Button variant="outline" onClick={handleCheckAllowance} leftIcon={<Loader2 className="w-4 h-4" />} className="w-full">
                Check Allowance
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Transaction History</span>
            <span className="text-sm text-crypto-textMuted">{transactions.length} transactions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-crypto-textMuted">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No transactions yet. Interact with the contract to see them here.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-4 p-3 bg-crypto-bgSecondary/50 border border-crypto-border rounded-lg hover:border-crypto-borderHover transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      tx.type === 'transfer' && 'bg-crypto-success/10',
                      tx.type === 'approve' && 'bg-crypto-warning/10',
                      tx.type === 'transferFrom' && 'bg-crypto-accent/10',
                      tx.type === 'deploy' && 'bg-crypto-primary/10',
                    )}>
                      {tx.type === 'transfer' && <Send className="w-4 h-4 text-crypto-success" />}
                      {tx.type === 'approve' && <ArrowRightLeft className="w-4 h-4 text-crypto-warning" />}
                      {tx.type === 'transferFrom' && <ArrowRightLeft className="w-4 h-4 text-crypto-accent" />}
                      {tx.type === 'deploy' && <Wallet className="w-4 h-4 text-crypto-primary" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-crypto-text truncate">{formatTxType(tx.type)}</span>
                        {formatTxStatus(tx.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-crypto-textMuted mt-0.5">
                        <span className="font-mono">{formatAddress(tx.from)}</span>
                        {tx.type === 'transfer' && <ArrowRightLeft className="w-3 h-3" />}
                        {tx.type === 'approve' && <ArrowRightLeft className="w-3 h-3" />}
                        {tx.type === 'transferFrom' && <ArrowRightLeft className="w-3 h-3" />}
                        <span className="font-mono">{formatAddress(tx.to)}</span>
                        {tx.spender && <span className="font-mono text-crypto-warning">via {formatAddress(tx.spender)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="font-mono text-crypto-text text-sm">{formatBalance(tx.amount, token.decimals)} <span className="font-sans text-crypto-textMuted">{token.symbol}</span></p>
                      <p className="text-xs text-crypto-textMuted">Gas: {tx.gasUsed.toLocaleString()}</p>
                    </div>
                    <CopyButton
                      value={tx.txHash}
                      format={formatHash}
                      label="Tx Hash"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={showAddAddress} onClose={() => setShowAddAddress(false)} title="Add Wallet Address" size="sm">
        <div className="space-y-4">
          <Input
            label="Ethereum Address"
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            placeholder="0x..."
            leftIcon={<Wallet className="w-4 h-4" />}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateAddress} leftIcon={<Loader2 className="w-4 h-4" />} className="flex-1">
              Generate Random
            </Button>
            <Button variant="primary" onClick={handleAddAddress} leftIcon={<CheckCircle className="w-4 h-4" />} className="flex-1">
              Add Address
            </Button>
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-lg shadow-card border',
            toast.type === 'success'
              ? 'bg-crypto-success/10 border-crypto-success/30 text-crypto-success'
              : 'bg-crypto-error/10 border-crypto-error/30 text-crypto-error'
          )}>
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}