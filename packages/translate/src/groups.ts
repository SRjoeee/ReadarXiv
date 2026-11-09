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
// text piece of its place, and its empty copy (a moved marker pair) goes. The projection, and so a row's sentences, is the
// reply's own: a span's edges are none of it.
import { textOf } from './accept.ts'
import type { OutPiece, Piece, UnitIn } from './contract.ts'

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

/** The reply's content with each group it did not bring back placed around its own text where the translation states it
 *  (above). Pure; the content given is not changed */
export function placeGroups(unit: UnitIn, out: readonly OutPiece[]): OutPiece[] {
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
    const f = fold(g.text)
    if (!f) continue
    // (its place: the group the reply holds around it, nearest, else the whole unit; the source's text there holds it once,
    // in the group alone)
    const scopeId = [...g.ancestors].reverse().find((a) => SOLID.test(textOf(spans.get(a)?.span.content ?? []))) ?? ''
    if (sourceTexts(scopes.get(scopeId)!, g.id).some((s) => matchesIn(s, f).length)) continue
    const scopeOut = scopeId ? spans.get(scopeId)!.span.content : top
    // (every place the reply holds it there, at any depth: one, in a text of the place itself)
    let total = 0
    let at: { piece: Extract<OutPiece, { t: 'text' }>; m: [number, number] } | null = null
    const count = (ps: readonly OutPiece[], direct: boolean) => {
      for (const p of ps)
        if (p.t === 'text') {
          const ms = matchesIn(p.s, f)
          total += ms.length
          if (direct && ms.length === 1) at = { piece: p, m: ms[0]! }
        } else if (p.t === 'span') count(p.content, false)
    }
    count(scopeOut, true)
    const hit = at as { piece: Extract<OutPiece, { t: 'text' }>; m: [number, number] } | null
    if (total !== 1 || !hit) continue
    // (its empty copy, a moved marker pair, out of the reply)
    if (back) back.in.splice(back.in.indexOf(back.span), 1)
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
