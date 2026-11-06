// S.names and S.nameLed replayed against today's run: every babel name of a pair's pages (today's bundle: today-names.ts) set by
// the port over the page's characters as today read them, against the baseline's reader dump (`names`: drawn, why, its line's
// start, baseline and text as the markup drew it); and every S.nameLed F1 slot of the pair's ledger (the start of a unit's first
// line after a name that leads no unit), with every other laid round checked to take none.
//
// The page's characters: today's reading of the page's draw (the left part's, the reader's own input) under two stand-ins for
// the design widths the tap does not record (today-names.ts); a name whose answer differs between the two is not compared and is
// counted (`widths`: it needs the design widths). The tap's own characters of a page (samples/pages, 30 pages) are a cross-check
// (`tapOther`: they give another answer). A name that leads a unit is that unit's lead: its word is
// compared with the unit's U.lead slot, and whether it is drawn with the unit's lay (its lead taken, the unit laid).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { faceOf, ownSmallCaps } from '../../../../packages/typeset/src/breaker/faces.ts'
import { type MeasureTable, tableMetrics } from '../../../../packages/typeset/src/metrics/table.ts'
import { nameLed } from '../../../../packages/typeset/src/shared/name-led.ts'
import {
  type NameRecord,
  type NameRow,
  nameChars,
  nameRoom,
  type PageChar,
  type SetName,
  setName,
} from '../../../../packages/typeset/src/shared/names.ts'
import { blockOfTap } from '../../../../packages/typeset/tests/replay/fit-input.ts'
import { derived, firstDifference, LAB, ledger, readGz, TAP, TODAY } from '../../../../packages/typeset/tests/replay/tap.ts'
import { pageChars, tapChars, todayNames } from './today-names.ts'
import { paperOf } from '../../../../packages/typeset/tests/replay/today.ts'
import { rolesOf } from '../../../../packages/typeset/tests/replay/tokens-input.ts'

type Raw = Record<string, unknown>
type DumpName = { occurrence: number; key: string; page: number; drawn: boolean; why?: string; line?: Raw }
export type NameCase = {
  occurrence: number
  page: number
  chars: 'draw' | 'none'
  d: string | null
  widths?: true
  /** the tap's own characters of the page (samples/pages) give another answer */
  tapOther?: true
}
export type NamesResult = { names: NameCase[]; led: { cases: number; slots: number; differ: string[] } }

let rules: { targets: Record<string, { params: Raw }> } | null = null
let labelsOf: Record<string, { labels?: Record<string, string> }> | null = null
const r2 = (v: number) => Math.round(v * 100) / 100
const n2 = (v: number) => Math.round(v * 100) / 100
/** the door's scale: CSS pixels a PDF unit of its markup (baseline/tools/reader-entry.mjs SCALE) */
const SCALE = 2.5

/** a name's line as the dump reads its markup (reader-entry.mjs othersOfSvg over svgOfName L2:4786): its first run's start
 *  and its baseline through PDF.js's viewport at the door's scale and back, two decimals each way; its runs' text */
export function lineOf(set: SetName, view: readonly number[]): Raw | null {
  const d = set.drawn
  if (!d) return null
  const [v0, v1, v2, v3] = view as [number, number, number, number]
  // (PDF.js PageViewport, rotation 0: [s, 0, 0, -s, |cx - x0| s - s cx, |cy - y0| s + s cy])
  const cx = (v2 + v0) / 2,
    cy = (v3 + v1) / 2
  const e = Math.abs(cx - v0) * SCALE - SCALE * cx,
    f = Math.abs(cy - v1) * SCALE + SCALE * cy
  const px = d.x * SCALE + e,
    py = -d.baseline * SCALE + f
  // (an oblique face's <text> is skewed about its start by translate(px py) skewX translate(-px -py), whose first translate the
  // dump's reading adds to its first run's x: its start read twice over, the dump's, kept)
  const x = d.face.oblique ? n2(px) + n2(px) : n2(px)
  return {
    x0: r2(x / SCALE + v0),
    baseline: r2(v3 - n2(py) / SCALE),
    text: d.runs.map((r) => r.s).join(''),
  }
}

