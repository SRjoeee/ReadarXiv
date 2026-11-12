// The tags wire, over typed pieces, for the engines that keep tags (Google's translateHtml: tags 100 %; Chrome's built-in
// translator): an element as `<x id="n"/>`, a span with text as `<t id="n">…</t>` (every span: these engines keep their words
// inside it), a span with none as one void; to Google each in HTML's own inline element (TagSpelling 'html': an element a
// `<span translate="no">` holding its token, a word of its sentence; a span with text a `<span>` holding its words). For a
// unit that lights by sentence, a void boundary marker of an id past the unit's own goes where each sentence after the first
// begins (Google brings `<x id="N"/>` back exactly where it was set; `<s/>` gets closers appended, `<wbr>` is dropped:
// measured), and where they land are the translation's sentences.
import { sentenceCuts } from '@readarxiv/text'
import { asOut, projectionOf, textOf } from '../accept.ts'
import type { OutPiece, Piece, UnitIn } from '../contract.ts'
import { contentOf, refill, type Tok } from './markers.ts'
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

export type TagSlot = { t: 'void'; out: OutPiece[]; own: boolean } | { t: 'pair'; id: string }
export interface TagsPlan {
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
}

/** the model's and the engines' spellings of a tag (the extension's tokens.ts TAG_RE): `<x id="1"/>`, `<x id="1" />`,
 *  single or no quotes, `<x id="1"></x>` (its id the first three groups); an open `<t id="1">` (the next three); a close
 *  `</t>`; HTML's own inline element (TagSpelling 'html'), an open `<span id="1" …>` (the next three) and a close `</span>`:
 *  what a span is, an element holding its token or a group holding its words, its id says (the unit's slot), never its
 *  attributes (readTags) */
export const TAG_RE =
  /<x\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:\/>|>\s*<\/x\s*>)|<t\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*>|<\/t\s*>|<span\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))[^<>]*>|<\/span\s*>/g
const SPAN_CLOSE = /<\/span\s*>/y

/**
 * How a tags wire writes its tags. 'void': an element (a formula, a citation, a reference, a note's mark: a void slot) as
 * `<x id="n"/>`, an empty element, what an LLM is told a void tag is (the extension's prompt) and Chrome's translator is sent;
 * a span with text as `<t id="n">…</t>`. 'html', what Google's translateHtml is sent: HTML's own inline element for both, in
 * the terms of the HTML it reads: an element `<span id="n" translate="no">xn</span>`, a token that HTML's `translate`
 * attribute keeps untranslated, a word of its sentence (the token an identifier, what a formula is, never a quantity or an
 * article); a span with text `<span id="n">…</span>`, the words of its sentence it holds. A boundary marker is always a void.
 * Measured: Google takes an element that holds no text (`<x/>`, `<x></x>`, `<span></span>`) or that HTML does not know
 * (`<x>n</x>`, with `translate="no"` or without) as a break between two texts it translates apart, each closed with a full
 * stop of its own (lane stray-stop, 2026-11-12, a probe of 42 units of two papers, zh and ja, after the owner's report on
 * 1706.03762v7): "… a matrix <x/>. The keys …" -> "…矩阵中。<x/> 。键和值…", 51 of 164 element groups in zh and 53 in ja, 18 of
 * them a stop on both sides, the element never moved across a word. Written as a word, none (1 and 5 left, each the target's
 * word order setting the element first in its sentence), the elements and boundary markers all back, the token as sent 424
 * of 424 (without the attribute 91 of 424 changed); a number for the token read as a quantity beside a word ("3 In" ->
 * inches, 4 and 4 replies), the identifier 0 and 1. A span written `<t>` is such a break too (lane reply-dots, 2026-11-13,
 * after the owner's report on 2611.03953v2's abstract): Google translated the text before it alone, wrote "……" where the
 * span's words belong and set the span after it ("act as <t>parameter priors</t> without…" -> "可以作为……<t>参数先验</t>而不…"),
 * 65 places of 13,233 zh spans in the lab's Google store, and translated a span's words out of their sentence ("the {order}
 * we take" -> 命令, "each of the {m} coordinates" -> 米); written as a `<span>`, the dots were gone in 61 of 61 units and those
 * words read in their sentences (顺序, "m 个"); 3 of 122 units refused by the token contract (Google moved an element and
 * left its token as text: the next translator's)
 */
export type TagSpelling = 'void' | 'html'
/** the token an element written as a word holds: its slot's number after an `x` */
export const tokenOf = (n: number): string => `x${n}`
const elementTag = (as: TagSpelling, n: number): string =>
  as === 'html' ? `<span id="${n}" translate="no">${tokenOf(n)}</span>` : `<x id="${n}"/>`
