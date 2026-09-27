// P0's field (the redesign's design, §5.4): what a line typed or pasted asks for, decided as it is typed and acted on at
// Enter only. A pure function of the text. An arXiv PDF or HTML address opens that page translating; an abstract
// address, a bare id — new style or old, with its version or without, after `arXiv:` or not — or an arXiv DOI names a
// paper, whose two entries the popup then offers (P17's); any other link is not the popup's to open; anything else is
// words for arXiv's own search. An id is tried before a link: `math.GT/0309136` reads as a host name with a path
import { paperIdFrom } from '@/core/paper-id'
import { pdfUrlOf, translatedHtmlUrlOf } from '@/core/pdf/entry'

export type Query =
  | { kind: 'empty' }
  | { kind: 'open'; format: 'pdf' | 'html'; id: string; href: string }
  | { kind: 'paper'; id: string }
  | { kind: 'search'; query: string; href: string }
  | { kind: 'elsewhere' }

/** arXiv's advanced search, the link under the field */
export const ADVANCED_SEARCH = 'https://arxiv.org/search/advanced'

/** arXiv's search for words, as the field in its own header sends them */
export const searchUrl = (query: string): string => `https://arxiv.org/search/?${new URLSearchParams({ query, searchtype: 'all', source: 'header' })}`

/** The hosts that serve arXiv's papers at the same paths; what the popup opens is always arxiv.org's */
const ARXIV_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'])
/** arXiv's DOIs, 10.48550/arXiv.<id>, the id in either style; `doi:` before it as citations write it */
const DOI = /^(?:doi:\s*)?10\.48550\/arxiv\.(\S+)$/i
/** `arXiv:` before an id, as papers cite one another, the category after it or not */
const CITED = /^arxiv:\s*(\S+)(?:\s+\[[^\]]+\])?$/i
/** What reads as an address: a scheme, `www.`, or a host name with a path after it — words with a dot in them do not */
const LINK = /^(?:[a-z][a-z\d+.-]*:\/\/\S+|www\.\S+|(?:[a-z\d-]+\.)+[a-z]{2,}[/?#]\S*)$/i
const SCHEME = /^[a-z][a-z\d+.-]*:\/\//i

/** An id as arXiv writes one, or null: the shapes are core/paper-id.ts's, which the entry pages read */
const idOf = (text: string | undefined): string | null => (text ? paperIdFrom(`/abs/${text}`, 'abs') : null)

export function readQuery(text: string): Query {
  const q = text.trim()
  if (!q) return { kind: 'empty' }
  const id = idOf(q) ?? idOf(CITED.exec(q)?.[1]) ?? idOf(DOI.exec(q)?.[1])
  if (id) return { kind: 'paper', id }
  if (LINK.test(q)) return linkOf(q)
  return { kind: 'search', query: q, href: searchUrl(q) }
}

function linkOf(text: string): Query {
  let url: URL
  try {
    url = new URL(SCHEME.test(text) ? text : `https://${text}`)
  } catch {
    return { kind: 'elsewhere' }
  }
  const host = url.hostname.toLowerCase()
  // a DOI's own resolver, an arXiv DOI after it
  if (host === 'doi.org' || host === 'dx.doi.org') {
    let path = url.pathname.slice(1)
    try {
      path = decodeURIComponent(path)
    } catch {} // a malformed escape is not an arXiv DOI either
    const id = idOf(DOI.exec(path)?.[1])
    return id ? { kind: 'paper', id } : { kind: 'elsewhere' }
  }
  if (!ARXIV_HOSTS.has(host)) return { kind: 'elsewhere' }
  const pdf = paperIdFrom(url.pathname, 'pdf')
  if (pdf) return { kind: 'open', format: 'pdf', id: pdf, href: pdfUrlOf(pdf) }
  const html = paperIdFrom(url.pathname, 'html')
  if (html) return { kind: 'open', format: 'html', id: html, href: translatedHtmlUrlOf(html) }
  const abs = paperIdFrom(url.pathname, 'abs')
  return abs ? { kind: 'paper', id: abs } : { kind: 'elsewhere' }
}

/**
 * Whether an address is an arXiv paper's page the extension answers on — its full text, its abstract, its PDF — so that
 * a tab there not answering yet is a page still loading, not P0 (§5.4). arxiv.org's alone: the content scripts match it
 */
export function isPaperAddress(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && parsed.hostname === 'arxiv.org' && (['html', 'abs', 'pdf'] as const).some(section => paperIdFrom(parsed.pathname, section) !== null)
}
