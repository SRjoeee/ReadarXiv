// The walk's inputs at today's smallest composite that materialises them (baseline/tap/TAP.md §4: X.walk replayed whole at F2,
// layoutCut), made from a unit's ledger round: its measured tokens (B.measure's ref into tokens/<pair>.tokens.json.gz, each
// token's face and style by index, a crop by its page, box and baseline), the label crops the run set before its first line
// (F1's rowLabelCrop, U.decor's carriedCrop), the blocks the walk was handed (F2's walkedBlocks), the size and the unit's own
// parameters (U.params), the target's rules (lanes/L3/replay/rules.json.gz: today's resolveRules), the hyphenation patterns
// the run loaded, and the widths of the pair's metrics table. And what F2 recorded: the layout and its lines, summarized as
// the tap summarizes them, so that a port's layout is compared field by field.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Face, Token, TStyle } from '../../src/breaker/tokens.ts'
import { fitMeasure } from '../../src/breaker/measure.ts'
import { hyphenationOf, type Patterns } from '../../src/breaker/hyph.ts'
import { type MeasureTable, tableMetrics } from '../../src/metrics/table.ts'
import { derived, LAB, ledger, readGz, TAP } from './tap.ts'

type Raw = Record<string, unknown>
/** the tap's numbers back: a non-finite one is written as its string */
export const num = (v: unknown): unknown =>
  v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v === 'NaN' ? Number.NaN : v

/** a pair's tokens file (TAP.md §5): the faces and styles its tokens name by index, each unit's tokens by its ref */
type TokenFile = { faces: (Face & { font: string })[]; styles: TStyle[]; units: Record<string, Raw[]> }
const tokenFiles = new Map<string, TokenFile>()
const tokensOf = (pair: string): TokenFile => {
  const t = tokenFiles.get(pair) ?? (readGz(join(TAP, 'tokens', `${pair}.tokens.json.gz`)) as TokenFile)
  tokenFiles.set(pair, t)
  return t
}
const metricsOf = new Map<string, ReturnType<typeof tableMetrics>>()
const metrics = (pair: string) => {
  const m = metricsOf.get(pair) ?? tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as MeasureTable)
  metricsOf.set(pair, m)
  return m
}

/** the hyphenation files the reader was served (the tap's replay-check HYPHS: the sweep cache's first, then the baseline's) */
const HYPHS = [
  '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache/static/hyph',
  join(LAB, 'refactor-2026-11', 'baseline', 'static', 'hyph'),
]
const patternsByLang = new Map<string, Patterns | null>()
const patternsOf = (lang: string): Patterns | null => {
  if (!patternsByLang.has(lang)) {
    const f = HYPHS.map((d) => join(d, `${lang}.json`)).find((p) => existsSync(p))
    patternsByLang.set(lang, f ? hyphenationOf(JSON.parse(readFileSync(f, 'utf8'))) : null)
  }
  return patternsByLang.get(lang)!
}
type Rules = { targets: Record<string, { params: Raw; patterns: string[] }> }
let rules: Rules | null = null

/** a crop resolution as the token carried it: its box, where cropOfBox cut it from a segment, read back from its rectangle */
const cropOf = (c: Raw) => {
  const crop = c.crop as number[]
  const out: Raw = {
    mode: c.mode,
    page: c.page,
    crop,
    baseline: c.baseline,
    ...(c.part !== undefined ? { part: c.part } : {}),
  }
  if (typeof c.text === 'string') out.text = c.text
  // (cropOfBox's margins taken off: the box TeX set, which the line's extent reads, cropExtent)
  out.gap = {
    box: { x0: crop[0]! + 0.4, bottom: crop[1]! + 0.3, x1: crop[2]! - 0.4, top: crop[3]! - 0.3, baseline: c.baseline },
  }
  return out
}
/** a block as the walk was handed it (the tap's blockOf: numbers JSON prints, measures as entries, flowX's lead one deep) */
export const blockOfTap = (b: Raw): Raw => {
  const o: Raw = {}
  for (const [k, v] of Object.entries(b)) {
    if (k === 'borrows') continue
    if (k === 'measures') o[k] = new Map((v as [string, number, number][]).map(([key, a, z]) => [key, [a, z]]))
    else if (k === 'flowX') {
      const f = v as { y: number; lead: Raw | null }
      o[k] = { y: f.y, lead: f.lead ? blockOfTap(f.lead) : null }
    } else o[k] = Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.map(num) : num(x))) : num(v)
  }
  return o
}

export type WalkCase = {
  pair: string
  ord: number
  round: number
  tokens: Token[]
  blocks: Raw[]
  s: number
  P: Raw
  want: { layout: Raw; layoutLines: unknown[]; tokens: number; cutTokens: number }
  crops: number
  /** the round's slot of a rule (the first that holds `has`, where given) */
  slot: (by: string, has?: string) => Raw | undefined
  /** the target's rules (resolveRules' params) */
  rules: Raw
}

