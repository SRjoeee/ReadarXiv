// The tags wire, over typed pieces, for the engines that keep tags (Google's translateHtml: tags 100 %; Chrome's built-in
// translator): an element as `<x id="n"/>`, a span with text as `<t id="n">…</t>` (every span: these engines keep their words
// inside it), a span with none as one void; to Google each in HTML's own inline element (TagSpelling 'html': an element a
// `<b translate=no>` holding its token, a word of its sentence; a span with text a `<span>` holding its words). For a
// unit that lights by sentence, a void boundary marker of an id past the unit's own goes where each sentence after the first
// begins (Google brings `<x id="N"/>` back exactly where it was set; `<s/>` gets closers appended, `<wbr>` is dropped:
// measured), and where they land are the translation's sentences.
import { sentenceCuts } from '@readarxiv/text'
import { asOut, textOf } from '../accept.ts'
import type { OutPiece, Piece, UnitIn } from '../contract.ts'
import { contentOf, type Off, refill, type Tok, withOff } from './markers.ts'
import {
  type Beside,
  decode,
  displayEnds,
  endsOf,
  escapeTags,
  GLUED_LEAD,
  GLUED_SPACE,
  type GlueEl,
  glueOf,
  INVISIBLE,
  inWord,
  LEAD_PUNCT,
  LETTER,
  LINE_END,
  OWN_LEAD,
  SAYS,
  SENTINEL,
  standInOf,
} from './text.ts'

type TagSlot = { t: 'void'; out: OutPiece[]; own: boolean } | { t: 'pair'; id: string }
interface TagsPlan {
  /** what is sent: the wire with its boundary markers */
  wire: string
  slots: TagSlot[]
  /** boundary markers' ids, in order (each past every slot's) */
  marks: number[]
  /** where each marked sentence after the first begins in the unit's projection */
  cuts: number[]
  refill: string[]
  /** element slots the source set glued to the piece before them, and after them, a text or another element (text.ts
   *  glueOf): the white space a reply sets there is taken back */
  gluedBefore: ReadonlySet<number>
  gluedAfter: ReadonlySet<number>
  /** for each boundary marker set right after its sentence's stop (planTags: on the wire a sentence ends at its stop), the
   *  elements the source glues after that stop, by id: the sentence's own, whose boundary a reading sets after them */
  leads: ReadonlyMap<number, readonly string[]>
  /** a boundary marker set right after the unit's last stop, before the elements glued after it: the wire's alone, no
   *  sentence's start (absent where the unit ends otherwise) */
  endMark?: number
  /** what sets nothing and went on no wire (offWire): back at the unit's front or end, or a pair's, by its id (markers.ts Off) */
  off: Off
  /** each pair's group around it (null: the unit), whether something of that group went out before the pair, and its depth:
   *  a reply that loses a pair (one that is not `must` may come back unstyled) has what `off` puts back in it come back in a
   *  copy of it in that group, never loose (a declaration loose would hold past its group) */
  parents: ReadonlyMap<string, { parent: string | null; after: boolean; depth: number }>
}

/** the model's and the engines' spellings of a tag (the extension's tokens.ts TAG_RE): `<x id="1"/>`, `<x id="1" />`,
 *  single or no quotes, `<x id="1"></x>` (its id the first three groups); an open `<t id="1">` (the next three); a close
 *  `</t>`; HTML's own inline elements (TagSpelling 'html'): an open `<span id="1" …>` (the next three) and a close `</span>`,
 *  what a span is, an element holding its token or a group holding its words, its id says (the unit's slot), never its
 *  attributes (readTags); and an open `<b …>` and a close `</b>`, an element holding its token, which says its slot (no id) */
const TAG_RE =
  /<x\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:\/>|>\s*<\/x\s*>)|<t\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*>|<\/t\s*>|<span\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))[^<>]*>|<\/span\s*>|<b(?:\s[^<>]*)?>|<\/b\s*>/g
const SPAN_CLOSE = /<\/span\s*>/y
const B_CLOSE = /<\/b\s*>/y

/**
 * How a tags wire writes its tags. 'void': an element (a formula, a citation, a reference, a note's mark: a void slot) as
 * `<x id="n"/>`, an empty element, what an LLM is told a void tag is (the extension's prompt) and Chrome's translator is sent;
 * a span with text as `<t id="n">…</t>`. 'html', what Google's translateHtml is sent: HTML's own inline element for both, in
 * the terms of the HTML it reads: an element `<b translate=no>xn</b>`, a token that HTML's `translate` attribute keeps
 * untranslated, a word of its sentence (the token an identifier, what a formula is, never a quantity or an article), its slot
 * the token's number (no id: the token says it, and the reading holds the token to it); a span with text
 * `<span id="n">…</span>`, the words of its sentence it holds. A boundary marker is always a void.
 * Measured: Google takes an element that holds no text (`<x/>`, `<x></x>`, `<span></span>`) or that HTML does not know
 * (`<x>n</x>`, with `translate="no"` or without) as a break between two texts it translates apart, each closed with a full
 * stop of its own (measured on a probe of 42 units of two papers, 1706.03762v7 one of them, zh and ja):
 * "… a matrix <x/>. The keys …" -> "…矩阵中。<x/> 。键和值…", 51 of 164 element groups in zh and 53 in ja, 18 of
 * them a stop on both sides, the element never moved across a word. Written as a word, none (1 and 5 left, each the target's
 * word order setting the element first in its sentence), the elements and boundary markers all back, the token as sent 424
 * of 424 (without the attribute 91 of 424 changed); a number for the token read as a quantity beside a word ("3 In" ->
 * inches, 4 and 4 replies), the identifier 0 and 1. A span written `<t>` is such a break too (measured on 2611.03953v2's
 * abstract and the lab's Google store): Google translated the text before it alone, wrote "……" where the
 * span's words belong and set the span after it ("act as <t>parameter priors</t> without…" -> "可以作为……<t>参数先验</t>而不…"),
 * 65 places of 13,233 zh spans in the lab's Google store, and translated a span's words out of their sentence ("the {order}
 * we take" -> 命令, "each of the {m} coordinates" -> 米); written as a `<span>`, the dots were gone in 61 of 61 units and those
 * words read in their sentences (顺序, "m 个"); 3 of 122 units refused by the token contract (Google moved an element and
 * left its token as text: the next translator's). The element's tag is the shortest Google keeps whole (DESIGN
 * §6.2): of `<b>xn</b>`, `<b translate=no>xn</b>`, `<span translate=no>xn</span>` and `<span translate="no">xn</span>`, asked
 * in that order over 280 units of five languages (measured 2026-11-13), the bare `<b>` lost 173 of 1,909 elements
 * (dropped, or merged into a word), `<b translate=no>` none, every class (a stop before an element, ellipses, lost stops, a
 * unit left as the source) as with `<span id="n" translate="no">`, the tag back as sent 1,909 of 1,909; asked again over
 * this wire, 48 merged cells and 20 units of the HTML page (measured 2026-11-15), every class the same, 2,169 of 2,169
 * tags back. 12 to 16 % fewer characters are sent. A reply in the spelling before it (`<span id="n" translate="no">`) reads
 * as it did: a stored reply is read again
 */
