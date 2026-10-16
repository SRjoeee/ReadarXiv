// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { partTarget } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { type Anchor, anchorUnits, boundsFromMarks, type DocToken, floatMatches, frameOfTokens, lineRects, markWords, pageFrame, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftOfPart, leftReach } from '@/pdf-reader/engine/pipeline/left-part.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { displayEdges, unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { columnsOfTokens, layoutOf, pageColumns } from '@/pdf-reader/engine/view/highlight.mjs'
import { LAB, LAB_PAPERS } from './helpers/lab-data'

// The page stream's rules 1 and 4 (E2b §0.1, stage 2), each a rule of arXiv's text alone, made at step T before any unit is
// located, in place of a rule of the located units' words or lines: the pages' frame (anchors.mjs frameOfTokens, beside
// pageFrame) and the pages' columns the far push reads (highlight.mjs columnsOfTokens, beside pageColumns). What each depends
// on, exactly: every page's tokens (and, for the columns, the pages' views) and nothing else — not the units, the marks or the
// anchors. Neither is local to a prefix of the pages (the frame's and the edges' votes are the whole text's, as today's are): both
// are final once arXiv's text is read, before the page pass, which is what lets a part's left be made from its own units alone

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, o: { size?: number; width?: number; eol?: boolean } = {}): Item => {
  const size = o.size ?? 10
  return { str, transform: [size, 0, 0, size, x, y], width: o.width ?? str.length * size * 0.5, height: size, hasEOL: o.eol ?? false, fontName: 'f' }
}
/** a justified line of words from x0 to x1, one item a word */
const line = (words: string[], y: number, x0 = 72, x1 = 540): Item[] => {
  const len = words.reduce((a, w) => a + w.length * 5, 0), gap = (x1 - x0 - len) / Math.max(1, words.length - 1)
  let x = x0
  return words.map((w, k) => { const it = item(w, x, y, { eol: k === words.length - 1 }); x += w.length * 5 + gap; return it })
}
/** distinct words: the n-th word of the paper */
const word = (n: number) => `w${String.fromCharCode(97 + (n % 26))}${String.fromCharCode(97 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (Math.floor(n / 676) % 26))}`
const plain = (v: unknown) => JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x))
const VIEW = [0, 0, 612, 792]

/**
 * A paper of `pages` pages: a running head (the same words at one baseline) from page 2 on, a page number at the foot, a line's
 * number in the left margin beside each line of text, arXiv's stamp on page 1 (20 units, at the margin), and ten lines of the
 * text's own words a page, a word's space less than its size (one column from 72 to 540, or two: 72 to 300 and 312 to 540)
 */
function paper(pages: number, { two = false } = {}) {
  let n = 0
  const out: TextPage[] = []
  for (let p = 1; p <= pages; p++) {
    const items: Item[] = []
    if (p > 1) items.push(...line(['A', 'Study', 'of', 'Things'], 760, 250, 362).map(it => ({ ...it, transform: [9, 0, 0, 9, it.transform[4] as number, 760], height: 9 })))
    if (p === 1) items.push(item('arXiv:2601.00001v1 [cs.CL] 1 Jan 2026', 14, 300, { size: 20, width: 30 }))
    for (const [x0, x1] of two ? [[72, 300], [312, 540]] : [[72, 540]]) {
      for (let l = 0; l < 10; l++) {
        if (x0 === 72) items.push(item(String(l + 1), 40, 700 - 12 * l, { size: 7 }))
        items.push(...line(Array.from({ length: two ? 9 : 19 }, () => word(n++)), 700 - 12 * l, x0, x1))
      }
    }
    items.push(item(String(p), 300, 40))
    out.push({ page: p, items, styles: {} })
  }
  return tokenizeDocument(out)
}
/** the text's own tokens: the words of the lines of text (not the head, the numbers or the stamp) */
const textOf = (doc: DocToken[]) => doc.flatMap((t, k) => (/^w[a-z]{3}$/.test(t.t) ? [k] : []))

