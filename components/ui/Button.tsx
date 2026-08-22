'use client'

import { forwardRef, ButtonHTMLAttributes, AnchorHTMLAttributes, ElementType } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  asChild?: boolean
  href?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, leftIcon, rightIcon, fullWidth, disabled, children, asChild, href, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-crypto-bg disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary: 'bg-crypto-primary text-crypto-bg hover:bg-crypto-primary/90 active:bg-crypto-primary focus:ring-crypto-primary/50 shadow-glow-primary',
      secondary: 'bg-crypto-bgSecondary text-crypto-text border border-crypto-border hover:bg-crypto-bgSecondary/80 hover:border-crypto-borderHover focus:ring-crypto-primary/50',
      outline: 'bg-transparent text-crypto-primary border border-crypto-primary hover:bg-crypto-primaryDim focus:ring-crypto-primary/50',
      ghost: 'bg-transparent text-crypto-text hover:bg-crypto-bgSecondary focus:ring-crypto-primary/50',
      danger: 'bg-crypto-error text-white hover:bg-crypto-error/90 focus:ring-crypto-error/50 shadow-[0_0_20px_rgba(255,51,102,0.3)]',
      success: 'bg-crypto-success text-crypto-bg hover:bg-crypto-success/90 focus:ring-crypto-success/50 shadow-glow-success',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-4 py-2 text-base gap-2',
      lg: 'px-6 py-3 text-lg gap-2.5',
      xl: 'px-8 py-4 text-xl gap-3',
    }

    const Component = (asChild || href ? 'a' : 'button') as ElementType
    const isAnchor = asChild || href
    const mergedProps = {
      ...props,
      ref,
      className: twMerge(baseStyles, variants[variant], sizes[size], fullWidth && 'w-full', className),
      ...(href ? { href } : {}),
      ...(disabled || loading ? { 'aria-disabled': 'true', tabIndex: -1 } : {}),
      ...(!isAnchor ? { disabled: disabled || loading } : {}),
    }

    return (
      <Component {...mergedProps}>
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {!loading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {!loading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </Component>
    )
  }
)

Button.displayName = 'Button'