type TagSpelling = 'void' | 'html'
/** the token an element written as a word holds: its slot's number after an `x` */
const tokenOf = (n: number): string => `x${n}`
const elementTag = (as: TagSpelling, n: number): string =>
  as === 'html' ? `<b translate=no>${tokenOf(n)}</b>` : `<x id="${n}"/>`
const openTag = (as: TagSpelling, n: number): string => (as === 'html' ? `<span id="${n}">` : `<t id="${n}">`)
const closeTag = (as: TagSpelling): string => (as === 'html' ? '</span>' : '</t>')
/** a string of the tokens' form standing as a token would: `x` and digits, with no ASCII letter, digit or underscore right
 *  before it (inside a longer word or number it is none: `max1`, `0x1F`) and no digit right after it (`x12` holds no `x1`) */
const TOKEN_FORM = /(?<![A-Za-z0-9_])x[0-9]+(?![0-9])/g
/** a text of the wire as the reading keeps it: its entities read (a character reference is one character), its invisible
 *  code points out */
const keptOf = (s: string): string => decode(s).replace(INVISIBLE, '')
/** where an element's span (or `<b>`) ends from `from`, right after its open: the start of its close and the end of it, its
 *  content holding no tag; null where no close of its own spelling follows its content */
function elementEnd(s: string, from: number, close = SPAN_CLOSE): { at: number; end: number } | null {
  const at = s.indexOf('<', from)
  if (at < 0) return null
  close.lastIndex = at
  const c = close.exec(s)
  return c ? { at, end: at + c[0].length } : null
}
/** whether a tag TAG_RE matched is an element's `<b …>` open, or a `</b>` close */
const boldOpen = (tag: string): boolean => tag.startsWith('<b')
const boldClose = (tag: string): boolean => tag.startsWith('</b')
/** what a `<b>` opened right before `from` holds: the slot its token names, as the reading keeps the text (its entities read,
 *  its white space aside), and where its close ends; null where it holds anything but one token, or is not closed */
function boldOf(s: string, from: number): { n: number; end: number } | null {
  const end = elementEnd(s, from, B_CLOSE)
  if (!end) return null
  const k = /^x([0-9]+)$/.exec(keptOf(s.slice(from, end.at)).trim())
  return k ? { n: Number(k[1]), end: end.end } : null
}
/** the element a `<b>` opened right before `from` stands for, where its token names an element's slot: that slot, and where
 *  its close ends; null for any other */
function boldElement(s: string, from: number, plan: TagsPlan): { n: number; end: number } | null {
  const b = boldOf(s, from)
  return b && plan.slots[b.n - 1]?.t === 'void' ? b : null
}
/** a wire's text outside its elements, the unit's as sent or a reply: each element out with what it holds (a void; a span
 *  whose id is an element's slot, or a `<b>` whose token is, what it holds its token), every other tag a break */
function outsideElements(wire: string, plan: TagsPlan): string {
  let out = ''
  let last = 0
  const re = new RegExp(TAG_RE.source, 'g')
  for (let m = re.exec(wire); m; m = re.exec(wire)) {
    out += `${wire.slice(last, m.index)} `
    last = m.index + m[0].length
    const sp = m[7] ?? m[8] ?? m[9]
    const end =
      sp !== undefined && plan.slots[Number(sp) - 1]?.t === 'void'
        ? elementEnd(wire, last)
        : boldOpen(m[0])
          ? boldElement(wire, last, plan)
          : null
    if (end) {
      last = end.end
      re.lastIndex = last
    }
  }
  return out + wire.slice(last)
}
/** each string of the tokens' form outside the elements of a wire, the unit's as sent or a reply, how often: counted in its
 *  text as the reading keeps it (`&#x42;` is "B", no `x42`; `&#120;1` is "x1"), each tag a break; one definition for both */
