// @vitest-environment node
// Production's row path's answers frozen (lab/typeset/parity/production-rows.mjs --freeze, --today-frozen, AXT_TODAY_FROZEN):
// a pair's answer, whether today's own row path gives its stored rows back, is recorded under the digest of what it was read
// from, and read back in place of today's engine only while those inputs are the same: a stored row changed, a catalog gone,
// or a pair never recorded is not read. Synthetic caches and answers in a temporary folder; today's engine is never loaded.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { FROZEN_ROWS_FORMAT, frozenInputsOf, frozenRowsFile, lineOf, type RowsAgainst } from '../../lab/typeset/parity/production-rows.mjs'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const PAIR = '2601.00001v1-zh'
/** a cache holding one pair: its catalog naming one units chunk, its manifest naming one rows object */
function cacheOf(rows: string) {
  const d = mkdtempSync(join(tmpdir(), 'production-rows-'))
  dirs.push(d)
  mkdirSync(join(d, 'objects'))
  mkdirSync(join(d, 'papers', '2601.00001v1'), { recursive: true })
  mkdirSync(join(d, 'papers', PAIR), { recursive: true })
  writeFileSync(join(d, 'objects', 'u1'), 'units chunk')
  writeFileSync(join(d, 'objects', 'r1'), rows)
  writeFileSync(join(d, 'papers', '2601.00001v1', 'catalog.json'), JSON.stringify({ units: [{ sha256: 'u1' }] }))
  writeFileSync(join(d, 'papers', PAIR, 'open.json'), JSON.stringify({ body: { manifest: { rows: [{ sha256: 'r1' }] } } }))
  return d
}
const answer: RowsAgainst = { rows: 2, same: 2, missing: [], extra: [], moved: [], differ: [], held: [] }

describe("production's row path's answers, frozen", () => {
  it("names a pair's inputs by their bytes: another stored row is another digest; none where the manifest is not there", () => {
    const a = frozenInputsOf(cacheOf('{"rows":[[1]]}'), PAIR)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(frozenInputsOf(cacheOf('{"rows":[[1]]}'), PAIR)).toBe(a)
    expect(frozenInputsOf(cacheOf('{"rows":[[2]]}'), PAIR)).not.toBe(a)
    expect(frozenInputsOf(cacheOf('{"rows":[[1]]}'), '2601.00001v1-ja')).toBeNull()
  })
  it('reads a recorded answer as a run of today prints it, only over the inputs it was recorded on', () => {
    const cache = cacheOf('{"rows":[[1]]}')
    const frozen = mkdtempSync(join(tmpdir(), 'production-rows-frozen-'))
    dirs.push(frozen)
    writeFileSync(frozenRowsFile(frozen), JSON.stringify({ format: FROZEN_ROWS_FORMAT, recorded: { engine: 'e', at: 't' }, pairs: { [PAIR]: { inputs: frozenInputsOf(cache, PAIR), result: answer } } }))
    const run = (env: Record<string, string>, ...args: string[]) =>
      spawnSync(process.execPath, ['lab/typeset/parity/production-rows.mjs', ...args], { encoding: 'utf8', env: { ...process.env, AXT_SWEEP_CACHE: cache, ...env } })
    const byFlag = run({}, `--today-frozen=${frozen}`, PAIR)
    expect(byFlag.status).toBe(0)
    expect(byFlag.stdout.split('\n').slice(1, 3)).toEqual([lineOf(PAIR, answer), "production's rows: 1 of 1 pairs; 2 of 2 stored rows given back by production's own path"])
    // (the release check's display gates set the folder in the environment; a pair never recorded is not read)
    const byEnv = run({ AXT_TODAY_FROZEN: frozen }, PAIR, '2601.00001v1-ja')
    expect(byEnv.status).toBe(1)
    expect(byEnv.stdout).toContain(lineOf(PAIR, answer))
    expect(byEnv.stdout).toContain('2601.00001v1-ja: not read: no stored rows in the cache')
    // (a stored row changed since: not read)
    writeFileSync(join(cache, 'objects', 'r1'), '{"rows":[[9]]}')
    const changed = run({}, `--today-frozen=${frozen}`, PAIR)
    expect(changed.status).toBe(1)
    expect(changed.stdout).toContain(`${PAIR}: not read: its catalog or stored rows are not those production's path was recorded on`)
  })
})
