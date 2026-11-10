// A group a reply did not bring back, placed where the translation states it (the chain's reading of every accepted reply,
// stored or fresh, whatever the wire: chain.ts judge and the runs floor).
//
// A wire may carry a group or not: the tags wire carries every group, and a translator that keeps tags brings each back; the
// markers wire carries only a `must` group, since a marker is a hard sentence boundary to Microsoft's endpoint and it moves a
// marker pair inside a sentence to the reply's end, empty (today's stored replies of the 22 parity pairs: of the inline style
// groups today's wire sent as markers, bold 140 kept around their words and 166 moved, italic 104 and 709, colour 0 and 36);
// and any translator may drop a tag pair. A group so lost loses its style: its weight, its slant, its colour (2610.17024v1
// p9's `\textbf{(B1)}`, 2608.25210v2's `\textcolor{blue}{value}`, round 8 part A on staging).
//
// Its place is stated where the translation holds the group's own text as the source holds it: once, a whole word or words
// (Unicode's word boundaries, UAX #29) and equal by Unicode's compatibility (NFKC: a full-width "（B1）" is "(B1)"), white space
// aside; and the source holds that text once in the same place, the group's alone (the place: the group the reply holds around
// it, nearest, else the whole unit). A label, a name, an identifier the translator writes as it is: the group goes around it.
// Not placed: a group whose words were translated (no counterpart is stated; a translator that keeps markup brings it back),
// one whose text the translation or the source holds twice, one holding an element or another group (its pieces travel on
// their own), one the translation holds only inside another group. Nothing else of a reply moves: a placed group splits one
// text piece of its place, and its copy holding no text (a moved marker pair, empty or around white space) is unwrapped, its
// white space kept where it stands. The projection, and so a row's sentences, is the reply's own: a span's edges are none of it.
//
// A phrase group whose words were translated is placed too where the reply states its reference translation, the group's own
// text translated alone by the same translator (`referencesOf`, `placeReferences`; the chain asks it of a markers-wire
// translator alone, in the unit's batch, and never changes the unit's reply): once in the group's place, as a defined
// normalisation of both reads (NFKC, no white space beside a CJK character, a run of white space one space; the reference's
// ends trimmed of punctuation and white space), both ends on a word boundary of the reply in the target language (UAX #29 and
// ICU's dictionaries: `Intl.Segmenter`, granularity `word`). Over the 88 papers' Chinese (lane style-wire, 2026-11-11): of 559
// phrase groups sent today as no markers, the reply states 236 references once, ICU's boundaries hold both ends of 233, and a
// read of 60 found 59 placed right; "Power Law+Gaussian", whose reference holds a word of its own, is the one wrong. Not asked
// for a group that is `must` (it comes back on the wire), that holds the whole unit (it comes back around the translation),
// that holds an element or another group (its pieces travel on their own), or whose text is one word (a label, a name: its own
// text is placed as above, or it is translated as a word).
//
// `Intl.Segmenter` is in every place the chain runs: the website's Worker (workerd's V8 with ICU), the extension's background
// (Chrome since 87; the floor is 131) and node in the lab (full ICU since 13); this module asked it for word boundaries
// before references (`segmentsOf`), as packages/text asks it for sentences.
import { accept, textOf } from './accept.ts'
import type { Lang, OutPiece, Piece, UnitIn } from './contract.ts'

const SOLID = /\S/
/** a text as matched: compatibility-equal (NFKC), white space aside */
const fold = (s: string): string => s.normalize('NFKC').replace(/\s+/gu, '')

let segmenter: Intl.Segmenter | null = null
/** where a text's words begin and end (UAX #29: Intl.Segmenter's word segments), each segment with its folded text */
function segmentsOf(s: string): { at: number; end: number; f: string }[] {
  segmenter ??= new Intl.Segmenter('und', { granularity: 'word' })
  return [...segmenter.segment(s)].map((x) => ({ at: x.index, end: x.index + x.segment.length, f: fold(x.segment) }))
}
/** each place a text holds `f`, whole segments from one that is no white space: [start, end) in the text's code units */
function matchesIn(s: string, f: string): [number, number][] {
  // (a text that does not hold it, folded, holds no place of it: the words are read only where it may stand)
  if (!fold(s).includes(f)) return []
  const segs = segmentsOf(s)
  const out: [number, number][] = []
  for (let k = 0; k < segs.length; k++) {
    if (!segs[k]!.f || !f.startsWith(segs[k]!.f)) continue
    let got = ''
    for (let m = k; m < segs.length && got.length < f.length; m++) {
      if (!segs[m]!.f) continue
      got += segs[m]!.f
      if (got === f) out.push([segs[k]!.at, segs[m]!.end])
      else if (!f.startsWith(got)) break
    }
  }
  return out
}

type Group = { id: string; text: string; ancestors: string[] }
/** a unit's groups of text alone that are not `must` (any other comes back or the reply is refused), each with its own text,
 *  its enclosing groups' ids (innermost last) and those groups' contents (the whole unit's first) */
