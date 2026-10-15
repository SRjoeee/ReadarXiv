// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { cutBundle } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { readLeftPart, type Ref } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { anchorUnits, boundsFromMarks, markWords, sentenceStarts, startRuns, startsAnchor, type TextPage, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { plainSource, textsShown } from '@/pdf-reader/engine/translate/mt.mjs'
import { LAB, LAB_ON, LAB_PAPERS, labFiles, PACK } from './helpers/lab-data'
import { readCut } from './helpers/parts-paper'
import { piecesOf } from './helpers/start-pieces'

// The left parts' starts equal the anchors' on the real papers (left-pages design, T3). Each local paper's units come from its
// source; arXiv's PDF (the pack's) is read by the pinned PDF.js and anchored (a) by the units' text alone and (b) under the marks
// of our marked compile carried to it, as the reader anchors it; the side the producer makes of the anchors is cut with the pack's
// layout file, read back as the service reads it, and each unit's anchor is rebuilt from its pages' left parts, as the view does.
// The starts sentenceStarts gives are then compared, under several families of offsets (every word's start; single starts; seeded
// subsets). AXT_LAB and AXT_PACK (helpers/lab-data.ts)

const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
/** the kinds lit whole (highlight.mjs bySentence) */
const NOT_RUNNING = new Set(['caption', 'heading', 'cell', 'figure'])
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))

async function readPdf(file: string) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') })
  const pdf = await task.promise
  const pages: (TextPage & { view: number[] })[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p), tc = await pg.getTextContent()
    pages.push({ page: p, items: tc.items as unknown[], styles: tc.styles as Record<string, unknown>, view: pg.view })
  }
  const marks = new Map<string, { page: number; x: number; y: number }>()
  for (const [name, d] of await pdf.getDestinations()) {
    if (d && /^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  }
  await task.destroy()
  return { pages, marks }
}

/** a seeded generator */
const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }

