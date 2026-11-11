// The markers wire, over typed pieces (Microsoft's free endpoint keeps no tag: tags 0 %, markers 98 %, translation dossier
// §16). A unit goes out as plain text with its elements as markers `@a#`; what Microsoft does to markers is repaired here
// and nowhere else. Restated from the measured facts the PDF engine's wire (mt.mjs) carries, now that the source reader
// types each piece:
// - each marker is a hard sentence boundary to the endpoint, so a span that is not `must` goes on no wire: its words join
//   the sentence and its style may be lost (the decision: such a span may come back unstyled), and its head (accept.ts
//   headLength: the elements before its first word, a declaration's place, `{\em all}`) is one marker that comes back in a
//   copy of the span, never loose: a declaration loose held to the unit's end (1810.04805v2 on staging, 2026-11-08: all
//   after "all"'s translation slanted, all after BERT bold); a style that cannot be mapped is dropped, never spread. A
//   span holding the whole unit goes on no wire either and comes back around the translation; a `must` span is kept as
//   two markers, or as one when it holds no text;
// - side-by-side elements, white space alone between them, go as one marker read back as all of them in order (28,203 of
//   the 53 sweep papers' 97,053 markers touched the one before); a display, and an element its host states `alone`, ends
//   such a stretch (`display` below is that property and nothing else);
// - an element that sets nothing where it stands (`silent`, the source reader's from TeX's tables: a declaration, a key
//   written to a file, `\noindent`, `\-`) goes on no wire, and so does a span's head of such elements alone (`{\bfseries w}`):
//   a marker for it cut the sentence where the source sets nothing (2610.19159's `\textcolor{…}{\bfseries w}` round every
//   word: 13,000 markers and word salad, until today's wire sent them on none, TRANSLATE_VERSION 3 and 10; this wire, before
//   the source reader stated them, sent 106 in one of its units where today's sends 10, and Microsoft's reply was word salad
//   again, 2026-11-09). Beside an element that sets something it rides in that one's marker, in its
//   place; alone, it comes back at the front of its innermost kept group (the unit, a kept span) where nothing of the group
//   went out before it, else at the group's end, as today's wire puts it back; one beside a span that holds all the rest
//   leaves that span around the translation, itself outside it where it stands;
// - a marker touching a word is read as part of it, and one right after a full stop leaves the last word untranslated: a
//   space of ours around it, taken back on reading wherever the reply kept it on that side of the marker: the space is the
//   wire's, not the page's (DESIGN §6.2, as the HTML page's rehydrate takes it), and the source set the element glued there,
//   a mark, a script or an accent to its word, a tie to its neighbours (before 2026-11-09 only beside a stop or a digit:
//   2610.20967v1's names read back a space TeX never set before each name's marks, 4.3 pt where TeX's is 1.35). Not around an element
//   inside a word (a letter right before it and right after it, an element that reads as part of a word: `inWord`): there
//   the word is one token of the source, and spaced it went out as two words (2608.25210v2's `str\_s`: `str @a# s` came
//   back `STR @a#`, `LLM @a# bottom @b# up` with "bottom" and "up" translated; unspaced, the four identifiers asked came
//   back as they went, 2026-11-09);
// - a display's own end punctuation goes after its marker or the sentence runs on (0/444 vs 1,357/1,357), and the reply's
//   marks after that marker are taken off on reading; an element's stop that is a line end (a forced break a run-in label
//   follows, no stop ending the sentence before it: the source reader's run-in rule) goes after its marker too, where
//   Microsoft cuts its sentence (it reads neither a marker nor a colon as a sentence's end), and is taken back on reading
//   (1810.04805v2 p8: the label "No NSP" inside the sentence before it came back with its term lost; begun on its own line,
//   whole);
// - ids are letters, never digits (engines reorder, merge and thousand-separate digits);
// - Microsoft writes `@e##`, `@d# #`, drops `#` before a CJK character, displaces a `#` (`@f#(#)`): read tolerantly where
//   the wire holds no `#` of its own; a marker without its `#` not at all for a unit stated `strict` (contract.ts).
import { asOut, headLength, holdsEl, textOf } from '../accept.ts'
import type { OutPiece, Piece, UnitIn } from '../contract.ts'
import { decode, displayEnds, ENTITY, escapeMarkers, INVISIBLE, LETTER, LINE_END, SAYS, standInOf } from './text.ts'

