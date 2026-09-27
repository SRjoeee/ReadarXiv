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