const tokensIn = (wire: string, plan: TagsPlan): Map<string, number> => {
  const out = new Map<string, number>()
  const text = keptOf(outsideElements(wire, plan))
  for (const m of text.matchAll(new RegExp(TOKEN_FORM.source, 'g'))) out.set(m[0], (out.get(m[0]) ?? 0) + 1)
  return out
}
const SOLID = /\S/
/** an element in a projection (accept.ts projectionOf) */
const OBJ = '\uFFFC'
const WHITE = /\s/
/** a sentence's stop (Unicode's Sentence_Terminal), and the closing marks after it */
const STOP = /\p{Sentence_Terminal}/u
const CLOSER = /[\p{Pe}\p{Pf}"'”’]/u
/** the first word of a sentence after the unit's last: what the cutter is asked whether the last stop ends a sentence by */
const NEXT = 'The'

type Item =
  /** `fixed`: no text of the source (a group's stop, written at its end): no sentence begins in it */
  | { t: 'text'; s: string; at: number; fixed?: true }
  | {
      t: 'void'
      out: OutPiece[]
      at: number
      len: number
      stop: string | undefined
      /** each element it holds can stand inside a word (text.ts inWord) */
      word: boolean
      /** it states a line end (no text of the source glued after it) */
      line: boolean
      /** its first and last elements, as the glue reads them (text.ts glueOf); none where it holds none */
      ends: { first: GlueEl; last: GlueEl } | null
    }
  | { t: 'open'; id: string; letters: boolean; depth: number }
  | { t: 'close' }
  /** what sets nothing and goes on no wire: back where its group begins or ends (`off`) */
  | { t: 'off'; out: OutPiece[] }

const elsOf = (content: readonly Piece[]): Extract<Piece, { t: 'el' }>[] =>
  content.flatMap((p): Extract<Piece, { t: 'el' }>[] => (p.t === 'el' ? [p] : p.t === 'span' ? elsOf(p.content) : []))
/** the elements of pieces that set something (not `silent`) */
const setting = (content: readonly Piece[]): Extract<Piece, { t: 'el' }>[] => elsOf(content).filter((q) => !q.silent)
/** a piece the wire writes as one tag of its own: an element, or a span holding no text */
const voidPiece = (p: Piece): boolean => p.t === 'el' || (p.t === 'span' && !SOLID.test(textOf(p.content)))
/** a piece that sets nothing where it stands: an element stated `silent`, or a span holding no text, not `must`, whose
 *  elements, one at least, all are (the markers wire's span head of such elements alone, `{\bfseries w}`'s copy) */
const silentPiece = (p: Piece): boolean =>
  p.t === 'el'
    ? !!p.silent
    : p.t === 'span' && !p.must && voidPiece(p) && elsOf(p.content).length > 0 && !setting(p.content).length
/** the projection the wire's cutter reads: accept.ts projectionOf, what sets nothing out */
const sentProjection = (content: readonly Piece[]): string =>
  content
    .map((p) => (p.t === 'text' ? p.s : silentPiece(p) ? '' : p.t === 'el' ? OBJ : sentProjection(p.content)))
    .join('')
const sentLength = (content: readonly Piece[]): number => sentProjection(content).length

/**
 * DESIGN §6.2 (contract.ts `silent`): what sets nothing is not in the sentence. The unit's pieces as
 * the wire sends them, the markers wire's rule (markers.ts itemsOf): a piece that sets nothing beside one that sets something,
 * white space alone between them, rides in that one's tag (before the first such of a stretch, else after the one before
 * it), the white space between them with it, out of the wire; one with no such neighbour stays in the pieces, `silent`, for
 * planTags to send on no wire and the reading to put back where its group begins or ends. Each projection offset of the
 * unit's (accept.ts projectionOf) is stated kept, on the wire, or not (`keep`), in order: the cutter's offsets map back
 */
function offWire(content: readonly Piece[]): {
  content: Piece[]
  riders: Map<Piece, { before: OutPiece[]; after: OutPiece[] }>
  keep: boolean[]
} {
  const riders = new Map<Piece, { before: OutPiece[]; after: OutPiece[] }>()
  const keep: boolean[] = []
  const mark = (ps: readonly Piece[], on: boolean) => {
    for (const p of ps) {
      if (p.t === 'text') for (let k = 0; k < p.s.length; k++) keep.push(on)
      else if (p.t === 'el') keep.push(on && !p.silent)
      else mark(p.content, on && !silentPiece(p))
    }
  }
  const white = (p: Piece | undefined) => p?.t === 'text' && !SOLID.test(p.s)
  const list = (ps: readonly Piece[]): Piece[] => {
    const rides = new Set<number>()
    for (let i = 0; i < ps.length; ) {
      if (!voidPiece(ps[i] as Piece)) {
        i++
        continue
      }
      // (a stretch: pieces of a tag of their own, white space alone between)
      let j = i
      for (let k = i + 1; k < ps.length && (voidPiece(ps[k] as Piece) || white(ps[k])); k++)
        if (voidPiece(ps[k] as Piece)) j = k
      const hosts: number[] = []
      for (let k = i; k <= j; k++) if (voidPiece(ps[k] as Piece) && !silentPiece(ps[k] as Piece)) hosts.push(k)
      for (const [h, at] of hosts.entries()) {
        const host = ps[at] as Piece
        const before = h === 0 && at > i ? asOut(ps.slice(i, at)) : []
        if (before.length) for (let k = i; k < at; k++) rides.add(k)
        // (after it, up to the last piece that sets nothing before the next one that sets something)
        const until = h + 1 < hosts.length ? (hosts[h + 1] as number) : j + 1
        let last = -1
        for (let k = at + 1; k < until; k++) if (voidPiece(ps[k] as Piece)) last = k
        const after = last > at ? asOut(ps.slice(at + 1, last + 1)) : []
        if (after.length) for (let k = at + 1; k <= last; k++) rides.add(k)
        if (before.length || after.length) riders.set(host, { before, after })
      }
      i = j + 1
    }
    const out: Piece[] = []
    for (const [k, p] of ps.entries()) {
      if (rides.has(k)) mark([p], false)
      // (a span holding text, a pair on the wire: its own pieces as the wire sends them)
      else if (p.t === 'span' && !voidPiece(p)) out.push({ ...p, content: list(p.content) })
      else {
        mark([p], true)
        out.push(p)
      }
    }
    return out
  }
  return { content: list(content), riders, keep }
}

/** an element's own stop as the tags wire reads it: its punctuation; a line end is the markers wire's (Microsoft cuts its
 *  sentence there; here our cutter reads the sentences, and the tags' white space is none) */
const ownStop = (stop: string | undefined): string | undefined =>
  stop !== undefined && LINE_END.test(stop) ? undefined : stop

/** A unit's tags wire, its tags written `as` (TagSpelling) */
export function planTags(unit: UnitIn, as: TagSpelling = 'void'): TagsPlan {
  // (a display that ends its sentence states the stop it ends it with: written after it, taken back on reading, read by the
  // cutter as its sentence's end; what sets nothing goes on no wire, offWire, the projection's offsets here the wire's own,
  // `unitAt` each one's in the unit's)
  const { content, riders, keep } = offWire(displayEnds(unit.content))
  const unitAt = keep.flatMap((on, k) => (on ? [k] : []))
  unitAt.push(keep.length)
  const items: Item[] = []
  /** each group's stop and the projection offset of its end, in order: the cutter reads it there */
  const stopsAt: [number, string][] = []
  const kinds = new Map<
    number,
    { kind: string; stop: string | undefined; reads: string | undefined; newblock: boolean }
  >()
  /** each element's id by its projection offset */
  const idAt = new Map<number, string>()
  /** the ids of what rides in an element's tag before it and after it (offWire), by the offset of the first and the last
   *  element its tag holds: a sentence a reading starts after the element starts after them */
  const riding = new Map<number, { before: string[]; after: string[] }>()
  const idsOf = (ps: readonly OutPiece[]): string[] =>
    ps.flatMap((q) => (q.t === 'el' ? [q.id] : q.t === 'span' ? idsOf(q.content) : []))
  /** the elements of pieces that go as one void, by their projection offsets: what each reads as to the cutter (what sets
   *  nothing, which rides in the void, none) */
  const readsOf = (ps: readonly Piece[], at0: number): number => {
    let at = at0
    for (const p of ps) {
      if (p.t === 'text') at += p.s.length
      else if (silentPiece(p)) continue
      else if (p.t === 'el') {
        kinds.set(at, { kind: p.kind, stop: ownStop(p.stop), reads: p.reads, newblock: !!p.newblock })
        idAt.set(at, p.id)
        at += 1
      } else at = readsOf(p.content, at)
    }
    return at
  }
  /** a void's tag: the piece, and what rides in it before and after it (stated by its first and its last element's offset) */
  const outOf = (p: Piece, at: number): OutPiece[] => {
    const own = asOut([p])
    const r = riders.get(p)
    if (!r) return own
    const pr = p.t === 'span' ? sentProjection(p.content) : OBJ
    const [first, last] = [at + pr.indexOf(OBJ), at + pr.lastIndexOf(OBJ)]
    riding.set(first, { before: idsOf(r.before), after: first === last ? idsOf(r.after) : [] })
    if (first !== last) riding.set(last, { before: [], after: idsOf(r.after) })
    return [...r.before, ...own, ...r.after]
  }
  const walk = (ps: readonly Piece[], at: number, depth: number): number => {
    for (const p of ps) {
      if (p.t === 'text') {
        items.push({ t: 'text', s: p.s, at })
        at += p.s.length
      } else if (silentPiece(p)) {
        // (it sets nothing, and no element beside it sets something: on no wire, back where its group begins or ends)
        items.push({ t: 'off', out: asOut([p]) })
      } else if (p.t === 'el') {
        kinds.set(at, { kind: p.kind, stop: ownStop(p.stop), reads: p.reads, newblock: !!p.newblock })
        idAt.set(at, p.id)
        items.push({
          t: 'void',
          out: outOf(p, at),
          at,
          len: 1,
          stop: ownStop(p.stop),
          word: inWord(p),
          line: LINE_END.test(p.stop ?? ''),
          ends: { first: p, last: p },
        })
        at += 1
      } else if (SOLID.test(textOf(p.content))) {
        items.push({ t: 'open', id: p.id, letters: LETTER.test(textOf(p.content)), depth })
        at = walk(p.content, at, depth + 1)
        // (the stop TeX set at its end, its source writing none: before its close)
        if (p.stop) {
          items.push({ t: 'text', s: p.stop, at, fixed: true })
          stopsAt.push([at, p.stop])
        }
        items.push({ t: 'close' })
      } else {
        const len = sentLength(p.content)
        // (its last element that sets something; its elements as the glue reads them, those that set something)
        const sets = setting(p.content)
        const last = [...p.content].reverse().find((q): q is Extract<Piece, { t: 'el' }> => q.t === 'el' && !q.silent)
        // (one void on the wire, but each element inside reads to the sentence cutter as itself)
        readsOf(p.content, at)
        items.push({
          t: 'void',
          out: outOf(p, at),
          at,
          len,
          stop: last ? ownStop(last.stop) : undefined,
          word: sets.every(inWord),
          line: !!last && LINE_END.test(last.stop ?? ''),
          ends: endsOf(sets),
        })
        at += len
      }
    }
    return at
  }
  const length = walk(content, 0, 0)
  const slots: TagSlot[] = []
  const gluedBefore = new Set<number>()
  const gluedAfter = new Set<number>()
  /** what the source sets beside item `i` (`d` its side), past the wire's own spans' tags: its text, or the element there (a
   *  void's last before it, its first after it), '' at an edge */
  const besideOf = (i: number, d: 1 | -1): Beside => {
    let j = i + d
    // (past what goes on no wire too: TeX set nothing there)
    while (items[j]?.t === 'open' || items[j]?.t === 'close' || items[j]?.t === 'off') j += d
    const x = items[j]
    return x?.t === 'text' ? x.s : x?.t === 'void' && x.ends ? (d < 0 ? x.ends.last : x.ends.first) : ''
  }
  const kept: { id: string; depth: number }[] = []
  const open: number[] = []
  // (each group on the wire, the unit and every pair, and whether something of it went out yet; what went on no wire, by where
  // it comes back, the markers wire's Off; and each pair's group around it, for a reply that loses the pair)
  const groups: { id: string | null; seen: boolean }[] = [{ id: null, seen: false }]
  const seen = () => {
    for (const g of groups) g.seen = true
  }
  const off = {
    front: [] as OutPiece[],
    back: [] as OutPiece[],
    heads: new Map<string, OutPiece[]>(),
    tails: new Map<string, OutPiece[]>(),
  }
  const parents = new Map<string, { parent: string | null; after: boolean; depth: number }>()
  let wire = ''
  /** the wire as written so far without its spans' tags: what glue reads before an element (text.ts glueOf) */
  let bare = ''
  /** for each projection offset, the wire offset a sentence beginning there is cut at: before the opens leading to it */
  const cutAt: number[] = new Array(length + 1).fill(-1)
  let pending: number | null = null
  const reach = (at: number) => {
    if (cutAt[at] === -1) cutAt[at] = pending ?? wire.length
    pending = null
  }
  for (const [i, it] of items.entries()) {
    if (it.t === 'text') {
      for (let k = 0; k < it.s.length; k++) {
        const ch = it.s[k] as string
        if (!it.fixed) reach(it.at + k)
        let w = ''
        if (!/\s/.test(ch)) {
          w = escapeTags(ch)
          seen()
        } else if (!/\s$/.test(wire) && !(k > 0 && /\s/.test(it.s[k - 1] as string))) w = ' '
        wire += w
        bare += w
      }
    } else if (it.t === 'off') {
      // (into its innermost group on the wire: before that group's first thing on it, else after its last)
      const g = groups[groups.length - 1] as { id: string | null; seen: boolean }
      if (g.id === null) (g.seen ? off.back : off.front).push(...it.out)
      else {
        const at = g.seen ? off.tails : off.heads
        at.set(g.id, [...(at.get(g.id) ?? []), ...it.out])
      }
    } else if (it.t === 'void') {
      reach(it.at)
      slots.push({ t: 'void', out: it.out, own: false })
      seen()
      let n = i + 1
      while (items[n]?.t === 'off') n++
      const next = items[n]
      // (glued to the piece beside it in the source, a text or another element: the white space a reply sets there taken
      // back; text.ts glueOf, the wire up to it read past its own spans' tags)
      const glued = glueOf(besideOf(i, -1), bare, besideOf(i, 1), it.word, it.line, it.ends)
      if (glued.before) gluedBefore.add(slots.length)
      if (glued.after) gluedAfter.add(slots.length)
      const stop = it.stop && !LEAD_PUNCT.test(next?.t === 'text' ? next.s : '') ? it.stop : ''
      if (stop) (slots[slots.length - 1] as { own: boolean }).own = true
      wire += `${elementTag(as, slots.length)}${stop}`
      bare += `${elementTag(as, slots.length)}${stop}`
    } else if (it.t === 'open') {
      pending ??= wire.length
      slots.push({ t: 'pair', id: it.id })
      if (it.letters) kept.push({ id: it.id, depth: it.depth })
      open.push(slots.length)
      wire += openTag(as, slots.length)
      const g = groups[groups.length - 1] as { id: string | null; seen: boolean }
      parents.set(it.id, { parent: g.id, after: g.seen, depth: groups.length })
      seen()
      groups.push({ id: it.id, seen: false })
    } else {
      open.pop()
      wire += closeTag(as)
      seen()
      groups.pop()
    }
  }
  cutAt[length] = wire.length
  for (let p = length - 1; p >= 0; p--) if (cutAt[p] === -1) cutAt[p] = cutAt[p + 1] as number
  const lead = wire.length - wire.trimStart().length
  wire = wire.trim()
  const cuts: number[] = []
  const marks: number[] = []
  const leads = new Map<number, string[]>()
  let endMark: number | undefined
  if (unit.sentences) {
    // (the projection the cutter reads: what goes on no wire out, each group's stop at its end, as the source would write it,
    // `orig` each of its offsets' in the wire's projection, a stop's that of the group's end)
    const plain = sentProjection(content)
    let projection = ''
    const orig: number[] = []
    let from = 0
    for (const [end, stop] of [...stopsAt, [plain.length, ''] as [number, string]]) {
      for (let i = from; i < end; i++) orig.push(i)
      projection += plain.slice(from, end) + stop
      for (let i = 0; i < stop.length; i++) orig.push(end)
      from = end
    }
    orig.push(plain.length)
    let at = 0
    let sent = ''
    // (an element that sets its sentence's own stop reads with it: the sentence ends there)
    const standIn = (q: number) => {
      const p = orig[q] as number
      const k = kinds.get(p)
      // (what the host says it reads as, but an annotation is one whatever its text: it belongs to the sentence before)
      const byKind = standInOf(k?.kind ?? 'other')
      const s = byKind !== 'annotation' && k?.reads !== undefined ? k.reads : byKind
      return k?.stop ? `${s === undefined || s === 'annotation' || s === 'citation' ? 'Xx' : s}${k.stop}` : s
    }
    const wireAt = (c: number) => Math.min(wire.length, Math.max(0, (cutAt[c] as number) - lead))
    /** the elements the source glues right after a sentence's stop, before projection offset `q` (only elements and white
     *  space between them and `q`, none between the stop, with its closing marks, and the first): the first's offset, and
     *  each one's id; null where the text before `q` is otherwise */
    const glued = (q: number): { first: number; ids: string[] } | null => {
      let k = q - 1
      let first = -1
      while (k >= 0 && (projection[k] === OBJ || WHITE.test(projection[k] as string))) {
        if (projection[k] === OBJ) first = k
        k--
      }
      if (first < 0 || k !== first - 1) return null
      while (k >= 0 && CLOSER.test(projection[k] as string)) k--
      if (k < 0 || !STOP.test(projection[k] as string)) return null
      const ids: string[] = []
      for (let i = first; i < q; i++)
        if (projection[i] === OBJ) {
          // (with what rides in its tag)
          const r = riding.get(orig[i] as number)
          ids.push(...(r?.before ?? []), idAt.get(orig[i] as number) as string, ...(r?.after ?? []))
        }
      return { first, ids }
    }
    /** whether the elements glued after a stop begin with a tie (the source reader's `space`: TeX's `~`, `\penalty10000\ `, a
     *  word space at which TeX sets no end-of-sentence space) right after it and then a word or a number: from the tie, the
     *  first piece after it that sets a character decides (past an element of kind `other`, the source reader's for a skip or a
     *  switch, which set none, text.ts inWord, and one the cutter reads as white space, a space or a forced break; what is stated
     *  `silent` is out of the projection already): text beginning with a letter or a digit, or an element the cutter reads as
     *  such, not a mark that annotates the sentence before (a note's mark, a footnote's call, a citation). The source itself
     *  states that stop no sentence's end. Where nothing sets a character up to the unit's end, the end stays */
    const setsNone = (kind: string): boolean => {
      const s = standInOf(kind)
      return kind === 'other' || (s !== undefined && !s.trim())
    }
    const tied = (g: { first: number }): boolean => {
      if (kinds.get(orig[g.first] as number)?.kind !== 'space') return false
      let next = g.first + 1
      while (
        next < projection.length &&
        projection[next] === OBJ &&
        setsNone(kinds.get(orig[next] as number)?.kind ?? 'other')
      )
        next++
      if (next >= projection.length) return false
      if (projection[next] !== OBJ) return /[\p{L}\p{N}]/u.test(projection[next] as string)
      const s = standInOf(kinds.get(orig[next] as number)?.kind ?? 'other')
      return s !== 'annotation' && s !== 'citation'
    }
    const mark = (w: number) => {
      marks.push(slots.length + marks.length + 1)
      sent += `${wire.slice(at, w)}<x id="${marks[marks.length - 1]}"/>`
      at = w
    }
    // (on the wire a sentence ends at its stop: where the source glues an element after it, a note's mark, a footnote's call,
    // a forced break, the boundary marker stands right after the stop, before it; the cutter's sentence ends alone, an
    // abbreviation's dot none. Google kept no stop before an element written as a word at a sentence's end, 0 of 80 such
    // places, and 77 with the marker so, measured over the lab's Google store. The sentence stays the source's, the stop and
    // the element with it: a reading sets the boundary after the element, `leads`. Where the source ties a word or a number to
    // the stop, `tied`, the cutter's end there is none: no marker, no cut. No word list, no language's case: the tie is TeX's
    // own statement; over the lab's Google store at RB1, 533 such ends, every one after an initial or an abbreviation ("M.~Casals",
    // "vol.~36", "Amer.~Math.~Soc."), none a sentence's, and with the marker right after "vol." Google wrote a volume, an issue
    // and pages the paper lacks, 42 bibliography units)
    if (unit.entry) {
      // (a bibliography entry's parts are its blocks, the display design's F39: BibTeX's styles write `\newblock` between an
      // entry's authors, title and venue, the source's own statement of its parts, and inside a bibliography the classes set
      // the stop's space factor code to 1000, `\sfcode`\.\@m`, no sentence space after any stop. So the cutter is not asked:
      // a boundary marker right before each element that states `newblock`, none at the entry's head, no end marker; an entry
      // that states none is one part. No abbreviation, no word list: the two are the source's and its classes' own. Lane
      // glued-mark's probe over 85 entries of the lab's Google store: the volumes, issues and pages Google wrote that the paper
      // lacks fell from 24 entries to 2, every block's own stop kept, 48 of 48, 1 reply of 85 refused)
      const blocks = [...kinds.entries()].flatMap(([p, k]) => (k.newblock ? [p] : [])).sort((a, b) => a - b)
      for (const c of blocks) {
        const w = wireAt(c)
        if (w <= at || w >= wire.length) continue
        mark(w)
        cuts.push(unitAt[c] as number)
      }
    } else {
      for (const q of sentenceCuts(projection, standIn)) {
        const c = orig[q] as number
        const g = glued(q)
        if (g && tied(g)) continue
        const moved = g ? wireAt(orig[g.first] as number) : null
        const w = moved !== null && moved > at ? moved : wireAt(c)
        if (w <= at || w >= wire.length) continue
        if (g && w === moved) leads.set(slots.length + marks.length + 1, g.ids)
        mark(w)
        // (in the unit's own projection, what sets nothing counted where it stands)
        cuts.push(unitAt[c] as number)
      }
      // (the unit's last stop with elements glued after it, where the cutter would end a sentence were one to follow: a marker
      // of the wire's alone there, no sentence's start)
      const g = glued(projection.length)
      if (g && !tied(g) && sentenceCuts(`${projection} ${NEXT}`, standIn).includes(projection.length + 1)) {
        const w = wireAt(orig[g.first] as number)
        if (w > at && w < wire.length) {
          endMark = slots.length + marks.length + 1
          mark(w)
        }
      }
    }
    wire = sent + wire.slice(at)
  }
  return {
    wire,
    slots,
    marks,
    cuts,
    refill: kept.sort((a, b) => b.depth - a.depth).map((k) => k.id),
    gluedBefore,
    gluedAfter,
    leads,
    ...(endMark !== undefined ? { endMark } : {}),
    off,
    parents,
  }
}

/** the boundary markers of a reply: each once and in order (the wire's own end marker, `endMark`, may be missing), the
 *  sentences between them none empty (what follows the end marker may be: the elements glued after the last stop, or
 *  nothing), replaced by the sentinel, with the ids of the markers found in order; else every one taken out, and no sentences */
function unmark(
  text: string,
  marks: readonly number[],
  endMark?: number,
): { text: string; marked: boolean; ids: number[] } {
  if (!marks.length) return { text, marked: false, ids: [] }
  const wanted = new Set(marks)
  const found: { at: number; end: number; id: number }[] = []
  for (const m of text.matchAll(new RegExp(TAG_RE.source, 'g'))) {
    const raw = m[1] ?? m[2] ?? m[3]
    const id = raw === undefined ? Number.NaN : Number(raw)
    if (wanted.has(id)) found.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, id })
  }
  const inOrder = (want: readonly number[]) => found.length === want.length && found.every((f, i) => f.id === want[i])
  const exact = inOrder(marks) || (endMark !== undefined && inOrder(marks.filter((m) => m !== endMark)))
  let out = ''
  let last = 0
  let empty = false
  /** whether the text from `last` follows the end marker */
  let afterEnd = false
  for (const f of found) {
    if (!afterEnd && !SOLID.test(text.slice(last, f.at))) empty = true
    out += text.slice(last, f.at) + (exact ? SENTINEL : '')
    last = f.end
    afterEnd = f.id === endMark
  }
  if (!afterEnd && !SOLID.test(text.slice(last))) empty = true
  out += text.slice(last)
  if (exact && empty) return { text: out.split(SENTINEL).join(''), marked: false, ids: [] }
  return { text: out, marked: exact, ids: exact ? found.map((f) => f.id) : [] }
}

