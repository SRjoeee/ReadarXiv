// A unit's run-in labels, stated `must` (interfaces/translate DECISION: "the PDF's source reader marks links and run-in labels";
// the translate contract's Piece: a `must` span comes back exactly once or the reply is refused). The markers wire (Microsoft's,
// the server's first translator) sends a span that is not `must` on no wire, its words the sentence's and its style lost:
// staging, 2026-11-08, 1810.04805v2 p8's "\noindent\textbf{No NSP}: ..." and 2010.11929v2 p5's "\textbf{Training \& Fine-tuning.}"
// came back regular. Today's wire kept such a pair as two markers by its own rule (src/pdf-reader/engine/translate/mt.mjs
// classOf at 065c1d973, its sentence rule and its boundary rule), ported here over the unit's typed content: a style group
// whose two ends stand where its sentence is cut anyway costs the endpoint no cut of its own. Today's flat text: each text as
// it is, an element that sets no ink nothing (the marking's INVISIBLE: a switch, a skip, a label), one that breaks the text (a
// forced break, an item, a display) or any other one character; a group with no text nothing, or one character where it holds
// an element that sets ink. Not ported: today's merge of same-style neighbours, and its keeping of a pair that sets more than a
// style (a box, a paper's macro of prose), which the translate lane's wire sends on no wire by its own decision. A figure text's
// run of glyphs in another face (locate/ink.ts figureRuns: a group of no source) is a style group read by the same rules.
//
// A label after a forced break is kept on the premise that the endpoint's sentence is cut there; on the markers wire it is not
// (a forced break is a marker like any other, and Microsoft reads neither a marker nor a colon as a sentence's end): staging,
// 2026-11-09, 1810.04805v2 p8's "as \bertbase: \\ \noindent \textbf{No NSP}: A bidirectional model ... (NSP) task." went out
// as one sentence of Microsoft's, the label's words a fragment between two markers inside it, and came back as the word for
// "no" alone, the term lost. So the break such a label follows, where no stop ends the text before it, states the line it
// ends: its `stop` a line end, which a wire writes after the element so that the endpoint's sentence ends there (begun on its
// own line, the label came back with its term). A break no label follows states nothing: a title or an affiliation broken
// over lines is one phrase.
import type { Piece } from '@readarxiv/format'
import { ABBR } from '@readarxiv/text'
import { INVISIBLE, STRUCTURE } from './tex.ts'

type Span = Extract<Piece, { t: 'span' }>
type El = Extract<Piece, { t: 'el' }>

/** an open that sets a style and nothing else (mt.mjs STYLE_OPEN: the front end's inline text commands, \textcolor, \mbox, a
 *  bare group) */