describe('frameOfTokens: the pages\' frame from the tokens alone (rule 1)', () => {
  const doc = paper(4)

  it('the text\'s words are inside; the running head, the page numbers, the lines\' numbers and arXiv\'s stamp are not', () => {
    const inFrame = frameOfTokens(doc)
    const text = new Set(textOf(doc))
    for (const k of text) expect(inFrame(doc[k] as DocToken), doc[k]?.t).toBe(true)
    const out = doc.filter((_, k) => !text.has(k))
    expect(out.length).toBeGreaterThan(0)
    for (const t of out) expect(inFrame(t), `${t.t} p${t.page} at ${t.x}, ${t.y}`).toBe(false)
  })

  it('is pageFrame\'s arithmetic over the body words: the verdicts pageFrame gives when the units\' words are the text\'s', () => {
    const want = pageFrame(doc, [textOf(doc)]), got = frameOfTokens(doc)
    expect(doc.map(got)).toEqual(doc.map(want))
  })

  it('depends on the tokens alone: the same verdicts again, over the tokens without their items, whatever is placed under it', () => {
    const verdicts = doc.map(frameOfTokens(doc))
    expect(doc.map(frameOfTokens(doc))).toEqual(verdicts)
    const bare = doc.map(t => ({ ...t, item: null }))
    expect(bare.map(frameOfTokens(bare))).toEqual(verdicts)
    // as placeUnits' rule it is asked of the units' words and reads none of them
    const inFrame = frameOfTokens(doc)
    const units: UnitText[] = [{ id: 0, text: textOf(doc).slice(0, 8).map(k => doc[k]?.t).join(' ') }]
    let asked = 0
    anchorUnits(doc, units, { frame: () => { asked++; return inFrame } })
    expect(asked).toBe(1)
  })

  it('is the whole text\'s, not a prefix\'s: on the first two pages alone the running head is seen once, and is no head', () => {
    const two = doc.filter(t => t.page <= 2)
    const head = two.findIndex(t => t.t === 'study')
    expect(frameOfTokens(doc)(two[head] as DocToken)).toBe(false)
    expect(frameOfTokens(two)(two[head] as DocToken)).toBe(true)
  })

  it('a line whose words recur at its baseline on another page is a head; the same words at another baseline are text', () => {
    const of = (ys: number[]) => {
      const pages: TextPage[] = [1, 2, 3].map(p => ({ page: p, items: [...(ys[p - 1] ? line(['Notes', 'on', 'Things'], ys[p - 1] as number, 250, 362) : []), ...Array.from({ length: 10 }, (_, l) => line(Array.from({ length: 8 }, (_, i) => word(100 * p + 8 * l + i)), 700 - 12 * l)).flat()], styles: {} }))
      const d = tokenizeDocument(pages), inFrame = frameOfTokens(d)
      return d.filter(t => t.t === 'notes').map(inFrame)
    }
    expect(of([750, 740, 0])).toEqual([true, true])
    expect(of([750, 750, 0])).toEqual([false, false])
  })

  it('no tokens, or no body word: everything is inside', () => {
    expect(frameOfTokens([])({ t: 'x', page: 1, x: 0, y: 0, w: 1, h: 1, top: 1, bottom: 0 })).toBe(true)
    const digits = tokenizeDocument([{ page: 1, items: [item('12', 300, 40), item('13', 300, 700)], styles: {} }])
    expect(digits.map(frameOfTokens(digits)).every(Boolean)).toBe(true)
  })
})

