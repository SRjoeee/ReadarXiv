import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/latex-front.mjs'
import { encodeLayout, type LayoutFile, PH_FLAG, parseLayout, UNIT_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { OPS_CAP } from '@/pdf-reader/engine/layout/ink.mjs'
import { CARRY_MIN, fontName, type LayoutStats, makeLayout, OPS_MS, OPS_PAPER_MS } from '@/pdf-reader/engine/layout/make.mjs'
import { encodeLayoutMarks, layoutMarksOf, type MarkClass, parseLayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'

// The layout maker over a fake PDF.js document of arXiv's PDF and a marks file made, as the run makes it, from a fake
// marked original: each run of text is a text item and the glyphs of an operator list alike, every character half an em
// wide, so that a word's place in the text layer is its glyphs' place

const CH = 0.5
type Run = { s: string; x: number; y: number; size?: number; font?: string; w?: number }
type Page = { runs: Run[]; boxes?: number[][]; view?: number[]; ops?: 'never' | 'fails' | 'capped' }
type Mark = [name: string, page: number, x: number, y: number]
type World = { pages: Page[]; marked?: Page[]; marks: Mark[]; units: SourceUnit[]; movers?: MarkClass[] }

const FONTS: Record<string, unknown> = {
  F1: { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false },
  F2: { name: `ABCDEF+Ä${'x'.repeat(300)}`, fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false },
}
const STYLES = { F1: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' }, F2: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' } }
const size = (r: Run) => r.size ?? 10
const adv = (r: Run) => (r.w ?? CH) * size(r)
/** where a run's character j begins, and where the run ends */
const xAt = (r: Run, j: number) => r.x + j * adv(r)
const endOf = (r: Run) => xAt(r, r.s.length)
const item = (r: Run) => ({ str: r.s, dir: 'ltr', transform: [size(r), 0, 0, size(r), r.x, r.y], width: r.s.length * adv(r), height: size(r), fontName: r.font ?? 'F1', hasEOL: false })
function opsOf(p: Page) {
  const ops: [number, unknown[]][] = []
  for (const r of p.runs) {
    const glyphs = [...r.s].map(c => ({ unicode: c, width: (r.w ?? CH) * 1000, isSpace: c === ' ', fontChar: c, vmetric: null }))
    ops.push([OPS.beginText, []], [OPS.setFont, [r.font ?? 'F1', size(r)]], [OPS.setTextMatrix, [[1, 0, 0, 1, r.x, r.y]]], [OPS.showText, [glyphs]], [OPS.endText, []])
  }
  for (const b of p.boxes ?? []) ops.push([OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from(b)]])
  if (p.ops === 'capped') while (ops.length <= OPS_CAP) ops.push([OPS.save, []])
  return { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }
}
const commonObjs = { get: (id: string) => FONTS[id] ?? null }
function arxivOf(pages: Page[], asked: number[] = []) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => {
      const p = pages[n - 1] as Page
      return {
        view: p.view ?? [0, 0, 612, 792], rotate: 0, commonObjs,
        getTextContent: async () => ({ items: p.runs.map(item), styles: STYLES }),
        getOperatorList: () => {
          asked.push(n)
          return p.ops === 'never' ? new Promise(() => {}) : p.ops === 'fails' ? Promise.reject(new Error('broken page')) : Promise.resolve(opsOf(p))
        },
      }
    },
  }
}
function markedOf(pages: Page[], marks: Mark[]) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => { const p = pages[n - 1] as Page; return { view: p.view ?? [0, 0, 612, 792], getTextContent: async () => ({ items: p.runs.map(item), styles: STYLES }) } },
    getDestinations: async () => new Map(marks.map(([name, page, x, y]) => [`axt-${name}`, [{ num: 100 + page, gen: 0 }, { name: 'FitR' }, x, y, null]])),
    getPageIndex: async (ref: { num: number }) => ref.num - 101,
  }
}
async function marksOf(w: World, log = '') {
  return parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(markedOf(w.marked ?? w.pages, w.marks), log, { engine: 'pdflatex', movesPunctuation: w.movers ?? [] }))))
}
const make = async (w: World, log = '', asked: number[] = []) => makeLayout({ units: w.units, marks: await marksOf(w, log), arxiv: arxivOf(w.pages, asked), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
/** a made file: it parses, and made again it is the same bytes */
async function made(w: World, log = ''): Promise<{ file: LayoutFile; stats: LayoutStats }> {
  const one = await make(w, log), two = await make(w, log)
  if (!('file' in one) || !('file' in two)) throw new Error(`refused: ${JSON.stringify('refused' in one ? one : two)}`)
  const text = encodeLayout(one.file)
  expect(encodeLayout(two.file)).toBe(text)
  expect(parseLayout(new TextEncoder().encode(text))).toEqual(one.file)
  for (const [, rows] of one.file.erase) expect(rows.length).toBeGreaterThan(0)
  return one
}

const text = (s: string) => ({ t: 'text', s })
const ph = (src: string) => ({ t: 'ph', src })
const unit = (kind: string, pieces: unknown[], more: Partial<SourceUnit> & { front?: boolean } = {}): SourceUnit => ({ kind, pieces, ...more })
const words = (from: number, n: number) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ')
const rowsOf = (f: LayoutFile, id: number, kind: 'lines' | 'frames' | 'erase') => { const e = f[kind].find(([u]) => u === id); if (!e) throw new Error(`no ${kind} for ${id}`); return e[1] }
const chunk = (rows: number[], n: number) => Array.from({ length: rows.length / n }, (_, i) => rows.slice(i * n, i * n + n))
const phOf = (f: LayoutFile, id: number, k: number) => { const r = f.ph.find(p => p[0] === id && p[1] === k); if (!r) throw new Error(`no ph ${id}.${k}`); return r }
const COLS2 = (page: number): Mark => [`c2-${page}`, page, 0, 0]
/** a paragraph with a numbered display between its lines */
const DISPLAY: World = {
  pages: [{ runs: [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b', x: 150, y: 680 }, { s: '(1)', x: 252, y: 680 }, { s: words(10, 10), x: 72, y: 660 }, { s: words(20, 10), x: 72, y: 648 }] }],
  marks: [['0s', 1, 72, 700], ['0e', 1, 267, 648], ['p0.1a', 1, 217, 700]],
  units: [unit('para', [text(`${words(0, 10)} `), ph('\\begin{equation}a=b\\end{equation}'), text(` ${words(10, 20)}`)])],
}

afterEach(() => { vi.useRealTimers() })

describe('makeLayout', () => {
  it('a paragraph on two columns is two frames, the second with its share', async () => {
    const left = Array.from({ length: 4 }, (_, j): Run => ({ s: words(10 * j, 10), x: 60, y: 700 - 12 * j }))
    const right = Array.from({ length: 6 }, (_, j): Run => ({ s: words(40 + 10 * j, 10), x: 320, y: 700 - 12 * j }))
    const runs = [...left, ...right], last = right.at(-1) as Run
    const { file } = await made({ pages: [{ runs }], marks: [COLS2(1), ['0s', 1, 60, 700], ['0e', 1, endOf(last), last.y]], units: [unit('para', [text(words(0, 100))])] })
    // below: from each frame's last line's bottom to the page's foot (nothing is under either)
    const b0 = 664 - 2.5 - 36, b1 = 640 - 2.5 - 36
    expect(chunk(rowsOf(file, 0, 'frames'), 6)).toEqual([[1, 0, 0, 4, -1, b0], [1, 1, 4, 6, 400, b1]])
    // each line: its page, its extent, the baseline its glyphs share, their top and bottom, size and font
    const lines = chunk(rowsOf(file, 0, 'lines'), 8)
    expect(lines).toHaveLength(10)
    expect(lines[0]).toEqual([1, 60, endOf(left[0] as Run), 700, 707.5, 697.5, 10, 0])
    expect(lines[4]).toEqual([1, 320, endOf(right[0] as Run), 700, 707.5, 697.5, 10, 0])
    expect(file.fonts).toEqual(['ABCDEF+CMR10'])
    expect(file.units).toEqual([[0, 0, 9, 0, 1]])
  })

  it("below is the gap to the next glyph or graphic in the frame's width, else to the foot", async () => {
    const a = [0, 1, 2].map((j): Run => ({ s: words(10 * j, 10), x: 72, y: 700 - 12 * j }))
    const b: Run = { s: words(30, 10), x: 72, y: 640 }
    // page 2: a narrow unit, a glyph below it outside its width
    const c: Run = { s: 'alpha beta gamma', x: 72, y: 700 }, aside: Run = { s: 'elsewhere', x: 400, y: 600 }
    const { file } = await made({
      pages: [{ runs: [...a, b], boxes: [[100, 500, 300, 520]] }, { runs: [c, aside] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(a[2] as Run), 676], ['1s', 1, 72, 640], ['1e', 1, endOf(b), 640], ['2s', 2, 72, 700], ['2e', 2, endOf(c), 700], ['3s', 2, 400, 600], ['3e', 2, endOf(aside), 600]],
      units: [unit('para', [text(words(0, 30))]), unit('para', [text(words(30, 10))]), unit('para', [text('alpha beta gamma')]), unit('para', [text('elsewhere')])],
    })
    // unit 0: down to unit 1's tops (640 + 7.5); unit 1: down to the box's top (520); unit 2: the glyph aside is not
    // in its width, so down to the page's foot
    expect(rowsOf(file, 0, 'frames')[5]).toBe(673.5 - 647.5)
    expect(rowsOf(file, 1, 'frames')[5]).toBe(637.5 - 520)
    expect(rowsOf(file, 2, 'frames')[5]).toBe(697.5 - 36)
  })

  it("a placeholder's ink is the glyphs between its marks, scripts included, split per line", async () => {
    const runs: Run[] = [
      { s: 'alpha beta', x: 72, y: 700 }, { s: 'x', x: 127, y: 700 }, { s: '2', x: 132, y: 703.5, size: 7 },
      { s: 'gamma delta epsilon zeta', x: 140, y: 700 }, { s: 'a+', x: 265, y: 700 },
      { s: 'b', x: 72, y: 688 }, { s: 'eta theta iota kappa', x: 82, y: 688 },
    ]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 182, 688], ['p0.1a', 1, 122, 700], ['p0.1b', 1, 135.5, 700], ['p0.3a', 1, 260, 700], ['p0.3b', 1, 77, 688]],
      units: [unit('para', [text('alpha beta '), ph('$x^2$'), text(' gamma delta epsilon zeta '), ph('$a+b$'), text(' eta theta iota kappa')])],
    })
    // the formula's x and its raised 2 (size 7, 3.5 above): one segment
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 127, 700, 135.5, 703.5 + 5.25, 697.5])
    // a formula across a line's end: a segment a line
    expect(phOf(file, 0, 3)).toEqual([0, 3, 0, 0, 1, 265, 700, 275, 707.5, 697.5, 1, 72, 688, 77, 695.5, 685.5])
    expect(stats.ph).toMatchObject({ marked: 2, found: 2, empty: 0, lost: 0, byKind: { math: [2, 2] } })
  })

  it("a macro's ink runs to the next word's first glyph", async () => {
    const runs: Run[] = [{ s: 'we use', x: 72, y: 700 }, { s: 'BERT', x: 107, y: 700 }, { s: 'models for text', x: 132, y: 700 }, { s: 'and BERT. Then more', x: 72, y: 688 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 688], ['p0.1a', 1, 102, 700], ['p0.3a', 1, 87, 688]],
      units: [unit('para', [text('we use '), ph('\\bert'), text(' models for text and '), ph('\\bert'), text('. Then more')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 6, 0, 1, 107, 700, 127, 707.5, 697.5])
    // before a full stop: the stop is the text's, not the macro's
    expect(phOf(file, 0, 3)).toEqual([0, 3, 6, 0, 1, 92, 688, 112, 695.5, 685.5])
    expect(stats.ph).toMatchObject({ marked: 2, found: 2, inferred: 2, byKind: { macro: [2, 2] } })
  })

  it('a display\'s lines are its segments and its number its last, NUMBERED', async () => {
    const { file } = await made(DISPLAY)
    expect(phOf(file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.NUMBERED, 1, 150, 680, 165, 687.5, 677.5, 1, 252, 680, 267, 687.5, 677.5])
  })

  it("the source's own brackets are flagged, the rendering's are not", async () => {
    const runs: Run[] = [{ s: 'see (2) and (3) here now', x: 72, y: 700 }]
    const at = (j: number) => xAt(runs[0] as Run, j)
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(5), 700], ['p0.1b', 1, at(6), 700], ['p0.3a', 1, at(11), 700], ['p0.3b', 1, at(15), 700]],
      units: [unit('para', [text('see ('), ph('\\ref{a}'), text(') and '), ph('\\eqref{b}'), text(' here now')])],
    })
    expect(phOf(file, 0, 1)[3]).toBe(PH_FLAG.SOURCE_BRACKETS)
    expect(phOf(file, 0, 3)[3]).toBe(0)
    // \eqref's own brackets are its ink
    expect(phOf(file, 0, 3).slice(5, 8)).toEqual([at(12), 700, at(15)])
  })

  it('a mark not carried makes the placeholder LOST; marks with nothing between make it EMPTY', async () => {
    const runs: Run[] = [{ s: 'one two three four five six seven', x: 72, y: 700 }]
    const at = (j: number) => xAt(runs[0] as Run, j)
    const { file, stats } = await made({
      pages: [{ runs }],
      // p0.1a off every line (between lines); p0.3a and p0.3b at one place; p0.5: its opening mark set twice, dropped
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(3), 650], ['p0.1b', 1, at(7), 700], ['p0.3a', 1, at(14), 700], ['p0.3b', 1, at(14), 700], ['p0.5a', 1, at(23), 700], ['p0.5b', 1, at(27), 700]],
      units: [unit('para', [text('one '), ph('$t$'), text(' three '), ph('\\cite{x}'), text(' five '), ph('$s$'), text(' seven')])],
    }, 'pdfTeX warning (dest): destination with the same identifier (name{axt-p0.5a}) has been already used, duplicate ignored\n')
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 2, PH_FLAG.EMPTY])
    expect(phOf(file, 0, 5)).toEqual([0, 5, 0, PH_FLAG.LOST])
    expect(stats.ph).toMatchObject({ marked: 3, found: 0, empty: 1, lost: 2 })
  })

  it('a glyph two placeholders would take goes to the first', async () => {
    const runs: Run[] = [{ s: 'say XYZ now and later', x: 72, y: 700 }]
    const at = (j: number) => xAt(runs[0] as Run, j)
    const { file } = await made({
      pages: [{ runs }],
      // the first's marks around X and Y, the second's around Y and Z
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(4), 700], ['p0.1b', 1, at(6), 700], ['p0.2a', 1, at(5), 700], ['p0.2b', 1, at(7), 700]],
      units: [unit('para', [text('say '), ph('$X$'), ph('$Z$'), text(' now and later')])],
    })
    expect(phOf(file, 0, 1).slice(5, 8)).toEqual([at(4), 700, at(6)])
    expect(phOf(file, 0, 2).slice(5, 8)).toEqual([at(6), 700, at(7)])
  })

  it("a heading's number is its label, and the erase leaves it out, and leaves out every display segment", async () => {
    const runs: Run[] = [{ s: '1', x: 72, y: 700, size: 12 }, { s: 'Introduction', x: 90, y: 700, size: 12 }, { s: words(0, 10), x: 72, y: 680 }, { s: '(a)', x: 72, y: 668 }, { s: 'an item of the list', x: 92, y: 668 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['h0s', 1, 90, 700], ['h0e', 1, 162, 700], ['1s', 1, 72, 680], ['1e', 1, endOf(runs[2] as Run), 680], ['2s', 1, 92, 668], ['2e', 1, endOf(runs[4] as Run), 668]],
      units: [unit('heading', [text('Introduction')], { depth: 1 }), unit('para', [text(words(0, 10))]), unit('para', [text('an item of the list')])],
    })
    expect(file.labels).toEqual([[0, 0, 1, 72, 700, 78, 709, 697], [2, 1, 1, 72, 668, 87, 675.5, 665.5]])
    expect(file.headings).toEqual([[0, 'Introduction']])
    expect(file.units[0]).toEqual([0, 1, 1, 0, 1])
    // the heading's line starts at its words; its erase leaves the number
    expect(rowsOf(file, 0, 'lines').slice(0, 3)).toEqual([1, 90, 162])
    for (const e of chunk(rowsOf(file, 0, 'erase'), 5)) expect(e[1]).toBeGreaterThanOrEqual(90)
    expect(stats.labels).toEqual({ heading: [1, 1], para: [1, 2] })
    // a display inside a paragraph: no rectangle on its line, none over it
    const d = (await made(DISPLAY)).file
    const erase = chunk(rowsOf(d, 0, 'erase'), 5), lines = chunk(rowsOf(d, 0, 'lines'), 8)
    const displayLine = lines.findIndex(l => l[3] === 680)
    expect(displayLine).toBeGreaterThan(0)
    expect(erase.some(e => e[0] === displayLine)).toBe(false)
    for (const e of erase) expect((e[1] as number) < 267 && (e[3] as number) > 150 && (e[2] as number) < 687.5 && (e[4] as number) > 677.5).toBe(false)
  })

  it('a mark carried off its page is dropped: its unit is not located there', async () => {
    // the cell's line moved whole to the page's right edge on arXiv's: its end mark, past its last word, lands off it
    const ours: Run = { s: 'foo bar', x: 72, y: 700 }, theirs: Run = { s: 'foo bar', x: 577, y: 700 }
    const rest: Run = { s: 'a line that stays where it is', x: 72, y: 600 }
    const w: World = {
      pages: [{ runs: [rest, theirs] }], marked: [{ runs: [ours, rest] }],
      marks: [['t0s', 1, 72, 700], ['t0e', 1, endOf(ours) + 15, 700], ['1s', 1, 72, 600], ['1e', 1, endOf(rest), 600]],
      units: [unit('cell', [text('foo bar')]), unit('para', [text('a line that stays where it is')])],
    }
    const { file, stats } = await made(w)
    expect(file.units.map(u => u[0])).toEqual([1])
    expect(stats.units.byKind.cell).toEqual([0, 1])
    // its end mark at its last word instead: carried onto the page, and the cell located there
    const near = await made({ ...w, marks: [['t0s', 1, 72, 700], ['t0e', 1, endOf(ours), 700], ['1s', 1, 72, 600], ['1e', 1, endOf(rest), 600]] })
    expect(near.file.units.map(u => u[0])).toEqual([0, 1])
    expect(rowsOf(near.file, 0, 'lines').slice(0, 3)).toEqual([1, 577, 612])
  })

  it('a centred caption is CENTRED; a justified paragraph is not', async () => {
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    para.push({ s: 'last line of it', x: 72, y: 652 })
    const cap = [{ s: 'Figure caption text', x: 172 - 47.5, y: 600 }, { s: 'its end', x: 172 - 17.5, y: 588 }]
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const { file } = await made({
      pages: [{ runs: [...para, ...cap] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[4] as Run), 652], ['1s', 1, cap[0]?.x ?? 0, 600], ['1e', 1, endOf(cap[1] as Run), 588]],
      units: [unit('para', [text(ws(para))]), unit('caption', [text(ws(cap))])],
    })
    expect((file.units[1]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
    expect((file.units[0]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(0)
  })

  it('below CARRY_MIN the paper is refused, with the stats', async () => {
    const lines = Array.from({ length: 10 }, (_, j): Run => ({ s: words(10 * j, 10), x: 72, y: 700 - 12 * j }))
    // two of the marked original's ten lines are set otherwise on arXiv's
    const theirs = lines.map((r, j) => (j >= 8 ? { ...r, s: words(500 + 10 * j, 10) } : r))
    const w: World = { pages: [{ runs: theirs }], marked: [{ runs: lines }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(lines[9] as Run), 592]], units: [unit('para', [text(words(0, 100))])] }
    const out = await make(w)
    expect(out).toMatchObject({ refused: 'carry', stats: { lines: { carried: 8, total: 10 } } })
    expect(CARRY_MIN).toBe(0.9)
    // nine of ten: a file
    const nine = await make({ ...w, pages: [{ runs: lines.map((r, j) => (j === 9 ? theirs[9] as Run : r)) }] })
    expect('file' in nine).toBe(true)
  })

  it("arXiv's page count out of bounds is refused before anything is read", async () => {
    const units = [unit('para', [text('x')])]
    const marks = await marksOf({ pages: [{ runs: [{ s: 'x', x: 72, y: 700 }] }], marks: [], units })
    for (const numPages of [0, 10_001, 1.5]) {
      const arxiv = { numPages, getPage: () => { throw new Error('not to be read') } }
      expect(await makeLayout({ units, marks, arxiv, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })).toMatchObject({ refused: 'pages' })
    }
  })

  it("the file parses; a file its parser refuses is not returned, the refusal in the stats", async () => {
    const runs: Run[] = [{ s: 'alpha beta gamma', x: 72, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700]], units: [unit('para', [text('alpha beta gamma')])] }
    await made(w)
    // a paper id the file may not hold
    const out = await makeLayout({ units: w.units, marks: await marksOf(w), arxiv: arxivOf(w.pages), OPS, paper: { id: 'not an id', version: 1 }, left: '', pdfjs: '6.3.289' })
    expect(out).toMatchObject({ refused: 'bounds', stats: { refusal: { path: 'paper.id' } } })
  })

  it('a font name of other characters, or too long, is cleaned; a glyph thinner than a hundredth is grown', async () => {
    expect(fontName(`ABÄ${'x'.repeat(300)}`)).toBe(`AB?${'x'.repeat(125)}`)
    expect(fontName('')).toBe('?')
    expect(fontName(undefined)).toBe('?')
    const runs: Run[] = [{ s: 'alpha beta gamma', x: 72, y: 700, font: 'F2' }, { s: 'q', x: 300, y: 600, w: 0.0003 }]
    const { file } = await made({ pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, 152, 700], ['1s', 1, 300, 600], ['1e', 1, 300.003, 600]], units: [unit('para', [text('alpha beta gamma')]), unit('para', [text('q')])] })
    expect(file.fonts).toEqual([fontName((FONTS.F2 as { name: string }).name), 'ABCDEF+CMR10'])
    expect(file.fonts[0]).toHaveLength(128)
    // a glyph 0.003 across: its line and its erase a hundredth across
    expect(rowsOf(file, 1, 'lines').slice(0, 3)).toEqual([1, 300, 300.01])
    expect(chunk(rowsOf(file, 1, 'erase'), 5)).toEqual([[0, 300, 597.5, 300.01, 607.5]])
  })

  it('a page whose ink is not whole locates none of its units: an operator list too slow, failing or capped', async () => {
    const page = (y: number, s: string): Page => ({ runs: [{ s, x: 72, y }] })
    const pages = [page(700, 'alpha beta gamma'), page(700, 'delta epsilon zeta'), page(700, 'eta theta iota'), page(700, 'kappa lambda mu')]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, 152, 700], ['1s', 2, 72, 700], ['1e', 2, 162, 700], ['2s', 3, 72, 700], ['2e', 3, 142, 700], ['3s', 4, 72, 700], ['3e', 4, 147, 700]]
    const units = ['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota', 'kappa lambda mu'].map(s => unit('para', [text(s)]))
    vi.useFakeTimers()
    const w: World = { pages: [pages[0] as Page, { ...pages[1] as Page, ops: 'never' }, { ...pages[2] as Page, ops: 'fails' }, { ...pages[3] as Page, ops: 'capped' }], marked: pages, marks, units }
    const out = make(w)
    await vi.advanceTimersByTimeAsync(OPS_MS + 1000)
    const done = await out
    if (!('file' in done)) throw new Error('refused')
    expect(done.file.units.map(u => u[0])).toEqual([0])
    expect(done.stats.timedOut).toEqual([2, 3])
    expect(done.stats.capped).toEqual([4])
  })

  it("a placeholder's symbol set apart at its line's end is its ink", async () => {
    // a table's head cell, ASR then a space then an arrow, which the text layer gives no word of
    const runs: Run[] = [{ s: 'ASR', x: 72, y: 700 }, { s: '\u2193', x: 89.35, y: 700 }, { s: 'ACC', x: 140, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['t0s', 1, 72, 700], ['t0e', 1, 94.35, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 94.35, 700], ['t1s', 1, 140, 700], ['t1e', 1, 155, 700]],
      units: [unit('cell', [text('ASR '), ph('$\\downarrow$')]), unit('cell', [text('ACC')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 89.35, 700, 94.35, 707.5, 697.5])
    // the cell's line takes it in, and erasing covers it
    expect(rowsOf(file, 0, 'lines').slice(0, 3)).toEqual([1, 72, 94.35])
    expect(chunk(rowsOf(file, 0, 'erase'), 5).some(e => (e[1] as number) <= 89.35 && (e[3] as number) >= 94.35)).toBe(true)
  })

  it("a mark the carrier does not place, past its line's last word, goes by its partner's offset", async () => {
    // a formula of no letters after the line's words: the closing mark more than two heights past the last word
    const ours: Run[] = [{ s: 'see the value', x: 72, y: 700 }, { s: '+++++', x: 142, y: 700 }]
    const theirs = ours.map(r => ({ ...r, y: 699.39 }))
    const { file } = await made({
      pages: [{ runs: theirs }], marked: [{ runs: ours }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 167, 700], ['p0.1a', 1, 137, 700], ['p0.1b', 1, 167, 700]],
      units: [unit('para', [text('see the value '), ph('$+++++$')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 142, 699.39, 167, 706.89, 696.89])
  })

  it('a unit whose marks were set but not carried stays the original\'s, though its words are there', async () => {
    const body = Array.from({ length: 10 }, (_, j): Run => ({ s: words(10 * j, 10), x: 72, y: 600 - 12 * j }))
    const ours: Run = { s: 'alpha beta gamma delta', x: 72, y: 700 }
    // set otherwise on arXiv's: its words over two lines
    const theirs: Run[] = [{ s: 'alpha beta', x: 72, y: 700 }, { s: 'gamma delta', x: 72, y: 688 }]
    const { file, stats } = await made({
      pages: [{ runs: [...theirs, ...body] }], marked: [{ runs: [ours, ...body] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(ours), 700], ['1s', 1, 72, 600], ['1e', 1, endOf(body[9] as Run), 492]],
      units: [unit('para', [text('alpha beta gamma delta')]), unit('para', [text(words(0, 100))])],
    })
    expect(file.units.map(u => u[0])).toEqual([1])
    expect(stats.lines).toEqual({ carried: 10, total: 11 })
  })

  it("a footnote's number glued to its first word on arXiv's still bounds the note, and is its label", async () => {
    // ours: the number raised and smaller; arXiv's: on the line, read with the word after it as one
    const ours: Run[] = [{ s: '1', x: 101.88, y: 703.6, size: 7 }, { s: 'Historically Press was the first to use it', x: 106, y: 700 }]
    const theirs: Run[] = [{ s: '1', x: 101, y: 700 }, { s: 'Historically Press was the first to use it', x: 106, y: 700 }]
    const end = endOf(ours[1] as Run)
    const { file } = await made({
      pages: [{ runs: theirs }], marked: [{ runs: ours }],
      marks: [['0s', 1, 106, 700], ['0e', 1, end, 700]],
      units: [unit('footnote', [text('Historically Press was the first to use it')])],
    })
    expect(rowsOf(file, 0, 'lines').slice(0, 3)).toEqual([1, 106, end])
    expect(file.labels).toEqual([[0, 3, 1, 101, 700, 106, 707.5, 697.5]])
  })

  it("a radical's sign, raised to its bar, is the formula's ink", async () => {
    // the sign's origin 7.7 above the line, past the window of scripts; its bar a rule over the radicand
    const runs: Run[] = [{ s: 'scaled by', x: 72, y: 700 }, { s: '\u221a', x: 122, y: 707.7 }, { s: 'dk', x: 127, y: 700 }, { s: 'here and there', x: 142, y: 700 }]
    const { file } = await made({
      pages: [{ runs, boxes: [[127, 707.2, 137, 707.6]] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 700], ['p0.1a', 1, 117, 700], ['p0.1b', 1, 137, 700]],
      units: [unit('para', [text('scaled by '), ph('$\\sqrt{d_k}$'), text(' here and there')])],
    })
    expect(phOf(file, 0, 1).slice(4, 10)).toEqual([1, 122, 700, 137, 707.7 + 7.5, 697.5])
  })

  it('the names of draft image frames are no lines of the paper', async () => {
    const text1: Run = { s: 'alpha beta gamma delta', x: 72, y: 700 }
    const { stats } = await made({
      pages: [{ runs: [text1] }], marked: [{ runs: [text1, { s: 'images fig1 png', x: 200, y: 500 }] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(text1), 700], ['g1a', 1, 150, 480], ['g1b', 1, 400, 480], ['g1t', 1, 400, 560]],
      units: [unit('para', [text('alpha beta gamma delta')])],
    })
    expect(stats.lines).toEqual({ carried: 1, total: 1 })
  })

  it('a placeholder the marked original gives no mark is LOST; a closing mark not set, its end is the text after it', async () => {
    const runs: Run[] = [{ s: 'Bold words follow here', x: 72, y: 700 }, { s: 'and a note', x: 72, y: 688 }, { s: '1', x: 122, y: 691.5, size: 7 }, { s: '. Then more', x: 125.5, y: 688 }]
    const note = unit('footnote', [text('A note.')])
    const { file, stats } = await made({
      pages: [{ runs }],
      // the footnote's call: its opening mark alone, as Task 1's marking now sets it
      marks: [['0s', 1, 97, 700], ['0e', 1, endOf(runs[3] as Run), 688], ['n0.2a', 1, 122, 688]],
      units: [unit('para', [ph('\\textbf{Bold}'), text(' words follow here and a note'), { t: 'nested', unit: note }, text('. Then more')]), note],
    })
    // the bold at the unit's head: no mark, LOST, counted apart
    expect(phOf(file, 0, 0)).toEqual([0, 0, 6, PH_FLAG.LOST])
    // the call: its number, raised, to the full stop after it
    expect(phOf(file, 0, 2)).toEqual([0, 2, 5, PH_FLAG.RAISED, 1, 122, 688, 125.5, 691.5 + 5.25, 691.5 - 1.75])
    expect(stats.ph).toMatchObject({ unmarked: 1, marked: 1, found: 1, inferred: 1 })
  })
})

describe('makeLayout, the review of 2026-10-06', () => {
  it('a line the text layer gives as two runs on one baseline is one line, each placeholder inked to its own marks', async () => {
    // a superscript in a formula: the anchor's line rectangles break at it, and the second one begins past a symbol and
    // a gap (1706.03762's note, unit 34: rows 107.8-346.3 and 358.9-503.9 on one baseline)
    const runs: Run[] = [
      { s: 'the dot product', x: 72, y: 700 }, { s: 'q', x: 152, y: 700 }, { s: 'i', x: 157, y: 705.5, size: 7 }, { s: '\u00b7', x: 165, y: 700 },
      { s: 'k=ssssssss', x: 171, y: 700 }, { s: 'has mean', x: 226, y: 700 }, { s: '0', x: 271, y: 700 },
      { s: 'and variance', x: 281, y: 700 }, { s: 'd', x: 346, y: 700 }, { s: 'k', x: 351, y: 697, size: 7 }, { s: '.', x: 354.5, y: 700 },
    ]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 359.5, 700], ['p0.1a', 1, 147, 700], ['p0.1b', 1, 221, 700], ['p0.3a', 1, 266, 700], ['p0.3b', 1, 276, 700], ['p0.5a', 1, 341, 700], ['p0.5b', 1, 354.5, 700]],
      units: [unit('para', [text('the dot product '), ph('$q^i \\cdot k=ssssssss$'), text(' has mean '), ph('$0$'), text(' and variance '), ph('$d_k$'), text('.')])],
    })
    expect(chunk(rowsOf(file, 0, 'lines'), 8).map(l => l.slice(0, 4))).toEqual([[1, 72, 359.5, 700]])
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 152, 700, 221, 710.75, 697.5])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 0, 0, 1, 271, 700, 276, 707.5, 697.5])
    expect(phOf(file, 0, 5)).toEqual([0, 5, 0, 0, 1, 346, 700, 354.5, 707.5, 695.25])
    expect(stats.ph).toMatchObject({ found: 3, empty: 0, lost: 0 })
  })

  it('a display that ends its unit is its ink down to the next line of the column, never EMPTY', async () => {
    // the next paragraph's lines set the column's right edge, where the number stands
    const runs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b', x: 150, y: 680 }, { s: '(2)', x: 252, y: 680 }, ...[0, 1, 2].map((j): Run => ({ s: words(10 + 10 * j, 10), x: 72, y: 660 - 12 * j }))]
    const w: World = {
      pages: [{ runs }],
      // the unit's end mark where its display's opening mark is (TeX sets it on the line the display left)
      marks: [['0s', 1, 72, 700], ['0e', 1, 217, 700], ['p0.1a', 1, 217, 700], ['1s', 1, 72, 660], ['1e', 1, 267, 636]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\[a=b\\]')]), unit('para', [text(words(10, 30))])],
    }
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.NUMBERED, 1, 150, 680, 165, 687.5, 677.5, 1, 252, 680, 267, 687.5, 677.5])
    expect(stats.ph.byKind.display).toEqual([1, 1])
    // nothing below it in its column to bound it: LOST, not EMPTY
    const alone = await made({ ...w, pages: [{ runs: runs.slice(0, 3) }], marks: (w.marks as Mark[]).slice(0, 3), units: [w.units[0] as SourceUnit] })
    expect(phOf(alone.file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.LOST])
  })

  it('a caption centred whole, its label with it, is CENTRED', async () => {
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    // "Fig. 1." and its text, centred together on 172
    const label: Run = { s: 'Fig. 1.', x: 172 - 57.5, y: 600 }, cap: Run = { s: 'Some text here', x: 172 - 17.5 + 2.5, y: 600 }
    const { file } = await made({
      pages: [{ runs: [...para, label, cap] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[3] as Run), 664], ['1s', 1, cap.x, 600], ['1e', 1, endOf(cap), 600]],
      units: [unit('para', [text(para.map(r => r.s).join(' '))]), unit('caption', [text('Some text here')])],
    })
    expect(file.labels.map(l => l[0])).toEqual([1])
    expect((file.units[1]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
  })

  it('erase rectangles merge within half an em of each other, and a line keeps 16 at most, the closest merged first', async () => {
    // gaps of 4.5 and 5.5 pt at 10 pt: the first merged, the second not
    const near: Run[] = [{ s: 'aaa', x: 72, y: 700 }, { s: 'bbb', x: 91.5, y: 700 }, { s: 'ccc', x: 112, y: 700 }]
    // 18 words 6 pt apart but two pairs, 5.6 and 5.8 pt apart: those two merged, 16 left
    const gaps = Array.from({ length: 17 }, (_, j) => (j === 4 ? 5.8 : j === 11 ? 5.6 : 6))
    const many: Run[] = []
    for (let j = 0, x = 72; j < 18; j++) { many.push({ s: `w${String.fromCharCode(97 + j)}`, x, y: 600 }); x += 10 + (gaps[j] ?? 0) }
    const last = many[17] as Run
    const { file } = await made({
      pages: [{ runs: [...near, ...many] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 127, 700], ['1s', 1, 72, 600], ['1e', 1, endOf(last), 600]],
      units: [unit('para', [text('aaa bbb ccc')]), unit('para', [text(many.map(r => r.s).join(' '))])],
    })
    expect(chunk(rowsOf(file, 0, 'erase'), 5).map(e => [e[1], e[3]])).toEqual([[72, 106.5], [112, 127]])
    const rects = chunk(rowsOf(file, 1, 'erase'), 5)
    expect(rects).toHaveLength(16)
    const merged = rects.filter(e => (e[3] as number) - (e[1] as number) > 10).map(e => [e[1], e[3]])
    const r2 = (v: unknown) => Math.round((v as number) * 100) / 100
    expect(merged.map(m => m.map(r2))).toEqual([[xAt(many[4] as Run, 0), endOf(many[5] as Run)], [xAt(many[11] as Run, 0), endOf(many[12] as Run)]].map(m => m.map(r2)))
  })

  it('a unit whose every glyph erasing leaves out has no erase entry; a rule of no height is erased a hundredth high', async () => {
    // a cell standing inside a display's row: its glyph is inside the display's segment
    const runs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a', x: 150, y: 680 }, { s: 'zz', x: 190, y: 680 }, { s: 'b', x: 230, y: 680 }, { s: words(10, 10), x: 72, y: 660 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 267, 660], ['p0.1a', 1, 217, 700], ['t1s', 1, 190, 680], ['t1e', 1, 200, 680]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\begin{equation}a b\\end{equation}'), text(` ${words(10, 10)}`)]), unit('cell', [text('zz')])],
    })
    expect(file.units.map(u => u[0])).toEqual([0, 1])
    expect(file.erase.map(([u]) => u)).toEqual([0])
    // a formula of two glyphs 6 pt apart either side of a rule of no height: three rectangles, the rule's 0.01 high
    const r: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: 'x', x: 140, y: 700 }, { s: 'y', x: 185, y: 700 }, { s: 'and more', x: 200, y: 700 }]
    const rule = await made({
      pages: [{ runs: r, boxes: [[151, 703, 179, 703]] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 240, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 190, 700]],
      units: [unit('para', [text('see '), ph('$\\overline{x y}$'), text(' and more')])],
    })
    expect(chunk(rowsOf(rule.file, 0, 'erase'), 5).filter(e => e[1] === 151)).toEqual([[0, 151, 703, 179, 703.01]])
  })

  it("which pieces were marked is the marks file's: its classes and the paper's switch", async () => {
    // a citation a full stop follows, on a paper whose package moves it: the switch gave it no mark
    const runs: Run[] = [{ s: 'as shown', x: 72, y: 700 }, { s: '12', x: 112, y: 703, size: 7 }, { s: '. More words here', x: 119, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, 204, 700]], units: [unit('para', [text('as shown '), ph('\\cite{a}'), text('. More words here')])] }
    const switched = await made({ ...w, movers: ['cite'] })
    expect(phOf(switched.file, 0, 1)).toEqual([0, 1, 2, PH_FLAG.LOST])
    expect(switched.stats.ph).toMatchObject({ marked: 0, unmarked: 1, lost: 0 })
    // the same marks file but made with every class marking it: its marks expected, and missing
    const plain = await made(w)
    expect(plain.stats.ph).toMatchObject({ marked: 1, unmarked: 0, lost: 1 })
  })

  it('units past 512 faces stay the original\'s: a count of fonts never gets the file refused', async () => {
    // 515 one-word units, each in a face of its own
    for (let f = 0; f < 515; f++) FONTS[`G${f}`] = { name: `ABCDEF+Face${f}`, fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false }
    const runs = Array.from({ length: 515 }, (_, f): Run => ({ s: `word${f}`, x: 72 + 100 * (f % 5), y: 780 - 1.4 * Math.floor(f / 5) * 10, font: `G${f}` }))
    const { file } = await made({
      pages: [{ runs }],
      marks: runs.flatMap((r, f): Mark[] => [[`${f}s`, 1, r.x, r.y], [`${f}e`, 1, endOf(r), r.y]]),
      units: runs.map(r => unit('para', [text(r.s)])),
    })
    expect(file.fonts).toHaveLength(512)
    expect(file.units).toHaveLength(512)
    expect(file.units.at(-1)?.[0]).toBe(511)
  })

  it('a placeholder set below its line is LOWERED; a title and the front matter are flagged', async () => {
    const runs: Run[] = [{ s: 'A Title of Front Matter', x: 72, y: 740 }, { s: 'Some Author and Another', x: 72, y: 725 }, { s: 'alpha beta', x: 72, y: 700 }, { s: 'xy', x: 127, y: 697, size: 7 }, { s: 'gamma delta', x: 140, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      // the front matter carries no marks: placed by its words alone
      marks: [['2s', 1, 72, 700], ['2e', 1, 195, 700], ['p2.1a', 1, 122, 700], ['p2.1b', 1, 134, 700]],
      units: [unit('heading', [text('A Title of Front Matter')], { title: true, front: true }), unit('author', [text('Some Author and Another')], { front: true }), unit('para', [text('alpha beta '), ph('$_{xy}$'), text(' gamma delta')])],
    })
    expect(phOf(file, 2, 1)[3]).toBe(PH_FLAG.LOWERED)
    expect(file.units.map(u => u[3])).toEqual([UNIT_FLAG.TITLE | UNIT_FLAG.FRONT, UNIT_FLAG.FRONT, 0])
  })

  it("a paper's operator lists are waited for OPS_PAPER_MS in all: the pages past it are not asked", async () => {
    const pages = Array.from({ length: 8 }, (_, j): Page => ({ runs: [{ s: `alpha beta gamma ${j}`, x: 72, y: 700 }], ops: 'never' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const asked: number[] = []
    const out = make({ pages, marked: pages.map(p => ({ runs: p.runs })), marks: [], units: [unit('para', [text('alpha beta gamma 0')])] }, '', asked)
    await vi.advanceTimersByTimeAsync(OPS_PAPER_MS + 10 * OPS_MS)
    const done = await out
    expect(asked).toEqual([1, 2, 3, 4, 5, 6])
    expect(done.stats.timedOut).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('the pinned PDF.js has the cancel the maker gives a page up with; without it the maker warns once and goes on', async () => {
    const pdf = '%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>> endobj\n4 0 obj <</Length 16>> stream\n0 0 m 10 10 l S\nendstream endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n'
    const task = getDocument({ data: new TextEncoder().encode(pdf), verbosity: 0 })
    const page = (await (await task.promise).getPage(1)) as unknown as { _abortOperatorList?: unknown; _intentStates?: unknown }
    expect(typeof page._abortOperatorList).toBe('function')
    expect(page._intentStates).toBeInstanceOf(Map)
    await task.destroy()
    // the fake pages have no cancel: two pages given up, one warning
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    const p = (s: string): Page => ({ runs: [{ s, x: 72, y: 700 }], ops: 'never' })
    const out = make({ pages: [p('alpha beta gamma'), p('delta epsilon zeta')], marked: [{ runs: p('alpha beta gamma').runs }, { runs: p('delta epsilon zeta').runs }], marks: [], units: [] })
    await vi.advanceTimersByTimeAsync(3 * OPS_MS)
    await out
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('makeLayout, the re-review of 2026-10-06', () => {
  const body = (y: number, from: number) => [0, 1, 2].map((j): Run => ({ s: words(from + 10 * j, 10), x: 72, y: y - 12 * j }))

  it('subequations is a display: one ending its unit is found, not an EMPTY macro', async () => {
    const runs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b', x: 150, y: 680 }, { s: '(2a)', x: 247, y: 680 }, ...body(660, 10)]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 217, 700], ['p0.1a', 1, 217, 700], ['1s', 1, 72, 660], ['1e', 1, 267, 636]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\begin{subequations}\\begin{align}a&=b\\end{align}\\end{subequations}')]), unit('para', [text(words(10, 30))])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.NUMBERED, 1, 150, 680, 165, 687.5, 677.5, 1, 247, 680, 267, 687.5, 677.5])
  })

  it("a placeholder's glyphs begin no more than 0.4 pt before its opening mark and have their middles before its closing mark: a carried mark a few tenths off keeps its base glyph", async () => {
    // the opening mark carried 0.36 pt right of the formula's first glyph (2307.16209's $\Psi_0$, $\ell$)
    const runs: Run[] = [{ s: 'shown by', x: 72, y: 700 }, { s: 'P', x: 117, y: 700 }, { s: '0', x: 122, y: 698, size: 7 }, { s: 'and more', x: 130.5, y: 700 }, { s: 'x', x: 175.5, y: 700 }, { s: ', then', x: 180.5, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      // and a closing mark carried 0.2 pt into the comma after its formula: the comma is the text's
      marks: [['0s', 1, 72, 700], ['0e', 1, 210.5, 700], ['p0.1a', 1, 117.36, 700], ['p0.1b', 1, 125.5, 700], ['p0.3a', 1, 170.5, 700], ['p0.3b', 1, 180.7, 700]],
      units: [unit('para', [text('shown by '), ph('$P_0$'), text(' and more '), ph('$x$'), text(', then')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 117, 700, 125.5, 707.5, 696.25])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 0, 0, 1, 175.5, 700, 180.5, 707.5, 697.5])
  })

  it("marks past the line's last glyph, the formula set on the next line, are LOST, not EMPTY", async () => {
    // our compile set qQ past the margin; arXiv's at the next line's start
    const runs: Run[] = [{ s: 'see the value', x: 72, y: 700 }, { s: 'qQ', x: 72, y: 688 }, { s: 'and then more words', x: 87, y: 688 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 182, 688], ['p0.1a', 1, 140, 700], ['p0.1b', 1, 150, 700]],
      units: [unit('para', [text('see the value '), ph('$qQ$'), text(' and then more words')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(stats.ph.empty).toBe(0)
  })

  it("a placeholder across lines takes a row between them only where it lies between its marks' lines: never a text line", async () => {
    // the anchor's rows out of order: the line above comes between the formula's two lines in the content stream
    const runs: Run[] = [{ s: 'first line ends with', x: 72, y: 700 }, { s: 'a+', x: 177, y: 700 }, { s: 'words of a line above', x: 72, y: 712 }, { s: 'b', x: 72, y: 688 }, { s: 'then the rest', x: 82, y: 688 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 147, 688], ['p0.1a', 1, 172, 700], ['p0.1b', 1, 77, 688]],
      units: [unit('para', [text('first line ends with '), ph('$a+b$'), text(' words of a line above then the rest')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 177, 700, 187, 707.5, 697.5, 1, 72, 688, 77, 695.5, 685.5])
    expect(stats.ph.textTaken).toBe(0)
  })

  it('every visible piece of a located unit has its row: one of a class the marked original left unmarked is LOST', async () => {
    const runs: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: 'www.example.org', x: 92, y: 700 }, { s: 'and', x: 172, y: 700 }, { s: 'x', x: 192, y: 700 }, { s: 'here', x: 202, y: 700 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 222, 700], ['p0.3a', 1, 187, 700], ['p0.3b', 1, 197, 700]],
      units: [unit('para', [text('see '), ph('\\url{www.example.org}'), text(' and '), ph('$x$'), text(' here '), ph('~'), { t: 'open' }, { t: 'close' }])],
    }
    // a marks file made without the url class: the url piece no mark, its row LOST; the tie and the group none
    const marks = parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(markedOf(w.pages, w.marks), '', { engine: 'pdflatex', classes: ['math'] }))))
    const out = await makeLayout({ units: w.units, marks, arxiv: arxivOf(w.pages), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
    if (!('file' in out)) throw new Error('refused')
    expect(out.file.ph.map(r => [r[1], r[3]])).toEqual([[1, PH_FLAG.LOST], [3, 0]])
  })

  it("a display whose ink is all another unit's is LOST, not EMPTY; a footnote's rule under a display is no segment of it", async () => {
    // the next unit's text holds the display's glyphs: nothing left for the display
    const owned: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b and more', x: 72, y: 680 }, ...body(660, 10)]
    const lost = await made({
      pages: [{ runs: owned }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 217, 700], ['p0.1a', 1, 217, 700], ['1s', 1, 72, 680], ['1e', 1, 267, 636]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\[x=y\\]')]), unit('para', [text(`a=b and more ${words(10, 30)}`)])],
    })
    expect(phOf(lost.file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.LOST])
    // a display at the column's foot, the footnote's rule and text below it
    const runs: Run[] = [...body(700, 0), { s: 'a=b', x: 150, y: 660 }, { s: '1', x: 72, y: 620, size: 7 }, { s: 'A note here', x: 76, y: 617, size: 8 }]
    const { file } = await made({
      pages: [{ runs, boxes: [[72, 635, 250, 635.4]] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 267, 676], ['p0.1a', 1, 267, 676], ['1s', 1, 76, 617], ['1e', 1, 120, 617]],
      units: [unit('para', [text(`${words(0, 30)} `), ph('\\[a=b\\]')]), unit('footnote', [text('A note here')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 1, 0, 1, 150, 660, 165, 667.5, 657.5])
  })
})

