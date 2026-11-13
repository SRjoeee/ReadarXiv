// D.links (design-b §1.6 E1, T36, G13; design-a §1.2 Page.links): a laid member's links moved with the pieces they are over.
// Ported from engine 065c1d973 links.mjs: matchUnit L369-446 (an annotation matched to the member's pieces, tier by tier:
// geometry, a citation's key or a destination's name, a url, the order of a kind, the whole text), placeUnit L485-497 with
// placeText, placeCrop, placePair, keptOf, rangeRecord, spanOf, tooDeep, normed (a matched annotation's record over what is
// drawn of its piece: the drawn characters of a rendering, a crop's own map, a pair's tokens), and the targets' kinds
// (kindOfAnnot, urlOf, linkKindOf, singleTarget). Lane L1 states each annotation's owner (Part.links' `owner`, today's
// ownedIn run once by the prepare): a member's candidates are the annotations it owns, matched among its pieces as today.
// A link no member's drawing takes stays at A's boxes (design-a §1.2: Page.links), the reader's.
import type { LaidLine } from '../fit/types.ts'
import type { LineRun, TextRun } from './display.ts'

/** the most work a member's links may spend, a count of point-against-box tests (links.mjs WORK_MAX); unmeasured */
export const WORK_MAX = 2e7
/** how far a browser's advances may part from the layout's measure, a share of the distance from a run's start (DRIFT_BOUND) */
export const DRIFT_BOUND = 0.06

/** an annotation as the match reads it: its target, its glyph points under it (g2), its boxes, its text, its border; `at` its
 *  place in its member's annotations' order on A where the caller states it (lay/links.ts inReading: the PDF's annotation
 *  array need not be in TeX's order); where it does not, its order is its index `i` on its page (today's: page, then PDF
 *  order) */
export type Annot = {
  i: number
  at?: number
  url?: string
  dest?: unknown
  rect?: number[]
  boxes?: number[][]
  ov?: string
  border?: { width: number; rgb: number[]; style: string }
  g2: { key?: string[]; x: number[]; y: number[]; ch: string[] }
}
export type Cand = { q: number; a: Annot }
/** a piece a link may take: its place in the source, its kind and keys, how it is drawn, its rendering's characters and its
 *  segments ([page, x0, baseline, x1, top, bottom] each), the whole text's own characters */
export type Target = {
  ord?: number | null
  k?: number
  pair?: unknown
  kind?: string
  keys?: string[]
  url?: string
  name?: string
  single?: boolean
  /** a word TeX set as written whose annotations name one target (lay/links.ts): one link over its whole drawing */
  word?: boolean
  gap?: ReadonlySet<string> | null
  segs?: readonly (readonly number[])[] | null
  draw?: 'text' | 'crop' | 'pair' | 'whole' | null
  own?: { key: string; page: number; x0: number; x1: number; yb: number }[] | (() => Target['own'])
}
type Tried = { q: number; i: number; why: string }
type Group = { to: Target; annots: (Cand & { tier: string })[] }

const collapse = (s: string) => s.replace(/\s+/gu, ' ').trim()
const inside = (x: number, y: number, b: readonly number[]) => x > b[0]! && x < b[2]! && y > b[1]! && y < b[3]!
const sound = (b: readonly number[]) => b[0]! < b[2]! && b[1]! < b[3]!
const sound4 = sound
const within = (x: number, y: number, s: readonly number[]) =>
  x >= s[1]! - 0.5 && x <= s[3]! + 0.5 && y >= s[5]! - 0.5 && y <= s[4]! + 0.5

