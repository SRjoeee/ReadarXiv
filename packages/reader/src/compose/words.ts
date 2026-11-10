// The words the reader sets where no chrome shows them: a page's name (UI.md S-R-11a, said to screen readers, never shown) and the
// name of a laid page's link with no text under it, by where it goes (S-R-25, the owner's words of 2026-10-17). From the string
// catalogue (`@readarxiv/ui`) in the interface's language unless a host gives its own through openReader; read at each use (the
// catalogue is a live binding), so that a language switched meanwhile names the next drawing.
import { R } from '@readarxiv/ui'

export interface Words {
  pageName(side: 'original' | 'translation', n: number): string
  linkName(to: { url: string } | { internal: true }): string
}

/** the catalogue's words (S-R-11a, S-R-25), where a host gives none */
export const CATALOGUE_WORDS: Words = {
  pageName: (side, n) => R.pageName(side, n),
  linkName: (to) => linkNameOf(to, R.linkName),
}

/** S-R-25's rule over a pack's link words: elsewhere in the paper; a web page by its site; an email by its address; else a link */
export function linkNameOf(
  to: { url: string } | { internal: true },
  words: { internal: string; site(site: string): string; email(address: string): string; fallback: string },
): string {
  if ('internal' in to) return words.internal
  let u: URL
  try {
    u = new URL(to.url)
  } catch {
    return words.fallback
  }
  if (u.protocol === 'mailto:') {
    let address = u.pathname
    try {
      address = decodeURIComponent(address)
    } catch {
      /* the address as written */
    }
    return address ? words.email(address) : words.fallback
  }
  return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? words.site(u.hostname) : words.fallback
}
