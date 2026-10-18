// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { anchorUnits, type DocToken, floatMatches, inkEdges, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { layoutOf, pageColumns } from '@/pdf-reader/engine/view/highlight.mjs'

// arXiv's text read once (the prepare's step T, layout/arxiv.mjs): every page's text read one time, tokenized a page at a time,
// its tokens' ink edges made while its items are there, the items let go. What it gives is what the whole document's reading
// gives (tokenizeDocument and inkEdges over every page at once), so that the left and the maker share it: on the sample paper,
// read by the pinned PDF.js, and on the lab's papers where this machine has them (AXT_LAB)

type Doc = { numPages: number; getPage(n: number): Promise<{ view: number[]; getTextContent(): Promise<{ items: unknown[]; styles: Record<string, unknown> }> }> }
/** each page's text with its items, as the whole document's reading takes it */
async function wholeOf(doc: Doc): Promise<TextPage[]> {
  const pages: TextPage[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    pages.push({ page: p, items: tc.items, styles: tc.styles })
  }
  return pages
}
/** a token's fields but its item */
const fields = (t: DocToken) => ({ t: t.t, page: t.page, x: t.x, y: t.y, w: t.w, h: t.h, top: t.top, bottom: t.bottom, sym: t.sym, far: t.far })

async function sameAsWhole(bytes: Uint8Array) {
  const task = getDocument({ data: bytes, verbosity: 0 })
  try {
    const doc = (await task.promise) as unknown as Doc
    const text = await readArxivText(doc)
    const whole = tokenizeDocument(await wholeOf(doc))
    const { l, r } = inkEdges(whole)
    expect(text.pages).toBe(doc.numPages)
    expect(text.ok.every(Boolean)).toBe(true)
    expect(text.tokens.length).toBe(whole.length)
    expect(text.tokens.map(fields)).toEqual(whole.map(fields))
    expect(text.tokens.every(t => t.item === null)).toBe(true)
    expect(Array.from(text.edges.l)).toEqual(Array.from(l))
    expect(Array.from(text.edges.r)).toEqual(Array.from(r))
    const at = whole.map(t => (t.item as { transform: number[] }).transform[4])
    expect(Array.from(text.spans.x0)).toEqual(at)
    // (the item's end along its baseline: its width across for upright text, less for text set at an angle)
    const across = (tr: number[]) => { const along = Math.hypot(tr[0]!, tr[1]!); return along ? tr[0]! / along : 1 }
    expect(Array.from(text.spans.x1)).toEqual(whole.map((t, k) => (at[k] as number) + (t.item as { width: number }).width * across((t.item as { transform: number[] }).transform)))
    return { text, whole }
  } finally { await task.destroy() }
}