describe.skipIf(!LAB_ON)('the real papers: the left parts\' starts equal the anchors\'', () => {
  for (const [name, target] of LAB_PAPERS) {
    it(name, async () => {
      const { layoutFile, sourceFile } = labFiles(name, target)
      const root = join(LAB as string, 'data/layout', name)
      const arxivFile = join(PACK as string, 'fixtures', `${name}-zh`, 'arxiv.pdf')
      const keyFile = join(root, 'marks.key')
      const markedFile = join(root, 'compiles', `${existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : ''}.pdf`)
      for (const f of [layoutFile, sourceFile, arxivFile]) if (!existsSync(f)) throw new Error(`missing ${f}`)
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))

      const source = await unpackSource(new Uint8Array(readFileSync(sourceFile)))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const paper = openPaper(source.files)
      const texts = textsShown(paper.units, new Map(), () => undefined)
      // the text the left is anchored by is the source's plain text, which the view's rebuild counts its offsets in
      for (let i = 0; i < paper.units.length; i++) expect(texts[i]!.text, `unit ${i}`).toBe(plainSource(paper.units[i] as never))

      const ax = await readPdf(arxivFile), marked = existsSync(markedFile) ? await readPdf(markedFile) : null
      const doc = tokenizeDocument(ax.pages)
      const views = ax.pages.map(p => p.view)
      const carried = marked ? markWords(tokenizeDocument(marked.pages), marked.marks) : null
      const kinds = paper.units.map((u: { kind: string }) => u.kind)
      const floating = (i: number) => FLOATING.has(kinds[i] ?? '')
      const layout = parseLayout(new Uint8Array(readFileSync(layoutFile)))
      expect(layout.paper.pages).toBe(views.length)
      const units = bundleUnitsOf(paper)

      const seen = { units: 0, withStarts: 0, compared: 0, e0: 0, emptied: 0, mismatches: 0 }
      for (const [how, bounds] of [['text alone', undefined], ...(carried ? [['under the marks', boundsFromMarks(doc, carried)] as const] : [])] as const) {
        const anchors = anchorUnits(doc, texts, { ...(bounds ? { bounds } : {}), floating })
        // anchor tokens rising and unique, the precondition of startRuns' filter
        for (const [uid, a] of anchors) if (a) for (let k = 1; k < a.tokens.length; k++) expect(a.tokens[k], `${how}, unit ${uid}`).toBeGreaterThan(a.tokens[k - 1]!)
        const side = leftSideOf({ doc, views, anchors })
        const whole = { paper: { id, version, pages: views.length }, base: { bytes: 1_000_000, sha256: 'a'.repeat(64), xref: 999_000 }, versions: { image: '1' }, units, left: { pages: side.pages, units: side.units }, layout }
        const cut = await cutBundle(whole as never, { leftPages: side.leftPages })
        const { parts } = await readCut(cut)
        const streams = new Map<number, number>()
        for (const p of parts) for (const w of p.left) streams.set(w[0], w[1])
        const lefts = []
        for (const l of cut.left) lefts.push(await readLeftPart(l.bytes, { ref: l.ref as Ref & { page: number }, streamOf: i => streams.get(i) }))
        const emptied = new Set(cut.left.filter(l => (l as { emptied?: boolean }).emptied).map(l => l.page))
        seen.emptied += emptied.size

        const rand = rng(7)
        const located = new Set(side.units.map(u => u[0]))
        for (const [uid, a] of anchors) {
          if (!a || !located.has(uid)) continue
          seen.units++
          const text = texts[uid]!.text
          // the unit's pieces from the left parts of every page its rectangles are on
          const pagesOf = [...new Set(a.rects.map(r => r.page))]
          if (pagesOf.some(p => emptied.has(p))) continue
          const pieces = []
          for (const l of lefts) {
            const spans = l.spans.find(s => s[0] === uid)
            if (!spans) continue
            const runs = l.pairs.find(s => s[0] === uid)
            pieces.push({ first: l.first, ranges: spans[1], ...(runs ? { runs: runs[1] } : {}) })
          }
          // (the oracle the pieces come from agrees with the writer's: the clipping of the global runs)
          const runs = startRuns(a)
          const total = doc.length
          const starts = lefts.map(l => l.first)
          expect(pieces.map(p => p.runs ?? null), `${how}, unit ${uid}`).toEqual(piecesOf(a, runs, starts, total).map(p => p.runs ?? null))
          const rebuilt = startsAnchor(pieces)
          if (runs) seen.withStarts++
          // offsets: every word's start, a few single starts, seeded subsets, none
          const word = [...text.matchAll(/\S+/g)].map(m => m.index as number).filter(o => o > 0 && o < text.length)
          const families: number[][] = [word, []]
          const stride = Math.max(1, Math.floor(word.length / 40))
          for (let i = 0; i < word.length; i += stride) families.push([word[i]!])
          for (let r = 0; r < 4; r++) families.push(word.filter(() => rand() < 0.1))
          for (const o of families) {
            const want = sentenceStarts(a, text, o), got = sentenceStarts(rebuilt, text, o)
            if (runs === null && o.length === 0 && want !== null) { seen.e0++; expect(NOT_RUNNING.has(kinds[uid] ?? ''), `E0 on a running unit: ${how}, unit ${uid}`).toBe(true); if (process.env.AXT_CUT_STATS) process.stderr.write(`E0 ${name} ${how} unit ${uid}: ${JSON.stringify({ c: a.coverage, b: a.bounded, tokens: a.tokens.length, pairs: [...(a.pairs ?? [])].slice(0, 6), kind: kinds[uid], words: text.split(/\s+/).length })}\n`); continue }
            seen.compared++
            if (JSON.stringify(want === null ? null : [...want]) !== JSON.stringify(got === null ? null : [...got])) seen.mismatches++
            expect(got === null ? null : [...got], `${how}, unit ${uid}, offsets ${o.slice(0, 6)}`).toEqual(want === null ? null : [...want])
          }
        }
      }
      expect(seen.mismatches).toBe(0)
      // (E0: a unit through the gate whose every pair is off its own tokens, asked for no sentence: [] raw, null rebuilt. Only floats' captions
      // and the like, which are never lit by sentence; none on a running unit)
      expect(seen.e0).toBeLessThanOrEqual(2)
      expect(seen.compared).toBeGreaterThan(1000)
      expect(seen.withStarts).toBeGreaterThan(20)
      if (process.env.AXT_CUT_STATS) process.stderr.write(`LEFT ${name} ${JSON.stringify(seen)}\n`)
    }, 900_000)
  }
})
