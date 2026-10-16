// The paper the reader opens: its id as the address names it, its version, and its title where its PDF names none. The
// layer is a paper version's (server.ts), and an address may name an id alone (arXiv's listings link the latest PDF without
// one): the version is then the latest arXiv's abstract page lists, read from the same one request the title's fallback
// makes, made once a visit and only where it is needed (an id with its version, a PDF with a title, ask nothing).

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
 *  cannot be had */
export function abstractPage(paper: string, f: typeof fetch = (...a) => fetch(...a)): () => Promise<Abstract> {
  let asked: Promise<Abstract> | null = null
  return () => (asked ??= (async () => {
    if (!paper) return { title: '', version: null }
    try {
      const res = await f(`https://arxiv.org/abs/${ownVersion(paper)?.id ?? paper}`, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!res.ok) return { title: '', version: null }
      return abstractOf(await res.text())
    } catch {
      return { title: '', version: null }
    }
  })())
}