/** a pair's names and S.nameLed slots replayed */
export async function namesOf(pair: string): Promise<NamesResult> {
  const L = ledger(pair)
  const paper = paperOf(pair)
  const today = todayNames(paper)
  const dumpFile = join(LAB, 'refactor-2026-11', 'baseline', 'reader', `${pair}.reader.json`)
  const dump = existsSync(dumpFile) ? (JSON.parse(readFileSync(dumpFile, 'utf8')) as { names: DumpName[] }) : null
  rules ??= derived('rules')
  labelsOf ??= (
    JSON.parse(readFileSync(join(TODAY, 'src', 'pdf-reader', 'engine', 'rules', 'layout-rules.json'), 'utf8')) as {
      languages: Record<string, { labels?: Record<string, string> }>
    }
  ).languages
  const P = rules!.targets[L.target]!.params as { cjk?: boolean; cjkQuotes?: boolean; floorMin: number }
  const info = L.info as { N: number; paper: { designs: { serif: string } } }
  const roles = rolesOf(pair)
  const metrics = tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as MeasureTable)
  const labels = labelsOf![L.target]?.labels ?? null
  const out: NameCase[] = []
  const records: NameRecord[] = []
  const set = (nm: NameRow, chars: readonly PageChar[]): SetName => {
    const mine = nameChars(nm, chars)
    return setName({
      nm,
      mine,
      room: () => nameRoom(nm, chars, mine),
      to: L.target,
      labels,
      serif: info.paper.designs.serif,
      P,
      faceOf: (st, cls) => faceOf(roles, st, cls),
      ownSmallCaps,
      metrics,
      shown: true,
    })
  }
  // (a decision as compared: its record, its drawing, its lead's word; not the characters it holds)
  const same = (a: SetName, b: SetName) =>
    !firstDifference(
      { rec: a.rec, drawn: a.drawn ?? null, lead: a.lead?.text ?? null, wait: a.wait ?? null },
      { rec: b.rec, drawn: b.drawn ?? null, lead: b.lead?.text ?? null, wait: b.wait ?? null },
    )
  for (const nm of today?.names ?? []) {
    if (nm.page > info.N) continue
    const want = dump?.names.find((m) => m.occurrence === nm.occurrence && m.page === nm.page)
    const a = await pageChars(paper, nm.page, 'a'),
      b = await pageChars(paper, nm.page, 'b')
    if (!a || !b) {
      out.push({ occurrence: nm.occurrence, page: nm.page, chars: 'none', d: 'no draw of the page' })
      continue
    }
    const from: NameCase['chars'] = 'draw'
    const got = set(nm, a),
      gb = set(nm, b)
    if (!same(got, gb)) {
      out.push({ occurrence: nm.occurrence, page: nm.page, chars: 'draw', d: null, widths: true })
      // (its record for S.nameLed: none drawn, so that no start is read of a name not decided)
      records.push({ ...got.rec, drawn: false })
      continue
    }
    // (the tap's own reading of the page, where pass 2 kept it: a cross-check of the draw's reading, which is the reader's input)
    const exact = tapChars(pair, nm.page)
    const tapOther = exact && !same(set(nm, exact), got) ? true : undefined
    records.push(got.rec)
    let d: string | null = null
    if (!want) d = 'not in the dump'
    else if (got.wait) d = `waits for ${JSON.stringify(got.wait).slice(0, 80)}`
    else if (got.rec.unit !== undefined) {
      // (a name leading a unit: its word against the unit's U.lead slot; drawn where its unit took it and was laid)
      const u = L.units.find((x) => x.ord === got.rec.unit)
      const last = Math.max(0, ...(u?.slots ?? []).map((x) => x.round))
      const lead = u?.slots.find((x) => x.by === 'U.lead' && x.round === last)?.value as
        | { name: number; lead: { parts: string[] } | null }
        | null
        | undefined
      const laid = (u as { dump?: string } | undefined)?.dump === 'laid'
      const took = !!lead?.lead && lead.name === nm.occurrence
      d =
        (took ? firstDifference(got.rec.text, lead!.lead!.parts[0], 'lead text') : null) ??
        firstDifference(took && !!laid, want.drawn, 'drawn (its unit)')
    } else {
      const line = lineOf(got, today!.view(nm.page) ?? [0, 0, 0, 0])
      d = firstDifference(
        { drawn: got.rec.drawn, why: got.rec.drawn ? undefined : (got.rec.why ?? undefined), line: line ?? undefined },
        { drawn: want.drawn, why: want.why, line: want.line },
        'name',
      )
    }
    out.push({ occurrence: nm.occurrence, page: nm.page, chars: from, d, ...(tapOther ? { tapOther } : {}) })
  }
  // S.nameLed: every laid round's first block after the page's names (a slot where today took one; none elsewhere)
  const led = { cases: 0, slots: 0, differ: [] as string[] }
  for (const u of L.units) {
    for (const r of new Set(u.slots.filter((x) => x.by === 'X.cut').map((x) => x.round))) {
      const slots = u.slots.filter((x) => x.round === r)
      if (slots.some((x) => x.by === 'S.rowStart')) continue
      const f2 = slots.find((x) => x.by === 'X.cut')?.value as Raw
      const b0 = (f2.walkedBlocks as Raw[] | undefined)?.[0]
      if (!b0) continue
      led.cases++
      const slot = slots.find((x) => x.by === 'S.nameLed')?.value as { start: number } | undefined
      if (slot) led.slots++
      const b = blockOfTap(b0) as Parameters<typeof nameLed>[0]
      const start = nameLed(b, records)
      const dd = firstDifference(start, slot ? slot.start : null, 'start')
      if (dd) led.differ.push(`ord ${u.ord} round ${r}: ${dd}`)
    }
  }
  return { names: out, led }
}