/** each element's slot, by its id (a void of several holds more than one) */
function slotsById(plan: TagsPlan): Map<string, number> {
  const out = new Map<string, number>()
  const walk = (ps: readonly OutPiece[], n: number) => {
    for (const p of ps) {
      if (p.t === 'el') out.set(p.id, n)
      else if (p.t === 'span') walk(p.content, n)
    }
  }
  plan.slots.forEach((s, i) => {
    if (s.t === 'void') walk(s.out, i + 1)
  })
  return out
}
/** a reply's boundary markers and elements where they stand (an element's span or `<b>` with the token it holds), in order */
function tagsOf(text: string, plan: TagsPlan): { mark?: number; slot?: number; at: number; end: number }[] {
  const out: { mark?: number; slot?: number; at: number; end: number }[] = []
  const marks = new Set(plan.marks)
  const re = new RegExp(TAG_RE.source, 'g')
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index
    const x = m[1] ?? m[2] ?? m[3]
    const sp = m[7] ?? m[8] ?? m[9]
    if (x !== undefined)
      out.push(
        marks.has(Number(x)) ? { mark: Number(x), at, end: re.lastIndex } : { slot: Number(x), at, end: re.lastIndex },
      )
    else if (sp !== undefined && plan.slots[Number(sp) - 1]?.t === 'void') {
      const end = elementEnd(text, re.lastIndex)?.end ?? re.lastIndex
      re.lastIndex = end
      out.push({ slot: Number(sp), at, end })
    } else if (boldOpen(m[0])) {
      const b = boldElement(text, re.lastIndex, plan)
      if (b) {
        re.lastIndex = b.end
        out.push({ slot: b.n, at, end: b.end })
      }
    }
  }
  return out
}
/**
 * The elements the source glues after a sentence's stop (`leads`) are that sentence's: the wire sets them after its boundary
 * marker, the first things of the next sentence's segment, and a reply may carry one into that sentence's words (2111.09276v1
 * p5, Google: "…search.[9] Then we apply an image encoder[10]", its zh reply setting mark 9 beside mark 10). Each one a
 * reply set after its marker past a word, or past a later marker, goes back right after that marker, after those of them the
 * reply kept there, in the source's order, and the white space the reply set right after it at its old place goes with it;
 * one the reply set before its marker, in its own sentence, stays where the reply set it (before or after that sentence's
 * stop: a target's own order). Only where the markers came back once each and in order: elsewhere no sentence is known
 */
