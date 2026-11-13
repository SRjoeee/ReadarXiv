// What the reader knows of its paper beside the layer (today's R engine/view/reader-view.mjs reportPaper, session/paper.ts,
// core/pdf/entry.ts htmlVersionOf): its title, the PDF's own (its Info Title, arXiv's margin stamp dropped) else the one
// arXiv's abstract page gives; and where arXiv has an HTML version of it, for a reader whose bilingual PDF cannot be had. Both
// are asked through the host's fetch (interfaces/host design-a §1.7: the extension's fallbacks, with no member of the host);
// a host that does not serve arXiv's origin refuses them at once, and the reader then has no title of the page and offers the
// HTML version, as a failed ask does.
import { type Fetch, realTimers, type Timers } from '../bytes/source.ts'
import { bodyWithin } from './client.ts'

/** arXiv's margin stamp, which its dvips and Ghostscript PDFs carry as their Info Title: `arXiv:1007.0072v1  [quant-ph]  1 Jul 2010` */
export const ARXIV_STAMP = /^arXiv:\S+\s+\[[^\]]+\]\s+\d{1,2}\s+\w{3}\s+\d{4}$/
/** how long the abstract page may take, ms, its answer and its body together (R session/paper.ts ABSTRACT_MS): an id with
 *  no version waits on it before the layer is asked; unmeasured */
export const ABSTRACT_MS = 15_000
/** the abstract page's bytes at most (arXiv's are some tens of kilobytes); unmeasured */
export const ABSTRACT_CAP = 2 * 1024 * 1024
/** how long the HEAD on the HTML version may take, ms: an answer not back by then says nothing, and the version is offered
 *  (R core/pdf/entry.ts ENTRY_CHECK_MS); unmeasured */
export const HTML_CHECK_MS = 3000
/** the hash that starts an HTML page's translation on arrival (R core/abstract/link.ts AUTO_TRANSLATE_HASH) */
export const TRANSLATE_HASH = '#readarxiv'

/** a paper's id without its version */
const idOf = (paper: string) => paper.replace(/v\d+$/, '')

/** the title a PDF's metadata names (its Info Title), or '' where it names none: arXiv's margin stamp is no title */
export function titleOf(info: unknown): string {
  const t = String((info as { Title?: unknown } | null)?.Title ?? '').trim()
  return ARXIV_STAMP.test(t) ? '' : t
}

/** the title arXiv's abstract page gives (its citation_title), '' where it gives none */
export function abstractTitleOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelector('meta[name="citation_title"]')?.getAttribute('content')?.trim() ?? ''
}

/**
 * The abstract page's title of `paper`, one request a visit: let go at ABSTRACT_MS (its body too), read within ABSTRACT_CAP.
 * One that could not be read (the network, a status that is no page, nothing in time) is forgotten once it has answered, so
 * that a later ask (an original opened again by a retry) reads it again; one request at a time. Never rejects
 */
export function abstractPage(fetch: Fetch, paper: string, timers: Timers = realTimers): () => Promise<string> {
  let asked: Promise<string> | null = null
  const none = () => {
    asked = null
    return ''
  }
  return () =>
    (asked ??= (async () => {
      const ac = new AbortController()
      const timer = timers.later(() => ac.abort(new Error(`nothing within ${ABSTRACT_MS / 1000} s`)), ABSTRACT_MS)
      try {
        const r = await fetch(`https://arxiv.org/abs/${idOf(paper)}`, { signal: ac.signal })
        if (!r.ok) {
          void r.body?.cancel().catch(() => {})
          return none()
        }
        return abstractTitleOf(new TextDecoder().decode(await bodyWithin(r, ABSTRACT_CAP)))
      } catch {
        return none()
      } finally {
        timers.clear(timer)
      }
    })())
}

/**
 * Where arXiv has the paper's HTML version, with the hash that starts its translation, or null where arXiv says it has none: one
 * HEAD. Only arXiv saying so means there is none (404, or 410): a request that failed, a 429, a 5xx or nothing within
 * HTML_CHECK_MS say nothing about the paper, and the version is offered (at worst it leads to arXiv's own answer). Never rejects
 */
export async function htmlVersionOf(fetch: Fetch, paper: string, timers: Timers = realTimers): Promise<string | null> {
  const url = `https://arxiv.org/html/${paper}`
  const ac = new AbortController()
  let timer: unknown
  const late = new Promise<null>((resolve) => {
    timer = timers.later(() => {
      ac.abort(new Error(`nothing within ${HTML_CHECK_MS / 1000} s`))
      resolve(null)
    }, HTML_CHECK_MS)
  })
  const status = await Promise.race([
    fetch(url, { method: 'HEAD', signal: ac.signal }).then(
      (r) => {
        void r.body?.cancel().catch(() => {})
        return r.status
      },
      () => null,
    ),
    late,
  ]).finally(() => timers.clear(timer))
  return status === 404 || status === 410 ? null : `${url}${TRANSLATE_HASH}`
}

/** arXiv's own PDF of the paper, for the browser to open in a tab of its own (it streams and saves it; the reader never reads it
 *  to save it): the address's `#axt-viewer` asks for the browser's own viewer, never a reader laid over it (R core/pdf/entry.ts
 *  VIEWER_HASH, viewerUrlOf) */
export const originalPdfOf = (paper: string): string => `https://arxiv.org/pdf/${paper}`
export const VIEWER_HASH = '#axt-viewer'