describe('columnsOfTokens: the pages\' columns from the tokens alone (rule 4)', () => {
  const views = [VIEW, VIEW, VIEW, VIEW]

  it('two columns where the text has two, their text edges the text\'s; the same structure as pageColumns\'', () => {
    const doc = paper(4, { two: true })
    const cols = columnsOfTokens(doc, views) as { two: boolean; cols: Record<string, { x0: number; x1: number }> }[]
    // the units' lines, one unit a column a page: today's rule over the same lines
    const anchors = new Map<number, Anchor | null>()
    const text = textOf(doc)
    for (let p = 1; p <= 4; p++) for (const half of [0, 1]) {
      const ks = text.filter(k => (doc[k] as DocToken).page === p && ((doc[k] as DocToken).x < 306) === (half === 0))
      anchors.set(anchors.size, { tokens: ks, rects: lineRects(doc, ks), coverage: 1, bounded: true })
    }
    const today = pageColumns(views, anchors) as typeof cols
    expect(cols).toHaveLength(5)
    expect(cols[0]).toBeNull()
    for (let p = 1; p <= 4; p++) {
      const P = cols[p] as (typeof cols)[number], T = today[p] as (typeof cols)[number]
      expect(Object.keys(P).sort()).toEqual(Object.keys(T).sort())
      expect(P.two).toBe(true)
      expect(plain(P.cols)).toBe(plain(T.cols))
      expect(P.cols.L?.x0).toBeCloseTo(72)
      expect(P.cols.R?.x1).toBeCloseTo(540)
    }
  })

  it('depends on the tokens and the views alone: the same again, over the tokens without their items', () => {
    const doc = paper(4)
    const want = plain(columnsOfTokens(doc, views))
    expect(plain(columnsOfTokens(doc, views))).toBe(want)
    expect(plain(columnsOfTokens(doc.map(t => ({ ...t, item: null })), views))).toBe(want)
    // the frame given is the one read: with no token inside, no line, and no edge
    const none = columnsOfTokens(doc, views, () => false) as { x0: number }[]
    expect(Number.isFinite((none[1] as { x0: number }).x0)).toBe(false)
    expect(((columnsOfTokens(doc, views) as { x0: number }[])[1] as { x0: number }).x0).toBeCloseTo(72)
  })

  it('as layoutOf\'s rule it reads the far push alone: the layout\'s columns stay the document part\'s', () => {
    const doc = paper(2)
    const text = textOf(doc)
    const anchors = new Map<number, Anchor | null>([[0, { tokens: text.slice(0, 20), rects: lineRects(doc, text.slice(0, 20)), coverage: 1, bounded: true }]])
    const want = layoutOf(doc, [VIEW, VIEW], anchors) as unknown as { page: unknown[] }
    const got = layoutOf(doc, [VIEW, VIEW], anchors, undefined, { columns: () => columnsOfTokens(doc, [VIEW, VIEW]) }) as unknown as { page: unknown[] }
    expect(plain(got.page)).toBe(plain(want.page))
  })
})

// ---------------------------------------------------------------- the shapes the text's lines failed on (the corpus, 2026-10-17)
// Each a page the first rule 4 (every line of the tokens in the frame) read wrongly, drawn on the 124 papers' pages: its far push
// at a column edge that is no text's. The text's lines are now cut at a space wider than the taller token and kept with four body
// words that are 60 % of their tokens, and a page's columns are a vote
/** cells at given places on a baseline: [text, x] */
const cells = (y: number, cs: [string, number][], size = 10): Item[] => cs.map(([t, x], k) => item(t, x, y, { size, eol: k === cs.length - 1 }))
/** n lines of prose from y down, 12 apart, each from x0 to x1, a word's space less than its size: words no other line has */
let fresh = 20_000
const prose = (y: number, n: number, x0: number, x1: number, words = 19): Item[] => {
  const out: Item[] = []
  for (let l = 0; l < n; l++) out.push(...line(Array.from({ length: words }, () => word(fresh++)), y - 12 * l, x0, x1))
  return out
}
const docOf = (pages: Item[][]) => tokenizeDocument(pages.map((items, i) => ({ page: i + 1, items, styles: {} })))
/** the far push a token gets under the text's columns (layoutOf, no unit placed) */
const pushedR = (doc: DocToken[], views: number[][], k: number) => (layoutOf(doc, views, new Map(), undefined, { columns: () => columnsOfTokens(doc, views) }) as unknown as { tok: { r: Float32Array } }).tok.r[k]
type Page = { two: boolean; cols: Record<string, { x0: number; x1: number }> }

