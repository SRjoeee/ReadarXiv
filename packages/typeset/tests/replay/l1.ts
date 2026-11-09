// Lane L1's bundles of the corpus, as the converge lane's last run made them with the code of this tree (readarxiv-lab-data
// refactor-2026-11/lanes/L7/prepare/bundles/<paper>/, lanes/L7-converge.md; lane L1's own runs: lanes/L1-out9):
// a paper's head (`head.json`), its parts by page (`<digest>.part`: design-a's Part, flows of Placed members) and its Units
// objects (`<digest>.units`). Read as JSON, every field as the bundle holds it (packages/format's schema on L1's branch:
// `read` names the facts carried as read on A). Lab-data only: the bundles hold licensed papers' text.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type OutPiece, type Part, type Piece, type Placed, type Unit, unitId } from '@readarxiv/format'
import { sourcePieces } from '../../src/lay/read.ts'
import type { V0Piece } from '../../src/unit/breaks.ts'
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
 *  (those its door row's numbers name: text, open, close, ph, a placeholder with its source) and its lines on A */
export type TodayPrepared = {
  ord: number
  id: string | null
  kind: string
  text: string
  pieces: { kind: string; s?: string; src?: string }[]
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
/** a formula's run an ink unit holds as an element, `$…$`, its TeX specials written as the commands that set them in a formula
 *  (packages/engine locate/today/ink-units.mjs MATH_SPECIAL), a run of scripts written as TeX writes one, `$^{…}$` or `$_{…}$` */
const FORMULA = /^\$(?:[\^_]\{([\s\S]+)\}|([\s\S]+))\$$/
/** the characters an element's ink reads as where today's prepare may have read that ink otherwise: an address's (`\url{…}`,
 *  rebuild/wire-tail: today's text) and an ink unit's formula run's (`$…$`, its specials undone: a script TeX set in a text
 *  face, today's text, rebuild/script-face); null for any other element */
export function readingOf(src: string): string | null {
  const a = ADDRESS.exec(src)?.[1]
  if (a !== undefined) return a
  const m = FORMULA.exec(src)
  const f = m?.[1] ?? m?.[2]
  return f === undefined ? null : f.replace(/\\backslash |\\([${}])/g, (_, c: string | undefined) => c ?? '\\')
}

/** what today's unit holds, in its order: each character of its texts, and each placeholder (`k` its piece's index, the number
 *  its door row cites it by), its groups' opens and closes none: today's source projection, an atom an offset of it */
type Atom = { c: string } | { k: number; src: string }
const atomsOf = (t: TodayPrepared): Atom[] =>
  t.pieces.flatMap((p, k): Atom[] =>
    p.kind === 'text' ? (p.s ?? '').split('').map((c) => ({ c })) : p.kind === 'ph' ? [{ k, src: p.src ?? '' }] : [],
  )
const sameAtom = (a: Atom, b: Atom) => ('c' in a ? 'c' in b && a.c === b.c : 'k' in b && a.k === b.k)

/**
 * v2's unit (its flat pieces, sourcePieces') read against today's unit of the same glyphs (its atoms): every text of v2's
 * today's characters, and each element of v2's today's run of atoms it stands for — today's placeholder of its own source, or
 * atoms whose characters (a placeholder's its reading, readingOf) are the element's reading, so a script today's held part as
 * text and part as a placeholder (2610.20967v1 p1's "Tsai1" and "$,2$") is one —, in order, all of today's atoms read; groups
 * read through. Returns each element's run, [from, to) of today's atoms, by its piece's index (sourcePieces' k), and how many
 * were read by their characters; null where the two differ
 */
function heldRuns(
  flat: readonly V0Piece[],
  atoms: readonly Atom[],
): { runs: Map<number, [number, number]>; read: number } | null {
  const runs = new Map<number, [number, number]>()
  let j = 0,
    read = 0
  for (const p of flat) {
    if (p.t === 'text') {
      for (let i = 0; i < p.s.length; i++, j++) {
        const a = atoms[j]
        if (!a || !('c' in a) || a.c !== p.s[i]) return null
      }
      continue
    }
    if (p.t === 'open' || p.t === 'close') continue
    if (p.t !== 'ph') return null
    const a = atoms[j]
    if (a && 'k' in a && a.src === p.src) {
      runs.set(p.k!, [j, ++j])
      continue
    }
    const r = readingOf(p.src)
    if (!r) return null
    const from = j
    let got = ''
    while (got.length < r.length) {
      const x = atoms[j]
      const s = !x ? null : 'c' in x ? x.c : readingOf(x.src)
      if (!s || !r.startsWith(got + s)) return null
      got += s
      j++
    }
    runs.set(p.k!, [from, j])
    read++
  }
  return j === atoms.length ? { runs, read } : null
}

/**
 * v2's members whose unit's id no unit of today's has, joined to today's unit of the same glyphs where v2's holds as elements
 * kept runs today's held otherwise, so that the two contents, and so their ids, differ: its e-mail and web addresses (the
 * reading's `\url{…}`, kept as A's ink: rebuild/wire-tail, 2026-11-09), today's text; an ink unit's scripts TeX set in a text
 * face (rebuild/script-face, 2026-11-09), today's text, or text and a placeholder (heldRuns). The member's own unit (no echo: its
 * kind the unit's) holding such an element, and a unit of today's that heldRuns reads it against, set on the same lines of A
 * (as many, each on the same page at the same baseline, to the hundredth both state them at), whatever kind each reading gave
 * those glyphs (2610.21313v1 p1: an inknotes of today's, an inknames of v2's). `members` and `today` those the id joins left
 * (each by ord), `units` the bundle's units by id. Returns v2's ord -> today's ord, each joined once, in order
 */
export function keptJoin(
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
    const flat = sourcePieces(u.content)
    if (!flat.some((p) => p.t === 'ph')) continue
    const t = free.find(
      (t) =>
        !taken.has(t.ord) &&
        // (a unit the dump states no lines of, which today drew nothing of, has no glyphs to join)
        !!t.lines &&
        t.lines.length === m.lines.length &&
        t.lines.every((l, j) => l.page === m.lines[j]![0] && Math.abs(l.baseline - m.lines[j]![4]) <= 0.01 + 1e-9) &&
        (heldRuns(flat, atomsOf(t))?.read ?? 0) > 0,
    )
    if (!t) continue
    taken.add(t.ord)
    out.set(m.ord, t.ord)
  }
  return out
}

/**
 * Today's door row of a unit (`today`'s pieces its numbers name) said in v2's unit of the same glyphs that holds kept runs as
 * elements where today's held them otherwise (keptJoin): the translation as today's row writes it, each element of v2's where
 * the translation holds what today's held for it (heldRuns: its address or its mark as text, sent back as it went, and today's
 * placeholders it holds, cited), the groups today's unit had (round its addresses: 2609.36054 p1's grey ones) gone, and the
 * row's sentences counted in v2's projection (each element one character). Exact or none: null where v2's unit holds a group,
 * a group of today's the row cites holds text, a placeholder of today's the row cites is no element's, or the elements stand
 * at no places of the translation in their order, or at more than one way of placing them (a mark's digit the translation
 * holds twice); or a sentence starts inside an element
 */
export function keptRow(
  row: DoorRow,
  today: TodayPrepared,
  unit: Pick<Unit, 'content'> & { sentences?: true },
): { content: OutPiece[]; sentences?: { src: number[]; tr: number[] } } | null {
  const flat = sourcePieces(unit.content)
  if (flat.some((p) => p.t !== 'text' && p.t !== 'ph')) return null
  const atoms = atomsOf(today)
  const held = heldRuns(flat, atoms)
  if (!held) return null
  // (each element by its place among the pieces, its id (sourcePieces' k), and what today's held for it)
  const els = flat.flatMap((p) => {
    if (p.t !== 'ph') return []
    const [from, to] = held.runs.get(p.k!)!
    return [{ k: p.k!, from, pat: atoms.slice(from, to) }]
  })
  // (the translation: the row's strings and the source texts it cites, character by character, and today's placeholders it
  // cites; a group it cites must hold nothing)
  const tr: Atom[] = []
  let open = 0
  for (const q of row[1]) {
    const p = typeof q === 'string' ? { kind: 'text', s: q } : today.pieces[q]
    if (!p) return null
    if (p.kind === 'text') {
      if (open) return null
      for (const c of (p.s ?? '').split('')) tr.push({ c })
    } else if (p.kind === 'open') open++
    else if (p.kind === 'close' && open) open--
    else if (p.kind === 'ph') tr.push({ k: q as number, src: p.src ?? '' })
    else return null
  }
  // (the ways of placing the elements in their order, from each place on: ways[e][i], two standing for more)
  const fits = (e: number, i: number) => els[e]!.pat.every((x, d) => tr[i + d] !== undefined && sameAtom(tr[i + d]!, x))
  const ways: number[][] = Array.from({ length: els.length + 1 }, () => new Array<number>(tr.length + 1).fill(0))
  ways[els.length]!.fill(1)
  for (let e = els.length - 1; e >= 0; e--)
    for (let i = tr.length; i >= 0; i--)
      ways[e]![i] = Math.min(
        2,
        (i < tr.length ? ways[e]![i + 1]! : 0) + (fits(e, i) ? ways[e + 1]![i + els[e]!.pat.length]! : 0),
      )
  if (ways[0]![0] !== 1) return null
  const trAt: [number, number][] = []
  for (let e = 0, i = 0; e < els.length; e++) {
    while (!(fits(e, i) && ways[e + 1]![i + els[e]!.pat.length]! > 0)) i++
    trAt.push([i, els[e]!.pat.length])
    i += els[e]!.pat.length
  }
  const content: OutPiece[] = []
  let text = ''
  for (let i = 0, e = 0; i < tr.length; ) {
    if (e < els.length && trAt[e]![0] === i) {
      if (text) content.push({ t: 'text', s: text })
      text = ''
      content.push({ t: 'el', id: String(els[e]!.k) })
      i += trAt[e]![1]
      e++
      continue
    }
    const x = tr[i]!
    // (a placeholder of today's no element of v2's holds)
    if (!('c' in x)) return null
    text += x.c
    i++
  }
  if (text) content.push({ t: 'text', s: text })
  if (!unit.sentences) return { content }
  const s = doorSentences(
    row,
    today.pieces.map((p) => ({ t: p.kind, s: p.s })),
  )
  if (!s) return { content }
  // (each element's place in today's source projection, an atom an offset of it, and in its translation)
  const srcAt: [number, number][] = els.map((e) => [e.from, e.pat.length])
  /** an offset of today's projection in v2's: each element before it one character; one inside an element none */
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
