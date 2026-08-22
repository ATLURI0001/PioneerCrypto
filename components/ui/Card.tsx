'use client'

import { HTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'glass'
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  hover?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hover, children, ...props }, ref) => {
    const variants = {
      default: 'bg-crypto-bgSecondary border border-crypto-border',
      elevated: 'bg-crypto-bgSecondary border border-crypto-border shadow-card',
      outlined: 'bg-transparent border-2 border-crypto-border',
      glass: 'bg-crypto-card backdrop-blur-lg border border-crypto-border',
    }

    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
      xl: 'p-12',
    }

    return (
      <div
        ref={ref}
        className={twMerge(
          'rounded-xl transition-all duration-300',
          variants[variant],
          paddings[padding],
          hover && 'hover:border-crypto-borderHover hover:shadow-glow-primary cursor-pointer',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={clsx('mb-4', className)} {...props} />
  )
)

CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={clsx('text-xl font-bold text-crypto-text', className)} {...props} />
  )
)

CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={clsx('text-crypto-textMuted mt-1', className)} {...props} />
  )
)

CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={clsx('', className)} {...props} />
  )
)

CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={clsx('mt-4 pt-4 border-t border-crypto-border', className)} {...props} />
  )
)

CardFooter.displayName = 'CardFooter'