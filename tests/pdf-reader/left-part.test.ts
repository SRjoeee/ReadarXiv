// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { partTarget } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { type Anchor, anchorUnits, boundsFromMarks, type DocToken, floatMatches, markWords, pageFrame, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftOfPart, leftReach } from '@/pdf-reader/engine/pipeline/left-part.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { displayEdges, unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { pageColumns } from '@/pdf-reader/engine/view/highlight.mjs'
import { LAB, LAB_PAPERS } from './helpers/lab-data'

// The left of a part (the page stream, E2a): the units first framed on a part's pages, placed from the units that may touch
// those pages and theirs, equal to the whole paper's anchors of those units, under the whole document's frame (pageFrame's
// rule reads every located unit: a frame of arXiv's text alone is a rule change, not this). And each page's left part made
// of the parts so far, under the whole left's columns, equal to the whole's (the far push reads the columns)

const plain = (v: unknown) => JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x))
type Options = { bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean; floatMatch?: Map<number, number[] | null> | null }

/** the whole left and the frame it was placed under; then each part's left, at the schedule `target`, and what they hold */
function compare(doc: DocToken[], units: UnitText[], o: Options, target: (a: number, N: number) => number) {
  let frame: ReturnType<typeof pageFrame> | null = null
  const whole = anchorUnits(doc, units, { ...o, frame: (d, ms) => (frame = pageFrame(d, ms)) })
  const N = doc.length ? (doc.at(-1) as DocToken).page : 0
  const reach = leftReach(doc, units, o)
  const told = new Map<number, Anchor>()
  const parts: [number, number, number][] = []
  for (let a = 1; a <= N;) {
    const b = target(a, N)
    const { anchors, read } = leftOfPart(doc, units, { ...o, frame: () => frame as ReturnType<typeof pageFrame> }, [a, b], reach)
    // the part's units: exactly the whole's whose first rectangle stands on its pages, placed as the whole places them
    const want = [...whole].filter(([, w]) => w && w.rects[0] && w.rects[0].page >= a && w.rects[0].page <= b)
    expect(plain([...anchors].sort((x, y) => x[0] - y[0])), `pages ${a}-${b}`).toBe(plain(want.sort((x, y) => x[0] - y[0])))
    for (const [id, w] of anchors) { expect(told.has(id)).toBe(false); told.set(id, w) }
    parts.push([a, b, read.length])
    a = b + 1
  }
  // every unit the whole places, in one part
  expect([...told.keys()].sort((x, y) => x - y)).toEqual([...whole].filter(([, w]) => w).map(([id]) => id).sort((x, y) => x - y))
  return { whole, parts }
}

