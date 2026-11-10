// What both wires do to text: the escaping the free endpoints need, the entities read back, the code points no reader
// sees. Restated from the measured facts (translation dossier §16): Microsoft's and Google's free endpoints run an HTML
// aligner on every request, so a bare `<` or `&` fuses (`a < b and c > d` came back `<B和C> d`), and replies stay
// HTML-encoded; Google sets zero width spaces inside words; a numeric entity past U+10FFFF must not throw.
import type { Piece } from '../contract.ts'

/** default-ignorable code points: invisible by definition, dropped from what a reply says */
export const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
/** the sentinel a reading places where a sentence begins (a private-use character: no reply holds one) */
export const SENTINEL = ''

/** text for the markers wire: `@` doubled (a literal `@` never starts a marker), `& < >` as entities */
export const escapeMarkers = (s: string): string =>
  s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** text for the tags wire: `& < >` as entities */
export const escapeTags = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
/** a reply's entities read: a numeric one of a code point (U+10FFFF at most, else kept as it stands) and the named ones */
export const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b: string) => {
    if (b[0] !== '#') return NAMED[b.toLowerCase()] ?? m
    const c = b[1] === 'x' || b[1] === 'X' ? Number.parseInt(b.slice(2), 16) : Number.parseInt(b.slice(1), 10)
    return c <= 0x10ffff ? String.fromCodePoint(c) : m
  })
/** an entity, as one atom of a wire: a boundary inside one goes to its end */
export const ENTITY = '&(?:#[xX][0-9a-fA-F]+|#\\d+|amp|lt|gt|quot|apos|nbsp);'

/** what a translation of words holds: a letter, or a digit (two is 2) */
export const SAYS = /[\p{L}\p{N}]/u
export const LETTER = /\p{L}/u

/** what an element reads as to the sentence splitter, by its kind (mt.mjs splitContextOf, now typed): a note's mark belongs
 *  to the sentence before it; a citation too where it is set against it, else it opens the next (`… expensive. \citet{x}
 *  proposes …`: the splitter reads where it stands, @readarxiv/text `citation`); a reference is a number, a formula a word, a
 *  break a space */
export function standInOf(kind: string): 'annotation' | 'citation' | string | undefined {
  if (kind === 'cite') return 'citation'
  if (kind === 'note-mark' || kind === 'footnote') return 'annotation'
  if (kind === 'ref' || kind === 'eqref') return '1'
  if (kind === 'math') return 'x'
  if (kind === 'break' || kind === 'space') return ' '
  return undefined
}

/** an element's stop that is white space alone: a line end it states (a forced break a run-in label follows), which the
 *  markers wire writes where Microsoft cuts its sentence; never punctuation of the element's own */
export const LINE_END = /^\s+$/

/** the stop a display that states none of its own ends its sentence with, where TeX set it at that sentence's end */
export const DISPLAY_END = '.'
/** a text that begins a sentence: its first letter upper case (Unicode Lu, Lt) */
const BEGINS = /^\s*[\p{Lu}\p{Lt}]/u
/**
 * The unit's content with each display that states no stop of its own given `DISPLAY_END` where TeX set it at its sentence's end:
 * the first thing after it that sets something is text that begins with an upper-case letter (Unicode Lu, Lt: the source's own
 * orthography; TeX's text goes on after a display in its paragraph either way, "… as: [display] The next …" a sentence of its
 * own after it, "… tuple: [display] where …" its sentence going on). What sets nothing is passed over (an element stated
 * `silent`, one that reads as white space: a space, a break); an element that sets something, or the unit's end, gives none.
 * Each wire writes it after the display as the display's own stop, which reading takes back (the original sets none there),
 * and the tags wire's cutter reads it: a translator is asked for the sentence TeX ended (Microsoft cuts at neither a marker nor
 * a colon: 0 of 444 without a display's stop, 1,357 of 1,357 with it). Over the corpus's 88 papers (2026-11-09): 3,937 displays
 * state their stop; of the rest, 328 go on in lower case, 52 end their unit, 95 on 22 papers are followed by an upper-case
 * word, the commonest all a sentence's first (The 17, In 9, We 7, For 5, Here 5, Then 4, This 4)
 */
export function displayEnds(content: readonly Piece[]): readonly Piece[] {
  const ends = new Set<Piece>()
  let pending: Piece | null = null
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'span') walk(p.content)
      else if (p.t === 'text') {
        if (!p.s.trim()) continue
        if (pending && BEGINS.test(p.s)) ends.add(pending)
        pending = null
      } else if (p.kind === 'display' && p.stop === undefined) pending = p
      else if (!p.silent && standInOf(p.kind) !== ' ') pending = null
    }
  }
  walk(content)
  if (!ends.size) return content
  const stated = (ps: readonly Piece[]): Piece[] =>
    ps.map((p) =>
      p.t === 'span' ? { ...p, content: stated(p.content) } : ends.has(p) ? { ...p, stop: DISPLAY_END } : p,
    )
  return stated(content)
}