const openTag = (as: TagSpelling, n: number): string => (as === 'html' ? `<span id="${n}">` : `<t id="${n}">`)
const closeTag = (as: TagSpelling): string => (as === 'html' ? '</span>' : '</t>')
/** a string of the tokens' form standing as a token would: `x` and digits, with no ASCII letter, digit or underscore right
 *  before it (inside a longer word or number it is none: `max1`, `0x1F`) and no digit right after it (`x12` holds no `x1`) */
export const TOKEN_FORM = /(?<![A-Za-z0-9_])x[0-9]+(?![0-9])/g
/** a text of the wire as the reading keeps it: its entities read (a character reference is one character), its invisible
 *  code points out */
const keptOf = (s: string): string => decode(s).replace(INVISIBLE, '')
/** where an element's span ends from `from`, right after its open: the start of its close and the end of it, its content
 *  holding no tag; null where no close follows its content */
function elementEnd(s: string, from: number): { at: number; end: number } | null {
  const at = s.indexOf('<', from)
  if (at < 0) return null
  SPAN_CLOSE.lastIndex = at
  const c = SPAN_CLOSE.exec(s)
  return c ? { at, end: at + c[0].length } : null
}
/** a wire's text outside its elements, the unit's as sent or a reply: each element out with what it holds (a void; a span
 *  whose id is an element's slot, what it holds its token), every other tag a break */
