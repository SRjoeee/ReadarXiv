// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  it('refuses a --side that is not stock or lite, before it reads or writes anything', () => {
    for (const side of ['Lite', 'LITE', 'stok', '', 'both']) {
      const out = join(data, `typo-${side || 'empty'}.json`)
      const r = run(['1512.03385v1', `--side=${side}`, `--digests=${out}`])
      expect(r.status, side).toBe(2)
      expect(r.stderr + r.stdout).toMatch(/--side=stock\|lite/)
      expect(r.stdout).not.toContain('read')
      expect(existsSync(out), side).toBe(false)
    }
  })

  it('compares only a stock record and a lite record, in that order, and refuses two of one side', () => {
    const stock = join(data, 'stock.json'), lite = join(data, 'lite.json')
    expect(run([`--compare=${stock},${lite}`]).status).toBe(0)
    for (const pair of [[stock, stock], [lite, lite], [lite, stock]]) {
      const r = run([`--compare=${pair.join(',')}`])
      expect(r.status, pair.map(f => f.slice(f.lastIndexOf('/') + 1)).join(',')).toBe(2)
      expect(r.stderr + r.stdout).toMatch(/stock.*lite/)
    }
    // a record that names no side (an older file) is refused too
    writeFileSync(join(data, 'bare.json'), JSON.stringify({ pdfs: {}, peak: {} }))
    expect(run([`--compare=${join(data, 'bare.json')},${lite}`]).status).toBe(2)
  })
})
