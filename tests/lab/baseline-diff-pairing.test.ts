// @vitest-environment node
// The migration's differential (lab-data's refactor-2026-11/baseline/tools/diff.mjs) pairs the units of one id by place: each
// of the baseline's with the candidate's on its first line's page and baseline, its extent meeting it; the rest in ord order
// (the coordinator's ruling of 2026-11-10, lane fig-text). 2610.22197v1's eighteen units "lin2": F0 took four of them, on p12
// and p13, into lines as elements; paired in ord order, the four after them were read against p15's (unwrapped, as before) and
// stated lost. Synthetic dumps in the baseline's FORMAT.md form, run through the tool where lab-data holds it.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TOOL = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11/baseline/tools/diff.mjs'
const ID = 'a'.repeat(64)
const line = (page: number, x0: number, baseline: number) => ({ page, x0, x1: x0 + 20, baseline, top: baseline + 6, bottom: baseline - 2, size: 8 })
const unit = (ord: number, state: string, at: [number, number, number] | null, why?: string) => ({
  id: ID,
  ord,
  kind: 'inkfigures',
  text: 'lin2',
  pieces: [{ k: 0, kind: 'text', s: 'lin2' }],
  state,
  ...(at ? { lines: [line(...at)] } : {}),
  ...(why ? { why } : {}),
})
const dump = (units: object[]) => ({ format: 1, engine: 'test', paper: 'p', refused: null, pages: 1, counts: {}, units })
const lossesOf = (base: object[], cand: object[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'axt-diff-'))
  for (const [side, units] of [
    ['a', base],
    ['b', cand],
  ] as const) {
    mkdirSync(join(dir, side, 'prepare'), { recursive: true })
    writeFileSync(join(dir, side, 'prepare', 'p.prepare.json'), JSON.stringify(dump(units)))
  }
  writeFileSync(join(dir, 'acc.json'), JSON.stringify({ accepted: [] }))
  const json = join(dir, 'out.json')
  spawnSync('node', [TOOL, join(dir, 'a'), join(dir, 'b'), '--scope=prepare', `--acceptance=${join(dir, 'acc.json')}`, `--json=${json}`])
  return (JSON.parse(readFileSync(json, 'utf8')) as { losses: { ordA: number; cause: string }[] }).losses
}

describe.skipIf(!existsSync(TOOL))('the differential pairs the units of one id by place, the rest in ord order', () => {
  // (today's four: drawn on p12, p13, p13 and p17; and one on p15 not drawn)
  const base = [unit(1, 'drawn', [12, 264, 696]), unit(2, 'drawn', [13, 133, 696]), unit(3, 'drawn', [13, 264, 696]), unit(4, 'drawn', [17, 76, 647]), unit(5, 'unlaid', [15, 282, 705], 'figure: crowded')]
  it('reads a unit the candidate makes at today’s place against today’s there, and one it takes into another unit as stated', () => {
    // (the candidate: p12's and p13's two taken into lines (stated, no lines), p17's kept as the original's, p15's unwrapped)
    const cand = [
      unit(10, 'laid', [17, 77, 647], 'kept as the original: set wholly in a face of one pitch'),
      unit(11, 'laid', [15, 282, 705], 'unwrapped'),
      unit(20, 'unlaid', null, 'kept as the original: set wholly in a face of one pitch'),
      unit(21, 'unlaid', null, 'kept as the original: set wholly in a face of one pitch'),
      unit(22, 'unlaid', null, 'kept as the original: set wholly in a face of one pitch'),
    ]
    const lost = lossesOf(base, cand)
    // (no loss of today's p17 unit to p15's "unwrapped": each read against its own place; the three taken, their statement)
    expect(lost.filter((l) => l.cause === 'unwrapped')).toEqual([])
    expect(lost.map((l) => [l.ordA, l.cause]).sort()).toEqual([
      [1, 'kept as the original: set wholly in a face of one pitch'],
      [2, 'kept as the original: set wholly in a face of one pitch'],
      [3, 'kept as the original: set wholly in a face of one pitch'],
      [4, 'kept as the original: set wholly in a face of one pitch'],
    ])
  })
})