describe('columnsOfTokens on the shapes the plain text lines failed on', () => {
  it('text past the column\'s edge, broken by wide spaces (a figure\'s clipped text), does not make the edge', () => {
    // two columns, the text to 540 on the right; on page 5, 12 lines read 24 past it, 8 of them broken by a formula's space
    const pages = [1, 2, 3, 4, 5, 6].map(p => {
      const items = [...prose(700, 30, 72, 300, 9)]
      if (p !== 5) items.push(...prose(700, 30, 312, 540, 9))
      else {
        items.push(...prose(700, 18, 312, 540, 9))
        for (let l = 0; l < 12; l++) {
          const y = 484 - 12 * l, ws = Array.from({ length: 9 }, () => word(fresh++))
          items.push(...(l < 8 ? [...line(ws.slice(0, 7), y, 312, 470), ...line(ws.slice(7), y, 520, 564)] : line(ws, y, 312, 564)))
        }
      }
      // a proof's box at the right column's edge, set apart after a line's last word
      if (p === 3) items.push(item('end', 312, 330), item('∎', 535, 330, { width: 5, eol: true }))
      return items
    })
    const doc = docOf(pages), views = pages.map(() => VIEW)
    const cols = columnsOfTokens(doc, views) as (Page | null)[]
    expect((cols[3] as Page).two).toBe(true)
    expect((cols[3] as Page).cols.R?.x1).toBeCloseTo(540)
    expect((cols[5] as Page).cols.R?.x1).toBeCloseTo(540)
    const k = doc.findIndex(t => t.t === 'end')
    expect(doc[k]?.far).toBe(540)
    expect(pushedR(doc, views, k)).toBe(540)
  })

  it('a page of tables alone: its rows of numbers do not make the text\'s edge', () => {
    // one column, the text to 540; page 2 all table (80 rows, the number column to 520), page 4 three lines of text and a box
    const rows: Item[] = []
    for (let r = 0; r < 80; r++) rows.push(...cells(760 - 9 * r, [['total', 72], ['12.5', 300], ['34.5', 400], ['56.5', 500]]))
    const pages = [prose(700, 30, 72, 540), rows, prose(700, 30, 72, 540), [...prose(700, 3, 72, 540), item('end', 72, 640), item('∎', 535, 640, { width: 5, eol: true })]]
    const doc = docOf(pages), views = pages.map(() => VIEW)
    const cols = columnsOfTokens(doc, views) as (Page | null)[]
    expect((cols[4] as Page).cols.F?.x1).toBeCloseTo(540)
    const k = doc.findIndex(t => t.t === 'end')
    expect(doc[k]?.far).toBe(540)
    expect(pushedR(doc, views, k)).toBe(540)
  })

  it('two tables side by side on a page of one column are no two columns', () => {
    // one column; page 2 three lines of text across, then a table in each half of the page, its number column to 295; in one row
    // of the left one a shorter number and a mark set apart at that column's end
    const tables: Item[] = []
    for (let r = 0; r < 20; r++) tables.push(...cells(640 - 12 * r, r === 5 ? [['method', 72], ['12.5', 200], ['3', 260]] : [['method', 72], ['12.5', 200], ['34.5', 275]]), ...(r === 5 ? [item('†', 290, 640 - 12 * r, { width: 5 })] : []))
    for (let r = 0; r < 20; r++) tables.push(...cells(640 - 12 * r, [['model', 320], ['56.5', 450], ['78.5', 520]]))
    const pages = [prose(700, 30, 72, 540), [...prose(700, 3, 72, 540), ...tables], prose(700, 30, 72, 540)]
    const doc = docOf(pages), views = pages.map(() => VIEW)
    const cols = columnsOfTokens(doc, views) as (Page | null)[]
    expect((cols[2] as Page).two).toBe(false)
    const k = doc.findIndex(t => t.far === 295)
    expect(k).toBeGreaterThanOrEqual(0)
    expect(pushedR(doc, views, k)).not.toBe(295)
  })

  it('a page of displays, their rows in each half, is no two columns', () => {
    // one column; page 2 four lines of text across, then six rows of a display in each half, 185 across (single letters and
    // digits, as a display's symbols read: half of them letters), one of the left's shorter, its full stop set apart at the end
    const display: Item[] = []
    const glyphs = 'a1b2c3d4e5f6g7h8'
    const row = (y: number, x0: number, n = 16) => [...glyphs.slice(0, n)].map((t, i) => item(t, x0 + 12 * i, y))
    for (let r = 0; r < 6; r++) display.push(...(r === 2 ? [...row(640 - 12 * r, 100, 12), item('.', 280, 640 - 12 * r, { width: 5 })] : row(640 - 12 * r, 100)))
    for (let r = 0; r < 6; r++) display.push(...row(640 - 12 * r, 340))
    const pages = [prose(700, 30, 72, 540), [...prose(700, 4, 72, 540), ...display], prose(700, 30, 72, 540)]
    const doc = docOf(pages), views = pages.map(() => VIEW)
    const cols = columnsOfTokens(doc, views) as (Page | null)[]
    expect((cols[2] as Page).two).toBe(false)
    const k = doc.findIndex(t => t.far === 285)
    expect(k).toBeGreaterThanOrEqual(0)
    expect(pushedR(doc, views, k)).not.toBe(285)
  })
})

