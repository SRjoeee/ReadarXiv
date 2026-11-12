// The tags wire, over typed pieces, for the engines that keep tags (Google's translateHtml: tags 100 %; Chrome's built-in
// translator): an element as `<x id="n"/>` (to Google as a word of its sentence: ElementTag), a span with text as
// `<t id="n">…</t>` (every span: these engines keep their words inside it), a span with none as one void. For a unit that
// lights by sentence, a void boundary marker of an id past the unit's own goes where each sentence after the first begins
// (Google brings `<x id="N"/>` back exactly where it was set; `<s/>` gets closers appended, `<wbr>` is dropped: measured),
// and where they land are the translation's sentences.
import { sentenceCuts } from '@readarxiv/text'
import { asOut, projectionOf, textOf } from '../accept.ts'
import type { OutPiece, Piece, UnitIn } from '../contract.ts'
import { contentOf, refill, type Tok } from './markers.ts'
import {
  decode,
  displayEnds,
  escapeTags,
  GLUED_LEAD,
  GLUED_SPACE,
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
  /** element slots the source set glued to the text before them, and after them (text.ts glueOf): the white space a reply
   *  sets there is taken back */
  gluedBefore: ReadonlySet<number>
  gluedAfter: ReadonlySet<number>
}

/** the model's and the engines' spellings of a tag (the extension's tokens.ts TAG_RE): `<x id="1"/>`, `<x id="1" />`,
 *  single or no quotes, `<x id="1"></x>`; an open `<t id="1">`; a close `</t>`; an element written as a word
 *  (`ElementTag` 'word'), `<span id="1" …>…</span>` whole, what it holds its tenth group (its token: no text of the
 *  translation, and it must be its own, readTags) */
export const TAG_RE =
  /<x\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:\/>|>\s*<\/x\s*>)|<t\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*>|<\/t\s*>|<span\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))[^<>]*>([^<>]*)<\/span\s*>/g

/**
 * How a tags wire writes an element (a formula, a citation, a reference, a note's mark: a void slot; a boundary marker is
 * always a void). 'void', `<x id="n"/>`: an empty element, what an LLM is told a void tag is (the extension's prompt) and
 * Chrome's translator is sent. 'word', `<span id="n" translate="no">xn</span>`: in the terms of the HTML an engine that
 * translates HTML reads (Google's translateHtml), an inline element holding a token that HTML's `translate` attribute keeps
 * untranslated, a word of its sentence; the token an identifier (what a formula is), never a quantity or an article.
 * Measured (lane stray-stop, 2026-11-12, a probe of 42 units of two papers, zh and ja, after the owner's report on
 * 1706.03762v7): Google takes an element that holds no text (`<x/>`, `<x></x>`, `<span></span>`) or that HTML does not know
 * (`<x>n</x>`, with `translate="no"` or without) as a break between two texts it translates apart, each closed with a full
 * stop of its own: "… a matrix <x/>. The keys …" -> "…矩阵中。<x/> 。键和值…", 51 of 164 element groups in zh and 53 in ja, 18 of
 * them a stop on both sides, the element never moved across a word. Written as a word, none (1 and 5 left, each the
 * target's word order setting the element first in its sentence), the elements and boundary markers all back, the token as
 * sent 424 of 424 (without the attribute 91 of 424 changed); a number for the token read as a quantity beside a word ("3 In"
 * -> inches, 4 and 4 replies), the identifier 0 and 1
 */
export type ElementTag = 'void' | 'word'
/** the token an element written as a word holds: its slot's number after an `x` */
export const tokenOf = (n: number): string => `x${n}`
const elementTag = (as: ElementTag, n: number): string =>
  as === 'word' ? `<span id="${n}" translate="no">${tokenOf(n)}</span>` : `<x id="${n}"/>`
/** a string of the tokens' form standing as a token would: `x` and digits, with no ASCII letter, digit or underscore right
 *  before it (inside a longer word or number it is none: `max1`, `0x1F`) and no digit right after it (`x12` holds no `x1`) */
export const TOKEN_FORM = /(?<![A-Za-z0-9_])x[0-9]+(?![0-9])/g
/** each string of the tokens' form in a text, how often */
const tokensIn = (s: string): Map<string, number> => {
  const out = new Map<string, number>()
  for (const m of s.matchAll(new RegExp(TOKEN_FORM.source, 'g'))) out.set(m[0], (out.get(m[0]) ?? 0) + 1)
  return out
}
const SOLID = /\S/

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
    }
  | { t: 'open'; id: string; letters: boolean; depth: number }
  | { t: 'close' }