function outsideElements(wire: string, plan: TagsPlan): string {
  let out = ''
  let last = 0
  const re = new RegExp(TAG_RE.source, 'g')
  for (let m = re.exec(wire); m; m = re.exec(wire)) {
    out += `${wire.slice(last, m.index)} `
    last = m.index + m[0].length
    const sp = m[7] ?? m[8] ?? m[9]
    if (sp !== undefined && plan.slots[Number(sp) - 1]?.t === 'void') {
      const end = elementEnd(wire, last)
      if (end) {
        last = end.end
        re.lastIndex = last
      }
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

const elsOf = (content: readonly Piece[]): Extract<Piece, { t: 'el' }>[] =>
  content.flatMap((p): Extract<Piece, { t: 'el' }>[] => (p.t === 'el' ? [p] : p.t === 'span' ? elsOf(p.content) : []))

/** an element's own stop as the tags wire reads it: its punctuation; a line end is the markers wire's (Microsoft cuts its
 *  sentence there; here our cutter reads the sentences, and the tags' white space is none) */
const ownStop = (stop: string | undefined): string | undefined =>
  stop !== undefined && LINE_END.test(stop) ? undefined : stop

/** A unit's tags wire, its tags written `as` (TagSpelling) */
export function planTags(unit: UnitIn, as: TagSpelling = 'void'): TagsPlan {
  // (a display that ends its sentence states the stop it ends it with: written after it, taken back on reading, read by the
  // cutter as its sentence's end)
  const content = displayEnds(unit.content)
  const items: Item[] = []
  /** each group's stop and the projection offset of its end, in order: the cutter reads it there */
  const stopsAt: [number, string][] = []
  const kinds = new Map<number, { kind: string; stop: string | undefined; reads: string | undefined }>()
  /** each element's id by its projection offset */
  const idAt = new Map<number, string>()
  /** the elements of pieces that go as one void, by their projection offsets: what each reads as to the cutter */
  const readsOf = (ps: readonly Piece[], at0: number): number => {
    let at = at0
    for (const p of ps) {
      if (p.t === 'text') at += p.s.length
      else if (p.t === 'el') {
        kinds.set(at, { kind: p.kind, stop: ownStop(p.stop), reads: p.reads })
        idAt.set(at, p.id)
        at += 1
      } else at = readsOf(p.content, at)
    }
    return at
  }
  const walk = (ps: readonly Piece[], at: number, depth: number): number => {
    for (const p of ps) {
      if (p.t === 'text') {
        items.push({ t: 'text', s: p.s, at })
        at += p.s.length
      } else if (p.t === 'el') {
        kinds.set(at, { kind: p.kind, stop: ownStop(p.stop), reads: p.reads })
        idAt.set(at, p.id)
        items.push({
          t: 'void',
          out: [{ t: 'el', id: p.id }],
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
        const len = projectionOf(p.content).length
        const last = [...p.content].reverse().find((q) => q.t === 'el')
        // (one void on the wire, but each element inside reads to the sentence cutter as itself)
        readsOf(p.content, at)
        items.push({
          t: 'void',
          out: [{ t: 'span', id: p.id, content: asOut(p.content) }],
          at,
          len,
          stop: last?.t === 'el' ? ownStop(last.stop) : undefined,
          word: elsOf(p.content).every(inWord),
          line: last?.t === 'el' && LINE_END.test(last.stop ?? ''),
          ends: endsOf(elsOf(p.content)),
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
    while (items[j]?.t === 'open' || items[j]?.t === 'close') j += d
    const x = items[j]
    return x?.t === 'text' ? x.s : x?.t === 'void' && x.ends ? (d < 0 ? x.ends.last : x.ends.first) : ''
  }
  const kept: { id: string; depth: number }[] = []
  const open: number[] = []
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
        if (!/\s/.test(ch)) w = escapeTags(ch)
        else if (!/\s$/.test(wire) && !(k > 0 && /\s/.test(it.s[k - 1] as string))) w = ' '
        wire += w
        bare += w
      }
    } else if (it.t === 'void') {
      reach(it.at)
      slots.push({ t: 'void', out: it.out, own: false })
      const next = items[i + 1]
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
    } else {
      open.pop()
      wire += closeTag(as)
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
    // (the projection the cutter reads: each group's stop at its end, as the source would write it, `orig` each of its
    // offsets' in the unit's projection, a stop's that of the group's end)
    const plain = projectionOf(content)
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
      for (let i = first; i < q; i++) if (projection[i] === OBJ) ids.push(idAt.get(orig[i] as number) as string)
      return { first, ids }
    }
    const mark = (w: number) => {
      marks.push(slots.length + marks.length + 1)
      sent += `${wire.slice(at, w)}<x id="${marks[marks.length - 1]}"/>`
      at = w
    }
    // (on the wire a sentence ends at its stop: where the source glues an element after it, a note's mark, a footnote's call,
    // a forced break, the boundary marker stands right after the stop, before it; the cutter's sentence ends alone, an
    // abbreviation's dot none. Google kept no stop before an element written as a word at a sentence's end, 0 of 80 such
    // places, and 77 with the marker so: lane reply-dots, 2026-11-13. The sentence stays the source's, the stop and the
    // element with it: a reading sets the boundary after the element, `leads`)
    for (const q of sentenceCuts(projection, standIn)) {
      const c = orig[q] as number
      const g = glued(q)
      const moved = g ? wireAt(orig[g.first] as number) : null
      const w = moved !== null && moved > at ? moved : wireAt(c)
      if (w <= at || w >= wire.length) continue
      if (g && w === moved) leads.set(slots.length + marks.length + 1, g.ids)
      mark(w)
      cuts.push(c)
    }
    // (the unit's last stop with elements glued after it, where the cutter would end a sentence were one to follow: a marker
    // of the wire's alone there, no sentence's start)
    const g = glued(projection.length)
    if (g && sentenceCuts(`${projection} ${NEXT}`, standIn).includes(projection.length + 1)) {
      const w = wireAt(orig[g.first] as number)
      if (w > at && w < wire.length) {
        endMark = slots.length + marks.length + 1
        mark(w)
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

/** A reply → content, and where its marked sentences begin, or null where it cannot be read */
export function readTags(raw: string, plan: TagsPlan): { content: OutPiece[]; at?: number[] } | null {
  const { text, marked, ids } = unmark(raw, plan.marks, plan.endMark)
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
    // (a span is an element or a group by its id, as the unit's slots know it, whatever its attributes came back as)
    const v = x ?? (sp !== undefined && plan.slots[Number(sp) - 1]?.t === 'void' ? sp : undefined)
    const between = text.slice(last, m.index)
    const glued = v !== undefined && plan.gluedBefore.has(Number(v))
    push(between, glued ? GLUED_SPACE : null)
    if (glued && !between) takeBackBefore()
    last = m.index + m[0].length
    if (v !== undefined) {
      const n = Number(v)
      const slot = plan.slots[n - 1]
      if (slot?.t !== 'void' || seen.has(n)) return null
      if (sp !== undefined) {
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
  // reads as its text. Google's replies in lane stray-stop's fill: 1706.03762v7's Table 1 caption left `x1` behind,
  // 2610.40576v1 wrote its `50` as `x50`; counted in the text as read, the reply's and the wire's alike: tokensIn)
  const source = tokensIn(plan.wire, plan)
  for (const [token, n] of tokensIn(raw, plan)) if (n > (source.get(token) ?? 0)) return null
  if (
    !toks.some((t) => t.t === 'text' && SAYS.test(decode(t.s).split(SENTINEL).join(''))) &&
    LETTER.test(decode(wireText))
  )
    return null
  const content = contentOf(refill(toks, plan.refill), [])
  if (!content) return null
  if (!marked) return { content }
  // the sentinels' places in the translation's projection, then the sentinels out. The end marker is the wire's alone: no
  // sentence's start. A marker set right after its sentence's stop (`leads`) places its sentence's start after the elements
  // the source glues after that stop, where the reply sets them right after it (past white space), as the source's sentence
  // holds them; where the reply set another word first (it moved one), at the marker, as a reading takes a moved element
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