describe('readArxivText (step T)', () => {
  it('the sample paper: the whole document\'s tokens, each without its item, and their ink edges, bit for bit', async () => {
    const { text } = await sameAsWhole(new Uint8Array(readFileSync(new URL('../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url))))
    expect(text.tokens.length).toBeGreaterThan(1000)
    expect(text.views).toHaveLength(4)
  })

  it('a page that cannot be had has no view; one whose text cannot be read keeps its own; neither has tokens', async () => {
    const items = [{ str: 'words here', transform: [10, 0, 0, 10, 50, 700], width: 50, height: 10, hasEOL: true, fontName: 'f' }]
    const getTextContent = vi.fn(async () => ({ items, styles: {} }))
    const doc = {
      numPages: 3,
      getPage: async (n: number) => {
        if (n === 2) throw new Error('no such page')
        return { view: [0, 0, 612, 792], getTextContent: n === 3 ? async () => { throw new Error('bad text') } : getTextContent }
      },
    }
    const text = await readArxivText(doc)
    expect(text.views).toEqual([[0, 0, 612, 792], null, [0, 0, 612, 792]])
    expect(text.ok).toEqual([true, false, false])
    expect(text.tokens.map(t => [t.t, t.page])).toEqual([['words', 1], ['here', 1]])
    expect(getTextContent).toHaveBeenCalledTimes(1)
  })
})

// a synthetic paper whose last paragraph ends with a proof's box set apart at the column's edge (tokenizeDocument's `far`)
type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol: boolean, width = str.length * 5): Item => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol, fontName: 'f' })
/** a line of words from x = 50 to 300, justified */
const line = (words: string[], y: number): Item[] => {
  const gap = (250 - words.join('').length * 5) / Math.max(1, words.length - 1)
  let x = 50
  return words.map((w, k) => { const it = item(w, x, y, k === words.length - 1); x += w.length * 5 + gap; return it })
}
const PAGES: TextPage[] = [
  { page: 1, items: [...line(['one', 'two', 'three', 'four', 'five'], 700), ...line(['six', 'seven', 'eight', 'nine', 'ten'], 688), ...line(['eleven', 'twelve', 'thirteen', 'fourteen'], 676), ...line(['alpha', 'beta', 'gamma', 'delta.'], 664), item('end', 50, 640, false), item('of', 70, 640, false), item('proof', 85, 640, false), item('∎', 295, 640, true, 5)], styles: {} },
  { page: 2, items: line(['more', 'words', 'on', 'the', 'next'], 700), styles: {} },
]
const UNITS: UnitText[] = [
  { id: 0, text: 'one two three four five six seven eight nine ten' },
  { id: 1, text: 'eleven twelve thirteen fourteen alpha beta gamma delta' },
  { id: 2, text: 'end of proof' },
  { id: 3, text: 'more words on the next' },
]
const VIEWS = [[0, 0, 612, 792], [0, 0, 612, 792]]

describe('layoutOf and leftSideOf over step T\'s tokens (their items let go) and edges', () => {
  const doc = tokenizeDocument(PAGES)
  const at = (t: string) => doc.findIndex(d => d.t === t)
  const bounds = new Map<string, [number, number]>([['0', [0, at('ten')]], ['1', [at('eleven'), at('delta')]], ['2', [at('end'), at('proof')]], ['3', [at('more'), at('next')]]])
  const anchors = anchorUnits(doc, UNITS, { bounds })
  const bare = doc.map(t => ({ ...t, item: null }))
  const edges = inkEdges(doc)

  it('the proof\'s box is the far token\'s ink at its column\'s edge, by the whole document\'s columns', () => {
    const k = at('proof')
    expect(doc[k]?.far).toBe(300)
    const whole = layoutOf(doc, VIEWS, anchors) as unknown as { tok: { r: Float32Array } }
    expect(whole.tok.r[k]).toBe(300)
  })

  it('the same layout with the edges given, the tokens holding no item; the edges given are not changed', () => {
    const want = layoutOf(doc, VIEWS, anchors) as unknown as { tok: Record<string, Float32Array> }
    const r0 = Float32Array.from(edges.r)
    const got = layoutOf(bare, VIEWS, anchors, undefined, { edges }) as unknown as { tok: Record<string, Float32Array> }
    for (const f of ['l', 'r', 'y', 'h', 'top', 'bottom']) expect(Array.from(got.tok[f] as Float32Array), f).toEqual(Array.from(want.tok[f] as Float32Array))
    expect(Array.from(edges.r)).toEqual(Array.from(r0))
    // (without them, the items are what the edges are made of: a token with none has its box alone)
    const none = layoutOf(bare, VIEWS, anchors) as unknown as { tok: Record<string, Float32Array> }
    expect(Array.from(none.tok.r as Float32Array)).not.toEqual(Array.from(want.tok.r as Float32Array))
  })

  it('the columns are a rule: today\'s pageColumns by default; a page\'s far token by the whole\'s columns when given them', () => {
    const want = layoutOf(doc, VIEWS, anchors) as unknown as { tok: { r: Float32Array }; page: unknown[] }
    expect(Array.from((layoutOf(doc, VIEWS, anchors, undefined, { columns: pageColumns }) as unknown as { tok: { r: Float32Array } }).tok.r)).toEqual(Array.from(want.tok.r))
    // the proof's unit alone: its page's columns are its own line's, and the box is not at their edge
    const part = new Map([[2, anchors.get(2) ?? null]])
    const alone = layoutOf(doc, VIEWS, part) as unknown as { tok: { r: Float32Array } }
    expect(alone.tok.r[at('proof')]).not.toBe(300)
    // with the whole's columns given, the page's tokens are the whole's
    const given = layoutOf(doc, VIEWS, part, undefined, { columns: () => want.page }) as unknown as { tok: { r: Float32Array } }
    expect(Array.from(given.tok.r)).toEqual(Array.from(want.tok.r))
  })

  it('leftSideOf with the edges given, over tokens with no item: every page\'s left part the same', () => {
    const want = leftSideOf({ doc, views: VIEWS, anchors })
    const got = leftSideOf({ doc: bare, views: VIEWS, anchors, edges })
    expect(got.units).toEqual(want.units)
    for (const p of [1, 2]) expect(got.leftPages(p), String(p)).toEqual(want.leftPages(p))
  })

  it('floatMatches over step T\'s tokens is floatMatches over the whole reading\'s', () => {
    const floating = (id: number) => id === 2
    expect(floatMatches(bare, UNITS, floating)).toEqual(floatMatches(doc, UNITS, floating))
  })
})

// the lab's arXiv PDFs (AXT_LAB=<a lab/pdf directory with data/>): data/layout/<id>/arxiv.pdf
const LAB = process.env.AXT_LAB
const labPapers = LAB && existsSync(join(LAB, 'data/layout')) ? readdirSync(join(LAB, 'data/layout')).filter(id => existsSync(join(LAB, 'data/layout', id, 'arxiv.pdf'))) : []
describe.skipIf(!labPapers.length)('readArxivText over the lab\'s arXiv PDFs', () => {
  for (const id of labPapers) it(id, async () => { await sameAsWhole(new Uint8Array(readFileSync(join(LAB as string, 'data/layout', id, 'arxiv.pdf')))) }, 120_000)
})
