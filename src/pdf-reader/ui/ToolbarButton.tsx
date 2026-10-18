// A toolbar button (the reader's design, §6.1): 30 × 30, a 7 px radius, its hit area grown to the bar's height; the fill
// on hover and while its popover is open, a ring of its own while pressed, so that a press is seen with the pointer still
// on it; a press scales it to 0.96. An icon's button is named by its words; one that shows a value is labelled by what
// is on it — the value it shows, first, then its words, hidden — so that its name holds what is seen and starts with it
// (WCAG 2.5.3), and stays in step with it (better-accessibility: aria-labelledby before aria-label). Its tooltip says the
// words and the value (or, out of reach for a reason that matters, the reason). A disabled one stays in place, greyed, so the bar never reflows. With `href` it is a link, opened
// in a new tab: a control that goes to a page is one, for a middle click and ⌘-click
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, useId } from 'react'
import { useTip } from '@/ui/controls/tip'

export function ToolbarButton({ label, value, valueLang, valueClassName = '', valueWidest, hint, why, keys, pressed, disabled, onClick, anchor, href, children, className = '', ...rest }: {
  label: string
  /** what the button shows before its children, and its name starts with: the zoom's scale, the language, the service */
  value?: string
  /** the language the value is written in, when it is not the interface's (a language's own name): `lang` on the value, so
   *  that it is read and drawn as that language */
  valueLang?: string
  /** the value's own look (the zoom's tabular figures) */
  valueClassName?: string
  /** the widest the value can be, whose width it keeps as its digits come and go (the zoom's 99 % → 100 %) */
  valueWidest?: string
  /** the anchor name of a popover this button opens, beside its tooltip's: anchor-name takes a list */
  anchor?: string
  hint?: string
  /** why it is out of reach, when that is what the reader should be told (S-R-21): the tooltip's second thought, in
   *  place of the value or the shortcut */
  why?: string
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
  const { props, tip } = useTip(label, why ?? value ?? hint)
  const tipAnchor = (props.style as { anchorName: string }).anchorName
  const style = { anchorName: anchor ? `${tipAnchor}, ${anchor}` : tipAnchor } as CSSProperties
  const id = useId()
  const named = value === undefined ? { 'aria-label': label } : { 'aria-labelledby': `${id}-value ${id}-words` }
  // the reason it is out of reach is said to assistive technology too: the tooltip, which says it to the eye, is hidden from it
  const reason = why ? { 'aria-description': why } : {}
  return (
    <>
      {href ? (
        <a href={href} target="_blank" rel="noopener" {...named} {...reason} aria-keyshortcuts={keys} className={`tbtn ${className}`} {...props} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} style={style}>
          {children}
        </a>
      ) : (
        <button type="button" {...named} {...reason} aria-keyshortcuts={keys} aria-pressed={pressed} aria-disabled={disabled || undefined} onClick={disabled ? undefined : onClick} className={`tbtn ${className}`} {...props} {...rest} style={style}>
          {value !== undefined && (valueWidest === undefined
            ? <span id={`${id}-value`} data-value lang={valueLang} className={valueClassName}>{value}</span>
            // the widest drawn hidden in the same cell holds the width; out of the name, which is the value's alone
            : <span className={`fit ${valueClassName}`}><span data-widest aria-hidden="true">{valueWidest}</span><span id={`${id}-value`} data-value lang={valueLang}>{value}</span></span>)}
          {children}
          {value !== undefined && <span id={`${id}-words`} hidden>{label}</span>}
        </button>
      )}
      {tip}
    </>
  )
}