const elsOf = (content: readonly Piece[]): Extract<Piece, { t: 'el' }>[] =>
  content.flatMap((p): Extract<Piece, { t: 'el' }>[] => (p.t === 'el' ? [p] : p.t === 'span' ? elsOf(p.content) : []))

/** an element's own stop as the tags wire reads it: its punctuation; a line end is the markers wire's (Microsoft cuts its
 *  sentence there; here our cutter reads the sentences, and the tags' white space is none) */
const ownStop = (stop: string | undefined): string | undefined =>
  stop !== undefined && LINE_END.test(stop) ? undefined : stop

/** A unit's tags wire, each element written `as` (ElementTag) */
export function planTags(unit: UnitIn, as: ElementTag = 'void'): TagsPlan {
  // (a display that ends its sentence states the stop it ends it with: written after it, taken back on reading, read by the
  // cutter as its sentence's end)
  const content = displayEnds(unit.content)
  const items: Item[] = []
  /** each group's stop and the projection offset of its end, in order: the cutter reads it there */
  const stopsAt: [number, string][] = []
  const kinds = new Map<number, { kind: string; stop: string | undefined; reads: string | undefined }>()
  /** the elements of pieces that go as one void, by their projection offsets: what each reads as to the cutter */
  const readsOf = (ps: readonly Piece[], at0: number): number => {
    let at = at0
    for (const p of ps) {
      if (p.t === 'text') at += p.s.length
      else if (p.t === 'el') {
        kinds.set(at, { kind: p.kind, stop: ownStop(p.stop), reads: p.reads })
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
        items.push({
          t: 'void',
          out: [{ t: 'el', id: p.id }],
          at,
          len: 1,
          stop: ownStop(p.stop),
          word: inWord(p),
          line: LINE_END.test(p.stop ?? ''),
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
  /** the source's text beside item `i` (`d` its side), past the wire's own spans' tags: '' where an element stands there */
  const textBeside = (i: number, d: 1 | -1): string => {
    let j = i + d
    while (items[j]?.t === 'open' || items[j]?.t === 'close') j += d
    const x = items[j]
    return x?.t === 'text' ? x.s : ''
  }
  const kept: { id: string; depth: number }[] = []
  const open: number[] = []
  let wire = ''
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
        if (/\s/.test(ch)) {
          if (!/\s$/.test(wire) && !(k > 0 && /\s/.test(it.s[k - 1] as string))) wire += ' '
        } else wire += escapeTags(ch)
      }
    } else if (it.t === 'void') {
      reach(it.at)
      slots.push({ t: 'void', out: it.out, own: false })
      const next = items[i + 1]
      // (glued to the text beside it in the source: the white space a reply sets there taken back; text.ts glueOf, the
      // wire up to it read past its own spans' tags)
      const glued = glueOf(
        textBeside(i, -1),
        wire.replace(/(?:<t id="\d+">|<\/t>)+$/, ''),
        textBeside(i, 1),
        it.word,
        it.line,
      )
      if (glued.before) gluedBefore.add(slots.length)
      if (glued.after) gluedAfter.add(slots.length)
      const stop = it.stop && !LEAD_PUNCT.test(next?.t === 'text' ? next.s : '') ? it.stop : ''
      if (stop) (slots[slots.length - 1] as { own: boolean }).own = true
      wire += `${elementTag(as, slots.length)}${stop}`
    } else if (it.t === 'open') {
      pending ??= wire.length
      slots.push({ t: 'pair', id: it.id })
      if (it.letters) kept.push({ id: it.id, depth: it.depth })
      open.push(slots.length)
      wire += `<t id="${slots.length}">`
    } else {
      open.pop()
      wire += '</t>'
    }
  }
  cutAt[length] = wire.length
  for (let p = length - 1; p >= 0; p--) if (cutAt[p] === -1) cutAt[p] = cutAt[p + 1] as number
  const lead = wire.length - wire.trimStart().length
  wire = wire.trim()
  const cuts: number[] = []
  const marks: number[] = []
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
    for (const q of sentenceCuts(projection, standIn)) {
      const c = orig[q] as number
      const w = Math.min(wire.length, Math.max(0, (cutAt[c] as number) - lead))
      if (w <= at || w >= wire.length) continue
      marks.push(slots.length + marks.length + 1)
      sent += `${wire.slice(at, w)}<x id="${marks[marks.length - 1]}"/>`
      at = w
      cuts.push(c)
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
  }
}

/** the boundary markers of a reply: each once and in order, the sentences between them none empty, replaced by the
 *  sentinel; else every one taken out, and no sentences */
function unmark(text: string, marks: readonly number[]): { text: string; marked: boolean } {
  if (!marks.length) return { text, marked: false }
  const wanted = new Set(marks)
  const found: { at: number; end: number; id: number }[] = []
  for (const m of text.matchAll(new RegExp(TAG_RE.source, 'g'))) {
    const raw = m[1] ?? m[2] ?? m[3]
    const id = raw === undefined ? Number.NaN : Number(raw)
    if (wanted.has(id)) found.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, id })
  }
  const exact = found.length === marks.length && found.every((f, i) => f.id === marks[i])
  let out = ''
  let last = 0
  let empty = false
  for (const f of found) {
    if (!SOLID.test(text.slice(last, f.at))) empty = true
    out += text.slice(last, f.at) + (exact ? SENTINEL : '')
    last = f.end
  }
  if (!SOLID.test(text.slice(last))) empty = true
  out += text.slice(last)
  if (exact && empty) return { text: out.split(SENTINEL).join(''), marked: false }
  return { text: out, marked: exact }
}