// ---------------------------------------------------------------- what the two rules buy: a part's left from its own units
/** a paper whose units are its paragraphs (two a page, the second running onto the next page), each bounded, with a proof's
 *  box set apart at the column's edge after each page's last paragraph's last word */
function bounded(pages: number) {
  const out: TextPage[] = []
  let n = 0
  const units: UnitText[] = [], marks: [number, number][] = []
  const words: string[] = []
  for (let p = 1; p <= pages; p++) {
    const items: Item[] = []
    if (p > 1) items.push(...line(['A', 'Study', 'of', 'Things'], 760, 250, 362))
    for (let l = 0; l < 10; l++) {
      const ws = Array.from({ length: 19 }, () => word(n++))
      words.push(...ws)
      items.push(...line(ws, 700 - 12 * l))
    }
    // the last line's last word, and a box set apart at the column's edge
    items.push(item('end', 72, 560), item('∎', 535, 560, { width: 5 }))
    words.push('end')
    items.push(item(String(p), 300, 40))
    out.push({ page: p, items, styles: {} })
  }
  const doc = tokenizeDocument(out)
  // units of 30 words, the last one's tail onto the next page
  const live = doc.flatMap((t, k) => (/^w[a-z]{3}$|^end$/.test(t.t) ? [k] : []))
  for (let i = 0; i * 30 < live.length; i++) {
    const ks = live.slice(30 * i, 30 * i + 30)
    units.push({ id: i, text: ks.map(k => (doc[k] as DocToken).t).join(' ') })
    marks.push([ks[0] as number, ks.at(-1) as number])
  }
  return { doc, units, bounds: new Map(marks.map(([a, b], i) => [String(i), [a, b] as [number, number]])) }
}