// ---------------------------------------------------------------- a synthetic paper
type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol: boolean): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL: eol, fontName: 'f' })
const page = (lines: string[][], n: number): TextPage => ({
  page: n,
  items: lines.flatMap((words, l) => { let x = 50; return words.map((w, k) => { const it = item(w, x, 700 - l * 12, k === words.length - 1); x += w.length * 5 + 5; return it }) }),
  styles: {},
})
const PAGES = [
  page([['Intro', 'heading'], ['alpha', 'beta', 'gamma', 'delta'], ['epsilon', 'zeta', 'eta', 'theta']], 1),
  page([['iota', 'kappa', 'lambda', 'mu'], ['nu', 'xi', 'omicron', 'pi'], ['Method', 'part']], 2),
  page([['Figure', 'one', 'shows', 'the', 'curves'], ['rho', 'sigma', 'tau', 'upsilon']], 3),
  page([['phi', 'chi', 'psi', 'omega'], ['last', 'words', 'of', 'all']], 4),
]
const UNITS: UnitText[] = [
  { id: 0, text: 'Intro heading' },
  { id: 1, text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu' },
  // a caption whose float TeX set two pages on: between its neighbours it is not, over the whole document it is
  { id: 2, text: 'Figure one shows the curves' },
  { id: 3, text: 'nu xi omicron pi' },
  { id: 4, text: 'Method part' },
  { id: 5, text: 'rho sigma tau upsilon phi chi psi omega' },
  { id: 6, text: 'last words of all' },
]

describe('leftOfPart: a part\'s left is the whole left\'s, its units placed from those that may touch its pages', () => {
  const doc = tokenizeDocument(PAGES)
  const at = (t: string) => doc.findIndex(d => d.t === t)
  const bounds = new Map<string, [number, number]>([['1', [at('alpha'), at('mu')]], ['3', [at('nu'), at('pi')]], ['5', [at('rho'), at('omega')]], ['6', [at('last'), at('all')]]])
  const floating = (id: number) => id === 2

  it('at the doubling schedule and a page a part: a unit across a page, a heading between marked neighbours, a float set later', () => {
    for (const floatMatch of [null, floatMatches(doc, UNITS, floating)]) {
      for (const target of [partTarget, (a: number) => a]) {
        const { whole } = compare(doc, UNITS, { bounds, floating, floatMatch }, target)
        expect(whole.get(2)?.rects[0]?.page).toBe(3)
        expect(whole.get(1)?.rects.map(r => r.page)).toEqual([1, 1, 2])
        expect(whole.get(4)).toBeTruthy()
      }
    }
  })

  it('with no marks at all: every unit may reach every page, and the parts are the whole\'s still', () => {
    compare(doc, UNITS, {}, partTarget)
  })

  it('where each unit may reach, before any is matched: its bounds; its window between its marked neighbours; a float\'s match too', () => {
    const reach = leftReach(doc, UNITS, { bounds, floating, floatMatch: floatMatches(doc, UNITS, floating) })
    expect(reach[1]).toEqual([[at('alpha'), at('mu')]])
    // the float: its neighbours' window (the whole document at this size) and its match on page 3
    expect(reach[2]?.at(-1)).toEqual([at('figure'), at('curves')])
  })
})

// ---------------------------------------------------------------- the lab's papers (AXT_LAB): the marked compile kept beside each
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const opened = (file: string) => getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') })
/** the web's unit marks of a marked compile (marksOfDoc) */
async function unitMarksOf(file: string) {
  const task = opened(file)
  try {
    const pdf = await task.promise, pages: TextPage[] = [], marks = new Map<string, { page: number; x: number; y: number }>()
    for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items as unknown[], styles: tc.styles as Record<string, unknown> }) }
    for (const [name, d] of await pdf.getDestinations()) if (d && /^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
    return markWords(tokenizeDocument(pages), marks)
  } finally { await task.destroy() }
}

describe.skipIf(!LAB)('leftOfPart over the lab\'s papers: each part\'s left and each page\'s left part are the whole\'s', () => {
  for (const [name] of LAB_PAPERS) {
    it(name, async ({ skip }) => {
      const root = join(LAB as string, 'data/layout', name), keyFile = join(root, 'marks.key')
      const markedFile = join(root, 'compiles', `${existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : ''}.pdf`)
      // (a paper whose marked compile this machine does not keep: its unit marks are not known here)
      if (!existsSync(markedFile)) skip()
      for (const f of [join(root, 'source.gz'), join(root, 'arxiv.pdf')]) if (!existsSync(f)) throw new Error(`missing ${f}`)
      const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'source.gz'))))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const paper = openPaper(source.files)
      const texts = paper.units.map((u, i) => ({ id: i, ...unitText(u.pieces as Parameters<typeof unitText>[0]), ...displayEdges(u) }))
      const floating = (i: number) => FLOATING.has(paper.units[i]?.kind ?? '')
      const task = opened(join(root, 'arxiv.pdf'))
      let text: Awaited<ReturnType<typeof readArxivText>>
      try { text = await readArxivText(await task.promise) } finally { await task.destroy() }
      const doc = text.tokens
      const bounds = boundsFromMarks(doc, await unitMarksOf(markedFile))
      const floatMatch = floatMatches(doc, texts, floating)
      const { whole, parts } = compare(doc, texts, { bounds, floating, floatMatch }, partTarget)
      // the parts read fewer units than the paper holds where it is long enough to have several
      if (parts.length > 2) expect(Math.min(...parts.map(p => p[2]))).toBeLessThan(texts.length)
      // each page's left part, made of the parts so far under the whole left's columns, is the whole's
      let columns: ReturnType<typeof pageColumns> | null = null
      const wholeSide = leftSideOf({ doc, views: text.views as number[][], anchors: whole, edges: text.edges, columns: (v, an, k) => (columns = pageColumns(v, an, k)) })
      const so = new Map<number, Anchor | null>()
      for (const [a, b] of parts) {
        for (const [id, w] of whole) if (w && w.rects[0] && w.rects[0].page >= a && w.rects[0].page <= b) so.set(id, w)
        const side = leftSideOf({ doc, views: text.views as number[][], anchors: so, edges: text.edges, columns: () => columns as ReturnType<typeof pageColumns> })
        for (let p = a; p <= b; p++) expect(plain(side.leftPages(p)), `page ${p}`).toBe(plain(wholeSide.leftPages(p)))
      }
    }, 600_000)
  }
})
