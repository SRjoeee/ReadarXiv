// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GLYPH_COLUMNS, type Glyph, packGlyphs, pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { STREAM_COLUMNS } from '@/pdf-reader/engine/layout/stream.mjs'

// The marks read and the layout maker keep a page's glyphs packed as columns (packGlyphs), not as a Glyph object each (the
// prepare memory note of 2026-10-15). Over every page of the sample paper (tests/fixtures/pdf/sample-1, read by the pinned
// PDF.js as the server reads a PDF), the columns hold each Glyph's numbers bit for bit, in the order asked, and the marks
// read's few the same as the maker's. What ownedOf finds over them is held by layout-stream.test.ts, each case with its
// expected answer

type Ink = ReturnType<typeof pageInk>
const read: { ink: Ink }[] = []
beforeAll(async () => {
  const task = getDocument({ data: new Uint8Array(readFileSync(new URL('../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url))), verbosity: 0 })
  try {
    const doc = await task.promise
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      read.push({ ink: pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate }) })
    }
  } finally { await task.destroy() }
})

describe('packGlyphs over the sample paper', () => {
  it('reads a page of real ink: four pages, thousands of glyphs, some boxes', () => {
    expect(read).toHaveLength(4)
    expect(read.reduce((n, r) => n + r.ink.glyphs.length, 0)).toBeGreaterThan(5000)
    expect(read.some(r => r.ink.boxes.length > 0)).toBe(true)
  })

  it("holds every Glyph's numbers and character bit for bit, in stream order", () => {
    for (const { ink: { glyphs } } of read) {
      const P = packGlyphs(glyphs)
      expect(P.n).toBe(glyphs.length)
      for (const k of ['x0', 'x1', 'y', 'top', 'bottom', 'size'] as const) expect(Array.from(P[k]), k).toEqual(glyphs.map(g => g[k]))
      expect(P.u).toEqual(glyphs.map(g => g.u))
      // its ink across with its advance; no font asked
      expect(Array.from(P.ix0)).toEqual(glyphs.map(g => Math.min(g.x0, g.ix0)))
      expect(Array.from(P.ix1)).toEqual(glyphs.map(g => Math.max(g.x1, g.ix1)))
      expect(Array.from(P.font)).toEqual(glyphs.map(() => -1))
      expect(P.most).toBe(Math.max(0, ...glyphs.map(g => g.size)))
    }
  })

  it('in the order given, each font by the id asked for: the layout maker\'s by baseline', () => {
    for (const { ink: { glyphs } } of read) {
      const order = glyphs.map((_, i) => i).sort((a, b) => (glyphs[a] as Glyph).y - (glyphs[b] as Glyph).y || (glyphs[a] as Glyph).x0 - (glyphs[b] as Glyph).x0 || a - b)
      const names: string[] = []
      const P = packGlyphs(glyphs, { order, fontIds: f => (names.includes(f) ? names.indexOf(f) : names.push(f) - 1) })
      const by = order.map(i => glyphs[i] as Glyph)
      expect(P.n).toBe(glyphs.length)
      for (const k of ['x0', 'x1', 'y', 'top', 'bottom', 'size'] as const) expect(Array.from(P[k]), k).toEqual(by.map(g => g[k]))
      expect(P.u).toEqual(by.map(g => g.u))
      expect(Array.from(P.font).map(i => names[i])).toEqual(by.map(g => g.font))
    }
    expect(packGlyphs([])).toMatchObject({ n: 0, most: 0, u: [] })
  })

  it("the marks read's columns alone (STREAM_COLUMNS), each the same as with every column", () => {
    expect(GLYPH_COLUMNS).toEqual(expect.arrayContaining([...STREAM_COLUMNS]))
    for (const { ink: { glyphs } } of read) {
      const all = packGlyphs(glyphs), few = packGlyphs(glyphs, { columns: STREAM_COLUMNS })
      expect(Object.keys(few).sort()).toEqual(['most', 'n', ...STREAM_COLUMNS].sort())
      expect(few).toEqual({ n: all.n, most: all.most, x0: all.x0, y: all.y, size: all.size, u: all.u })
    }
  })
})