export const DISPLAY = 'display'

type Item =
  /** `fixed`: no text of the source, every character of it at `at` (a group's stop, written at its end) */
  | { t: 'text'; s: string; at: number; fixed?: true }
  | {
      t: 'void'
      out: OutPiece[]
      at: number
      len: number
      display: boolean
      stop: string | undefined
      /** each element it holds can stand inside a word (`inWord`) */
      word: boolean
      /** each element it holds sets nothing (`silent`): alone, it goes on no wire */
      silent: boolean
    }
  | { t: 'open'; id: string; at: number; letters: boolean; depth: number }
  | { t: 'close'; id: string; at: number }
export type Slot = { t: 'void'; out: OutPiece[] } | { t: 'open'; id: string } | { t: 'close'; id: string }
export interface Beside {
  before: OutPiece[]
  after: OutPiece[]
}
export interface Off {
  front: OutPiece[]
  back: OutPiece[]
  heads: ReadonlyMap<string, OutPiece[]>
  tails: ReadonlyMap<string, OutPiece[]>
}

export interface MarkersPlan {
  wire: string
  /** marker n stands for slots[n − 1] */
  slots: Slot[]
  /** markers the wire set a space before after a full stop, after a digit, and before a digit */
  stops: ReadonlySet<number>
  numbers: ReadonlySet<number>
  numbersAfter: ReadonlySet<number>
  /** markers the wire set a space of its own before, and after: where the source set the element glued to the text there */
  gluedBefore: ReadonlySet<number>
  gluedAfter: ReadonlySet<number>
  /** markers after which the wire wrote their element's own stop */
  own: ReadonlySet<number>
  /** markers after which the wire wrote a line end, their element's stop: taken back on reading */
  lines: ReadonlySet<number>
  /** spans that hold the whole unit, outermost first: back around the translation */
  around: readonly string[]
  /** for each of them, what sets nothing beside it (`silent`, on no wire): back before and after it */
  beside: readonly Beside[]
  /** what went on no wire (`silent`): back at the unit's front or end (inside its spans around), or a kept span's (by id) */
  off: Off
  /** kept spans whose source holds letters, innermost first: refilled where they come back empty */
  refill: readonly string[]
  /** the wire holds no `#` of its own: a `#` beside a marker is the marker's */
  hashFree: boolean
  /** the markers (by id) the wire follows with a `#` of its own, white space between or none (`@b## of runs`, `@a# ## Root`):
   *  a `#` there in the reply is the text's, as it went out */
  hashAfter: ReadonlySet<number>
  /** for each wire offset (and its end), the offset in the unit's projection it came from */
  plainAt: readonly number[]
}

/** bijective base-26: 1 → a, 26 → z, 27 → aa */
export function toAlpha(id: number): string {
  let n = id
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(97 + r) + out
    n = (n - 1 - r) / 26
  }
  return out
}
export function fromAlpha(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 96)
  return n
}

const SOLID = /\S/
const LEAD_PUNCT = /^\s*[.,;:!?。．，、；：！？]/
const projLength = (ps: readonly Piece[]): number =>
  ps.reduce((n, p) => n + (p.t === 'text' ? p.s.length : p.t === 'el' ? 1 : projLength(p.content)), 0)

type El = Extract<Piece, { t: 'el' }>
const silentEl = (p: Piece): p is El => p.t === 'el' && !!p.silent
/** the spans that hold every element and every word of the unit but those that set nothing, outermost first, what they hold,
 *  and the elements that set nothing beside each */