/** what an annotation points to: a citation, a footnote's mark, another destination, a url (links.mjs kindOfAnnot) */
export function kindOfAnnot(a: { url?: string; dest?: unknown }): 'url' | 'cite' | 'note' | 'internal' {
  if (a.url !== undefined) return 'url'
  if (typeof a.dest === 'string' && a.dest.startsWith('cite.')) return 'cite'
  if (typeof a.dest === 'string' && /^Hfootnote\./.test(a.dest)) return 'note'
  return 'internal'
}
/** a URL as the match compares two: TeX's escapes undone, then the WHATWG parser's form; null where it is none (urlOf) */
export function urlOf(arg: unknown): string | null {
  if (typeof arg !== 'string') return null
  try {
    return new URL(arg.replace(/\\([#%_&~$])/g, '$1')).href
  } catch {
    return null
  }
}
const CITE_SRC = /^\\(?![Nn]ocite)[A-Za-z]*[Cc]ite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*)*\{([^{}]*)\}/
const REF_SRC =
  /^\\(?:ref|eqref|autoref|Autoref|cref|Cref|crefrange|Crefrange|cpageref|Cpageref|pageref|nameref|Nameref|vref|Vref|labelcref|subref|hyperref|hyperlink)\*?(?![A-Za-z])/
const NOTE_SRC = /^\\(?:footnote|footnotemark)(?![A-Za-z])/
const URL_SRC = /^\\url\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/
const HREF_SRC = /^\\href\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/
export type LinkKind =
  | { kind: 'cite'; keys: string[] }
  | { kind: 'url'; url: string }
  | { kind: 'internal'; name?: string }
  | { kind: 'note' }
/** the link a piece may carry, by its source (links.mjs linkKindOf): a citation's keys, a url, a destination, a mark; null */
export function linkKindOf(piece: { t?: string; src?: unknown } | null | undefined): LinkKind | null {
  if (piece?.t === 'nested') return { kind: 'note' }
  const src = typeof piece?.src === 'string' ? piece.src : ''
  if (piece?.t === 'open') {
    const h = HREF_SRC.exec(src)
    if (h) {
      const url = urlOf(h[1])
      return url ? { kind: 'url', url } : null
    }
    const n = /^\\hyperlink\s*\{([^{}]+)\}/.exec(src)
    if (n) return { kind: 'internal', name: n[1]!.trim() }
    return /^\\(?:hyperref|hyperlink)(?![A-Za-z])/.test(src) ? { kind: 'internal' } : null
  }
  if (piece?.t !== 'ph') return null
  const c = CITE_SRC.exec(src)
  if (c)
    return {
      kind: 'cite',
      keys: c[1]!
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    }
  const u = URL_SRC.exec(src) ?? HREF_SRC.exec(src)
  if (u) {
    const url = urlOf(u[1])
    return url ? { kind: 'url', url } : null
  }
  if (NOTE_SRC.test(src)) return { kind: 'note' }
  if (REF_SRC.test(src)) return { kind: 'internal' }
  return null
}
/** whether a piece names one link target alone (links.mjs singleTarget) */
export function singleTarget(piece: { src?: string } | null | undefined, kind: LinkKind | null): boolean {
  if (!kind) return false
  if (kind.kind === 'cite') return kind.keys.length === 1
  if (kind.kind === 'internal') {
    const arg = /\{([^{}]*)\}/.exec(piece?.src ?? '')
    return !!arg && !arg[1]!.includes(',')
  }
  return true
}
const sameTarget = (a: Annot, b: Annot) =>
  a.url !== undefined ? a.url === b.url : b.url === undefined && JSON.stringify(a.dest) === JSON.stringify(b.dest)
const sameBorder = (a: Annot, b: Annot) =>
  !a.border || !b.border
    ? !a.border && !b.border
    : a.border.width === b.border.width &&
      a.border.style === b.border.style &&
      a.border.rgb.every((v, i) => v === b.border!.rgb[i])

/** a member's annotations matched to its pieces, tier by tier (links.mjs matchUnit) */
export function matchUnit({
  cands,
  targets,
  budget = { left: WORK_MAX },
}: {
  cands: readonly Cand[]
  targets: Target[]
  budget?: { left: number }
}): { groups: Group[]; tried: Tried[] } {
  const took = new Map<Target, (Cand & { tier: string })[]>(),
    tried: Tried[] = []
  const add = (T: Target, c: Cand, tier: string) => {
    const g = took.get(T) ?? []
    took.set(T, g)
    g.push({ ...c, tier })
  }
  const left: Cand[] = []
  for (const c of cands) {
    const g = c.a.g2
    let hit: Target | null = null,
      n = 0
    budget.left -= (g.key?.length ?? 0) * targets.length
    if (budget.left < 0) {
      tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      continue
    }
    if (g.key?.length) {
      for (const T of targets)
        if (T.gap && g.key.every((key) => T.gap!.has(`${c.q}|${key}`))) {
          hit = T
          n++
        }
      if (!n)
        for (const T of targets) {
          if (!T.segs?.length) continue
          budget.left -= T.segs.length * g.x.length
          if (budget.left < 0) break
          if (g.x.every((x, j) => T.segs!.some((s) => s[0] === c.q && within(x, g.y[j]!, s)))) {
            hit = T
            n++
          }
        }
    }
    if (budget.left < 0) {
      tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      continue
    }
    if (n !== 1) {
      left.push(c)
      continue
    }
    if (hit!.draw) add(hit!, c, 'geometry')
  }
  const tookOf = (T: Target, f: (a: Annot) => boolean) => (took.get(T) ?? []).some((x) => f(x.a))
  const done = new Set<Cand>()
  const inSource = (list: Target[]) =>
    list.length > 1 && list.some((T) => !Number.isInteger(T.ord))
      ? null
      : list.slice().sort((a, b) => (a.ord as number) - (b.ord as number))
  const assign = (anns: Cand[], list: Target[], tier: string) => {
    if (!anns.length || !list.length) return
    for (const c of anns) done.add(c)
    const tgts = inSource(list)
    if (!tgts) {
      for (const c of anns) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
      return
    }
    if (anns.length === tgts.length)
      anns.forEach((c, j) => {
        add(tgts[j]!, c, tier)
      })
    else if (tgts.length === 1 && anns.every((c) => sameTarget(c.a, anns[0]!.a)))
      for (const c of anns) add(tgts[0]!, c, tier)
    else for (const c of anns) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
  }
  const drawn = targets.filter((T) => T.draw)
  const group = (m: Map<string, Cand[]>, k: string, c: Cand) => {
    const list = m.get(k) ?? []
    m.set(k, list)
    list.push(c)
  }
  // 2. key
  const byKey = new Map<string, Cand[]>()
  for (const c of left) if (kindOfAnnot(c.a) === 'cite') group(byKey, (c.a.dest as string).slice(5), c)
  for (const [x, anns] of byKey)
    assign(
      anns,
      drawn.filter((T) => T.kind === 'cite' && T.keys?.includes(x) && !tookOf(T, (a) => a.dest === `cite.${x}`)),
      'key',
    )
  const byName = new Map<string, Cand[]>()
  for (const c of left)
    if (
      !done.has(c) &&
      kindOfAnnot(c.a) === 'internal' &&
      typeof c.a.dest === 'string' &&
      drawn.some((T) => T.name === c.a.dest)
    )
      group(byName, c.a.dest, c)
  for (const [name, anns] of byName)
    assign(
      anns,
      drawn.filter((T) => T.name === name && !tookOf(T, (a) => a.dest === name)),
      'key',
    )
  // 3. url
  const byUrl = new Map<string, Cand[]>()
  for (const c of left) if (kindOfAnnot(c.a) === 'url') group(byUrl, urlOf(c.a.url) ?? c.a.url!, c)
  for (const [u, anns] of byUrl)
    assign(
      anns,
      drawn.filter(
        (T) =>
          T.kind === 'url' && T.url === u && !tookOf(T, (a) => a.url !== undefined && (urlOf(a.url) ?? a.url) === u),
      ),
      'url',
    )
  // 4. order
  for (const kind of ['note', 'internal']) {
    const anns = left.filter((c) => !done.has(c) && kindOfAnnot(c.a) === kind)
    assign(
      anns,
      drawn.filter((T) => T.kind === kind && T.name === undefined && !tookOf(T, (a) => kindOfAnnot(a) === kind)),
      'order',
    )
  }
  // 5. whole
  const whole = drawn.find((T) => T.draw === 'whole')
  const rest = whole ? left.filter((c) => !done.has(c)) : []
  if (rest.length && typeof whole!.own === 'function') whole!.own = whole!.own()
  const own = whole?.own as Exclude<Target['own'], () => unknown> | undefined
  if (rest.length && own?.length) {
    const byTarget: Cand[][] = []
    for (const c of rest) {
      const g = byTarget.find((x) => sameTarget(x[0]!.a, c.a))
      if (g) g.push(c)
      else byTarget.push([c])
    }
    budget.left -= own.length * byTarget.length
    const holding =
      budget.left < 0
        ? []
        : byTarget.filter((g) => {
            const under = new Set(g.flatMap((c) => (c.a.g2.key ?? []).map((key) => `${c.q}|${key}`)))
            return own.every((ch) => under.has(ch.key))
          })
    if (holding.length === 1) for (const c of holding[0]!) add(whole!, c, 'whole')
    else for (const g of holding) for (const c of g) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
  }
  return { groups: [...took].map(([to, annots]) => ({ to, annots })), tried }
}

const LETTER = /[\p{L}\p{N}]/u,
  INK = /\S/u,
  MARK = /[\p{M}\p{Lm}\p{Sk}]/u
/** a run of characters as a match finds one in another: letters and digits alone, their marks left out, or every non-space
 *  character; with each UTF-16 unit's character (normed) */
function normed(chars: readonly string[], keep: RegExp) {
  let s = ''
  const at: number[] = []
  const letters = keep === LETTER
  chars.forEach((ch, j) => {
    for (const c of ch.normalize(letters ? 'NFKD' : 'NFKC'))
      if (keep.test(c) && !(letters && MARK.test(c))) {
        s += c
        for (let u = 0; u < c.length; u++) at.push(j)
      }
  })
  return { s, at }
}

/** a laid line with its runs (D.display's lineRuns): a run's items [index on the line, offset in its text], its text */
type Run = TextRun
export type RunLine = { line: LaidLine; runs: readonly LineRun[] }
type Edge = (line: LaidLine, run: Run, at: number) => number
type Band = (t: unknown, line: LaidLine) => { top: number; bottom: number }
type D = { ch: string; li: number; run: Run; at: number; end: number; n: number }
type Tok = {
  s?: string
  space?: boolean
  crop?: { k?: number | null; page: number; crop: number[]; baseline: number; text?: string }
  k?: number
  ph?: unknown
  st?: { link?: unknown }
}
export type LinkRecord = {
  boxes: number[]
  url?: string
  dest?: unknown
  name: string
  moved: true
  order: number
  border?: { width: number; rgb: number[]; style: string }
}
type Placed = {
  page: number
  li: number
  x: number
  rec: LinkRecord
  sources: { annots: [number, number][]; tier: string }
}

const recordOf = (a: Annot, boxes: number[], name: string): LinkRecord => {
  const rec: LinkRecord = {
    boxes,
    ...(a.url !== undefined ? { url: a.url } : { dest: a.dest }),
    name,
    moved: true,
    order: 0,
  }
  if (a.border) rec.border = { width: a.border.width, rgb: [...a.border.rgb], style: a.border.style }
  return rec
}
const tokOf = (line: LaidLine, n: number) => line.items[n]!.t as Tok

function spanOf(line: LaidLine, e0: D, e1: D, edge: Edge, pad: number) {
  const startOf = (run: Run, n: number) => run.items.find(([m]) => m === n)?.[1] ?? 0
  const items = line.items
  const x0 = edge(line, e0.run, e0.at)
  let x1 = edge(line, e1.run, e1.end)
  const t1 = tokOf(line, e1.n),
    s1 = startOf(e1.run, e1.n)
  if (!LETTER.test(t1.s!.slice(e1.end - s1))) {
    const end = edge(line, e1.run, s1 + t1.s!.length)
    let m = e1.n + 1
    while (m < items.length && (items[m]!.t as Tok).space) m++
    if (m >= items.length) x1 = end + pad
    else if (!e1.run.items.some(([k]) => k === m) && items[m]!.x! > end) x1 = items[m]!.x!
    else x1 = end
  }
  return { x0, x1 }
}
function tooDeep(line: LaidLine, e0: D, edge: Edge) {
  const start = edge(line, e0.run, 0),
    x0 = edge(line, e0.run, e0.at),
    w0 = edge(line, e0.run, e0.end) - x0
  return !(DRIFT_BOUND * Math.abs(x0 - start) < Math.abs(w0) / 2)
}
const spacedApart = (p: D, e: D, lines: readonly RunLine[]) =>
  p.li !== e.li ||
  (p.run === e.run
    ? /\s/.test(e.run.text.slice(p.end, e.at))
    : lines[e.li]!.line.items.slice(p.n + 1, e.n).some((it) => (it.t as Tok).space))
function rangeRecord(entries: readonly D[], lines: readonly RunLine[], edge: Edge, band: Band) {
  if (!entries.length) return null
  const page = lines[entries[0]!.li]!.line.page
  const mine = entries.filter((e) => lines[e.li]!.line.page === page)
  const boxes: number[][] = [],
    lineOf: number[] = []
  for (const li of [...new Set(mine.map((e) => e.li))]) {
    const on = mine.filter((e) => e.li === li),
      { line } = lines[li]!
    const e0 = on[0]!,
      e1 = on.at(-1)!
    if (tooDeep(line, e0, edge)) return null
    let top = Number.NEGATIVE_INFINITY,
      bottom = Number.POSITIVE_INFINITY
    for (const n of new Set(on.map((e) => e.n))) {
      const b = band(line.items[n]!.t, line)
      if (b.top > top) top = b.top
      if (b.bottom < bottom) bottom = b.bottom
    }
    const { x0, x1 } = spanOf(line, e0, e1, edge, 0.25 * (top - bottom))
    const box = [Math.min(x0, x1), bottom, Math.max(x0, x1), top]
    if (sound4(box) && box.every(Number.isFinite)) {
      boxes.push(box)
      lineOf.push(li)
    }
  }
  if (!boxes.length) return null
  let name = ''
  mine.forEach((e, j) => {
    const p = mine[j - 1]
    if (p && spacedApart(p, e, lines)) name += ' '
    name += e.ch
  })
  return { page, li: lineOf[0]!, x: boxes[0]![0]!, boxes: boxes.flat(), name: collapse(name) }
}

function placeText(
  to: Target,
  annots: Group['annots'],
  lines: readonly RunLine[],
  edge: Edge,
  band: Band,
  records: Placed[],
  tried: Tried[],
  budget: { left: number },
) {
  const Dc: D[] = []
  lines.forEach(({ line, runs }, li) => {
    for (const run of runs) {
      if ('crop' in run) continue
      for (const [n, at] of run.items) {
        const t = tokOf(line, n)
        if (t.space || t.crop || t.k !== to.k || typeof t.s !== 'string' || t.ph === undefined) continue
        let o = at
        for (const ch of t.s) {
          Dc.push({ ch, li, run, at: o, end: o + ch.length, n })
          o += ch.length
        }
      }
    }
  })
  if (!Dc.length) {
    for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
    return
  }
  const ownOf = (c: Cand) => (c.a.ov ? [...c.a.ov] : c.a.g2.ch)
  budget.left -= Dc.length * annots.reduce((n, c) => n + ownOf(c).length + 1, 1)
  if (budget.left < 0) {
    for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
    return
  }
  // (a word TeX set as written, its annotations one link split by TeX's line breaks: over the whole of what is drawn of it)
  if (to.word) {
    placeRanges([{ ds: 0, de: Dc.length - 1, annots: [...annots] }], Dc, lines, edge, band, records, tried)
    return
  }
  const dChars = Dc.map((e) => e.ch)
  const forms = { letters: normed(dChars, LETTER), ink: normed(dChars, INK) }
  const found: { c: Group['annots'][number]; ds: number; de: number }[] = []
  let from = 0
  // (in their order on A: one search, moving forward only, takes each over its own occurrence)
  const sorted = annots.slice().sort((a, b) => a.q - b.q || (a.a.at ?? a.a.i) - (b.a.at ?? b.a.i))
  const formOf = (own: readonly string[]) => {
    const A = normed(own, LETTER)
    return A.s ? { mode: 'letters' as const, A } : { mode: 'ink' as const, A: normed(own, INK) }
  }
  const isLetter = (j: number) => j >= 0 && j < Dc.length && LETTER.test(Dc[j]!.ch)
  sorted.forEach((c, n) => {
    const own = ownOf(c),
      { mode, A } = formOf(own)
    const Fm = forms[mode]
    const prev = found.at(-1),
      next = sorted[n + 1]
    const nextS = next && sameTarget(next.a, c.a) ? formOf(ownOf(next)) : null
    let s0 = -1
    if (A.s) {
      let u = Fm.at.findIndex((j) => j >= from)
      if (u < 0) u = Fm.s.length
      for (let at = Fm.s.indexOf(A.s, u); at >= 0; at = Fm.s.indexOf(A.s, at + 1)) {
        const ds = Fm.at[at]!,
          de = Fm.at[at + A.s.length - 1]!
        const leftOk =
          mode !== 'letters' ||
          !isLetter(ds - 1) ||
          spacedApart(Dc[ds - 1]!, Dc[ds]!, lines) ||
          (prev && prev.de === ds - 1 && sameTarget(prev.c.a, c.a))
        const rightOk =
          mode !== 'letters' ||
          !isLetter(de + 1) ||
          spacedApart(Dc[de]!, Dc[de + 1]!, lines) ||
          (nextS?.mode === 'letters' && Fm.s.startsWith(nextS.A.s, at + A.s.length))
        if (leftOk && rightOk) {
          s0 = at
          break
        }
      }
    }
    if (s0 < 0) {
      if (annots.length === 1 && c.tier !== 'order' && to.single) found.push({ c, ds: 0, de: Dc.length - 1 })
      else tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      return
    }
    let ds = Fm.at[s0]!,
      de = Fm.at[s0 + A.s.length - 1]!
    const ink = own.filter((ch) => INK.test(ch))
    const first = ink.findIndex((ch) => LETTER.test(ch)),
      last = ink.findLastIndex((ch) => LETTER.test(ch))
    if (mode === 'letters') {
      for (let j = last + 1; j < ink.length && de + 1 < Dc.length && Dc[de + 1]!.ch === ink[j]; j++) de++
      for (let j = first - 1; j >= 0 && ds - 1 >= 0 && Dc[ds - 1]!.ch === ink[j] && ds - 1 >= from; j--) ds--
    }
    found.push({ c, ds, de })
    from = de + 1
  })
  const merged: { ds: number; de: number; annots: Group['annots'] }[] = []
  for (const f of found) {
    const prev = merged.at(-1)
    if (prev && prev.de + 1 === f.ds && sameTarget(prev.annots[0]!.a, f.c.a) && sameBorder(prev.annots[0]!.a, f.c.a)) {
      prev.de = f.de
      prev.annots.push(f.c)
    } else merged.push({ ds: f.ds, de: f.de, annots: [f.c] })
  }
  placeRanges(merged, Dc, lines, edge, band, records, tried)
}

/** each range of a piece's drawn characters made a record on each page it is drawn on, its annotations the record's sources */
function placeRanges(
  merged: readonly { ds: number; de: number; annots: Group['annots'] }[],
  Dc: readonly D[],
  lines: readonly RunLine[],
  edge: Edge,
  band: Band,
  records: Placed[],
  tried: Tried[],
) {
  for (const m of merged) {
    // (a range set over two pages, where the lines are a member's on its pages: a record on each, of what each page draws)
    const range = Dc.slice(m.ds, m.de + 1)
    let made = false
    for (const pg of new Set(range.map((e) => lines[e.li]!.line.page))) {
      const r = rangeRecord(
        range.filter((e) => lines[e.li]!.line.page === pg),
        lines,
        edge,
        band,
      )
      if (!r) continue
      made = true
      records.push({
        page: r.page,
        li: r.li,
        x: r.x,
        rec: recordOf(m.annots[0]!.a, r.boxes, r.name),
        sources: { annots: m.annots.map((c) => [c.q, c.a.i]), tier: m.annots[0]!.tier },
      })
    }
    if (!made) for (const c of m.annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
  }
}

function placeCrop(
  to: Target,
  annots: Group['annots'],
  lines: readonly RunLine[],
  scale: number,
  records: Placed[],
  tried: Tried[],
) {
  const at: { line: LaidLine; li: number; it: LaidLine['items'][number]; n: number }[] = []
  lines.forEach(({ line }, li) => {
    line.items.forEach((it, n) => {
      if ((it.t as Tok).crop?.k === to.k) at.push({ line, li, it, n })
    })
  })
  for (const c of annots) {
    let first: (typeof at)[number] | null = null
    const box: number[] = []
    for (const x of at) {
      const { line, it } = x,
        r = (it.t as Tok).crop!,
        cr = r.crop
      if (c.q !== r.page || (first && line.page !== first.line.page)) continue
      const sx = it.w / (cr[2]! - cr[0]!)
      const X = (v: number) => it.x! + (v - cr[0]!) * sx,
        Y = (y: number) =>
          line.baseline + (y - r.baseline) * ((line.seg as { scale?: number } | undefined)?.scale ?? scale)
      const drawn = [it.x!, Y(cr[1]!), it.x! + it.w, Y(cr[3]!)]
      const had = box.length
      for (const ar of c.a.boxes?.length ? c.a.boxes : [c.a.rect!]) {
        const b = [
          Math.max(drawn[0]!, X(ar[0]!)),
          Math.max(drawn[1]!, Y(ar[1]!)),
          Math.min(drawn[2]!, X(ar[2]!)),
          Math.min(drawn[3]!, Y(ar[3]!)),
        ]
        if (sound4(b) && b.every(Number.isFinite)) box.push(...b)
      }
      if (box.length > had && !first) first = x
    }
    if (!first) {
      tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      continue
    }
    const name = collapse(
      c.a.ov || (annots.length === 1 ? ((at[0]!.it.t as Tok).crop!.text ?? '') : '') || c.a.g2.ch.join(''),
    )
    records.push({
      page: first.line.page,
      li: first.li,
      x: box[0]!,
      rec: recordOf(c.a, box, name),
      sources: { annots: [[c.q, c.a.i]], tier: c.tier },
    })
  }
}

function keptOf(own: NonNullable<Exclude<Target['own'], () => unknown>>, annots: Group['annots'], page: number) {
  const out = { before: [] as number[][], after: [] as number[][], beforeText: '', afterText: '' }
  const ownKeys = new Set(own.map((c) => c.key))
  for (const c of annots) {
    if (c.q !== page) continue
    const g = c.a.g2
    for (const b of c.a.boxes ?? []) {
      let lo = Number.POSITIVE_INFINITY,
        hi = Number.NEGATIVE_INFINITY
      for (const ch of own)
        if (ch.page === page && inside((ch.x0 + ch.x1) / 2, ch.yb, b)) {
          lo = Math.min(lo, ch.x0)
          hi = Math.max(hi, ch.x1)
        }
      if (!(lo < hi)) continue
      let before = '',
        after = ''
      for (let k = 0; k < g.x.length; k++) {
        if (ownKeys.has(`${c.q}|${g.key?.[k]}`) || !inside(g.x[k]!, g.y[k]!, b)) continue
        if (g.x[k]! < lo) before += g.ch[k]
        else if (g.x[k]! > hi) after += g.ch[k]
      }
      if (before && sound([b[0]!, b[1]!, lo, b[3]!])) {
        out.before.push([b[0]!, b[1]!, lo, b[3]!])
        out.beforeText += before
      }
      if (after && sound([hi, b[1]!, b[2]!, b[3]!])) {
        out.after.push([hi, b[1]!, b[2]!, b[3]!])
        out.afterText += after
      }
    }
  }
  return out.before.length || out.after.length ? out : null
}

function placePair(
  to: Target,
  annots: Group['annots'],
  lines: readonly RunLine[],
  edge: Edge,
  band: Band,
  records: Placed[],
  tried: Tried[],
  budget: { left: number },
) {
  const Dc: D[] = []
  lines.forEach(({ line, runs }, li) => {
    for (const run of runs) {
      if ('crop' in run) continue
      for (const [n, at] of run.items) {
        const t = tokOf(line, n)
        if (t.space || t.crop || typeof t.s !== 'string' || (to.draw !== 'whole' && t.st?.link !== to.pair)) continue
        let o = at
        for (const ch of t.s) {
          Dc.push({ ch, li, run, at: o, end: o + ch.length, n })
          o += ch.length
        }
      }
    }
  })
  if (annots.some((c) => !sameBorder(c.a, annots[0]!.a))) {
    for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
    return
  }
  budget.left -= Dc.length * (annots.length + 1)
  if (budget.left < 0) {
    for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
    return
  }
  const r = rangeRecord(Dc, lines, edge, band)
  if (!r) {
    for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
    return
  }
  const own = to.own as Exclude<Target['own'], () => unknown>
  const kept = to.draw === 'whole' && own ? keptOf(own, annots, r.page) : null
  const boxes = kept ? [...kept.before.flat(), ...r.boxes, ...kept.after.flat()] : r.boxes
  const name = kept ? collapse(`${kept.beforeText} ${r.name} ${kept.afterText}`) : r.name
  records.push({
    page: r.page,
    li: r.li,
    x: r.x,
    rec: recordOf(annots[0]!.a, boxes, name),
    sources: { annots: annots.map((c) => [c.q, c.a.i]), tier: annots[0]!.tier },
  })
}

/**
 * D.links: the records a member's matched annotations make over what is drawn of their pieces (links.mjs placeUnit): one box a
 * drawn line, in PDF units; `lines` the member's laid lines with their runs (D.display's lineRuns), `edge` a run's edge
 * (D.display's runEdge), `band` a token's band (D.sentences' tokenBand), `scale` the layout's
 */
export function placeUnit({
  groups,
  lines,
  edge,
  band,
  scale,
  budget = { left: WORK_MAX },
}: {
  groups: readonly Group[]
  lines: readonly RunLine[]
  edge: Edge
  band: Band
  scale: number
  budget?: { left: number }
}): { records: Placed[]; tried: Tried[] } {
  const records: Placed[] = [],
    tried: Tried[] = []
  const items = lines.reduce((n, l) => n + l.line.items.length, 0) + 1
  for (const { to, annots } of groups) {
    budget.left -= items * (annots.length + 1)
    if (budget.left < 0) {
      for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      continue
    }
    if (to.draw === 'crop') placeCrop(to, annots, lines, scale, records, tried)
    else if (to.draw === 'pair' || to.draw === 'whole') placePair(to, annots, lines, edge, band, records, tried, budget)
    else placeText(to, annots, lines, edge, band, records, tried, budget)
  }
  return { records, tried }
}
