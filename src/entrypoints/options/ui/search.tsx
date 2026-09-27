// The settings page's search (the redesign's design, §6.1): the query every row reads to mark what it found, the words
// on `mark`. The pass that hides what a search did not find is `applySearch`, below (Task 52)
import { createContext, type ReactNode, useContext } from 'react'

/** The query, trimmed and lowercased; '' while there is none */
export const SearchQuery = createContext('')

/** A row's words with what the search found on `mark` */
export function Marked({ text }: { text: string }) {
  const q = useContext(SearchQuery)
  if (!q) return text
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let at = 0
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, at)) {
    parts.push(text.slice(at, i), <mark key={i} className="o-hit">{text.slice(i, i + q.length)}</mark>)
    at = i + q.length
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

/**
 * The search's pass over what is drawn (§6.1): a row is found when its words hold the query and it shows — a closed
 * reveal is inert, so a sub-row that does not apply is not found; a card and a section with no row found miss too,
 * and each card's first row found loses its top line. Attributes only, read and written in one pass, no layout.
 * Returns how many rows were found. With no query it clears what an earlier pass marked
 */
export function applySearch(root: HTMLElement, q: string): number {
  for (const el of root.querySelectorAll('[data-miss], [data-first]')) {
    el.removeAttribute('data-miss')
    el.removeAttribute('data-first')
  }
  if (!q) return 0
  let found = 0
  for (const row of root.querySelectorAll<HTMLElement>('[data-srow]')) {
    if (!row.closest('[inert]') && (row.dataset.search ?? '').includes(q)) found++
    else row.setAttribute('data-miss', '')
  }
  for (const box of root.querySelectorAll<HTMLElement>('[data-card], section[data-section]')) {
    const first = box.querySelector<HTMLElement>('[data-srow]:not([data-miss])')
    if (!first) box.setAttribute('data-miss', '')
    else if (box.hasAttribute('data-card') && first.closest('[data-card]') === box) first.setAttribute('data-first', '')
  }
  return found
}