function around(content: readonly Piece[]): {
  ids: string[]
  inner: readonly Piece[]
  at: number
  beside: Beside[]
  stops: (string | undefined)[]
} {
  const ids: string[] = []
  const beside: Beside[] = []
  const stops: (string | undefined)[] = []
  let inner = content
  let at = 0
  for (;;) {
    const solid = inner.filter((p) => !(p.t === 'text' && !SOLID.test(p.s)) && !silentEl(p))
    const only = solid[0]
    if (solid.length !== 1 || only?.t !== 'span') return { ids, inner, at, beside, stops }
    const k = inner.indexOf(only)
    at += projLength(inner.slice(0, k))
    ids.push(only.id)
    stops.push(only.stop)
    beside.push({
      before: asOut(inner.slice(0, k).filter(silentEl)),
      after: asOut(inner.slice(k + 1).filter(silentEl)),
    })
    inner = only.content
  }
}

/** the last element of pieces that sets something, through the groups that hold it: what a marker of them ends with (its
 *  display, its own stop), a display inside a group inside a span's head too (`{\small $$ x = y. $$} Then…`) */
function lastEl(content: readonly Piece[]): El | undefined {
  for (let i = content.length - 1; i >= 0; i--) {
    const p = content[i] as Piece
    if (p.t === 'el' && !p.silent) return p
    if (p.t === 'span') {
      const inner = lastEl(p.content)
      if (inner) return inner
    }
  }
  return undefined
}

/** a display, or an element its host states alone: it ends a stretch of elements, and so a marker */
const ends = (q: El | undefined): boolean => !!q && (q.kind === DISPLAY || q.alone === true)
/** the stop a stretch of side-by-side elements ends with: its last element's that sets something, else a line end one of
 *  them states (what follows a forced break in its stretch sets no word: a switch, a skip) */
const stopOf = (els: readonly El[]): string | undefined =>
  els.findLast((q) => !q.silent)?.stop ?? els.findLast((q) => q.stop !== undefined && LINE_END.test(q.stop))?.stop
/**
 * Whether an element can stand inside a word, its characters the word's: one that reads as a word to the sentence splitter
 * (text.ts standInOf: a formula; a macro, an escaped character, code, which it reads as none). Never one its reader states
 * nothing of (`other`: the PDF's source reader's kind for a skip, a switch, which set no character; a tie is its `space`, a
 * forced break its `break`),
 * a display, a space or a break, a reference's number or an annotation
 */
const inWord = (q: El): boolean => q.kind !== 'other' && q.kind !== DISPLAY && (standInOf(q.kind) ?? 'x') === 'x'
const elsOf = (content: readonly Piece[]): El[] =>
  content.flatMap((p): El[] => (p.t === 'el' ? [p] : p.t === 'span' ? elsOf(p.content) : []))
const holdsEnd = (content: readonly Piece[]): boolean =>
  content.some((q) => (q.t === 'el' ? ends(q) : q.t === 'span' && holdsEnd(q.content)))
/** how much of a head (its first `k` pieces) one marker takes: up to its last element before its first display (that
 *  display included, where a piece ends with it), so that no marker holds a display before another element */
function cutOf(content: readonly Piece[], k: number): number {
  let cut = 0
  for (let i = 0; i < k; i++) {
    const q = content[i] as Piece
    const last = q.t === 'el' ? q : q.t === 'span' ? lastEl(q.content) : undefined
    if (q.t === 'span' && holdsEnd(q.content) && !ends(last)) break
    if (q.t === 'el' || (q.t === 'span' && holdsEl(q.content))) cut = i + 1
    if (ends(last)) break
  }
  return cut
}

