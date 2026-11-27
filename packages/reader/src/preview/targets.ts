// A link's target, by its destination (link previews, phase 1; docs/PDF-READER.md §20): the head's `targets`, as the prepare
// stated them on its own evidence, keyed by the destination as Link.to.dest writes it (PDF.js's dest as JSON: a name
// `"cite.x"`, or an explicit array). A destination the head does not state has no preview and keeps its jump (the design's L4):
// nothing is derived or repaired here. Each of the three link sources is read back to that key: a laid link's (compose/links.ts:
// its href, the key URI-encoded) and PDF.js's own on the left and on a right page not laid (its href, PDF.js's
// getDestinationHash: `#` and the name or the array's JSON, `escape`d).
import type { Head, Target } from '@readarxiv/format'

/** the head's targets by their destination (none: a head made before the targets, or a paper whose links land on nothing) */
export function targetsOf(head: Pick<Head, 'targets'> | null): Map<string, Target> {
  return new Map((head?.targets ?? []).map((t) => [t[0], t] as const))
}

/** a link's target by its destination, or null */
export const targetOf = (targets: ReadonlyMap<string, Target>, dest: string): Target | null => targets.get(dest) ?? null

/** PDF.js's `escape`d text read back: `unescape` where the platform has it (every browser, Node), else the URI's decoding */
function unescaped(s: string): string | null {
  const un = (globalThis as { unescape?: (s: string) => string }).unescape
  try {
    return un ? un(s) : decodeURIComponent(s)
  } catch {
    return null
  }
}

/**
 * PDF.js's link hash (getDestinationHash: `#` + escape(name), or + escape(JSON of an explicit array)) read back to the key a
 * destination is stated by (Link.to.dest: JSON.stringify of PDF.js's dest); null for no hash, a page or a named action's
 * (`#page=…`, a query), or one that reads as nothing
 */
export function destOfHash(hash: string): string | null {
  if (!hash.startsWith('#') || hash.length < 2) return null
  const s = unescaped(hash.slice(1))
  if (!s) return null
  if (s.startsWith('[')) {
    try {
      const d = JSON.parse(s)
      if (Array.isArray(d)) return JSON.stringify(d)
    } catch {
      /* a name that begins with a bracket */
    }
  }
  return JSON.stringify(s)
}

/** a laid link's href (compose/links.ts: `#` and its Link.to.dest, URI-encoded) read back to its key; null where it is none */
export function destOfLaidHash(hash: string): string | null {
  if (!hash.startsWith('#') || hash.length < 2) return null
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
}

/** the destination key of a link element of either source: a laid link's (`a.axt-link`), else PDF.js's own anchor's; null for a
 *  link out of the paper or none */
export function destOfLink(a: Element): string | null {
  const href = a.getAttribute('href') ?? ''
  return a.classList.contains('axt-link') ? destOfLaidHash(href) : destOfHash(href)
}
