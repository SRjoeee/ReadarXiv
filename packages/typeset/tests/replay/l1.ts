// Lane L1's bundles of the corpus, as the converge lane's last run made them with the code of this tree (readarxiv-lab-data
// refactor-2026-11/lanes/L7/prepare/bundles/<paper>/, lanes/L7-converge.md; lane L1's own runs: lanes/L1-out9):
// a paper's head (`head.json`), its parts by page (`<digest>.part`: design-a's Part, flows of Placed members) and its Units
// objects (`<digest>.units`). Read as JSON, every field as the bundle holds it (packages/format's schema on L1's branch:
// `read` names the facts carried as read on A). Lab-data only: the bundles hold licensed papers' text.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type OutPiece, type Part, type Piece, type Placed, type Unit, unitId } from '@readarxiv/format'
import { sourcePieces } from '../../src/lay/read.ts'
import { type DoorRow, doorSentences } from './rows.ts'
import { LAB } from './tap.ts'

export const L1_BUNDLES =
  process.env.AXT_L1_BUNDLES ?? join(LAB, 'refactor-2026-11', 'lanes', 'L7', 'prepare', 'bundles')
export const hasL1 = existsSync(L1_BUNDLES)

/** a member as L1's part holds it: Placed and the fields L1's later schema adds */
export type L1Placed = Placed & { read?: string[] }
export type L1Paper = {
  paper: string
  pages: number
  /** each page's part, or undefined where the page has none (it is A) */
  parts: Map<number, Part & { flows: L1Placed[][] }>
  /** each unit by its id */
  units: Map<string, Unit>
}

const papers = new Map<string, L1Paper | null>()
/** a paper's L1 bundle, or null where the run made none */
export function l1Paper(paper: string): L1Paper | null {
  if (papers.has(paper)) return papers.get(paper)!
  const dir = join(L1_BUNDLES, paper)
  let out: L1Paper | null = null
  if (existsSync(join(dir, 'head.json'))) {
    const head = JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')) as {
      paper: { pages: number }
      parts: (string | null)[]
      units: string[]
    }
    const parts = new Map<number, L1Paper['parts'] extends Map<number, infer P> ? P : never>()
    head.parts.forEach((d, i) => {
      if (d) parts.set(i + 1, JSON.parse(readFileSync(join(dir, `${d}.part`), 'utf8')))
    })
    const units = new Map<string, Unit>()
    for (const d of head.units)
      for (const u of (JSON.parse(readFileSync(join(dir, `${d}.units`), 'utf8')) as { units: Unit[] }).units)
        units.set(u.id, u)
    out = { paper, pages: head.paper.pages, parts, units }
  }
  papers.set(paper, out)
  return out
}

/** a unit's text, its groups' with the rest */
const textOf = (ps: readonly Piece[]): string =>
  ps.map((p) => (p.t === 'text' ? p.s : p.t === 'span' ? textOf(p.content) : '')).join('')
/**
 * The unit today's prepare made where L1's bundle holds `u`, the two making it of other content: a figure text whose glyphs
 * set a run in another face, a group of its own in L1's (packages/engine locate/ink.ts figureRuns), is one text in today's (its
 * figure reading states no run), its id the format's unitId over its kind and that text. Else `u` itself. The parity's rows and
 * joins are today's units', by today's ids
 */
export function todayUnitOf<U extends Pick<Unit, 'id' | 'kind' | 'content'>>(u: U): U {
  if (u.kind !== 'inkfigures' || u.content.every((p) => p.t === 'text')) return u
  const content: Piece[] = [{ t: 'text', s: textOf(u.content) }]
  return { ...u, id: unitId(u.kind, content), content }
}

/** a unit of today's as its prepare dump states it (baseline/prepare/<paper>.prepare.json): its kind, its text, its flat pieces
 *  (those its door row's numbers name: text, open, close, ph) and its lines on A */
export type TodayPrepared = {
  ord: number
  id: string | null
  kind: string
  text: string
  pieces: { kind: string; s?: string }[]
  lines: { page: number; baseline: number }[]
}
const prepared = new Map<string, Map<number, TodayPrepared> | null>()
/** a paper's units as today's prepare dump states them, by ord; null where lab-data holds no dump of it */
export function todayPrepared(paper: string): Map<number, TodayPrepared> | null {
  if (prepared.has(paper)) return prepared.get(paper)!
  const f = join(LAB, 'refactor-2026-11', 'baseline', 'prepare', `${paper}.prepare.json`)
  const out = existsSync(f)
    ? new Map((JSON.parse(readFileSync(f, 'utf8')) as { units: TodayPrepared[] }).units.map((u) => [u.ord, u]))
    : null
  prepared.set(paper, out)
  return out
}

/** an address a unit holds as an element: the reading's `\url{…}` of an e-mail or web address, its ink kept as A's */
const ADDRESS = /^\\url\{([^{}]*)\}$/
/** a unit's text where each address it holds as an element is the address (its groups' text with the rest), and how many
 *  addresses it holds; null where it holds another element or a nested unit, which no text of today's stands for */
function addressed(content: readonly Piece[]): { text: string; addresses: number } | null {
  let text = '',
    addresses = 0
  const walk = (ps: readonly Piece[]): boolean => {
    for (const p of ps) {
      if (p.t === 'text') text += p.s
      else if (p.t === 'span') {
        if (!walk(p.content)) return false
      } else {
        const a = p.t === 'el' ? ADDRESS.exec(p.src)?.[1] : undefined
        if (a === undefined) return false
        text += a
        addresses++
      }
    }
    return true
  }
  return walk(content) ? { text, addresses } : null
}