function itemsOf(content: readonly Piece[], at0: number): Item[] {
  const items: Item[] = []
  const walk = (ps: readonly Piece[], at: number, depth: number): number => {
    for (const p of ps) {
      if (p.t === 'text') {
        items.push({ t: 'text', s: p.s, at })
        at += p.s.length
      } else if (p.t === 'el') {
        items.push({
          t: 'void',
          out: [{ t: 'el', id: p.id }],
          at,
          len: 1,
          display: p.kind === DISPLAY || p.alone === true,
          stop: p.stop,
          word: inWord(p),
          silent: !!p.silent,
        })
        at += 1
      } else if (!p.must) {
        // a span on no wire: its head (the elements before its first word, where TeX sets a declaration that holds
        // for the rest of the group) one marker in a copy of it, its words the sentence's, back unstyled. The marker ends
        // at the head's first display (or element alone), whose own stop and boundary are a marker's last element's: the
        // head is cut after the piece that ends with one, or before a group holding one before its end (its own rule reads
        // that group); what follows goes as elsewhere, each display its own marker as on the base's wire
        const k = cutOf(p.content, headLength(p.content))
        if (k) {
          const head = p.content.slice(0, k)
          const len = projLength(head)
          const last = lastEl(head)
          items.push({
            t: 'void',
            out: [{ t: 'span', id: p.id, content: asOut(head) }],
            at,
            len,
            display: ends(last),
            stop: stopOf(elsOf(head)),
            word: elsOf(head).every(inWord),
            silent: elsOf(head).every((q) => !!q.silent),
          })
          at += len
        }
        at = walk(p.content.slice(k), at, depth)
        if (p.stop) items.push({ t: 'text', s: p.stop, at, fixed: true })
      } else if (SOLID.test(textOf(p.content))) {
        items.push({ t: 'open', id: p.id, at, letters: LETTER.test(textOf(p.content)), depth })
        at = walk(p.content, at, depth + 1)
        if (p.stop) items.push({ t: 'text', s: p.stop, at, fixed: true })
        items.push({ t: 'close', id: p.id, at })
      } else {
        // a `must` span with no text: one marker for it and what it holds
        const len = projLength(p.content)
        const last = lastEl(p.content)
        items.push({
          t: 'void',
          out: [{ t: 'span', id: p.id, content: asOut(p.content) }],
          at,
          len,
          display: ends(last),
          stop: stopOf(elsOf(p.content)),
          word: elsOf(p.content).every(inWord),
          silent: false,
        })
        at += len
      }
    }
    return at
  }
  walk(content, at0, 0)
  // side-by-side elements, white space alone between them, one marker; a display ends the stretch
  const out: Item[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item
    let last = i
    if (it.t === 'void' && !it.display) {
      for (let x = i + 1; x < items.length; x++) {
        const y = items[x] as Item
        if (y.t === 'void') {
          last = x
          if (y.display) break
          continue
        }
        if (y.t !== 'text' || SOLID.test(y.s)) break
      }
    }
    if (last === i || it.t !== 'void') {
      out.push(it)
      continue
    }
    const run = items.slice(i, last + 1)
    const end = run[run.length - 1] as Extract<Item, { t: 'void' }>
    const voids = run.filter((x): x is Extract<Item, { t: 'void' }> => x.t === 'void')
    // (a stretch of elements that each set nothing is no marker: each goes on no wire)
    if (voids.every((x) => x.silent)) {
      out.push(...run)
      i = last
      continue
    }
    out.push({
      t: 'void',
      out: run.flatMap((x): OutPiece[] => (x.t === 'void' ? x.out : x.t === 'text' ? [{ t: 'text', s: x.s }] : [])),
      at: it.at,
      len: end.at + end.len - it.at,
      display: end.display,
      stop:
        voids.findLast((x) => !x.silent)?.stop ??
        voids.findLast((x) => x.stop !== undefined && LINE_END.test(x.stop))?.stop,
      word: false,
      silent: false,
    })
    i = last
  }
  return out
}

/** a kept group on the wire (the unit, a kept span): what of it went on no wire, before and after its first thing on it */
type Group = { id: string | null; seen: boolean; lead: OutPiece[]; end: OutPiece[] }