function leadsBack(raw: string, plan: TagsPlan): string {
  if (!plan.leads.size) return raw
  const found = tagsOf(raw, plan).flatMap((t) => (t.mark === undefined ? [] : [t.mark]))
  const inOrder = (want: readonly number[]) => found.length === want.length && found.every((f, i) => f === want[i])
  if (!inOrder(plan.marks) && !(plan.endMark !== undefined && inOrder(plan.marks.filter((m) => m !== plan.endMark))))
    return raw
  const slotOf = slotsById(plan)
  let text = raw
  for (const [mark, ids] of plan.leads) {
    const lead = new Set(ids.flatMap((id) => (slotOf.has(id) ? [slotOf.get(id) as number] : [])))
    const tags = tagsOf(text, plan)
    const j = tags.findIndex((t) => t.mark === mark)
    if (j < 0) continue
    // (the run right after the marker: white space and the place's own elements)
    let end = (tags[j] as { end: number }).end
    let k = j + 1
    for (; k < tags.length; k++) {
      const t = tags[k] as { slot?: number; at: number; end: number }
      if (t.slot === undefined || !lead.has(t.slot) || SOLID.test(text.slice(end, t.at))) break
      end = t.end
    }
    const later = tags.slice(k).filter((t) => t.slot !== undefined && lead.has(t.slot))
    if (!later.length) continue
    const moved = [...later].sort((a, b) => (a.slot as number) - (b.slot as number)).map((t) => text.slice(t.at, t.end))
    for (const t of [...later].reverse()) {
      const space = /^[ \t\n\f\r]*/.exec(text.slice(t.end))?.[0] ?? ''
      text = text.slice(0, t.at) + text.slice(t.end + space.length)
    }
    text = text.slice(0, end) + moved.join('') + text.slice(end)
  }
  return text
}