function groupsOf(content: readonly Piece[]): { groups: Group[]; scopes: Map<string, readonly Piece[]> } {
  const groups: Group[] = []
  const scopes = new Map<string, readonly Piece[]>([['', content]])
  const walk = (ps: readonly Piece[], ancestors: string[]) => {
    for (const p of ps) {
      if (p.t !== 'span') continue
      scopes.set(p.id, p.content)
      if (!p.must && p.content.length && p.content.every((q) => q.t === 'text') && SOLID.test(textOf(p.content)))
        groups.push({ id: p.id, text: textOf(p.content), ancestors })
      walk(p.content, [...ancestors, p.id])
    }
  }
  walk(content, [])
  return { groups, scopes }
}
/** the source's text pieces of a content, at any depth, outside the group `skip` */
function sourceTexts(ps: readonly Piece[], skip: string, out: string[] = []): string[] {
  for (const p of ps)
    if (p.t === 'text') out.push(p.s)
    else if (p.t === 'span' && p.id !== skip) sourceTexts(p.content, skip, out)
  return out
}
/** a reply's spans by id, each with the list that holds it */
function spansIn(ps: OutPiece[], out = new Map<string, { span: Extract<OutPiece, { t: 'span' }>; in: OutPiece[] }>()) {
  for (const p of ps)
    if (p.t === 'span') {
      out.set(p.id, { span: p, in: ps })
      spansIn(p.content, out)
    }
  return out
}

/** a group's place in a reply: the text piece of its scope that holds its one match, the match there */
type Hit = { piece: Extract<OutPiece, { t: 'text' }>; m: [number, number] }
/** The reply's content with each group of `wanted` the reply did not bring back placed around the one match `find` gives in
 *  its place (the group the reply holds around it, nearest, else the whole unit), where `fits` takes it. Pure */
function placeBy(
  unit: UnitIn,
  out: readonly OutPiece[],
  wanted: (g: Group, scope: readonly Piece[]) => ((s: string) => [number, number][]) | null,
  fits: (s: string, m: [number, number]) => boolean = () => true,
): OutPiece[] {
  const { groups, scopes } = groupsOf(unit.content)
  if (!groups.length) return out as OutPiece[]
  const copy = (ps: readonly OutPiece[]): OutPiece[] =>
    ps.map((p) => (p.t === 'span' ? { t: 'span', id: p.id, content: copy(p.content) } : { ...p }))
  const top = copy(out)
  let placed = false
  for (const g of groups) {
    const spans = spansIn(top)
    const back = spans.get(g.id)
    if (back && SOLID.test(textOf(back.span.content))) continue
    // (its place: the group the reply holds around it, nearest, else the whole unit)
    const scopeId = [...g.ancestors].reverse().find((a) => SOLID.test(textOf(spans.get(a)?.span.content ?? []))) ?? ''
    const find = wanted(g, scopes.get(scopeId)!)
    if (!find) continue
    const scopeOut = scopeId ? spans.get(scopeId)!.span.content : top
    // (every place the reply holds it there, at any depth: one, in a text of the place itself)
    let total = 0
    let at: Hit | null = null
    const count = (ps: readonly OutPiece[], direct: boolean) => {
      for (const p of ps)
        if (p.t === 'text') {
          const ms = find(p.s)
          total += ms.length
          if (direct && ms.length === 1) at = { piece: p, m: ms[0]! }
        } else if (p.t === 'span') count(p.content, false)
    }
    count(scopeOut, true)
    const hit = at as Hit | null
    if (total !== 1 || !hit || !fits(hit.piece.s, hit.m)) continue
    // (its copy the reply brought back holding no text, a moved marker pair, unwrapped: its content, none or white space, kept
    // where it stands, so the reply's text, and the projection its sentences are counted in, are the reply's)
    if (back) back.in.splice(back.in.indexOf(back.span), 1, ...back.span.content)
    const { piece, m } = hit
    const s = piece.s
    scopeOut.splice(
      scopeOut.indexOf(piece),
      1,
      ...(m[0] > 0 ? [{ t: 'text' as const, s: s.slice(0, m[0]) }] : []),
      { t: 'span', id: g.id, content: [{ t: 'text', s: s.slice(m[0], m[1]) }] },
      ...(m[1] < s.length ? [{ t: 'text' as const, s: s.slice(m[1]) }] : []),
    )
    placed = true
  }
  return placed ? top : (out as OutPiece[])
}

/** The reply's content with each group it did not bring back placed around its own text where the translation states it
 *  (above). Pure; the content given is not changed */
export function placeGroups(unit: UnitIn, out: readonly OutPiece[]): OutPiece[] {
  return placeBy(unit, out, (g, scope) => {
    const f = fold(g.text)
    // (the source's text there holds it once, in the group alone)
    if (!f || sourceTexts(scope, g.id).some((s) => matchesIn(s, f).length)) return null
    return (s) => matchesIn(s, f)
  })
}

// ---------------------------------------------------------------- a phrase group placed by its reference translation

