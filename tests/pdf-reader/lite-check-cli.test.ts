// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// lab/pdf/spikes/lite-check.mjs expands a paper id to its PDFs the same way in both of its modes: the one-side mode (--side) and the
// comparing one read the same files, and a digest record is keyed by their paths. Run on the sample PDF as a paper of a data directory

const ROOT = resolve(__dirname, '../..')
const TSX = join(ROOT, 'node_modules/tsx/dist/cli.mjs')
const SPIKE = join(ROOT, 'lab/pdf/spikes/lite-check.mjs')
const SAMPLE = join(ROOT, 'tests/fixtures/pdf/sample-1/sample-1.pdf')
const data = mkdtempSync(join(tmpdir(), 'lite-check-'))
afterAll(() => rmSync(data, { recursive: true, force: true }))
mkdirSync(join(data, 'layout/1512.03385v1/compiles'), { recursive: true })
copyFileSync(SAMPLE, join(data, 'layout/1512.03385v1/arxiv.pdf'))
copyFileSync(SAMPLE, join(data, 'layout/1512.03385v1/compiles/aaaa.pdf'))

const run = (args: string[]) => spawnSync(process.execPath, [TSX, SPIKE, ...args], { encoding: 'utf8', env: { ...process.env, AXT_DATA: data }, cwd: ROOT })

describe('lite-check.mjs', () => {
  it('expands a paper id in --side mode as in the comparing mode: its arXiv PDF and its cached compiles, the digests keyed by those paths', () => {
    for (const side of ['stock', 'lite']) {
      const out = join(data, `${side}.json`)
      const r = run(['1512.03385v1', `--side=${side}`, `--digests=${out}`])
      expect({ status: r.status, stderr: r.stderr.slice(0, 300) }).toEqual({ status: 0, stderr: '' })
      expect(r.stdout).toContain(`${side}: ${join(data, 'layout/1512.03385v1/arxiv.pdf')} read`)
      expect(r.stdout).toContain(join(data, 'layout/1512.03385v1/compiles/aaaa.pdf'))
    }
    const c = run([`--compare=${join(data, 'stock.json')},${join(data, 'lite.json')}`])
    expect(c.status).toBe(0)
    expect(c.stdout).toMatch(/ok .*2 PDFs.*the same/)
  })

  it('with no argument stands for the gate\'s five papers: those the data directory lacks are skipped, those it holds are read', () => {
    const r = run(['--side=lite'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('skip 1706.03762v7')
    expect(r.stdout).toContain(`lite: ${join(data, 'layout/1512.03385v1/arxiv.pdf')} read`)
  })

  it('compares the normal mode on an id and on an explicit .pdf path alike', () => {
    const r = run(['1512.03385v1', SAMPLE])
    expect(r.status).toBe(0)
    expect(r.stdout.match(/^ok /gm)?.length).toBe(3)
  })
})
