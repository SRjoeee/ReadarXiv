// Cards and group headings (the redesign's design, §6.2). A card owns its rows' separators: the hairline on a hovered
// row's top edge and the next shown row's step aside, as grouped lists do. Found by attribute, never by layout: a row in
// a closed reveal is inert, a row a search left out carries data-miss
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'

const shownRows = (card: HTMLElement) => [...card.querySelectorAll<HTMLElement>('[data-srow]')].filter(r => !r.closest('[inert]') && !r.hasAttribute('data-miss'))

export function Card({ children, gap = false, row, role, label, onKeyDown }: {
  /** required in practice; optional in the type so that `createElement(Card, props, ...children)` (Popover's, Reveal's pattern) type-checks */
  children?: ReactNode
  /** 8 px after the card before it */
  gap?: boolean
  /** `section/row`: a deep link to the whole list (translate/services, appearance/styles) */
  row?: string
  role?: 'radiogroup'
  label?: string
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const card = ref.current
    if (!card) return
    let current: HTMLElement | null = null
    const clear = () => { for (const r of card.querySelectorAll('[data-sep-off]')) r.removeAttribute('data-sep-off') }
    /** the hovered row's separator and the next shown row's, stepped aside, from the rows shown now */
    const mark = () => {
      clear()
      const row = current
      if (!row?.hasAttribute('data-press') || row.closest('[data-card]') !== card) return
      // a row gone from the card, or hidden with its list, has no neighbour to step aside
      const rows = shownRows(card)
      const at = rows.indexOf(row)
      if (at < 0) return
      row.setAttribute('data-sep-off', '')
      rows[at + 1]?.setAttribute('data-sep-off', '')
    }
    const over = (e: Event) => {
      const row = (e.target as Element).closest<HTMLElement>('[data-srow]')
      if (row === current) return
      current = row
      mark()
    }
    const leave = () => { current = null; clear() }
    // a press on the hovered row opens or closes a list under it while the pointer rests, and no pointerover says so:
    // the next shown row is another one now (a reveal's inert, a row added or gone, a search's miss)
    const changed = new MutationObserver(() => { if (current) mark() })
    changed.observe(card, { subtree: true, childList: true, attributeFilter: ['inert', 'data-miss'] })
    card.addEventListener('pointerover', over)
    card.addEventListener('pointerleave', leave)
    return () => {
      changed.disconnect()
      card.removeEventListener('pointerover', over)
      card.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    // aria-label only when role gives it somewhere to land (a plain div's generic role does not carry a name)
    // biome-ignore lint/a11y/noStaticElementInteractions: a radio group's arrows, when it is one (§9)
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the label reaches the DOM only together with role="radiogroup"
    <div ref={ref} className="o-card" data-card="" data-row={row} data-gap={gap ? '' : undefined} role={role} aria-label={role ? label : undefined} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

/** A group's heading on the words' edge, an aside or a text button at its end */
export function GroupHeading({ title, aside, action }: { title: string; aside?: string; action?: ReactNode }) {
  return (
    <div className="o-heading" data-heading="">
      <h2>{title}</h2>
      {aside && <span className="o-aside">{aside}</span>}
      {action}
    </div>
  )
}
