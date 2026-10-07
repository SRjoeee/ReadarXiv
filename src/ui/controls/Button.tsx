// The pages' buttons (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces): the one primary action of a view
// in the brand, a neutral one, a text one with no ground but its hover's, a raised one on a group (a note's). Three
// sizes: lg fills its width (the popup's primary, its pair, its two entries), md a form's bar, sm a row's. An icon goes
// before the words, a shortcut after them on the brand and a neutral one. A disabled one is aria-disabled: it stays in
// the tab order, takes the neutral grey of its size, loses its shortcut, and neither acts nor submits a form. A busy one
// keeps its look and its words, a loader turning in its icon's place, and does not act again (controls.css .btn)
import { type IconNode, Loader } from 'lucide'
import type { ComponentProps, MouseEvent } from 'react'
import { Icon } from './Icon'
import { Kbd } from './Kbd'

export type ButtonKind = 'brand' | 'neutral' | 'text' | 'raised'
export type ButtonSize = 'lg' | 'md' | 'sm'

/** a disabled or busy button's press: nothing, and no form submitted (aria-disabled leaves the browser's action in place) */
const refuse = (e: MouseEvent) => e.preventDefault()

export function Button({ kind = 'neutral', size = 'md', icon, shortcut, disabled = false, busy = false, className, onClick, children, ...rest }: {
  kind?: ButtonKind
  size?: ButtonSize
  /** a Lucide node, drawn 16 px before the words */
  icon?: IconNode
  /** a shortcut as the browser reports it (⌥T), after the words: on the brand and a neutral one, while it can act */
  shortcut?: string
  disabled?: boolean
  /** an action under way (connecting): a loader turning in the icon's place, the words kept, and no second press */
  busy?: boolean
} & Omit<ComponentProps<'button'>, 'disabled'>) {
  const still = disabled || busy
  return (
    <button type="button" {...rest} aria-disabled={disabled || undefined} aria-busy={busy || undefined} onClick={still ? refuse : onClick} className={`btn ${kind} ${size}${className ? ` ${className}` : ''}`}>
      {busy ? <Icon node={Loader} className="spin" /> : icon && <Icon node={icon} />}
      {children != null && children !== '' && <span>{children}</span>}
      {shortcut && (kind === 'brand' || kind === 'neutral') && !still && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}
