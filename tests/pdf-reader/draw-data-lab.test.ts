// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { drawInputsOf } from '@/pdf-reader/engine/layer-proto/draw.mjs'
import { drawDataOf } from '@/pdf-reader/engine/pipeline/draw-data.mjs'
import { LINK_TEXT_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'
import { LAB } from './helpers/lab-data'
import { installLiteWorker } from './helpers/lite-pdfjs'

// The draw geometry of real papers against the browser's live reading, font by font (the engine lane's parity tier compares the same
// at page level): what drawDataOf ships of a font's map is the set the live path (layer2.mjs fontMappedOf) reads of the same font.
// Needs AXT_LAB (lab/pdf, whose data/layout/<paper>/arxiv.pdf are read); skipped without it.
//   AXT_LAB=<lab/pdf> pnpm exec vitest run tests/pdf-reader/draw-data-lab.test.ts

const NM = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
// (the live path's module opens a canvas as it loads; node has none)
;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas ??= class { width = 8; height = 8; getContext() { return null } }

/** [paper, the pages with Type3 fonts the census found (all pages if empty)] */
const PAPERS: [string, number[] | null][] = [['2608.04322v1', [3, 8, 9]], ['2307.16209v1', null]]
// (the lite worker, as the server runs it, before this file's first document: one opened without its options reads as stock)
beforeAll(async () => { await installLiteWorker() })
const sameSet = (a: Set<string> | null, b: Set<string> | null) => (a === null || b === null ? a === b : a.size === b.size && [...a].every(x => b.has(x)))

describe.skipIf(!LAB)('the map a font ships is the one the live reading takes', () => {
  for (const [paper, pages] of PAPERS) {
    it(`${paper}: every font of ${pages ? `pages ${pages.join(', ')}` : 'every page'}, Type3 included`, async () => {
      const file = join(LAB as string, 'data/layout', paper, 'arxiv.pdf')
      if (!existsSync(file)) return
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const { fontMappedOf } = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
      const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: join(NM, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(NM, 'standard_fonts/'), fontExtraProperties: true })
      const doc = await task.promise
      let type3 = 0, fonts = 0
      const bad: string[] = []
      for (const p of pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1)) {
        const page = await doc.getPage(p)
        await page.getOperatorList()
        const { draw, why } = await drawDataOf(page)
        if (draw === null) { expect(why, `${paper} p${p}`).toBe('font'); continue }
        const x = drawInputsOf(draw)
        const tc = await page.getTextContent()
        const seen = new Set<string>()
        tc.items.forEach((it, k) => {
          if (!('str' in it) || seen.has(it.fontName)) return
          seen.add(it.fontName)
          const key = x.items[k]?.fontName
          let live: Set<string> | null = null
          try { live = fontMappedOf(page.commonObjs.get(it.fontName)) } catch { live = null }
          const shipped = (key ? x.fonts.get(key)?.mapped : null) ?? null
          const f = page.commonObjs.get(it.fontName)
          fonts++
          if (f?.isType3Font) type3++
          if (!sameSet(shipped, live)) bad.push(`p${p} ${it.fontName} ${f?.name} type3=${!!f?.isType3Font}: shipped ${shipped === null ? 'none' : shipped.size}, live ${live === null ? 'none' : live.size}`)
        })
      }
      await task.destroy()
      expect(bad, `${bad.length} of ${fonts} fonts differ (${type3} Type3)`).toEqual([])
      if (paper === '2608.04322v1') expect(type3, 'the census\' Type3 fonts of p3, p8, p9').toBeGreaterThan(0)
    }, 600_000)
  }
})

describe.skipIf(!LAB)('a link\'s overlaid text the draw ships is the stock worker\'s', () => {
  for (const paper of ['1706.03762v7', '2307.16209v1', '2608.04322v1']) {
    it(`${paper}: every Link annotation of every page, read on the lite worker opened for the draw (LINK_TEXT_PIXELS)`, async () => {
      const file = join(LAB as string, 'data/layout', paper, 'arxiv.pdf')
      if (!existsSync(file)) return
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const open = (o: Record<string, unknown>) => getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: join(NM, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(NM, 'standard_fonts/'), fontExtraProperties: true, ...o })
      const [st, lt] = [open({}), open({ maxImageSize: LINK_TEXT_PIXELS })]
      const [stock, lite] = [await st.promise, await lt.promise]
      let links = 0, texts = 0
      const bad: string[] = []
      for (let p = 1; p <= stock.numPages; p++) {
        const want = (await (await stock.getPage(p)).getAnnotations()).filter(a => a.subtype === 'Link').map(a => a.overlaidText ?? null)
        const page = await lite.getPage(p)
        await page.getOperatorList()
        const { draw } = await drawDataOf(page)
        if (draw === null) continue
        const got = drawInputsOf(draw).annots.map(a => a.overlaidText)
        links += want.length
        texts += want.filter(t => typeof t === 'string' && t.length > 0).length
        if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`p${p}: ${JSON.stringify(got).slice(0, 120)} vs ${JSON.stringify(want).slice(0, 120)}`)
        page.cleanup()
      }
      await st.destroy()
      await lt.destroy()
      expect(bad, `${bad.length} pages differ of ${links} links`).toEqual([])
      expect(texts, 'links with text under them').toBeGreaterThan(0)
    }, 600_000)
  }
})