describe('a part\'s left under the two rules is the whole\'s, from the part\'s own units and nothing of the others\'', () => {
  const { doc, units, bounds } = bounded(5)
  const views = Array.from({ length: 5 }, () => VIEW)
  const inFrame = frameOfTokens(doc)
  const frame = () => inFrame
  const whole = anchorUnits(doc, units, { bounds, frame })

  it('rule 1: each part\'s anchors (leftOfPart under the token frame) are the whole\'s, no frame of the whole\'s placed units given', () => {
    const reach = leftReach(doc, units, { bounds })
    const told = new Map<number, Anchor>()
    for (const [a, b] of [[1, 1], [2, 3], [4, 5]] as [number, number][]) {
      const { anchors } = leftOfPart(doc, units, { bounds, frame }, [a, b], reach)
      const want = [...whole].filter(([, w]) => { const first = w?.rects[0]?.page; return first !== undefined && first >= a && first <= b })
      expect(plain([...anchors].sort((x, y) => x[0] - y[0])), `pages ${a}-${b}`).toBe(plain(want.sort((x, y) => x[0] - y[0])))
      for (const [id, w] of anchors) told.set(id, w)
    }
    expect([...told.keys()].sort((x, y) => x - y)).toEqual([...whole].filter(([, w]) => w).map(([id]) => id).sort((x, y) => x - y))
  })

  it('rule 4: a part\'s unit alone has the far push the whole has under the token columns; today\'s columns are its own line\'s', () => {
    const k = doc.findIndex(t => t.t === 'end')
    expect(doc[k]?.far).toBe(540)
    const alone = new Map<number, Anchor | null>([[0, { tokens: [k], rects: lineRects(doc, [k]), coverage: 1, bounded: true }]])
    const r = (o: Parameters<typeof layoutOf>[4]) => (layoutOf(doc, views, alone, undefined, o) as unknown as { tok: { r: Float32Array } }).tok.r[k]
    expect(r({})).not.toBe(540)
    expect(r({ columns: () => columnsOfTokens(doc, views) })).toBe(540)
    expect((layoutOf(doc, views, whole) as unknown as { tok: { r: Float32Array } }).tok.r[k]).toBe(540)
  })

  it('rule 4: each page\'s left part, made of the parts so far under the token columns, is the whole\'s, no whole left\'s columns given', () => {
    const cols = columnsOfTokens(doc, views)
    const columns = () => cols
    const wholeSide = leftSideOf({ doc, views, anchors: whole, columns })
    const so = new Map<number, Anchor | null>()
    for (let p = 1; p <= 5; p++) {
      for (const [id, w] of whole) if (w && w.rects[0]?.page === p) so.set(id, w)
      const side = leftSideOf({ doc, views, anchors: so, columns })
      expect(side.leftPages(p), `page ${p}`).not.toBeNull()
      expect(plain(side.leftPages(p)), `page ${p}`).toBe(plain(wholeSide.leftPages(p)))
    }
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

describe.skipIf(!LAB)('the lab\'s papers under the two rules: deterministic, of today\'s shape, and each part\'s left the whole\'s from its own units', () => {
  for (const [name] of LAB_PAPERS) {
    it(name, async ({ skip }) => {
      const root = join(LAB as string, 'data/layout', name), keyFile = join(root, 'marks.key')
      const markedFile = join(root, 'compiles', `${existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : ''}.pdf`)
      // (a paper whose marked compile this machine does not keep: its unit marks are not known here)
      if (!existsSync(markedFile)) skip()
      const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'source.gz'))))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const paper = openPaper(source.files)
      const texts = paper.units.map((u, i) => ({ id: i, ...unitText(u.pieces as Parameters<typeof unitText>[0]), ...displayEdges(u) }))
      const floating = (i: number) => FLOATING.has(paper.units[i]?.kind ?? '')
      const task = opened(join(root, 'arxiv.pdf'))
      let text: Awaited<ReturnType<typeof readArxivText>>
      try { text = await readArxivText(await task.promise) } finally { await task.destroy() }
      const doc = text.tokens, views = text.views as number[][]
      const bounds = boundsFromMarks(doc, await unitMarksOf(markedFile))
      const floatMatch = floatMatches(doc, texts, floating)
      const o = { bounds, floating, floatMatch }
      // rule 1: a verdict a token, the same twice, and a frame no unit placed reads
      const F = frameOfTokens(doc)
      const verdicts = doc.map(F)
      expect(verdicts.every(v => typeof v === 'boolean')).toBe(true)
      expect(doc.map(frameOfTokens(doc))).toEqual(verdicts)
      const frame = () => F
      const whole = anchorUnits(doc, texts, { ...o, frame })
      const today = anchorUnits(doc, texts, o)
      expect([...whole.keys()]).toEqual([...today.keys()])
      // rule 4: today's structure, page for page, the same twice
      const C = columnsOfTokens(doc, views)
      const T = pageColumns(views, today, i => paper.units[i]?.kind)
      expect(C.length).toBe(T.length)
      for (let p = 1; p < C.length; p++) expect(Object.keys(C[p] as object).sort(), `page ${p}`).toEqual(Object.keys(T[p] as object).sort())
      expect(plain(columnsOfTokens(doc, views))).toBe(plain(C))
      // each part's left (leftOfPart at the doubling schedule) the whole's, under the token frame alone; each page's left part,
      // of the parts so far, the whole's under the token columns alone
      const columns = () => C
      const reach = leftReach(doc, texts, o)
      const wholeSide = leftSideOf({ doc, views, anchors: whole, edges: text.edges, columns })
      const N = text.pages, so = new Map<number, Anchor | null>()
      for (let a = 1; a <= N;) {
        const b = partTarget(a, N)
        const { anchors } = leftOfPart(doc, texts, { ...o, frame }, [a, b], reach)
        const want = [...whole].filter(([, w]) => { const first = w?.rects[0]?.page; return first !== undefined && first >= a && first <= b })
        expect(plain([...anchors].sort((x, y) => x[0] - y[0])), `pages ${a}-${b}`).toBe(plain(want.sort((x, y) => x[0] - y[0])))
        for (const [id, w] of anchors) so.set(id, w)
        const side = leftSideOf({ doc, views, anchors: so, edges: text.edges, columns })
        for (let p = a; p <= b; p++) expect(plain(side.leftPages(p)), `page ${p}`).toBe(plain(wholeSide.leftPages(p)))
        a = b + 1
      }
      if (process.env.AXT_RULE_STATS) {
        const P = pageFrame(doc, [...today.values()].map(x => x?.tokens ?? null))
        const changed = [...whole].filter(([id, w]) => plain(w?.rects ?? null) !== plain(today.get(id)?.rects ?? null)).length
        process.stderr.write(`RULES ${name} ${JSON.stringify({ tokens: doc.length, frameFlips: doc.filter(t => P(t) !== F(t)).length, unitsMoved: changed, units: whole.size })}\n`)
      }
    }, 600_000)
  }
})