/** A reply → content, and where its marked sentences begin, or null where it cannot be read */
export function readTags(raw: string, plan: TagsPlan): { content: OutPiece[]; at?: number[] } | null {
  const { text, marked } = unmark(raw, plan.marks)
  const toks: Tok[] = []
  const seen = new Set<number>()
  const stack: number[] = []
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
  for (const m of text.matchAll(new RegExp(TAG_RE.source, 'g'))) {
    const v = m[1] ?? m[2] ?? m[3] ?? m[7] ?? m[8] ?? m[9]
    const o = m[4] ?? m[5] ?? m[6]
    const between = text.slice(last, m.index)
    const glued = v !== undefined && plan.gluedBefore.has(Number(v))
    push(between, glued ? GLUED_SPACE : null)
    if (glued && !between) takeBackBefore()
    last = (m.index ?? 0) + m[0].length
    if (v !== undefined) {
      const n = Number(v)
      const slot = plan.slots[n - 1]
      if (slot?.t !== 'void' || seen.has(n)) return null
      // (an element written as a word holds its own token and nothing else: the wire's contract, as for a lost element)
      if (m[10] !== undefined && m[10].trim() !== tokenOf(n)) return null
      seen.add(n)
      toks.push({ t: 'void', out: slot.out })
      afterOwn = slot.own
      afterGlued = plan.gluedAfter.has(n)
    } else if (o !== undefined) {
      const n = Number(o)
      const slot = plan.slots[n - 1]
      if (slot?.t !== 'pair' || seen.has(n)) return null
      seen.add(n)
      stack.push(n)
      toks.push({ t: 'open', id: slot.id })
    } else {
      const n = stack.pop()
      const slot = n === undefined ? undefined : plan.slots[n - 1]
      if (slot?.t !== 'pair') return null
      toks.push({ t: 'close', id: slot.id })
    }
  }
  push(text.slice(last), null)
  if (stack.length) return null
  // every element back; a span may be lost (the rule decides: one that is not `must` comes back unstyled)
  for (const [k, s] of plan.slots.entries()) if (s.t === 'void' && !seen.has(k + 1)) return null
  const wireText = plan.wire.replace(new RegExp(TAG_RE.source, 'g'), '')
  // (and no string of the tokens' form outside the elements more often than the unit's own text holds it, whatever its number:
  // a reply that moved an element to another word and left its token behind as text, or that wrote a number of the text in
  // the tokens' form, shows a reader our wire's artefact, and is unread as one with an element lost is; a paper's own `x1`
  // reads as its text. Google's replies in lane stray-stop's fill: 1706.03762v7's Table 1 caption left `x1` behind,
  // 2610.40576v1 wrote its `50` as `x50`)
  const source = tokensIn(wireText)
  for (const [token, n] of tokensIn(text.replace(new RegExp(TAG_RE.source, 'g'), ' ')))
    if (n > (source.get(token) ?? 0)) return null
  if (
    !toks.some((t) => t.t === 'text' && SAYS.test(decode(t.s).split(SENTINEL).join(''))) &&
    LETTER.test(decode(wireText))
  )
    return null
  const content = contentOf(refill(toks, plan.refill), [])
  if (!content) return null
  if (!marked) return { content }
  // the sentinels' places in the translation's projection, then the sentinels out
  const at: number[] = []
  let n = 0
  const strip = (ps: OutPiece[]): OutPiece[] =>
    ps.flatMap((p): OutPiece[] => {
      if (p.t === 'el') {
        n++
        return [p]
      }
      if (p.t === 'span') return [{ ...p, content: strip(p.content) }]
      let s = ''
      for (const ch of p.s) {
        if (ch === SENTINEL) at.push(n)
        else {
          s += ch
          n += ch.length
        }
      }
      return s ? [{ t: 'text', s }] : []
    })
  return { content: strip(content), at }
}
