// The one place an address from a host or a document becomes a link the chrome draws (the capsule's HTML version and its
// settings, the lost original's card, the title's abstract page): parsed, and drawn only where it leads to the page's own
// origin, or by https (http on this machine's loopback, a test host's) to arXiv's or an origin the host names (parts.tsx
// `linkOrigins`). Anything else draws no link: a `javascript:` or `data:` address a host forwarded, a foreign origin.

/** arXiv's origin, every link to arXiv's pages and files the chrome draws */
export const ARXIV_ORIGIN = 'https://arxiv.org'
const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]'])
/** the page's own schemes: a website's, a test host's, the extension's pages */
const OWN = /^(https?|chrome-extension):$/

/** `href` as a link the chrome may draw (its parsed form), or null: the page's own origin, or https (http on the loopback) to
 *  arXiv's or one of `origins` (each an origin, `https://host[:port]`) */
export function linkable(href: string | null | undefined, origins: readonly string[] = []): string | null {
  if (!href) return null
  const page = typeof location === 'undefined' ? null : location
  let u: URL
  try {
    u = page ? new URL(href, page.href) : new URL(href)
  } catch {
    return null
  }
  const origin = `${u.protocol}//${u.host}`
  if (page && OWN.test(page.protocol) && origin === `${page.protocol}//${page.host}`) return u.href
  const secure = u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname))
  return secure && (origin === ARXIV_ORIGIN || origins.includes(origin)) ? u.href : null
}
