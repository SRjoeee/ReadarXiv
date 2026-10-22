// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAB } from './helpers/lab-data'

// The fill each glyph of a real arXiv PDF is painted with, as the ink walk records it (layout/ink.mjs pageInk: setFillRGBColor,
// every colour space as PDF.js turns it to RGB), which a found placeholder's row ends with where it is not black (make.mjs).
// hyperref's colorlinks: 2609.26457's citations in #0071bc, 1810.04805's links in navy. Needs AXT_LAB (lab/pdf, whose
// data/layout/<paper>/arxiv.pdf are read); a paper whose PDF is not there is passed over, and the whole file skipped without it.
//   AXT_LAB=<lab/pdf> pnpm exec vitest run tests/pdf-reader/ink-fill-lab.test.ts

/** each page's glyphs by fill, the inked ones (a blank Unicode left out), and the runs of glyphs of one colour not black */
async function fillsOf(file: string, pages: number[] | null) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { pageInk } = await import('@/pdf-reader/engine/layout/ink.mjs')
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, disableFontFace: true, fontExtraProperties: true })
  const doc = await task.promise
  const count = new Map<number, number>(), runs: string[] = []
  for (const p of pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1)) {
    const page = await doc.getPage(p)
    const ink = pageInk(OPS as never, await page.getOperatorList(), page.commonObjs as never, { rotate: page.rotate })
    let run = '', fill = 0
    for (const g of ink.glyphs) {
      const f = g.fill ?? 0
      if (/\S/.test(g.u)) count.set(f, (count.get(f) ?? 0) + 1)
      if (f !== fill && run) { runs.push(run); run = '' }
      fill = f
      if (f !== 0) run += g.u
    }
    if (run) runs.push(run)
  }
  await task.destroy()
  return { count, runs }
}

describe.skipIf(!LAB)('a real paper\'s glyphs carry their fill', () => {
  it('2609.26457v1 page 12: its citations in #0071bc, the rest black', async () => {
    const file = join(LAB as string, 'data/layout/2609.26457v1/arxiv.pdf')
    if (!existsSync(file)) return
    const { count, runs } = await fillsOf(file, [12])
    for (const f of count.keys()) expect(Number.isInteger(f) && f >= -1 && f <= 0xffffff, String(f)).toBe(true)
    expect(count.get(0x0071bc)).toBeGreaterThan(800)
    expect(count.get(0) ?? 0).toBeGreaterThan(3 * (count.get(0x0071bc) ?? 0))
    expect(runs).toEqual(expect.arrayContaining(['Baeketal.', '2025']))
  }, 120_000)

  it('1810.04805v2, every page: its links in navy (#000080), the rest black', async () => {
    const file = join(LAB as string, 'data/layout/1810.04805v2/arxiv.pdf')
    if (!existsSync(file)) return
    const { count, runs } = await fillsOf(file, null)
    expect(count.get(0x000080)).toBeGreaterThan(2000)
    expect(count.get(0) ?? 0).toBeGreaterThan(10 * (count.get(0x000080) ?? 0))
    expect(runs).toEqual(expect.arrayContaining(['https://gluebenchmark.com/leaderboard']))
  }, 300_000)
})
