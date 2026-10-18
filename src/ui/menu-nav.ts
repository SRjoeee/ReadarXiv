// A menu's keyboard behaviour (the reader's design, §9.4), one for the popup's Menu and the reader's menus: the arrows
// move the active item, and assistive technology hears of it through aria-activedescendant; Home and End go to the
// ends; a letter goes to the next item that begins with it (a few typed quickly spell a word); Enter or Space picks,
// Escape closes. A disabled item is passed over
import { type KeyboardEvent, useId, useRef, useState } from 'react'

export interface MenuNav {
  active: number
  setActive: (index: number) => void
  /** on the element that has the focus, and on it alone: the list itself, or the search field before it */
  onKeyDown: (e: KeyboardEvent) => void
  /** the active item's element id, for aria-activedescendant on the element with the focus */
  activeId: string | undefined
  idOf: (index: number) => string
}

export function useMenuNav({ count, initial, isDisabled, labelOf, onPick, onClose, typeahead = true }: {
  count: number
  initial: number
  isDisabled: (index: number) => boolean
  labelOf: (index: number) => string
  onPick: (index: number) => void
  onClose: () => void
  /** off where a search field has the focus: the letters, Home and End are its */
  typeahead?: boolean
}): MenuNav {
  const base = useId()
  const [active, setActive] = useState(() => Math.max(0, initial))
  const typed = useRef({ text: '', at: 0 })
  /** the next item that can be chosen from `from`, going `by`; `from` itself when there is none */
  const step = (from: number, by: 1 | -1) => {
    for (let k = 1; k <= count; k++) {
      const j = (((from + by * k) % count) + count) % count
      if (!isDisabled(j)) return j
    }
    return from
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (!count) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => step(a, 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => step(a, -1)); return }
    // in a search field Home and End move its caret, as in any text field
    if (e.key === 'Home' && typeahead) { e.preventDefault(); setActive(step(-1, 1)); return }
    if (e.key === 'End' && typeahead) { e.preventDefault(); setActive(step(count, -1)); return }
    if (e.key === 'Enter' || (e.key === ' ' && typeahead)) { e.preventDefault(); onPick(active); return }
    if (!typeahead || e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return
    const now = performance.now()
    const word = now - typed.current.at < 500
    typed.current = { text: (word ? typed.current.text : '') + e.key.toLowerCase(), at: now }
    const q = typed.current.text
    // a letter looks from the item after the active one, so that pressing it again goes on; a word from the active one
    const from = q.length > 1 ? active : active + 1
    for (let k = 0; k < count; k++) {
      const j = (from + k) % count
      // the key is the menu's: nothing else on the page acts on it
      if (!isDisabled(j) && labelOf(j).toLowerCase().startsWith(q)) { e.preventDefault(); setActive(j); return }
    }
  }
  const idOf = (index: number) => `${base}-item-${index}`
  return { active, setActive, onKeyDown, activeId: count ? idOf(active) : undefined, idOf }
}