/**
 * v2's members whose unit's id no unit of today's has, joined to today's unit of the same glyphs where v2's holds its
 * addresses as elements (the reading's e-mail and web addresses kept as A's ink, \url{…}: rebuild/wire-tail, 2026-11-09) and
 * today's holds them as text, so that the two contents, and so their ids, differ: the member's own unit (no echo: its kind
 * the unit's) holding an address, and a unit of today's whose text is the member's unit's with each address as its text, set
 * on the same lines of A (as many, each on the same page at the same baseline, to the hundredth both state them at), whatever
 * kind each reading gave those glyphs (2610.21313v1 p1: an inknotes of today's, an inknames of v2's). `members` and `today`
 * those the id joins left (each by ord), `units` the bundle's units by id. Returns v2's ord -> today's ord, each joined once,
 * in order
 */
export function addressedJoin(
  members: readonly Pick<Placed, 'ord' | 'kind' | 'text' | 'lines'>[],
  units: ReadonlyMap<string, Pick<Unit, 'kind' | 'content'>>,
  today: readonly TodayPrepared[],
): Map<number, number> {
  const out = new Map<number, number>()
  const free = [...today].sort((a, b) => a.ord - b.ord)
  const taken = new Set<number>()
  for (const m of [...members].sort((a, b) => a.ord - b.ord)) {
    const u = typeof m.text === 'string' ? units.get(m.text) : undefined
    if (!u || u.kind !== m.kind) continue
    const a = addressed(u.content)
    if (!a?.addresses) continue
    const t = free.find(
      (t) =>
        !taken.has(t.ord) &&
        t.text === a.text &&
        t.lines.length === m.lines.length &&
        t.lines.every((l, j) => l.page === m.lines[j]![0] && Math.abs(l.baseline - m.lines[j]![4]) <= 0.01 + 1e-9),
    )
    if (!t) continue
    taken.add(t.ord)
    out.set(m.ord, t.ord)
  }
  return out
}

/**
 * Today's door row of a unit (`today`'s pieces its numbers name) said in v2's unit of the same glyphs that holds its addresses
 * as elements (addressedJoin): the translation's text as today's row writes it, each address the element v2 holds for it at
 * the place the translator kept it (a literal, sent back as it went: today's row holds it there as text), the groups today's
 * unit had (round its addresses: 2609.36054 p1's grey ones) gone, and the row's sentences counted in v2's projection (each
 * address one character, as an element is). Exact or none: null where v2's unit holds a group or another element, a group of
 * today's the row cites holds text, an element of today's is cited, or the translation does not hold each address as many
 * times as v2's unit does, in order; or a sentence starts inside an address
 */
export function addressedRow(
  row: DoorRow,
  today: TodayPrepared,
  unit: Pick<Unit, 'content'> & { sentences?: true },
): { content: OutPiece[]; sentences?: { src: number[]; tr: number[] } } | null {
  const flat = sourcePieces(unit.content)
  // (each element by its place among the pieces, its id: sourcePieces' k)
  const els: { k: number; a: string }[] = []
  for (const [k, p] of flat.entries()) {
    if (p.t === 'text') continue
    const a = p.t === 'ph' ? ADDRESS.exec(p.src)?.[1] : undefined
    if (a === undefined) return null
    els.push({ k, a })
  }
  // (the translation's text: the row's strings and the source texts it cites; a group it cites must hold nothing)
  let tr = '',
    open = 0
  for (const q of row[1]) {
    const p = typeof q === 'string' ? { kind: 'text', s: q } : today.pieces[q]
    if (!p) return null
    if (p.kind === 'text') {
      if (open) return null
      tr += p.s ?? ''
    } else if (p.kind === 'open') open++
    else if (p.kind === 'close' && open) open--
    else return null
  }
  const count = (a: string) => tr.split(a).length - 1
  if (els.some((e) => count(e.a) !== els.filter((x) => x.a === e.a).length)) return null
  const content: OutPiece[] = []
  const trAt: [number, number][] = []
  let from = 0
  for (const e of els) {
    const i = tr.indexOf(e.a, from)
    if (i < 0) return null
    if (i > from) content.push({ t: 'text', s: tr.slice(from, i) })
    content.push({ t: 'el', id: String(e.k) })
    trAt.push([i, e.a.length])
    from = i + e.a.length
  }
  if (from < tr.length) content.push({ t: 'text', s: tr.slice(from) })
  if (!unit.sentences) return { content }
  const s = doorSentences(
    row,
    today.pieces.map((p) => ({ t: p.kind, s: p.s })),
  )
  if (!s) return { content }
  // (each address's place in today's source projection: v2's text with each address as its text is today's)
  const srcAt: [number, number][] = []
  let at = 0
  for (const [k, p] of flat.entries()) {
    if (p.t === 'text') at += p.s.length
    else {
      const a = els.find((e) => e.k === k)!.a
      srcAt.push([at, a.length])
      at += a.length
    }
  }
  /** an offset of today's projection in v2's: each address before it one character; one inside an address none */
  const inV2 = (o: number, places: [number, number][]) => {
    let d = 0
    for (const [i, n] of places) {
      if (o >= i + n) d += n - 1
      else if (o > i) return -1
      else break
    }
    return o - d
  }
  const src = s.src.map((o) => inV2(o, srcAt)),
    trs = s.tr.map((o) => inV2(o, trAt))
  if (src.includes(-1) || trs.includes(-1)) return null
  return { content, sentences: { src, tr: trs } }
}