/** a CJK character, as the normalisation reads one (after NFKC): kana, the unified and compatibility ideographs, CJK symbols
 *  and punctuation, the full-width forms NFKC keeps */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/
let graphemes: Intl.Segmenter | null = null
/** a text as a reference is matched in it: each grapheme NFKC, no white space beside a CJK character, a run of white space one
 *  space; with each character's grapheme in the text ([from, to) code units) */
function normalOf(s: string): { n: string; from: number[]; to: number[] } {
  graphemes ??= new Intl.Segmenter('und', { granularity: 'grapheme' })
  const parts: { c: string; a: number; b: number }[] = []
  for (const g of graphemes.segment(s))
    for (const c of g.segment.normalize('NFKC'))
      parts.push({ c: /\s/u.test(c) ? ' ' : c, a: g.index, b: g.index + g.segment.length })
  let n = ''
  const from: number[] = []
  const to: number[] = []
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!
    if (p.c === ' ') {
      if (n.endsWith(' ')) continue
      let j = k + 1
      while (parts[j]?.c === ' ') j++
      const before = n.at(-1)
      const after = parts[j]?.c
      if (!before || !after || CJK.test(before) || CJK.test(after)) continue
    }
    n += p.c
    from.push(p.a)
    to.push(p.b)
  }
  return { n, from, to }
}
/** a reference as it is matched: normalised, its ends trimmed of punctuation and white space */
const wantOf = (ref: string): string => normalOf(ref).n.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
/** each place a text holds `want` as normalised, apart: [start, end) in the text's code units */
function referencesIn(s: string, want: string): [number, number][] {
  const { n, from, to } = normalOf(s)
  const out: [number, number][] = []
  for (let k = n.indexOf(want); k >= 0; k = n.indexOf(want, k + want.length))
    out.push([from[k]!, to[k + want.length - 1]!])
  return out
}
const wordSegmenters = new Map<Lang, Intl.Segmenter>()
/** whether [start, end) of a text begins and ends on its word boundaries in `target` (a tag the platform cannot read: its root's) */
function onWords(s: string, m: [number, number], target: Lang): boolean {
  let seg = wordSegmenters.get(target)
  if (!seg) {
    try {
      seg = new Intl.Segmenter(target, { granularity: 'word' })
    } catch {
      seg = new Intl.Segmenter('und', { granularity: 'word' })
    }
    wordSegmenters.set(target, seg)
  }
  const ends = new Set<number>([s.length])
  for (const x of seg.segment(s)) ends.add(x.index)
  return ends.has(m[0]) && ends.has(m[1])
}

/** the spans that hold every word and element of the unit but the white space and the elements that set nothing (the markers
 *  wire sends them on no wire and puts them back around the translation, markers.ts `around`) */
function wholeOf(content: readonly Piece[]): Set<string> {
  const out = new Set<string>()
  let inner = content
  for (;;) {
    const solid = inner.filter((p) => !(p.t === 'text' && !SOLID.test(p.s)) && !(p.t === 'el' && p.silent))
    const only = solid[0]
    if (solid.length !== 1 || only?.t !== 'span') return out
    out.add(only.id)
    inner = only.content
  }
}

/** A group a reference is asked for, and the unit it is asked as: the group's text alone */
export interface ReferenceGroup {
  id: string
  unit: UnitIn
}
/** The unit's groups a reference translation is asked for (above): of text alone, not `must`, not around the whole unit, whose
 *  text holds two words and a letter. Each asked as a unit of its own, `<unit id>~g<group id>` */
export function referencesOf(unit: UnitIn): ReferenceGroup[] {
  const { groups } = groupsOf(unit.content)
  const whole = wholeOf(unit.content)
  return groups
    .filter((g) => !whole.has(g.id) && /\S\s+\S/u.test(g.text.trim()) && /\p{L}/u.test(g.text))
    .map((g) => ({ id: g.id, unit: { id: `${unit.id}~g${g.id}`, content: [{ t: 'text', s: g.text }] } }))
}
/** a reference's text from a translator's reading of its reply (`read`), accepted as any reply is; null where none */
export function referenceText(unit: UnitIn, r: { content: OutPiece[] } | null): string | null {
  if (!r || !Array.isArray(r.content) || !accept(unit, r.content).ok) return null
  const s = textOf(r.content.flatMap((p) => (p.t === 'text' ? [p] : [])))
  return SOLID.test(s) ? s : null
}

/** The reply's content with each group of `refs` (by id: its reference translation) it did not bring back placed where the
 *  reply states that reference once, both ends on the reply's word boundaries in `target` (above). Pure */
export function placeReferences(
  unit: UnitIn,
  out: readonly OutPiece[],
  refs: ReadonlyMap<string, string>,
  target: Lang,
): OutPiece[] {
  if (!refs.size) return out as OutPiece[]
  return placeBy(
    unit,
    out,
    (g) => {
      const ref = refs.get(g.id)
      const want = ref === undefined ? '' : wantOf(ref)
      return want ? (s) => referencesIn(s, want) : null
    },
    (s, m) => onWords(s, m, target),
  )
}
