// A toolbar button (the reader's design, §6.1): 30 × 30, a 7 px radius, its hit area grown to the bar's height; the fill
// on hover and while its popover is open, a ring of its own while pressed, so that a press is seen with the pointer still
// on it; a press scales it to 0.96. Named by its words and the value it shows, which its tooltip shows too (WCAG 2.5.3:
// the name holds what is seen). A disabled one stays in place, greyed, so the bar never reflows. With `href` it is a link,
// opened in a new tab: a control that goes to a page is one, for a middle click and ⌘-click
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { useTip } from './tip'

export function ToolbarButton({ label, value, hint, keys, pressed, disabled, onClick, anchor, href, children, className = '', ...rest }: {
  label: string
  /** what the button shows, beside its words in its name and its tooltip: the zoom's scale, the language, the service */
  value?: string
  /** the anchor name of a popover this button opens, beside its tooltip's: anchor-name takes a list */
  anchor?: string
  hint?: string
  /** its shortcuts, for assistive technology (aria-keyshortcuts), the tooltip showing them as `hint` */
  keys?: string
  pressed?: boolean
  disabled?: boolean
  onClick?: () => void
  /** a page it opens in a new tab */
  href?: string
  children?: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'className'>) {
  const { props, tip } = useTip(label, value ?? hint)
  const tipAnchor = (props.style as { anchorName: string }).anchorName
  const style = { anchorName: anchor ? `${tipAnchor}, ${anchor}` : tipAnchor } as CSSProperties
  const name = value ? `${label} ${value}` : label
  return (
    <>
      {href ? (
        <a href={href} target="_blank" rel="noopener" aria-label={name} aria-keyshortcuts={keys} className={`tbtn ${className}`} {...props} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} style={style}>
          {children}
        </a>
      ) : (
        <button type="button" aria-label={name} aria-keyshortcuts={keys} aria-pressed={pressed} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} className={`tbtn ${className}`} {...props} {...rest} style={style}>
          {children}
        </button>
      )}
      {tip}
    </>
  )
}
