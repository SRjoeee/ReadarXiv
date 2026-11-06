// The words the reader sets where no chrome shows them, until the catalogue is `@readarxiv/ui`'s (the string catalogue moving into
// packages/ui): a page's name (UI.md S-R-11a, said to screen readers, never shown) and the name of a laid page's link with no text
// under it, by where it goes (S-R-25; today's src/pdf-reader/ui/link-names.ts rule). A host gives its own (its interface's
// language) through openReader; read at each use, so that a language switched meanwhile names the next drawing.

export interface Words {
  pageName(side: 'original' | 'translation', n: number): string
  linkName(to: { url: string } | { internal: true }): string
}

/** the English pack's words (packages/ui's en: S-R-11a, S-R-25), where a host gives none */
export const ENGLISH_WORDS: Words = {
  pageName: (side, n) => `${side === 'original' ? 'Original' : 'Translation'} · Page ${n}`,
  linkName: (to) =>
    linkNameOf(to, {
      internal: 'Elsewhere in this paper',
      site: (s) => `Opens ${s}`,
      email: (a) => `Email ${a}`,
      fallback: 'Link',
    }),
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