/** A unit's markers wire and what reading a reply needs */
export function planMarkers(unit: UnitIn): MarkersPlan {
  // (a display that ends its sentence states the stop it ends it with: written after its marker, taken back on reading)
  const content = displayEnds(unit.content)
  const { ids, inner, at, beside, stops: aroundStops } = around(content)
  const items = itemsOf(inner, at)
  // (the stop TeX set at the end of a span around the rest: after its words, the innermost's first)
  const innerEnd = at + projLength(inner)
  for (let i = aroundStops.length - 1; i >= 0; i--) {
    const stop = aroundStops[i]
    if (stop) items.push({ t: 'text', s: stop, at: innerEnd, fixed: true })
  }
  const slots: Slot[] = []
  const stops = new Set<number>()
  const numbers = new Set<number>()
  const numbersAfter = new Set<number>()
  const gluedBefore = new Set<number>()
  const gluedAfter = new Set<number>()
  const own = new Set<number>()
  const lines = new Set<number>()
  const kept: { id: string; depth: number }[] = []
  let wire = ''
  const plainAt: number[] = []
  const put = (s: string, from: number) => {
    wire += s
    for (let k = 0; k < s.length; k++) plainAt.push(from)
  }
  // (an element that sets nothing, left alone in itemsOf, goes on no wire: into its innermost kept group, before the group's
  // first thing on the wire or after)
  const isOff = (it: Item | undefined): boolean => it?.t === 'void' && it.silent
  const groups: Group[] = [{ id: null, seen: false, lead: [], end: [] }]
  const done: Group[] = []
  const seen = () => {
    for (const g of groups) g.seen = true
  }
  /** the text item next to `i` on the wire (`d` its side), past what goes on none */
  const textBeside = (i: number, d: 1 | -1): string => {
    let j = i + d
    while (isOff(items[j])) j += d
    const x = items[j]
    return x?.t === 'text' ? x.s : ''
  }
  for (const [i, it] of items.entries()) {
    if (it.t === 'text') {
      // white space as one space, one where two runs meet; the escapes, each character of one at its source's place
      for (let k = 0; k < it.s.length; k++) {
        const ch = it.s[k] as string
        if (/\s/.test(ch)) {
          if (/\s$/.test(wire) || (k > 0 && /\s/.test(it.s[k - 1] as string))) continue
          put(' ', it.fixed ? it.at : it.at + k)
        } else {
          put(escapeMarkers(ch), it.fixed ? it.at : it.at + k)
          seen()
        }
      }
      continue
    }
    if (isOff(it)) {
      const g = groups[groups.length - 1] as Group
      ;(g.seen ? g.end : g.lead).push(...(it as Extract<Item, { t: 'void' }>).out)
      continue
    }
    slots.push(
      it.t === 'void'
        ? { t: 'void', out: it.out }
        : it.t === 'open'
          ? { t: 'open', id: it.id }
          : { t: 'close', id: it.id },
    )
    if (it.t === 'open' && it.letters) kept.push({ id: it.id, depth: it.depth })
    const n = slots.length
    const nextText = textBeside(i, 1)
    // (an element inside a word: a letter of the source right before it and right after it, no space of ours beside it)
    const inside =
      it.t === 'void' && it.word && /[\p{L}\p{M}]$/u.test(textBeside(i, -1)) && /^[\p{L}\p{M}]/u.test(nextText)
    const before = !inside && /[\p{L}\p{N}\p{M}.]$/u.test(wire) ? ' ' : ''
    if (wire.endsWith('.')) stops.add(n)
    if (/\p{N}$/u.test(wire)) numbers.add(n)
    if (/^\p{N}/u.test(nextText)) numbersAfter.add(n)
    const stop = it.t === 'void' && it.stop && !LEAD_PUNCT.test(nextText) ? it.stop : ''
    const line = LINE_END.test(stop)
    if (line) lines.add(n)
    else if (stop) own.add(n)
    const after = !inside && !line && /^[\p{L}\p{N}\p{M}]/u.test(nextText) ? ' ' : ''
    const end = it.t === 'void' ? it.at + it.len : it.at
    if (before) gluedBefore.add(n)
    if (after) gluedAfter.add(n)
    put(before, it.at)
    put(`@${toAlpha(n)}#`, it.at)
    put(stop, end)
    put(after, end)
    seen()
    if (it.t === 'open') groups.push({ id: it.id, seen: false, lead: [], end: [] })
    else if (it.t === 'close' && groups.length > 1) done.push(groups.pop() as Group)
  }
  const unitGroup = groups[0] as Group
  const byGroup = (pick: (g: Group) => OutPiece[]) =>
    new Map(done.filter((g) => pick(g).length).map((g) => [g.id as string, pick(g)]))
  // the wire trimmed whole
  const lead = wire.length - wire.trimStart().length
  const trimmed = wire.trim()
  const map = plainAt.slice(lead, lead + trimmed.length)
  map.push(projLength(content))
  return {
    wire: trimmed,
    slots,
    stops,
    numbers,
    numbersAfter,
    gluedBefore,
    gluedAfter,
    own,
    lines,
    around: ids,
    beside,
    off: { front: unitGroup.lead, back: unitGroup.end, heads: byGroup((g) => g.lead), tails: byGroup((g) => g.end) },
    refill: kept.sort((a, b) => b.depth - a.depth).map((k) => k.id),
    hashFree: !trimmed.replace(/@@|@[a-z]+#/g, '').includes('#'),
    hashAfter: new Set(
      [...trimmed.matchAll(/@@|@([a-z]+)#(?=[ \t]*#)/g)].flatMap((m) => (m[1] ? [fromAlpha(m[1])] : [])),
    ),
    plainAt: map,
  }
}

// ---------------------------------------------------------------- reading a reply back

export type Tok =
  | { t: 'text'; s: string }
  | { t: 'void'; out: OutPiece[] }
  | { t: 'open'; id: string }
  | { t: 'close'; id: string }

/** a marker's `#` doubled is its own, a space or a tab between or none, where the wire holds no `#` of its own */
const CLOSER = '#(?:[ \\t]*#)*'
/** the reply's markers: strictly (each with its `#`), or tolerantly (one without it too, of at most the highest id's
 *  width, followed by no letter of an id and no `#`: `@b形`). A marker without its `#` is read only where the wire holds no
 *  `#` of its own: there every other `#` of the reply is taken out as the marker's, elsewhere the one it lost may stand in
 *  the text, which a reader would see (`F# @a(#)` → `F# … (#)`; the HTML page's 20 fixture blocks with a `#` of their own,
 *  DESIGN §6.3's reason; stage 4b's slip check) */
function readerOf(hashFree: boolean, bare: number | null): RegExp {
  const closer = hashFree ? CLOSER : '#'
  if (bare === null || !hashFree) return new RegExp(`@@|@([a-z]+)${closer}`, 'g')
  const letters = `[a-z]{1,${bare}}`
  return new RegExp(`@@|@(${letters})${closer}|@(${letters})(?![a-z#])`, 'g')
}
/** a run of `#` outside the markers, not an entity's, with a pair of brackets that held only it (`@f#(#)`) */
const STRAY = /(?<!&)#+/g
const STRAY_PAIR = /[ \t]*[([（【]\s*(?<!&)#+\s*[)\]）】]/g
/** our space after a stop before a marker, while the text still ends in a stop of any script */
const STOP_SPACE = /(?<=[.。．।॥۔։።။།])[ \t\n\f\r]+$/
/** our line end after a marker, where the reply kept it: its white space up to the first word, the sentinels a reading set
 *  among it kept */
const LINE_LEAD = /^[ \t\f\r\ue000]*\n[ \t\n\f\r\ue000]*/
/** our space after a digit before a marker, and before a digit after one */
const NUMBER_SPACE = /(?<=\p{N})[ \t\n\f\r]+$/u
const NUMBER_LEAD = /^[ \t\n\f\r]+(?=\p{N})/u
/** our space before a marker, and after one, where the source set its element glued to the text there: TeX set no space
 *  between a word and the mark, the script or the accent it carries, so neither does the translation, whatever the reply
 *  keeps of ours or whatever stands beside it now (2610.20967v1 p1 on staging: its names' marks 4.3 pt off the names, CJK's,
 *  where TeX's are 1.35; its places' marks a space before them) */
const GLUED_SPACE = /[ \t\n\f\r]+$/
const GLUED_LEAD = /^[ \t\n\f\r]+/
/** what a reply may set for an element's own stop right after its marker: any script's stop, comma, semicolon or colon */
const OWN_MARKS = '.,;:。．，、；：।۔،؛'
const OWN_LEAD = new RegExp(`^([ \\t\\n\\f\\r\\ue000]*)[${OWN_MARKS}]+`)
/** what the wire writes as one thing: a marker (read tolerantly too), an escaped `@`, an entity */
export const MARKER_ATOM = new RegExp(`@@|@[a-z]+(?:${CLOSER})?|${ENTITY}`, 'g')

/** A reply → tokens, or null where it cannot be read: a marker unknown, doubled or lost, every word lost */
export function readMarkers(text: string, plan: MarkersPlan, tolerant: boolean): Tok[] | null {
  // where the wire holds a `#` of its own, a `#` right after a marker is either Microsoft's doubled closer or the text's own
  // moved beside it: which, nobody can tell, and either way a reader would see one `#` too many or too few (stage 4b). Not
  // after a marker the wire itself follows with its text's `#` (`hashAfter`): there it is that `#`, as it went out (TeX's `\#`,
  // a character of the text since 2026-11-11: `$k$\#`, `## Root Goal` after a list's mark; Microsoft gave back every one of
  // 114 text `#` of the 88 papers' 24 units holding one, in Chinese, Japanese and German)
  if (!plan.hashFree)
    for (const m of text.replace(/@@/g, '').matchAll(/@([a-z]+)#[ \t]*#/g))
      if (!plan.hashAfter.has(fromAlpha(m[1] as string))) return null
  const toks: Tok[] = []
  const seen = new Set<number>()
  let afterNumber = false
  let afterGlued = false
  let afterOwn = false
  let afterLine = false
  const push = (raw: string, takeBack: RegExp | null) => {
    let s = raw
    if (plan.hashFree) s = s.replace(STRAY_PAIR, '').replace(STRAY, '')
    if (takeBack) s = s.replace(takeBack, '')
    if (afterOwn) s = s.replace(OWN_LEAD, '$1')
    if (afterLine) s = s.replace(LINE_LEAD, (m) => m.replace(/[^\ue000]/g, ''))
    s = decode(s)
    if (afterNumber) s = s.replace(NUMBER_LEAD, '')
    if (afterGlued) s = s.replace(GLUED_LEAD, '')
    s = s.replace(INVISIBLE, '')
    if (s) toks.push({ t: 'text', s })
  }
  const re = readerOf(plan.hashFree, tolerant ? toAlpha(Math.max(1, plan.slots.length)).length : null)
  let last = 0
  let buf = ''
  for (let m = re.exec(text); m; m = re.exec(text)) {
    buf += text.slice(last, m.index)
    last = re.lastIndex
    if (m[0] === '@@') {
      buf += '@'
      continue
    }
    const id = fromAlpha((m[1] ?? m[2]) as string)
    const slot = plan.slots[id - 1]
    if (!slot || seen.has(id)) return null
    push(
      buf,
      plan.gluedBefore.has(id)
        ? GLUED_SPACE
        : plan.stops.has(id)
          ? STOP_SPACE
          : plan.numbers.has(id)
            ? NUMBER_SPACE
            : null,
    )
    buf = ''
    seen.add(id)
    toks.push(slot)
    afterNumber = plan.numbersAfter.has(id)
    afterGlued = plan.gluedAfter.has(id)
    afterOwn = plan.own.has(id)
    afterLine = plan.lines.has(id)
  }
  push(buf + text.slice(last), null)
  if (seen.size !== plan.slots.length) return null
  if (!toks.some((t) => t.t === 'text' && SAYS.test(t.s)) && LETTER.test(plan.wire.replace(MARKER_ATOM, '')))
    return null
  return withOff(toks, plan.off)
}

/** the tokens with what went on no wire put back: at the unit's front and end, after a kept span's open and before its close */
function withOff(toks: Tok[], off: Off): Tok[] {
  if (!off.front.length && !off.back.length && !off.heads.size && !off.tails.size) return toks
  const one = (out: OutPiece[] | undefined): Tok[] => (out?.length ? [{ t: 'void', out }] : [])
  const res: Tok[] = one(off.front)
  for (const t of toks) {
    if (t.t === 'close') res.push(...one(off.tails.get(t.id)))
    res.push(t)
    if (t.t === 'open') res.push(...one(off.heads.get(t.id)))
  }
  res.push(...one(off.back))
  return res
}

const STOP = /[.!?。！？]/
const STOPS = /[.!?。！？]/g
/** a kept span come back empty (the translator set its words outside it) takes the words right after its close, past other
 *  closes, up to the end of their sentence; else those right before its open, past other opens, from the start of theirs */
export function refill(toks: Tok[], ids: readonly string[]): Tok[] {
  const out = [...toks]
  const solid = (t: Tok) => t.t === 'text' && SOLID.test(t.s)
  for (const id of ids) {
    const i = out.findIndex((t) => t.t === 'open' && t.id === id)
    const j = out.findIndex((t) => t.t === 'close' && t.id === id)
    if (i < 0 || j <= i || out.slice(i + 1, j).some(solid)) continue
    let x = j + 1
    while (out[x]?.t === 'close') x++
    const after = out[x]
    if (after?.t === 'text') {
      const cut = after.s.search(STOP)
      const inside = cut < 0 ? after.s : after.s.slice(0, cut)
      if (LETTER.test(inside)) {
        if (cut < 0) out.splice(x, 1)
        else out[x] = { t: 'text', s: after.s.slice(cut) }
        out.splice(j, 0, { t: 'text', s: inside })
        continue
      }
    }
    x = i - 1
    while (x >= 0 && out[x]?.t === 'open') x--
    const before = out[x]
    if (x >= 0 && before?.t === 'text') {
      const cut = Math.max(-1, ...[...before.s.matchAll(STOPS)].map((m) => m.index ?? -1))
      const inside = before.s.slice(cut + 1)
      if (LETTER.test(inside)) {
        if (cut < 0) out.splice(x, 1)
        else out[x] = { t: 'text', s: before.s.slice(0, cut + 1) }
        const open = out.findIndex((t) => t.t === 'open' && t.id === id)
        out.splice(open + 1, 0, { t: 'text', s: inside })
      }
    }
  }
  return out
}

/** tokens → content: pairs nested as they close, the spans around the whole unit put back with what sets nothing beside
 *  each (`beside`, aligned with them); null for a pair out of order */
export function contentOf(
  toks: readonly Tok[],
  aroundIds: readonly string[],
  beside: readonly Beside[] = [],
): OutPiece[] | null {
  const root: OutPiece[] = []
  const stack: { id: string | null; content: OutPiece[] }[] = [{ id: null, content: root }]
  for (const t of toks) {
    const top = stack[stack.length - 1] as { id: string | null; content: OutPiece[] }
    if (t.t === 'text') top.content.push({ t: 'text', s: t.s })
    else if (t.t === 'void') top.content.push(...t.out)
    else if (t.t === 'open') {
      const node: OutPiece = { t: 'span', id: t.id, content: [] }
      top.content.push(node)
      stack.push({ id: t.id, content: node.content })
    } else {
      if (stack.length === 1 || top.id !== t.id) return null
      stack.pop()
    }
  }
  if (stack.length !== 1) return null
  let content = root
  for (let i = aroundIds.length - 1; i >= 0; i--)
    content = [
      ...(beside[i]?.before ?? []),
      { t: 'span', id: aroundIds[i] as string, content },
      ...(beside[i]?.after ?? []),
    ]
  return content
}