/** the walk's case of a unit's ledger round, or why it has none */
export function walkCase(pair: string, ord: number, round: number): WalkCase | string {
  const L = ledger(pair)
  const u = L.units.find((x) => x.ord === ord)
  const slots = (u?.slots ?? []).filter((x) => x.round === round)
  const slot = (by: string, has?: string) =>
    slots.find((x) => x.by === by && (!has || (x.value !== null && has in (x.value as object))))?.value as
      | Raw
      | undefined
  const f2 = slot('X.cut'),
    bm = slot('B.measure'),
    up = slot('U.params')
  if (!f2 || !bm || !up) return 'no walk'
  const T = tokensOf(pair)
  const list = T.units[bm.ref as string]
  if (!list) return `no tokens ${bm.ref}`
  let crops = 0
  let tokens: Token[] = list.map((t) => {
    const o: Raw = {}
    for (const [k, v] of Object.entries(t)) {
      if (k === 'f') {
        const { font: _font, ...face } = T.faces[v as number]!
        o.face = face
      } else if (k === 'st') o.st = T.styles[v as number]
      else if (k === 'crop') {
        crops++
        o.crop = cropOf(v as Raw)
      } else o[k] = num(v)
    }
    return o as Token
  })
  // (the label crops the run set before the first line, after measuring: a shared row's own label, then a carried one)
  const rowLabel = slot('S.rowStart', 'rowLabelCrop')?.rowLabelCrop as Raw | undefined
  if (rowLabel) {
    const c = rowLabel as { crop: number[] }
    if (tokens[0] && !tokens[0].space) tokens[0] = { ...tokens[0], glue: true }
    tokens = [{ crop: rowLabel, cw: c.crop[2]! - c.crop[0]!, glue: false, w100: 0, ownLabel: true } as Token, ...tokens]
  }
  const carried = slot('U.decor', 'carriedCrop')?.carriedCrop as Raw | undefined
  if (carried) {
    const c = carried as { crop: number[] }
    tokens = [{ crop: carried, cw: c.crop[2]! - c.crop[0]!, glue: false, w100: 0 } as Token, ...tokens]
  }
  rules ??= derived<Rules>('rules')
  const R = rules.targets[L.target]!
  const patterns = Object.fromEntries(R.patterns.map((l) => [l, patternsOf(l)]))
  const hl = up.halfLead as Raw | null
  const P: Raw = {
    ...structuredClone(R.params),
    leadBase: up.leadBase,
    trackStart: up.trackStart,
    lineskip: up.lineskip,
    halfLead: hl ? { head: hl.head, foot: hl.foot, below: num(hl.below) } : null,
    lastLines: up.lastLines,
    ...(up.capScale !== null ? { capScale: up.capScale } : {}),
    measure: fitMeasure(metrics(pair)),
    patterns,
  }
  // (the tap's blockOf, mapped over the blocks, took a block's index for its `deep`: the first block's flowX lost its lead
  // block. S.rowStart's: the unit before's block that holds the row, from its last round, the F1 slot naming it)
  const blocks = (f2.walkedBlocks as Raw[]).map(blockOfTap)
  const fx = blocks[0]?.flowX as { y: number; lead: Raw | null } | undefined
  if (fx && !fx.lead) {
    const f1 = slot('S.rowStart', 'flowX')
    const row = f1?.row as { id: number; page: number; baseline: number } | undefined
    const named = (f1?.flowX as { lead?: number[] } | undefined)?.lead
    const lu = row ? L.units.find((x) => x.ord === row.id) : undefined
    if (lu && row && named) {
      const r = row
      const last = Math.max(...lu.slots.map((x) => x.round))
      const at = (by: string) => lu.slots.find((x) => x.round === last && x.by === by)?.value as Raw | undefined
      const raw = (at('X.further')?.widenedBlocks ?? at('X.cut')?.walkedBlocks) as Raw[] | undefined
      const lead = raw
        ?.map(blockOfTap)
        .find((q) => q.page === r.page && (q.B as number[]).some((y) => Math.abs(y - r.baseline) < 0.05))
      if (lead && lead.page === named[0] && lead.x0 === named[1] && lead.x1 === named[2]) fx.lead = lead
    }
  }
  return {
    pair,
    ord,
    round,
    tokens,
    blocks,
    s: up.s as number,
    P,
    want: {
      layout: f2.layout as Raw,
      layoutLines: f2.layoutLines as unknown[],
      tokens: f2.tokens as number,
      cutTokens: f2.cutTokens as number,
    },
    crops,
    slot,
    rules: R.params,
  }
}

/** a number as the tap prints it (TAP.md §1: as JSON prints it, non-finite as a string) */
const fin = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : (v ?? null))
/** a layout summarized as the tap's layoutOf, its lines as linesOf */
export function layoutOf(l: Raw | null) {
  if (!l) return null
  const st = l.state as Raw
  return {
    state: {
      lead: fin(st.lead),
      scale: fin(st.scale),
      track: fin(st.track),
      trackLatin: fin(st.trackLatin),
      compress: fin(st.compress),
      borrow: fin(st.borrow),
      knob: st.knob ?? null,
      ...(st.box ? { box: true } : {}),
      ...(st.next !== undefined ? { next: fin(st.next) } : {}),
      ...(st.fitTrack !== undefined ? { fitTrack: fin(st.fitTrack) } : {}),
    },
    f: fin(l.f),
    scale: fin(l.scale),
    knob: l.knob ?? null,
    clipped: !!l.clipped,
    lines: (l.lines as unknown[] | undefined)?.length ?? 0,
    tried: fin(l.tried),
    lostChars: fin(l.lostChars),
    opened: fin(l.opened),
    unopened: fin(l.unopened),
  }
}
export const linesOf = (l: Raw | null) =>
  ((l?.lines as Raw[] | undefined) ?? []).map((x) => [
    x.page,
    fin(x.baseline),
    fin(x.x0),
    fin((x.x0 as number) + (x.used as number)),
    x.mode ?? null,
    x.block ?? null,
    (x.items as unknown[] | undefined)?.length ?? 0,
  ])