const STYLE_OPEN =
  /^(?:\{|\\(?:textbf|textit|emph|textsl|textsc|underline|textup|textrm|textsf|textmd|textnormal|uline|mbox)\s*\{|\\textcolor\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}\s*\{)$/
/** a link's open (mt.mjs LINK): `must` already, a kept group's edges */
const LINK = /^\\(?:href|hyperref|hyperlink)(?![A-Za-z])/
/** a forced line break, a list's item (mt.mjs FORCED_BREAK) */
const FORCED_BREAK = /^(?:\\\\\*?(?:\[[^\]]*\])?|\\(?:newline|linebreak|item)(?![A-Za-z@])(?:\[[^\]]*\])?)\s*$/
/** a text that ends where a sentence ends (mt.mjs SENTENCE_END), never after an abbreviation (ABBR) */
const SENTENCE_END = /[.!?\u3002\uff01\uff1f]["'\u201d\u2019)\]]*$/
const SENTENCE_LEAD = /^[.!?\u3002\uff01\uff1f]/
/** a colon or a semicolon: a run-in label's end at the unit's head, a clause's anywhere else (mt.mjs CLAUSE_END) */
const CLAUSE_END = /[:;\uff1a\uff1b]["'\u201d\u2019)\]]*$/
const CLAUSE_LEAD = /^[:;\uff1a\uff1b]/
/** a run-in label's colon where a sentence begins past the unit's head (mt.mjs LABEL_END) */
const LABEL_END = /[:\uff1a]["'\u201d\u2019)\]]*$/
const LABEL_LEAD = /^[:\uff1a]/
const CAPITAL_LEAD = /^\p{Lu}/u
const SOLID = /\S/
const SPACE = /\s/
/** a sentence's end is read in the last characters before a place, its start in the first after it (mt.mjs WINDOW) */
const WINDOW = 200
/** an element on the flat text: one character, no white space */
const OBJ = '\ufffc'

const endsSentence = (s: string): boolean => {
  const t = s.trimEnd()
  return SENTENCE_END.test(t) && !ABBR.test(t.replace(/["'\u201d\u2019)\]]+$/, ''))
}
const breaks = (p: El): boolean => p.kind === 'display' || FORCED_BREAK.test(p.src)
const inkless = (p: El): boolean => INVISIBLE.test(p.src) || STRUCTURE.test(p.src)
/** whether a group opens with a switch (an element that sets no ink before its first text: mt.mjs headOf), `{\bf Remark:}` */
const switched = (ps: readonly Piece[]): boolean => {
  for (const p of ps) {
    if (p.t === 'text' && !SOLID.test(p.s)) continue
    return p.t === 'el' && inkless(p) && !breaks(p)
  }
  return false
}

/** The unit's content with each run-in label `must`, in place (its spans gain the flag; nothing else changes). Its walks keep
 *  their own stacks: a source's groups nest as deep as it likes */
export function runIns(content: Piece[]): Piece[] {
  // ---- what each group holds: text, and an element that sets ink (after its children)
  const holds = new Map<Span, { text: boolean; ink: boolean }>()
  {
    type Frame = { span: Span | null; list: readonly Piece[]; k: number; text: boolean; ink: boolean }
    const stack: Frame[] = [{ span: null, list: content, k: 0, text: false, ink: false }]
    while (stack.length) {
      const top = stack[stack.length - 1] as Frame
      if (top.k >= top.list.length) {
        stack.pop()
        if (top.span) holds.set(top.span, { text: top.text, ink: top.ink })
        const up = stack[stack.length - 1]
        if (up) {
          up.text ||= top.text
          up.ink ||= top.ink
        }
        continue
      }
      const p = top.list[top.k++] as Piece
      if (p.t === 'text') top.text ||= SOLID.test(p.s)
      else if (p.t === 'el') top.ink ||= !inkless(p) || breaks(p)
      else if (p.t === 'unit') top.ink = true
      else stack.push({ span: p, list: p.content, k: 0, text: false, ink: false })
    }
  }
  // ---- the flat text, each group's range in it, in the order the groups open, and where it breaks (mt.mjs flatOf)
  const parts: string[] = []
  const ranges = new Map<Span, [number, number]>()
  /** where the text breaks, and the element that breaks it there */
  const broken = new Map<number, El>()
  let at = 0
  {
    type Frame = { span: Span | null; list: readonly Piece[]; k: number }
    const stack: Frame[] = [{ span: null, list: content, k: 0 }]
    while (stack.length) {
      const top = stack[stack.length - 1] as Frame
      if (top.k >= top.list.length) {
        stack.pop()
        if (top.span) (ranges.get(top.span) as [number, number])[1] = at
        continue
      }
      const p = top.list[top.k++] as Piece
      if (p.t === 'text') {
        parts.push(p.s)
        at += p.s.length
      } else if (p.t === 'el') {
        if (breaks(p)) broken.set(at, p)
        else if (inkless(p)) continue
        parts.push(OBJ)
        at++
      } else if (p.t === 'unit') {
        parts.push(OBJ)
        at++
      } else {
        const h = holds.get(p) as { text: boolean; ink: boolean }
        if (h.text) {
          ranges.set(p, [at, at])
          stack.push({ span: p, list: p.content, k: 0 })
        } else if (h.ink) {
          parts.push(OBJ)
          at++
        }
      }
    }
  }
  const flat = parts.join('')
  const first = flat.search(/\S/)
  const word = flat.search(/[^\s\ufffc]/)
  let last = flat.length
  while (last > 0 && SPACE.test(flat[last - 1] as string)) last--
  let lastWord = flat.length
  while (lastWord > 0 && /[\s\ufffc]/.test(flat[lastWord - 1] as string)) lastWord--
  const nextSolidAt = (b: number) => {
    for (let i = b; i < flat.length; i++) if (!SPACE.test(flat[i] as string)) return i
    return -1
  }
  const solidBeforeAt = (a: number) => {
    let i = a - 1
    while (i >= 0 && SPACE.test(flat[i] as string)) i--
    return i
  }
  const breakAt = (i: number) => i >= 0 && broken.has(i)

  // ---- each style group by the sentence rule (mt.mjs classOf): kept where it begins where a sentence begins and ends where one
  // ends, a run-in label's colon ending it too
  type Seen = { a: number; b: number; starts: boolean; ends: boolean }
  const seen = new Map<Span, Seen>()
  const kept = new Set<Span>()
  const edges: number[] = []
  for (const [s, [a, b]] of ranges) {
    if (s.must || LINK.test(s.open ?? '')) {
      edges.push(a, b)
      continue
    }
    // (a group that holds the whole unit comes back around the translation: no marker of its own)
    if (a <= first && b >= last) {
      edges.push(a, b)
      continue
    }
    // (a group of no source, neither end's: a figure text's run of glyphs in another face (locate/ink.ts figureRuns), a style
    // and nothing else. A source's group with neither end is one that holds the whole unit, above)
    if (s.open === undefined ? s.close !== undefined : !STYLE_OPEN.test(s.open)) continue
    const head = a <= word
    const tail = b >= lastWord
    const inside = flat.slice(Math.max(a, b - WINDOW), b).trimEnd()
    const ni = nextSolidAt(b)
    const next = ni >= 0 ? (flat[ni] as string) : ''
    const starts = head || endsSentence(flat.slice(Math.max(0, a - WINDOW), a))
    // (a label where a sentence begins past the head or after a forced break; a bare group only where a switch opens it, never
    // BibTeX's case protection `{GEPA}: Reflective...`)
    const label =
      !head &&
      (starts || breakAt(solidBeforeAt(a))) &&
      (LABEL_END.test(inside) || LABEL_LEAD.test(next)) &&
      (s.open !== '{' || switched(s.content))
    const ends =
      tail ||
      endsSentence(inside) ||
      SENTENCE_LEAD.test(next) ||
      label ||
      (head && (CLAUSE_END.test(inside) || CLAUSE_LEAD.test(next) || CAPITAL_LEAD.test(next)))
    seen.set(s, { a, b, starts, ends })
    if (starts && ends) {
      kept.add(s)
      edges.push(a, b)
    }
    // (a label after a forced break, no stop ending the text before the break: the break ends the endpoint's sentence)
    const at = solidBeforeAt(a)
    const brk = broken.get(at)
    if (label && brk && brk.kind !== 'display' && !endsSentence(flat.slice(Math.max(0, at - WINDOW), at)))
      brk.stop = '\n'
  }
  // ---- the boundary rule (mt.mjs classOf's last): a group whose two ends both stand where the wire is cut anyway (a forced
  // break, an item or a display beside it, a kept or enclosing group's edge with white space alone between) is kept too; the
  // edges read by the sentence rule alone, so that one group's keeping makes no other's
  edges.sort((x, y) => x - y)
  const atEdge = (x: number) => {
    let lo = x
    while (lo > 0 && SPACE.test(flat[lo - 1] as string)) lo--
    let hi = x
    while (hi < flat.length && SPACE.test(flat[hi] as string)) hi++
    let l = 0
    let r = edges.length
    while (l < r) {
      const m = (l + r) >> 1
      if ((edges[m] as number) < lo) l = m + 1
      else r = m
    }
    return l < edges.length && (edges[l] as number) <= hi
  }
  for (const [s, { a, b, starts, ends }] of seen) {
    if (kept.has(s)) continue
    if ((starts || breakAt(solidBeforeAt(a)) || atEdge(a)) && (ends || breakAt(nextSolidAt(b)) || atEdge(b)))
      kept.add(s)
  }
  for (const s of kept) s.must = 1
  return content
}