/**
 * What goes back where (markers.ts withOff) for a reply's tokens: the plan's own, but where the reply lost a pair (one that is
 * not `must` may come back unstyled; on the markers wire every kept span comes back, or the reply is unread) what was to come
 * back after its open or before its close comes back in a copy of it, in the pair's own group, at that group's front where
 * nothing of the group went out before the pair, else at its end: never loose, as a span on no wire keeps its head (accept.ts
 * headLength). Innermost first, so that a copy of a lost pair inside a lost pair is held by the copy of the outer one
 */
function offOf(toks: readonly Tok[], plan: TagsPlan): Off {
  if (!plan.off.heads.size && !plan.off.tails.size) return plan.off
  const opened = new Set(toks.flatMap((t) => (t.t === 'open' ? [t.id] : [])))
  const lost = [...plan.parents.entries()].filter(([id]) => !opened.has(id)).sort((a, b) => b[1].depth - a[1].depth)
  if (!lost.some(([id]) => plan.off.heads.has(id) || plan.off.tails.has(id))) return plan.off
  const front = [...plan.off.front]
  const back = [...plan.off.back]
  const heads = new Map(plan.off.heads)
  const tails = new Map(plan.off.tails)
  for (const [id, { parent, after }] of lost) {
    const held = [...(heads.get(id) ?? []), ...(tails.get(id) ?? [])]
    heads.delete(id)
    tails.delete(id)
    if (!held.length) continue
    const copy: OutPiece = { t: 'span', id, content: held }
    if (parent === null) (after ? back : front).push(copy)
    else {
      const at = after ? tails : heads
      at.set(parent, [...(at.get(parent) ?? []), copy])
    }
  }
  return { front, back, heads, tails }
}

