// The paper the reader opens: its id as the address names it, its version, and its title where its PDF names none. The
// layer is a paper version's (server.ts), and an address may name an id alone (arXiv's listings link the latest PDF without
// one): the version is then the latest arXiv's abstract page lists, read from the same one request the title's fallback
// makes, made once a visit and only where it is needed (an id with its version, a PDF with a title, ask nothing).

import { bodyWithin } from './server'

/** how long the abstract page may take, its answer and its body together: an id with no version waits on it before the
 *  layer is asked, so one that never comes would hold the reader with no state and no retry */
export const ABSTRACT_MS = 15_000
/** the abstract page's bytes at most (arXiv's are some tens of kilobytes) */
export const ABSTRACT_CAP = 2 * 1024 * 1024

/** an id's own version, where it names one */
export function ownVersion(paper: string): { id: string; version: number } | null {
  const m = /^(.+)v(\d+)$/.exec(paper)
  return m ? { id: m[1] as string, version: Number(m[2]) } : null
}

/** what the abstract page says: its title (citation_title), and the latest version its submission history lists */
export interface Abstract { title: string; version: number | null }
/** the abstract page read, from its HTML: the title, and the highest `[vN]` of its submission history (arXiv lists every
 *  version there, the latest unlinked) */
export function abstractOf(html: string): Abstract {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = doc.querySelector('meta[name="citation_title"]')?.getAttribute('content')?.trim() ?? ''
  let version: number | null = null
  for (const m of (doc.querySelector('.submission-history')?.textContent ?? '').matchAll(/\[v(\d+)\]/g)) version = Math.max(version ?? 0, Number(m[1]))
  return { title, version }
}

/** the abstract page of `paper`, one request a visit (arxiv.org, the extension's host): what it says, or nothing where it
 *  cannot be had. Bounded: let go at ABSTRACT_MS (its body too) and read within ABSTRACT_CAP. One that could not be read
 *  (the network, a status that is no page, no answer in time) is forgotten once it has answered, so that a retry reads it
 *  again; one request at a time */
export function abstractPage(paper: string, f: typeof fetch = (...a) => fetch(...a)): () => Promise<Abstract> {
  let asked: Promise<Abstract> | null = null
  const none = (): Abstract => { asked = null; return { title: '', version: null } }
  return () => (asked ??= (async () => {
    if (!paper) return { title: '', version: null }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(Object.assign(new Error(`nothing within ${ABSTRACT_MS / 1000} s`), { name: 'TimeoutError' })), ABSTRACT_MS)
    try {
      const res = await f(`https://arxiv.org/abs/${ownVersion(paper)?.id ?? paper}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ac.signal })
      if (!res.ok) { void res.body?.cancel().catch(() => {}); return none() }
      return abstractOf(new TextDecoder().decode(await bodyWithin(res, ABSTRACT_CAP)))
    } catch {
      return none()
    } finally {
      clearTimeout(timer)
    }
  })())
}
