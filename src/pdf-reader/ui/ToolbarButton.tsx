// A toolbar button (the reader's design, §6.1): 30 × 30, a 7 px radius, its hit area grown to the bar's height; the fill
// on hover, while pressed and while its popover is open; a press scales it to 0.96. Named by its words, which its
// tooltip shows. A disabled one stays in place, greyed, so the bar never reflows
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTip } from './tip'

export function ToolbarButton({ label, hint, pressed, disabled, onClick, children, className = '', ...rest }: {
  label: string
  hint?: string
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  children?: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'className'>) {
  const { props, tip } = useTip(label, hint)
  return (
    <>
      <button type="button" aria-label={label} aria-pressed={pressed} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} className={`tbtn ${className}`} {...props} {...rest}>
        {children}
      </button>
      {tip}
    </>
  )
}