/** A reply → content, and where its marked sentences begin, or null where it cannot be read */
export function readTags(raw: string, plan: TagsPlan): { content: OutPiece[]; at?: number[] } | null {
  const { text, marked, ids } = unmark(leadsBack(raw, plan), plan.marks, plan.endMark)
  const toks: Tok[] = []
  const seen = new Set<number>()
  const stack: { n: number; span: boolean }[] = []
  let afterOwn = false
  let afterGlued = false
  // (the white space beside an element the source glued there taken back, as the markers reading takes it: text.ts glueOf)
  const push = (s0: string, takeBack: RegExp | null) => {
    let s = s0
    // (the element's own stop out first: the white space a reply set before it is then the glued element's to take back)
    if (afterOwn) s = s.replace(OWN_LEAD, '$1')
    afterOwn = false
    if (takeBack) s = s.replace(takeBack, '')
    s = decode(s)
    if (afterGlued) s = s.replace(GLUED_LEAD, '')
    // (past the wire's own pair tags: a glued element's next text may stand inside a pair it opens or after one it closes)
    if (s0) afterGlued = false
    s = s.replace(INVISIBLE, '')
    if (s) toks.push({ t: 'text', s })
  }
  /** the white space a text ending right before an element takes back, where only the wire's own pair tags stand between */
  const takeBackBefore = () => {
    for (let j = toks.length - 1; j >= 0; j--) {
      const t = toks[j] as Tok
      if (t.t === 'open' || t.t === 'close') continue
      if (t.t === 'text') {
        t.s = t.s.replace(GLUED_SPACE, '')
        if (!t.s) toks.splice(j, 1)
      }
      return
    }
  }
  let last = 0
  const re = new RegExp(TAG_RE.source, 'g')
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const x = m[1] ?? m[2] ?? m[3]
    const o = m[4] ?? m[5] ?? m[6]
    const sp = m[7] ?? m[8] ?? m[9]
    // (a close of no element's: a `<b>`'s close is read with its open)
    if (boldClose(m[0])) return null
    // (a `<b>` is an element by the token it holds, its slot that token's; one that holds anything else, or is not closed, is
    // no element of the wire's)
    const bold = boldOpen(m[0]) ? boldOf(text, m.index + m[0].length) : null
    if (boldOpen(m[0]) && !bold) return null
    // (a span is an element or a group by its id, as the unit's slots know it, whatever its attributes came back as)
    const v =
      x ?? (bold ? String(bold.n) : sp !== undefined && plan.slots[Number(sp) - 1]?.t === 'void' ? sp : undefined)
    const between = text.slice(last, m.index)
    const glued = v !== undefined && plan.gluedBefore.has(Number(v))
    push(between, glued ? GLUED_SPACE : null)
    if (glued && !between) takeBackBefore()
    last = m.index + m[0].length
    if (v !== undefined) {
      const n = Number(v)
      const slot = plan.slots[n - 1]
      if (slot?.t !== 'void' || seen.has(n)) return null
      if (bold) {
        last = bold.end
        re.lastIndex = last
      } else if (sp !== undefined) {
        // (an element written as a word holds its own token and nothing else, then its close: the wire's contract, as for a
        // lost element)
        const end = elementEnd(text, last)
        if (end === null || keptOf(text.slice(last, end.at)).trim() !== tokenOf(n)) return null
        last = end.end
        re.lastIndex = last
      }
      seen.add(n)
      toks.push({ t: 'void', out: slot.out })
      afterOwn = slot.own
      afterGlued = plan.gluedAfter.has(n)
    } else if (o !== undefined || sp !== undefined) {
      const n = Number(o ?? sp)
      const slot = plan.slots[n - 1]
      if (slot?.t !== 'pair' || seen.has(n)) return null
      seen.add(n)
      stack.push({ n, span: sp !== undefined })
      toks.push({ t: 'open', id: slot.id })
    } else {
      // (a close is the innermost open's, in its own spelling)
      const top = stack.pop()
      const slot = top === undefined ? undefined : plan.slots[top.n - 1]
      if (slot?.t !== 'pair' || top?.span !== m[0].startsWith('</span')) return null
      toks.push({ t: 'close', id: slot.id })
    }
  }
  push(text.slice(last), null)
  if (stack.length) return null
  // every element back; a span may be lost (the rule decides: one that is not `must` comes back unstyled)
  for (const [k, s] of plan.slots.entries()) if (s.t === 'void' && !seen.has(k + 1)) return null
  const wireText = outsideElements(plan.wire, plan)
  // (and no string of the tokens' form outside the elements more often than the unit's own text holds it, whatever its number:
  // a reply that moved an element to another word and left its token behind as text, or that wrote a number of the text in
  // the tokens' form, shows a reader our wire's artefact, and is unread as one with an element lost is; a paper's own `x1`
  // reads as its text. Google's replies: 1706.03762v7's Table 1 caption left `x1` behind,
  // 2610.40576v1 wrote its `50` as `x50`; counted in the text as read, the reply's and the wire's alike: tokensIn)
  const source = tokensIn(plan.wire, plan)
  for (const [token, n] of tokensIn(raw, plan)) if (n > (source.get(token) ?? 0)) return null
  if (
    !toks.some((t) => t.t === 'text' && SAYS.test(decode(t.s).split(SENTINEL).join(''))) &&
    LETTER.test(decode(wireText))
  )
    return null
  // (what went on no wire put back where its group begins or ends, the markers wire's own put-back)
  const content = contentOf(refill(withOff(toks, offOf(toks, plan)), plan.refill), [])
  if (!content) return null
  if (!marked) return { content }
  // the sentinels' places in the translation's projection, then the sentinels out. The end marker is the wire's alone: no
  // sentence's start. A marker set right after its sentence's stop (`leads`) places its sentence's start after the elements
  // the source glues after that stop, which stand right after it (past white space: leadsBack sets there each one the reply
  // carried into the next sentence), as the source's sentence holds them; where the reply set one in its own sentence, before
  // the marker, at the marker
  const at: number[] = []
  let n = 0
  let k = 0
  let held: { at: number; left: Set<string> } | null = null
  const settle = (to: number) => {
    if (held) at.push(to)
    held = null
  }
  const strip = (ps: OutPiece[]): OutPiece[] =>
    ps.flatMap((p): OutPiece[] => {
      if (p.t === 'el') {
        n++
        if (held?.left.delete(p.id) && !held.left.size) settle(n)
        return [p]
      }
      if (p.t === 'span') return [{ ...p, content: strip(p.content) }]
      let s = ''
      for (const ch of p.s) {
        if (ch === SENTINEL) {
          settle(held?.at ?? n)
          const id = ids[k++] as number
          const lead = plan.leads.get(id)
          if (id === plan.endMark) continue
          if (lead?.length) held = { at: n, left: new Set(lead) }
          else at.push(n)
        } else {
          if (held && !WHITE.test(ch)) settle(held.at)
          s += ch
          n += ch.length
        }
      }
      return s ? [{ t: 'text', s }] : []
    })
  const out = strip(content)
  settle(held === null ? n : (held as { at: number }).at)
  return { content: out, at }
}
