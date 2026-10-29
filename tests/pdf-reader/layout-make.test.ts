import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { encodeLayout, indexLayout, type LayoutFile, mergeLayout, MIXED_FILL, NAME_FLAG, NAME_KEYS, PART_KEYS, PH_FLAG, PH_KINDS, parseLayout, UNIT_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { fontName, type LayoutStats, makeLayout, makerOf, OPS_MS, runInOrder } from '@/pdf-reader/engine/layout/make.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { floatMatches, pageFrame } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { displayEdges, unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { type Annot, arxivOf, baseOf, CH, endOf, FONTS, lineCheckOf, type Mark, markedOf, marksOf, type Page, PATHS, ph, type Run, text, unit, words, type World, xAt } from './helpers/make-world'
import { INK_MS } from '@/pdf-reader/engine/layout/ink.mjs'
import { INK_ANY, LINKS_MAX, markedPages, marksOfHead, readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { MAX_LINKS } from '@/pdf-reader/engine/layer-proto/links.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'

// The layout maker over the fake world of helpers/make-world.ts

const make = async (w: World, log = '', asked: number[] = []) => makeLayout({ units: w.units, marks: await marksOf(w, log), arxiv: baseOf(w, asked), lineCheck: await lineCheckOf(w), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
/** a seeded generator */
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
let seeds = 1
/**
 * The same world's file with its passes run as tasks (makerOf byTasks) in an order a seeded pick makes of those the whole
 * order allows, each task confined to its own pages (`check`), the columns' edges the whole run's
 */
async function inOtherOrder(w: World, log: string) {
  const input = { units: w.units, marks: await marksOf(w, log), lineCheck: await lineCheckOf(w), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
  const first = await makerOf({ ...input, arxiv: baseOf(w) })
  if ('refused' in first) return first
  for (let p = 1; p <= first.pages; p++) await first.readPage(p)
  await first.whole()
  const m = await makerOf({ ...input, arxiv: baseOf(w), columnEdges: first.edges(), check: true })
  if ('refused' in m) return m
  for (let p = 1; p <= m.pages; p++) await m.readPage(p)
  const rand = seeded(seeds++)
  return m.byTasks(ready => Math.floor(rand() * ready.length))
}
/**
 * The same world's rows made a page at a time (makerOf byStream: the page stream's maker, the units anchored by ranges, the
 * passes as tasks as pages are read, each page let go once its tasks ran), the frame and the columns' edges the whole run's,
 * merged as parts are (mergeLayout): the whole file's rows
 */
async function byPages(w: World, log: string) {
  const input = { units: w.units, marks: await marksOf(w, log), lineCheck: await lineCheckOf(w), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', plans: true }
  let frameOf: ((t: unknown) => boolean) | null = null
  const first = await makerOf({ ...input, arxiv: baseOf(w), frame: ((d: never, ms: never) => { frameOf = pageFrame(d, ms) as never; return frameOf }) as never })
  if ('refused' in first) return null
  for (let p = 1; p <= first.pages; p++) await first.readPage(p)
  const whole = await first.whole()
  if (!('file' in whole)) return null
  const m = await makerOf({ ...input, arxiv: baseOf(w), frame: () => frameOf as never, columnEdges: first.edges(), check: true })
  if ('refused' in m) return null
  const st = await m.byStream()
  if ('refused' in st) throw new Error('the stream refused what the whole made')
  // and the marked original read a page at a time too (markedPages: its head, then each page before arXiv's of its number)
  const events = markedPages(markedOf(w.marked ?? w.pages, w.marks), log, { engine: 'pdflatex', switches: w.switches ?? null, inkless: w.inkless ?? null, texts: w.texts ?? null, names: w.names ?? null, complete: w.complete ?? null, apart: w.apart ?? null, units: w.units, OPS } as never)
  const head = ((await events.next()).value as { head: Parameters<typeof marksOfHead>[0] }).head
  const both = await makerOf({ ...input, marks: marksOfHead(head, 'pdflatex'), arxiv: baseOf(w), frame: () => frameOf as never, columnEdges: first.edges(), check: true })
  if ('refused' in both) throw new Error('the marked stream refused what the whole made')
  const sb = await both.byStream({ head, events } as never)
  if ('refused' in sb) throw new Error('the marked stream refused what the whole made')
  // and under rule 3 with its own edges a page at a time (none given), against the whole run under rule 3
  const r3 = { ...input, rules: { edges: 'earlier' } as never }
  const w3 = await makerOf({ ...r3, arxiv: baseOf(w) })
  if ('refused' in w3) return null
  for (let p = 1; p <= w3.pages; p++) await w3.readPage(p)
  const whole3 = await w3.whole()
  const s3m = await makerOf({ ...r3, arxiv: baseOf(w), frame: () => frameOf as never, check: true })
  if ('refused' in s3m || !('file' in whole3)) return null
  const s3 = await s3m.byStream()
  if ('refused' in s3) throw new Error('the rule-3 stream refused what the whole made')
  // and production's: both streams under the default rules (1, 3 and 4) with nothing given, each made of its own predicates, the
  // marked original read a page at a time in the second, against the whole run under the same rules
  const dw = await makerOf({ ...input, arxiv: baseOf(w) })
  if ('refused' in dw) return null
  for (let p = 1; p <= dw.pages; p++) await dw.readPage(p)
  const wholeD = await dw.whole()
  if (!('file' in wholeD)) return null
  const ds = await makerOf({ ...input, arxiv: baseOf(w), check: true })
  if ('refused' in ds) throw new Error('the default stream refused what the whole made')
  const sd = await ds.byStream()
  if ('refused' in sd) throw new Error('the default stream refused what the whole made')
  const events2 = markedPages(markedOf(w.marked ?? w.pages, w.marks), log, { engine: 'pdflatex', switches: w.switches ?? null, inkless: w.inkless ?? null, texts: w.texts ?? null, names: w.names ?? null, complete: w.complete ?? null, apart: w.apart ?? null, units: w.units, OPS } as never)
  const head2 = ((await events2.next()).value as { head: Parameters<typeof marksOfHead>[0] }).head
  const dm = await makerOf({ ...input, marks: marksOfHead(head2, 'pdflatex'), arxiv: baseOf(w), check: true })
  if ('refused' in dm) throw new Error('the default marked stream refused what the whole made')
  const sm = await dm.byStream({ head: head2, events: events2 } as never)
  if ('refused' in sm) throw new Error('the default marked stream refused what the whole made')
  return {
    whole, merged: mergeLayout([st.layout() as never]), cellRules: st.cellRules ?? null, marked: mergeLayout([sb.layout() as never]), markedRules: sb.cellRules ?? null, late: both.stats.late, rule3: { whole: whole3.file, merged: mergeLayout([s3.layout() as never]) },
    defaults: { whole: wholeD.file, cellRules: ('cellRules' in wholeD ? wholeD.cellRules : null) ?? null, stream: mergeLayout([sd.layout() as never]), streamRules: sd.cellRules ?? null, marked: mergeLayout([sm.layout() as never]), markedRules: sm.cellRules ?? null, late: dm.stats.late },
  }
}
/** what a file's stats count, but its times and its gzip size */
const counted = (s: LayoutStats) => { const { ms: _ms, bytes, ...rest } = s; return { ...rest, raw: bytes.raw } }
/** a made file: it parses, and made again it is the same bytes, its passes in another order the whole order allows too */
async function made(w: World, log = ''): Promise<{ file: LayoutFile; stats: LayoutStats }> {
  const one = await make(w, log), two = await make(w, log), three = await inOtherOrder(w, log)
  if (!('file' in one) || !('file' in two) || !('file' in three)) throw new Error(`refused: ${JSON.stringify('refused' in one ? one : 'refused' in two ? two : three)}`)
  const text = encodeLayout(one.file)
  expect(encodeLayout(two.file)).toBe(text)
  expect(encodeLayout(three.file)).toBe(text)
  // (but the pages whose rule-3 edges were taken from a later page: the passes as tasks are given the whole run's edges)
  expect({ ...counted(three.stats), edgesAhead: null }).toEqual({ ...counted(one.stats), edgesAhead: null })
  // a page at a time: every unit's rows and every name's, as the whole file holds them, and every page's plan
  const four = await byPages(w, log)
  if (four) {
    const rows = (f: Record<string, unknown>) => ({ ...Object.fromEntries(PART_KEYS.map(k => [k, f[k]])), colours: f.colours ?? null, unlaid: f.unlaid ?? null })
    expect(rows(four.merged as never)).toEqual(rows(four.whole.file as never))
    expect(four.cellRules).toEqual(four.whole.cellRules ?? null)
    expect(rows(four.marked as never)).toEqual(rows(four.whole.file as never))
    expect(four.markedRules).toEqual(four.whole.cellRules ?? null)
    expect(four.late).toEqual({ rows: 0, vetoes: 0 })
    if (four.rule3) expect(rows(four.rule3.merged as never)).toEqual(rows(four.rule3.whole as never))
    const d = four.defaults
    expect(rows(d.stream as never)).toEqual(rows(d.whole as never))
    expect(rows(d.marked as never)).toEqual(rows(d.whole as never))
    expect(d.streamRules).toEqual(d.cellRules)
    expect(d.markedRules).toEqual(d.cellRules)
    expect(d.late).toEqual({ rows: 0, vetoes: 0 })
  }
  expect(parseLayout(new TextEncoder().encode(text))).toEqual(one.file)
  for (const [, rows] of one.file.erase) expect(rows.length).toBeGreaterThan(0)
  return one
}

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

  it('a placeholder\'s segments are its own glyphs\' boxes on the base page, one a line, found at their places with no search (design §3.4)', async () => {
    const runs: Run[] = [
      { s: 'alpha beta', x: 72, y: 700 }, { s: 'x', x: 127, y: 700 }, { s: '2', x: 132, y: 703.5, size: 7 },
      { s: 'gamma delta epsilon zeta', x: 140, y: 700 }, { s: 'a+', x: 265, y: 700 },
      { s: 'b', x: 72, y: 688 }, { s: 'eta theta iota kappa', x: 82, y: 688 },
    ]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 182, 688], ['p0.1a', 1, 122, 700], ['p0.1b', 1, 135.5, 700], ['p0.3a', 1, 260, 700], ['p0.3b', 1, 77, 688]],
      units: [unit('para', [text('alpha beta '), ph('$x^2$'), text(' gamma delta epsilon zeta '), ph('$a+b$'), text(' eta theta iota kappa')])],
    }
    const marks = await marksOf(w)
    // each segment: the extent of the owned glyphs of the marks file on its line (their origins, advance and ink), no more
    const owned = (k: number) => { const row = marks.owned.find(r => r[0] === `p0.${k}a`) as number[]; return Array.from({ length: row[2] as number }, (_, j) => row.slice(3 + 5 * j, 8 + 5 * j)) }
    expect(owned(1).map(g => [g[0], g[1], g[2]])).toEqual([[1, 127, 700], [1, 132, 703.5]])
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 1).slice(4)).toEqual([1, 127, 700, 135.5, 703.5 + 5.25, 697.5])
    expect(phOf(file, 0, 3).slice(4)).toEqual([1, 265, 700, 275, 707.5, 697.5, 1, 72, 688, 77, 695.5, 685.5])
    expect(stats.ph).toMatchObject({ found: 2, lost: 0, owned: 5, matched: 5, unmatched: 0, twice: 0 })
    // a glyph of the base page 0.03 pt off its owned place is not its own: no search finds it, the piece LOST (the base page is
    // the final pass of the compile the marks were read from, every glyph where it was; ownedOn)
    const off = await made({ ...w, base: [{ runs: runs.map(r => (r.s === 'x' ? { ...r, x: r.x + 0.03 } : r)) }] })
    expect(phOf(off.file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(off.stats.ph.why).toEqual({ 'a glyph of its own not on the base page': 1 })
    // within the marks file's hundredths it is the same glyph
    const near = await made({ ...w, base: [{ runs: runs.map(r => (r.s === 'x' ? { ...r, x: r.x + 0.004 } : r)) }] })
    expect(phOf(near.file, 0, 1).slice(0, 5)).toEqual([0, 1, 0, 0, 1])
    // and no module of the engine matches glyphs across two PDFs any more
    const { existsSync } = await import('node:fs')
    for (const gone of ['match.mjs', 'tolerant.mjs']) expect(existsSync(`src/pdf-reader/engine/layout/${gone}`), gone).toBe(false)
  })

  it('a footnote\'s call no mark may stand before, after a paper\'s macro (\\xspace sets no space before \\footnote): placed from its own ink, the macro\'s parted from it by its text (2609.20976v1 p5u19)', async () => {
    // `\\lgnrm \\footnote{\\url{…}}~\\citep{a}`: the macro's opening mark, the citation's two, and none for the call between
    const runs: Run[] = [{ s: 'The code ', x: 72, y: 700 }, { s: 'lognormal_galaxies', x: 117, y: 700 }, { s: '1', x: 207, y: 703.5, size: 7 }, { s: '[1], which more words here.', x: 213, y: 700 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 348, 700], ['p0.1a', 1, 117, 700], ['p0.5a', 1, 213, 700], ['p0.5b', 1, 228, 700]],
      units: [unit('para', [text('The code '), ph('\\lgnrm'), text(' '), ph('\\footnote{\\url{https://x.org}}'), ph('~'), ph('\\citep{a}'), text(', which more words here.')])],
    }
    // (with the text the probe showed \\lgnrm sets: the macro's glyphs, the raised call's)
    const { file, stats } = await made({ ...w, texts: [['\\lgnrm', 'lognormal_galaxies']] })
    expect(phOf(file, 0, 1).slice(3)).toEqual([0, 1, 117, 700, 207, 707.5, 697.5])
    expect(phOf(file, 0, 3).slice(2)).toEqual([PH_KINDS.indexOf('footnote'), PH_FLAG.RAISED, 1, 207, 700, 210.5, 703.5 + 5.25, 703.5 - 1.75])
    expect(stats.ph).toMatchObject({ lost: 0 })
    // (with none, as before: the call LOST, and the macro with it — its unit the original's)
    const before = await made(w)
    expect([phOf(before.file, 0, 1)[3], phOf(before.file, 0, 3)[3]]).toEqual([PH_FLAG.LOST, PH_FLAG.LOST])
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

  it('a found piece\'s row ends with its glyphs\' fill where it is not black: the one colour of more than half of them, else MIXED_FILL', async () => {
    // (a citation in hyperref's colorlinks blue; a formula of a red glyph and a blue one; one black; one filled with a pattern)
    const parts: [string, string?][] = [['see the work '], ['[12]', '#0071bc'], [' and '], ['a', '#ff0000'], ['b', '#0071bc'], [' then x and '], ['y', 'pattern'], [' end']]
    const runs: Run[] = []
    let x = 72
    for (const [s, fill] of parts) { runs.push({ s, x, y: 700, ...(fill ? { fill } : {}) }); x += s.length * CH * 10 }
    const at = (j: number) => 72 + j * CH * 10
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, x, 700], ['p0.1a', 1, at(13), 700], ['p0.1b', 1, at(17), 700], ['p0.3a', 1, at(22), 700], ['p0.3b', 1, at(24), 700],
        ['p0.5a', 1, at(30), 700], ['p0.5b', 1, at(31), 700], ['p0.7a', 1, at(36), 700], ['p0.7b', 1, at(37), 700]],
      units: [unit('para', [text('see the work '), ph('\\cite{k}'), text(' and '), ph('$ab$'), text(' then '), ph('$x$'), text(' and '), ph('$y$'), text(' end')])],
    })
    const cite = phOf(file, 0, 1), two = phOf(file, 0, 3), black = phOf(file, 0, 5), pattern = phOf(file, 0, 7)
    expect([cite, two, black, pattern].map(r => r?.length)).toEqual([11, 11, 10, 10])
    expect(cite?.at(-1)).toBe(0x0071bc)
    expect(two?.at(-1)).toBe(MIXED_FILL)
    // (the index's: the drawer's)
    const index = indexLayout(file)
    expect([1, 3, 5, 7].map(k => index.unit(0)?.ph.get(k)?.fill)).toEqual([0x0071bc, MIXED_FILL, null, null])
  })

  it('a piece drawn stroked alone (text rendering mode 1 or 5) has no fill, whatever fill the state holds; filled and stroked (2) its fill', async () => {
    // (three citations in a state whose fill is red: one stroked alone, one stroked and clipped, one filled and stroked)
    const parts: [string, number?][] = [['see '], ['[1]', 1], [' and '], ['[2]', 5], [' then '], ['[3]', 2], [' end']]
    const runs: Run[] = []
    let x = 72
    for (const [s, tr] of parts) { runs.push({ s, x, y: 700, ...(tr !== undefined ? { tr, fill: '#ff0000' } : {}) }); x += s.length * CH * 10 }
    const at = (j: number) => 72 + j * CH * 10
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, x, 700], ['p0.1a', 1, at(4), 700], ['p0.1b', 1, at(7), 700], ['p0.3a', 1, at(12), 700], ['p0.3b', 1, at(15), 700], ['p0.5a', 1, at(21), 700], ['p0.5b', 1, at(24), 700]],
      units: [unit('para', [text('see '), ph('\\cite{a}'), text(' and '), ph('\\cite{b}'), text(' then '), ph('\\cite{c}'), text(' end')])],
    })
    expect([1, 3, 5].map(k => phOf(file, 0, k)?.length)).toEqual([10, 10, 11])
    expect(phOf(file, 0, 5)?.at(-1)).toBe(0xff0000)
  })

  it('a piece whose points are out of order, or set twice, is LOST; one whose points hold nothing is EMPTY', async () => {
    const runs: Run[] = [{ s: 'one two three four five six seven', x: 72, y: 700 }]
    const at = (j: number) => xAt(runs[0] as Run, j)
    const { file, stats } = await made({
      pages: [{ runs }],
      // p0.1a off every line, its point last in the stream; p0.3a and p0.3b at one place; p0.5: its opening mark set
      // twice, dropped
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(3), 650], ['p0.1b', 1, at(7), 700], ['p0.3a', 1, at(14), 700], ['p0.3b', 1, at(14), 700], ['p0.5a', 1, at(23), 700], ['p0.5b', 1, at(27), 700]],
      units: [unit('para', [text('one '), ph('$t$'), text(' three '), ph('\\cite{x}'), text(' five '), ph('$s$'), text(' seven')])],
    }, 'pdfTeX warning (dest): destination with the same identifier (name{axt-p0.5a}) has been already used, duplicate ignored\n')
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 2, PH_FLAG.EMPTY])
    expect(phOf(file, 0, 5)).toEqual([0, 5, 0, PH_FLAG.LOST])
    expect(stats.ph).toMatchObject({ marked: 3, found: 0, empty: 1, lost: 2 })
  })

  it('a piece whose closing point was never read and that owns nothing before the next point is LOST, not EMPTY (no-ink round)', async () => {
    // 2610.19159's shape: a code line's opening quote, \textquotedbl{}, its opening point read at its own glyph and its
    // closing one never, another piece's point (set late) at the same glyph: the open range holds nothing, though the
    // quote stands right there. Nothing proves it set no ink: its ink is not known
    const runs: Run[] = [{ s: 'x y echo "=== a b', x: 72, y: 700 }]
    const at = (j: number) => xAt(runs[0] as Run, j)
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.3a', 1, at(9), 700], ['p0.1a', 1, at(9), 700]],
      units: [unit('para', [text('x '), ph('\\#'), text(' y echo '), ph('\\textquotedbl{}'), text('=== a b')])],
    }
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 3)).toEqual([0, 3, 6, PH_FLAG.LOST])
    expect(stats.ph.why['open, nothing owned']).toBe(1)
    // (both points read with nothing between them: TeX set nothing there, EMPTY as before)
    const closed = await made({ ...w, marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.3a', 1, at(9), 700], ['p0.3b', 1, at(9), 700]] })
    expect(phOf(closed.file, 0, 3)).toEqual([0, 3, 6, PH_FLAG.EMPTY])
  })

  it("each colour piece's run's fill as the marked original's log gives it, a key only where a unit has one (PR-C)", async () => {
    const runs: Run[] = [{ s: 'see blue words and then red ones', x: 72, y: 700 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700]],
      units: [unit('para', [text('see '), { t: 'open', id: 1, src: '\\textcolor{blue!60!black}{' }, text('blue words'), { t: 'close', id: 1, src: '}' }, text(' and then '), ph('\\color{red}'), text(' red ones')])],
    }
    const log = 'AXT-COLOUR c0.1 0 0 0.6 rg 0 0 0.6 RG\nAXT-COLOUR c0.5 1 0 0 rg 1 0 0 RG\n'
    const { file, stats } = await made(w, log)
    expect(file.colours).toEqual([[0, 1, 0x000099], [0, 5, 0xff0000]])
    expect(stats.colours).toEqual({ pieces: 2, evaluated: 2 })
    expect(indexLayout(file).unit(0)?.colours).toEqual(new Map([[1, 0x000099], [5, 0xff0000]]))
    // (the log silent, the piece's colour not known: no row, and no key)
    const silent = await made(w, 'AXT-COLOUR c0.1 Red\n')
    expect(Object.hasOwn(silent.file, 'colours')).toBe(false)
    expect(encodeLayout(silent.file)).not.toContain('colours')
    expect(silent.stats.colours).toEqual({ pieces: 2, evaluated: 0 })
  })

  it('one glyph to one piece: a second piece whose own glyph is not on the base page is LOST, and takes nothing of the first\'s', async () => {
    const ours: Run[] = [{ s: 'say XX now and later', x: 72, y: 700 }]
    const at = (j: number) => xAt(ours[0] as Run, j)
    const w: World = {
      pages: [{ runs: ours }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(ours[0] as Run), 700], ['p0.1a', 1, at(4), 700], ['p0.1b', 1, at(5), 700], ['p0.2a', 1, at(5), 700], ['p0.2b', 1, at(6), 700]],
      units: [unit('para', [text('say '), ph('$X$'), ph('$X$'), text(' now and later')])],
    }
    // each its own X
    const both = await made(w)
    expect(phOf(both.file, 0, 1).slice(5, 8)).toEqual([at(4), 700, at(5)])
    expect(phOf(both.file, 0, 2).slice(5, 8)).toEqual([at(5), 700, at(6)])
    expect(both.stats.ph).toMatchObject({ found: 2, twice: 0, unmatched: 0, owned: 2, matched: 2 })
    // the base page holds one X: the first piece's; the second is LOST, never found on the first's glyph (no search: each
    // owned glyph at its own place, ownedOn)
    // (arXiv's page the base page's: its line in place)
    const base = [{ runs: [{ s: 'say X now and later', x: 72, y: 700 }] }]
    const one = await made({ ...w, pages: base, marked: [{ runs: ours }], base })
    expect(phOf(one.file, 0, 1).slice(5, 8)).toEqual([at(4), 700, at(5)])
    expect(phOf(one.file, 0, 2)).toEqual([0, 2, 0, PH_FLAG.LOST])
    expect(one.stats.ph.why).toEqual({ 'a glyph of its own not on the base page': 1 })
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

  it('a unit\'s CENTRED is TeX\'s where the log tells its alignment (marks.mjs readAlign), whatever its lines look like', async () => {
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    para.push({ s: 'last line of it', x: 72, y: 652 })
    const cap = [{ s: 'Figure caption text', x: 172 - 47.5, y: 600 }, { s: 'its end', x: 172 - 17.5, y: 588 }]
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const w: World = {
      pages: [{ runs: [...para, ...cap] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[4] as Run), 652], ['1s', 1, cap[0]?.x ?? 0, 600], ['1e', 1, endOf(cap[1] as Run), 588]],
      units: [unit('para', [text(ws(para))]), unit('caption', [text(ws(cap))])],
    }
    // (the paragraph told centred, the caption flush left: TeX's word, not the lines')
    const { file } = await made(w, 'AXT-ALIGN 0 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 1 p 0 0.0pt 1 1.0pt 1 1.0pt\n')
    expect((file.units[0]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
    expect((file.units[1]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(0)
    // (a caption in a box, mode h: no word, its lines read as before)
    const boxed = await made(w, 'AXT-ALIGN 1 h 0 0.0pt 0 0.0pt 1 1.0pt\n')
    expect((boxed.file.units[1]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
  })

  it('a unit TeX set flush left is FLUSH_LEFT, one flush right FLUSH_RIGHT, by TeX\'s word alone, never by its lines', async () => {
    // (a justified paragraph of 200 pt lines from 72, the column; a ragged one, its lines short of the column's edge; a quote set
    // flush right, its lines ending on the edge from starts that vary)
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    para.push({ s: 'last line of it', x: 72, y: 652 })
    const rag = [{ s: 'x'.repeat(30), x: 72, y: 620 }, { s: 'y'.repeat(24), x: 72, y: 608 }, { s: 'z'.repeat(16), x: 72, y: 596 }]
    const quote = [{ s: 'q'.repeat(30), x: 122, y: 560 }, { s: 'r'.repeat(20), x: 172, y: 548 }]
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const w: World = {
      pages: [{ runs: [...para, ...rag, ...quote] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[4] as Run), 652], ['1s', 1, 72, 620], ['1e', 1, endOf(rag[2] as Run), 596], ['2s', 1, 122, 560], ['2e', 1, endOf(quote[1] as Run), 548]],
      units: [unit('para', [text(ws(para))]), unit('para', [text(ws(rag))]), unit('para', [text(ws(quote))])],
    }
    const flush = (f: { units: unknown[][] }, i: number) => ((f.units[i]?.[3] as number) ?? 0) & (UNIT_FLAG.FLUSH_LEFT | UNIT_FLAG.FLUSH_RIGHT)
    // (\raggedright: \rightskip alone stretches; \raggedleft: \leftskip alone)
    const LEFT = 'p 0 0.0pt 1 1.0pt 1 1.0pt', RIGHT = 'p 1 1.0pt 0 0.0pt 0 0.0pt', JUST = 'p 0 0.0pt 0 0.0pt 1 1.0pt'
    const told = (await made(w, `AXT-ALIGN 0 ${JUST}\nAXT-ALIGN 1 ${LEFT}\nAXT-ALIGN 2 ${RIGHT}\n`)).file
    expect([0, 1, 2].map(i => flush(told, i))).toEqual([0, UNIT_FLAG.FLUSH_LEFT, UNIT_FLAG.FLUSH_RIGHT])
    expect([0, 1, 2].map(i => indexLayout(told).unit(i)?.flush)).toEqual([null, 'left', 'right'])
    // (no word from TeX: neither flag, whatever the lines look like: the ragged one is not read off its short lines)
    const none = (await made(w)).file
    expect([0, 1, 2].map(i => flush(none, i))).toEqual([0, 0, 0])
    // (TeX's word whatever the lines look like: a paragraph TeX set flush left whose lines but its last reach the column's edge
    // is flush left all the same; it was the probe that misread a boxed paragraph's alignment, and it reads its own now)
    const edge = (await made(w, `AXT-ALIGN 0 ${LEFT}\n`)).file
    expect(flush(edge, 0)).toBe(UNIT_FLAG.FLUSH_LEFT)
    // (a centred unit is CENTRED and neither flush flag)
    const centred = (await made(w, `AXT-ALIGN 1 p 1 1.0pt 1 1.0pt 0 0.0pt\n`)).file
    expect(((centred.units[1]?.[3] as number) ?? 0) & (UNIT_FLAG.CENTRED | UNIT_FLAG.FLUSH_LEFT | UNIT_FLAG.FLUSH_RIGHT)).toBe(UNIT_FLAG.CENTRED)
  })

  it('a one-line paragraph TeX set justified and its own glue centred (\\hfill X\\hfill) is CENTRED, off both edges by more than two ems; one nearer an edge is not', async () => {
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    // (the paragraph spans 72 to 272, its middle 172: a line of 60 on it, 70 off each edge; one of 170, 15 off each, an em and
    // a half: a footnote's line set from its mark that happens to sit on the middle, 1810.04805's unit 45)
    const narrow: Run = { s: 'x'.repeat(12), x: 142, y: 600 }, wide: Run = { s: 'y'.repeat(34), x: 87, y: 580 }
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const { file } = await made({
      pages: [{ runs: [...para, narrow, wide] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[3] as Run), 664], ['1s', 1, 142, 600], ['1e', 1, endOf(narrow), 600], ['2s', 1, 87, 580], ['2e', 1, endOf(wide), 580]],
      units: [unit('para', [text(ws(para))]), unit('para', [text(narrow.s)]), unit('footnote', [text(wide.s)])],
    }, 'AXT-ALIGN 0 p 0 0.0pt 0 0.0pt 1 1.0pt\nAXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt\nAXT-ALIGN 2 p 0 0.0pt 0 0.0pt 1 1.0pt\n')
    expect(file.units.map(u => (u[3] ?? 0) & UNIT_FLAG.CENTRED)).toEqual([0, UNIT_FLAG.CENTRED, 0])
  })

  it('with no word from TeX, a block of wide centred lines is CENTRED: one short of its column by more than an em', async () => {
    const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
    // (the paragraph spans 72 to 272; the caption's two lines centred on it, 190 and 185 wide, the second short of it by an em
    // and a half: both over 0.9 of the column, which had refused them)
    const cap = [{ s: 'x'.repeat(38), x: 77, y: 600 }, { s: 'y'.repeat(37), x: 79.5, y: 588 }]
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const { file } = await made({
      pages: [{ runs: [...para, ...cap] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[3] as Run), 664], ['1s', 1, 77, 600], ['1e', 1, endOf(cap[1] as Run), 588]],
      units: [unit('para', [text(ws(para))]), unit('caption', [text(ws(cap))])],
    })
    expect((file.units[1]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
  })

  it('a line across both columns is centred on the middle of the columns\' centres: an abstract indented in the left one moves its edges, not its centre (1810.04805\'s first page)', async () => {
    // (the left column 72 to 292, its abstract 87 to 277 in five lines against its paragraph's three, so that the column's
    // edges are the abstract's; the right column 320 to 540; a heading 206 to 406 across both, centred on the text block)
    const fill = (seed: string, n: number) => { let t = ''; for (let i = 0; t.length < n; i++) t += `${t ? ' ' : ''}${seed}${String.fromCharCode(97 + (i % 26))}${i}`.padEnd(4, 'q'); return t.slice(0, n).replace(/ $/, 'z') }
    const at = (s: string, x: number, y: number): Run => ({ s, x, y })
    const head = at(fill('h', 40), 206, 740)
    const abstract = [0, 1, 2, 3, 4].map(j => at(fill(`a${j}`, 38), 87, 700 - 12 * j))
    const left = [0, 1, 2].map(j => at(fill(`l${j}`, 44), 72, 630 - 12 * j))
    const right = [0, 1, 2, 3].map(j => at(fill(`r${j}`, 44), 320, 700 - 12 * j))
    const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
    const lastOf = (rs: Run[]) => rs.at(-1) as Run
    const { file } = await made({
      pages: [{ runs: [head, ...abstract, ...left, ...right] }],
      marks: [COLS2(1), ['0s', 1, 206, 740], ['0e', 1, endOf(head), 740], ['1s', 1, 87, 700], ['1e', 1, endOf(lastOf(abstract)), lastOf(abstract).y],
        ['2s', 1, 72, 630], ['2e', 1, endOf(lastOf(left)), lastOf(left).y], ['3s', 1, 320, 700], ['3e', 1, endOf(lastOf(right)), lastOf(right).y]],
      units: [unit('heading', [text(head.s)]), unit('abstract', [text(ws(abstract))]), unit('para', [text(ws(left))]), unit('para', [text(ws(right))])],
    })
    expect(file.units.map(u => (u[3] ?? 0) & UNIT_FLAG.CENTRED)).toEqual([UNIT_FLAG.CENTRED, 0, 0, 0])
  })

  it('a unit is laid only where every page it is on is drawable (its words arXiv\'s page\'s); none laid, the paper is refused, with the stats', async () => {
    // two pages of two paragraphs each; a paragraph a page of five lines
    const linesOn = (p: number): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * p + 10 * j, 10), x: 72, y: 700 - 12 * j }))
    const marks: Mark[] = []
    for (const p of [1, 2]) { const ls = linesOn(p); marks.push([`${2 * p - 2}s`, p, 72, 700], [`${2 * p - 2}e`, p, endOf(ls[4] as Run), 652], [`${2 * p - 1}s`, p, 72, 640], [`${2 * p - 1}e`, p, endOf(ls[9] as Run), 592]) }
    const units = [1, 2].flatMap(p => [unit('para', [text(words(100 * p, 50))]), unit('para', [text(words(100 * p + 50, 50))])])
    const w: World = { pages: [{ runs: linesOn(1) }, { runs: linesOn(2) }], marked: [{ runs: linesOn(1) }, { runs: linesOn(2) }], marks, units }
    expect((await made(w)).file.units.map(u => u[0])).toEqual([0, 1, 2, 3])
    // page 1's lines all 3 pt lower on arXiv's, one re-broken by a word: the same words, page 1 drawable, every unit laid
    const lower = linesOn(1).map(r => ({ ...r, y: r.y - 3 }))
    const shifted = await made({ ...w, pages: [{ runs: [...lower.slice(0, 2), { ...(lower[2] as Run), s: (lower[2] as Run).s.split(' ').slice(0, 9).join(' ') }, { ...(lower[3] as Run), s: `${(lower[2] as Run).s.split(' ')[9]} ${(lower[3] as Run).s}` }, ...lower.slice(4)] }, { runs: linesOn(2) }] })
    expect(shifted.file.units.map(u => u[0])).toEqual([0, 1, 2, 3])
    expect(shifted.stats.units.undrawn).toBe(0)
    expect(shifted.stats.lines.carried).toBe(10)
    // page 1 of other words on arXiv's (three lines of ten): page 1 not drawable, its two units left the original's
    const other = await made({ ...w, pages: [{ runs: linesOn(1).map((r, j) => (j >= 7 ? { ...r, s: words(900 + 10 * j, 10) } : r)) }, { runs: linesOn(2) }] })
    expect(other.file.units.map(u => u[0])).toEqual([2, 3])
    expect(other.stats.units).toMatchObject({ located: 2, undrawn: 2 })
    expect(other.file.unlaid).toEqual([[0, 'undrawn'], [1, 'undrawn']])
    // every page otherwise: no unit laid, the file refused ('carry'), the stats told; for parts too
    const none = { ...w, pages: [1, 2].map(p => ({ runs: linesOn(p).map((r, j) => ({ ...r, s: words(5000 + 100 * p + 10 * j, 10) })) })) }
    expect(await make(none)).toMatchObject({ refused: 'carry', stats: { units: { located: 0, undrawn: 4 }, lines: { carried: 0, total: 20 } } })
    const cut = await makeLayout({ units: w.units, marks: await marksOf(none), arxiv: baseOf(none), lineCheck: await lineCheckOf(none), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', parts: true })
    expect(cut).toMatchObject({ refused: 'carry' })
    // with no line check, every unit placed is laid
    const unchecked = await makeLayout({ units: w.units, marks: await marksOf(none), arxiv: baseOf(none), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
    expect('file' in unchecked && unchecked.file.units.map(u => u[0])).toEqual([0, 1, 2, 3])
    // a line check of other tokens than the base page's is refused
    await expect(makeLayout({ units: w.units, marks: await marksOf(w), arxiv: baseOf(w), lineCheck: { ...(await lineCheckOf(w)), tokenLine: new Int32Array(3) }, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })).rejects.toThrow(TypeError)
  })

  it('a unit over two pages is laid only where both are drawable', async () => {
    const p1 = Array.from({ length: 3 }, (_, j): Run => ({ s: words(10 * j, 10), x: 72, y: 100 - 12 * j }))
    const p2 = Array.from({ length: 3 }, (_, j): Run => ({ s: words(30 + 10 * j, 10), x: 72, y: 700 - 12 * j }))
    const marks: Mark[] = [['0s', 1, 72, 100], ['0e', 2, endOf(p2[2] as Run), 676]]
    const units = [unit('para', [text(words(0, 60))])]
    const w: World = { pages: [{ runs: p1 }, { runs: p2 }], marked: [{ runs: p1 }, { runs: p2 }], marks, units }
    expect((await made(w)).file.units.map(u => u[0])).toEqual([0])
    // page 2's last line on arXiv's page 1 (our compile behind arXiv's by a line): both pages drawn, their lines that moved alone
    // with no partner beside them (carry.mjs DRIFT_LINES), the unit laid
    const behind = await made({ ...w, pages: [{ runs: [...p1, { ...(p2[2] as Run), y: 60 }] }, { runs: p2.slice(0, 2) }] })
    expect(behind.file.units.map(u => u[0])).toEqual([0])
    // arXiv's page 2 of other words: page 2 not drawable, the unit not laid
    const other = await make({ ...w, pages: [{ runs: p1 }, { runs: p2.map((r, j) => ({ ...r, s: words(100 + 10 * j, 10) })) }] })
    expect(other).toMatchObject({ refused: 'carry', stats: { units: { undrawn: 1 } } })
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
    const out = await makeLayout({ units: w.units, marks: await marksOf(w), arxiv: baseOf(w), OPS, paper: { id: 'not an id', version: 1 }, left: '', pdfjs: '6.3.289' })
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
    const given: Page[] = [pages[0] as Page, { ...pages[1] as Page, ops: 'never' }, { ...pages[2] as Page, ops: 'fails' }, { ...pages[3] as Page, ops: 'capped' }]
    const w: World = { pages: given, marked: pages, base: given, marks, units }
    const out = make(w)
    await vi.advanceTimersByTimeAsync(OPS_MS + 1000)
    const done = await out
    if (!('file' in done)) throw new Error('refused')
    expect(done.file.units.map(u => u[0])).toEqual([0])
    // (each the original's for its marks, which stand on no page with ink)
    expect(done.file.unlaid).toEqual([[1, 'unplacedMarks'], [2, 'unplacedMarks'], [3, 'unplacedMarks']])
    expect(done.stats.timedOut).toEqual([2, 3])
    expect(done.stats.capped).toEqual([4])
  })

  it('a page whose walk goes too deep has no ink (capped); one past the box budget keeps it, its file the same (degraded)', async () => {
    const page = (s: string): Page => ({ runs: [{ s, x: 72, y: 700 }] })
    const pages = [page('alpha beta gamma'), page('delta epsilon zeta'), page('eta theta iota')]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, 152, 700], ['1s', 2, 72, 700], ['1e', 2, 162, 700], ['2s', 3, 72, 700], ['2e', 3, 142, 700]]
    const units = ['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota'].map(s => unit('para', [text(s)]))
    const of = (w: World) => make(w).then(d => { if (!('file' in d)) throw new Error('refused'); return d })
    // (a clock that stands: five hundred thousand paths are walked against the counted bounds alone, never the backstop)
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => 0)
    const deep: Page[] = [pages[0] as Page, { ...pages[1] as Page, ops: 'deep' }, { ...pages[2] as Page, ops: 'dense' }], shallow: Page[] = [pages[0] as Page, { ...pages[1] as Page, ops: 'deep' }, pages[2] as Page]
    const dense = await of({ pages: deep, marked: pages, base: deep, marks, units }).finally(() => clock.mockRestore())
    const plain = await of({ pages: shallow, marked: pages, base: shallow, marks, units })
    expect(dense.stats.capped).toEqual([2])
    expect(dense.stats.timedOut).toEqual([])
    expect(dense.stats.degraded).toEqual([3])
    expect(plain.stats.degraded).toEqual([])
    // page 2's unit stays the original's; page 3's is located as on the page without the paths, byte for byte
    expect(dense.file.units.map(u => u[0])).toEqual([0, 2])
    expect(encodeLayout(dense.file)).toBe(encodeLayout(plain.file))
  })

  it("a placeholder whose rule lies past the box budget is LOST, its rule never taken from a merged box (alone in its cell)", async () => {
    const runs: Run[] = [{ s: 'scaled by', x: 72, y: 700 }, { s: '\u221a', x: 122, y: 707.7 }, { s: 'dk', x: 127, y: 700 }, { s: 'here and there', x: 142, y: 700 }]
    const page: Page = { runs, boxes: [[127, 707.2, 137, 707.6, 2]], points: { 'p0.1a': [1, 0] } }
    const w: World = { pages: [page], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 700], ['p0.1a', 1, 117, 700], ['p0.1b', 1, 137, 700]], units: [unit('para', [text('scaled by '), ph('$\\sqrt{d_k}$'), text(' here and there')])] }
    const plain = await made(w)
    expect(phOf(plain.file, 0, 1).slice(4, 10)).toEqual([1, 122, 700, 137, 707.7 + 7.5, 697.5])
    // the base page with its bar past the budget: merged alone in its cell, its box the bar's exactly, and taken from the start
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => 0)
    const dense = await made({ ...w, marked: [page], pages: [page], base: [{ ...page, ops: 'dense' }] }).finally(() => clock.mockRestore())
    expect(dense.stats.degraded).toEqual([1])
    expect(phOf(dense.file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    // its unit located all the same, its text the page's
    expect(dense.file.units.map(u => u[0])).toEqual([0])
  })

  it("a marked page past a bound of the ink's walk is unread: no piece on it is owned, each LOST", async () => {
    const runs: Run[] = [{ s: 'alpha beta', x: 72, y: 700 }, { s: 'x', x: 127, y: 700 }, { s: 'gamma delta', x: 140, y: 700 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[2] as Run), 700], ['p0.1a', 1, 122, 700], ['p0.1b', 1, 132, 700]],
      units: [unit('para', [text('alpha beta '), ph('$x$'), text(' gamma delta')])],
    }
    expect((await made(w)).stats.ph).toMatchObject({ marked: 1, found: 1, lost: 0 })
    // the marked compile's page past STACK_MAX (after its points): capped, unread; arXiv's page as before
    const deep = await made({ ...w, marked: [{ runs, markedOps: 'deep' }] })
    expect(deep.stats.ph).toMatchObject({ marked: 1, found: 0, lost: 1 })
    expect(phOf(deep.file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
  })

  it('a page whose walk passes INK_MS has no ink (timedOut), the others theirs', async () => {
    const page = (s: string): Page => ({ runs: [{ s, x: 72, y: 700 }] })
    const pages = [page('alpha beta gamma'), page('delta epsilon zeta')]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, 152, 700], ['1s', 2, 72, 700], ['1e', 2, 162, 700]]
    const units = ['alpha beta gamma', 'delta epsilon zeta'].map(s => unit('para', [text(s)]))
    const marksFile = await marksOf({ pages, marks, units })
    // (a clock that moves INK_MS on at each reading: a page read in fewer steps than come between two readings never sees it)
    const real = performance.now.bind(performance)
    let skew = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => { skew += INK_MS; return real() + skew })
    try {
      const done = await makeLayout({ units, marks: marksFile, arxiv: arxivOf([pages[0] as Page, { ...pages[1] as Page, ops: 'slow' }]), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
      if (!('file' in done)) throw new Error('refused')
      // (the walk's backstop, apart from a list that never came)
      expect(done.stats.inkTimedOut).toEqual([2])
      expect(done.stats.timedOut).toEqual([])
      expect(done.stats.capped).toEqual([])
      expect(done.file.units.map(u => u[0])).toEqual([0])
    } finally { clock.mockRestore() }
  })

  it('each page let go once read, one cleanup a page after its list, or once given up on; the file the same', async () => {
    const page = (s: string): Page => ({ runs: [{ s, x: 72, y: 700 }] })
    const pages = [page('alpha beta gamma'), page('delta epsilon zeta'), page('eta theta iota'), page('kappa lambda mu')]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, 152, 700], ['1s', 2, 72, 700], ['1e', 2, 162, 700], ['2s', 3, 72, 700], ['2e', 3, 142, 700], ['3s', 4, 72, 700], ['3e', 4, 147, 700]]
    const units = ['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota', 'kappa lambda mu'].map(s => unit('para', [text(s)]))
    // page 2's list never comes and page 3's fails (both given up: giveUp, and a failed list's cancellation cleans up
    // nothing in PDF.js); page 4's is read, capped
    const given: Page[] = [pages[0] as Page, { ...pages[1] as Page, ops: 'never' }, { ...pages[2] as Page, ops: 'fails' }, { ...pages[3] as Page, ops: 'capped' }]
    const w: World = { pages: given, marked: pages, base: given, marks, units }
    const events: string[] = []
    const base = baseOf(w)
    const arxiv = {
      ...base,
      getPage: async (n: number) => {
        const p = await base.getPage(n)
        return { ...p, getOperatorList: () => p.getOperatorList().then(list => { events.push(`ops ${n}`); return list }), cleanup: () => { events.push(`cleanup ${n}`); return true } }
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    const marksFile = await marksOf(w)
    const run = (doc: typeof base) => makeLayout({ units, marks: marksFile, arxiv: doc, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
    const watched = run(arxiv), plain = run(base)
    await vi.advanceTimersByTimeAsync(2 * OPS_MS + 1000)
    const [a, b] = [await watched, await plain]
    warn.mockRestore()
    expect(events).toEqual(['ops 1', 'cleanup 1', 'cleanup 2', 'cleanup 3', 'ops 4', 'cleanup 4'])
    if (!('file' in a) || !('file' in b)) throw new Error('refused')
    expect(a.stats.timedOut).toEqual([2, 3])
    expect(encodeLayout(a.file)).toBe(encodeLayout(b.file))
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

  it('a unit set otherwise on arXiv\'s, its words the same, is laid: over our page its drawing is right; its line counts not in place', async () => {
    const body = Array.from({ length: 10 }, (_, j): Run => ({ s: words(10 * j, 10), x: 72, y: 600 - 12 * j }))
    const ours: Run = { s: 'alpha beta gamma delta', x: 72, y: 700 }
    // set otherwise on arXiv's: its words over two lines (no carrying: its own marks are where it stands on our page)
    const theirs: Run[] = [{ s: 'alpha beta', x: 72, y: 700 }, { s: 'gamma delta', x: 72, y: 688 }]
    const { file, stats } = await made({
      pages: [{ runs: [...theirs, ...body] }], marked: [{ runs: [ours, ...body] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(ours), 700], ['1s', 1, 72, 600], ['1e', 1, endOf(body[9] as Run), 492]],
      units: [unit('para', [text('alpha beta gamma delta')]), unit('para', [text(words(0, 100))])],
    })
    expect(file.units.map(u => u[0])).toEqual([0, 1])
    expect(stats.units).toMatchObject({ located: 2, undrawn: 0 })
    expect(stats.lines).toEqual({ carried: 10, total: 11, held: 0 })
  })

  it("a radical's sign, raised to its bar, is the formula's ink", async () => {
    // the sign's origin 7.7 above the line, past the window of scripts; its bar a rule over the radicand
    const runs: Run[] = [{ s: 'scaled by', x: 72, y: 700 }, { s: '\u221a', x: 122, y: 707.7 }, { s: 'dk', x: 127, y: 700 }, { s: 'here and there', x: 142, y: 700 }]
    // in the stream: the opening point, the sign, the bar, the radicand, the closing point
    const { file } = await made({
      pages: [{ runs, boxes: [[127, 707.2, 137, 707.6, 2]], points: { 'p0.1a': [1, 0] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 700], ['p0.1a', 1, 117, 700], ['p0.1b', 1, 137, 700]],
      units: [unit('para', [text('scaled by '), ph('$\\sqrt{d_k}$'), text(' here and there')])],
    })
    expect(phOf(file, 0, 1).slice(4, 10)).toEqual([1, 122, 700, 137, 707.7 + 7.5, 697.5])
    // the bar is its own, and erased with it
    expect(chunk(rowsOf(file, 0, 'erase'), 5).some(e => (e[1] as number) <= 127 && (e[3] as number) >= 137 && (e[2] as number) <= 707.2 && (e[4] as number) >= 707.6)).toBe(true)
  })

  it('the names of draft image frames are no lines of the paper', async () => {
    const text1: Run = { s: 'alpha beta gamma delta', x: 72, y: 700 }
    // (the draft's frame names its file; the final pass, the base page, draws the figure instead)
    const { stats } = await made({
      pages: [{ runs: [text1] }], marked: [{ runs: [text1, { s: 'images fig1 png', x: 200, y: 500 }] }], base: [{ runs: [text1] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(text1), 700], ['g1a', 1, 150, 480], ['g1b', 1, 400, 480], ['g1t', 1, 400, 560]],
      units: [unit('para', [text('alpha beta gamma delta')])],
    })
    expect(stats.lines).toEqual({ carried: 1, total: 1, held: 0 })
  })

  it('a placeholder the marked original gives no mark is LOST; a closing mark not set, its end is the text after it', async () => {
    const runs: Run[] = [{ s: 'Bold words follow here', x: 72, y: 700 }, { s: 'and a note', x: 72, y: 688 }, { s: '1', x: 122, y: 691.5, size: 7 }, { s: '. Then more', x: 125.5, y: 688 }]
    const note = unit('footnote', [text('A note.')])
    const { file, stats } = await made({
      // the call's point before its number in the stream
      pages: [{ runs, points: { 'n0.2a': [2, 0] } }],
      // the footnote's call: its opening mark alone, as Task 1's marking now sets it
      marks: [['0s', 1, 97, 700], ['0e', 1, endOf(runs[3] as Run), 688], ['n0.2a', 1, 122, 688]],
      units: [unit('para', [ph('\\textbf{Bold}'), text(' words follow here and a note'), { t: 'nested', unit: note }, text('. Then more')]), note],
    })
    // the bold at the unit's head: no mark, LOST, counted apart; before the start mark, outside the unit's lines
    expect(phOf(file, 0, 0)).toEqual([0, 0, 6, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
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

  it("a display that ends its unit is its own ink to the next unit's start mark, the next heading's number left out; alone at its page's foot, LOST", async () => {
    // MARK_DEF sets the unit's end mark before the display that ends it (where the display left the paragraph): in the
    // stream, the end mark's point, the display's opening point, the display, the next unit's number and start mark
    const runs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b', x: 150, y: 680 }, { s: '(2)', x: 252, y: 680 }, { s: '3', x: 72, y: 660, size: 12 }, { s: 'Results', x: 90, y: 660, size: 12 }, ...[0, 1, 2].map((j): Run => ({ s: words(10 + 10 * j, 10), x: 72, y: 640 - 12 * j }))]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 217, 700], ['p0.1a', 1, 217, 700], ['h1s', 1, 90, 660], ['h1e', 1, 132, 660], ['2s', 1, 72, 640], ['2e', 1, 267, 616]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\[a=b\\]')]), unit('heading', [text('Results')], { depth: 1 }), unit('para', [text(words(10, 30))])],
    }
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.NUMBERED, 1, 150, 680, 165, 687.5, 677.5, 1, 252, 680, 267, 687.5, 677.5])
    expect(stats.ph.byKind.display).toEqual([1, 1])
    // the heading's number is its label, not the display's
    expect(file.labels.map(l => l.slice(0, 4))).toEqual([[1, 0, 1, 72]])
    // nothing after it on its page, and no column body: its end is not known (the next mark on the next page), LOST, not
    // EMPTY; after its unit's end mark, outside the unit's lines
    const alone = await made({ ...w, pages: [{ runs: runs.slice(0, 3) }], marks: (w.marks as Mark[]).slice(0, 3), units: [w.units[0] as SourceUnit] })
    expect(phOf(alone.file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
    expect(alone.stats.ph.why).toEqual({ 'open, the next mark on another page': 1 })
  })

  it("a footnote's call after its unit's last word, which TeX gave no mark, is the raised run right after the end mark (2610.35877v1's abstract)", async () => {
    // (the abstract ends `step.\footnotemark`: TeX said a mark around the call moves the word after it, so it has none; the end
    // mark after "w9." and the call's raised "1" right after it. LOST, the abstract was the original's whole)
    const line: Run = { s: `${words(0, 9)} w9.`, x: 72, y: 700 }, mark: Run = { s: '1', x: endOf(line), y: 703.5, size: 7 }, next: Run = { s: words(10, 10), x: 72, y: 660 }
    const w: World = {
      pages: [{ runs: [line, mark, next] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(line), 700], ['1s', 1, 72, 660], ['1e', 1, endOf(next), 660]],
      units: [unit('abstract', [text(`${words(0, 9)} w9.`), ph('\\footnotemark')]), unit('para', [text(words(10, 10))])],
      // (TeX's answers in that paper: a word after the call moves under a mark, '2', so the call has none)
      switches: { '\\footnotemark': '00000020' },
    }
    const { file } = await made(w)
    const r = phOf(file, 0, 1)
    expect(r[3]).toBe(PH_FLAG.RAISED)
    expect(r.slice(4, 6)).toEqual([1, endOf(line)])
    // (a run right after the mark that is no raised mark, the next words on the line: not the call's, LOST as before)
    const level = await made({ ...w, pages: [{ runs: [line, { ...mark, y: 700, size: 10 }, next] }] })
    expect(phOf(level.file, 0, 1)[3]).toBe(PH_FLAG.LOST)
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
      // in the marked original's stream the cell after the paragraph
      pages: [{ runs }], marked: [{ runs, order: [0, 1, 3, 4, 2], points: { 't1s': [2, 0], 't1e': [2, 2] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 267, 660], ['p0.1a', 1, 217, 700], ['t1s', 1, 190, 680], ['t1e', 1, 200, 680]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\begin{equation}a b\\end{equation}'), text(` ${words(10, 10)}`)]), unit('cell', [text('zz')])],
    })
    expect(file.units.map(u => u[0])).toEqual([0, 1])
    expect(file.erase.map(([u]) => u)).toEqual([0])
    // a formula of two glyphs 6 pt apart either side of a rule of no height: three rectangles, the rule's 0.01 high
    const r: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: 'x', x: 140, y: 700 }, { s: 'y', x: 185, y: 700 }, { s: 'and more', x: 200, y: 700 }]
    const rule = await made({
      pages: [{ runs: r, boxes: [[151, 703, 179, 703, 3]] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 240, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 190, 700]],
      units: [unit('para', [text('see '), ph('$\\overline{x y}$'), text(' and more')])],
    })
    expect(chunk(rowsOf(rule.file, 0, 'erase'), 5).filter(e => e[1] === 151)).toEqual([[0, 151, 703, 179, 703.01]])
  })

  it("which pieces were marked is the marks file's: its classes and the paper's switch", async () => {
    // a citation a full stop follows, on a paper whose package moves it: the switch gave it no mark
    const runs: Run[] = [{ s: 'as shown', x: 72, y: 700 }, { s: '12', x: 112, y: 703, size: 7 }, { s: '. More words here', x: 119, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, 204, 700]], units: [unit('para', [text('as shown '), ph('\\cite{a}'), text('. More words here')])] }
    const switched = await made({ ...w, switches: { '\\cite': '22222222' } })
    expect(phOf(switched.file, 0, 1)).toEqual([0, 1, 2, PH_FLAG.LOST])
    expect(switched.stats.ph).toMatchObject({ marked: 0, unmarked: 1, lost: 0 })
    // the same marks file but made with every class marking it: its marks expected, and missing
    const plain = await made(w)
    expect(plain.stats.ph).toMatchObject({ marked: 1, unmarked: 0, lost: 1 })
  })

  it("the maker marks as the compile was marked: no probe run is every mark; a probe that did not answer a command is none", async () => {
    // the merge of Task 2's fix round 2 and Task 6b: the marks file said {} for "no probe", which Task 2's layoutMarking
    // reads as "the probe ran and answered nothing", so the maker took every citation of an unprobed compile for unmarked
    const runs: Run[] = [{ s: 'as shown', x: 72, y: 700 }, { s: '12', x: 112, y: 703, size: 7 }, { s: '. More words here', x: 119, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, 204, 700]], units: [unit('para', [text('as shown '), ph('\\cite{a}'), text('. More words here')])] }
    // no probe: the compile set the citation's marks, and the maker expects them
    expect((await made(w)).stats.ph).toMatchObject({ marked: 1, unmarked: 0 })
    // a probe that gave \cite no answer at all, or an x before a full stop: no mark, so unmarked (Task 2's m4)
    expect((await made({ ...w, switches: {} })).stats.ph).toMatchObject({ marked: 0, unmarked: 1 })
    expect((await made({ ...w, switches: { '\\cite': 'x0000000' } })).stats.ph).toMatchObject({ marked: 0, unmarked: 1 })
    // a probe that answered every mark: marked
    expect((await made({ ...w, switches: { '\\cite': '00000000' } })).stats.ph).toMatchObject({ marked: 1, unmarked: 0 })
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

  it("each page's operator list is waited for OPS_MS alone: no count of pages given up on makes a later page dark", async () => {
    // twelve pages whose lists never come: each asked, waited for OPS_MS and given up, that page alone (what a page given up
    // on leaves is that page's: oplist.mjs)
    const pages = Array.from({ length: 12 }, (_, j): Page => ({ runs: [{ s: `alpha beta gamma ${j}`, x: 72, y: 700 }], ops: 'never' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const asked: number[] = []
    const out = make({ pages, marked: pages.map(p => ({ runs: p.runs })), base: pages, marks: [], units: [unit('para', [text('alpha beta gamma 0')])] }, '', asked)
    await vi.advanceTimersByTimeAsync(13 * OPS_MS)
    const done = await out
    expect(asked).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(done.stats.timedOut).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    // eleven pages past OPS_CAP, then one whose list comes: it is read, its ink whole
    const mixed = pages.map((p, j): Page => ({ ...p, ops: j < 11 ? 'capped' : undefined }))
    const asked2: number[] = []
    const done2 = await make({ pages: mixed, marked: mixed.map(p => ({ runs: p.runs })), base: mixed, marks: [], units: [unit('para', [text('alpha beta gamma 0')])] }, '', asked2)
    expect(asked2).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(done2.stats.capped).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(done2.stats.timedOut).toEqual([])
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
    const out = make({ pages: [p('alpha beta gamma'), p('delta epsilon zeta')], marked: [{ runs: p('alpha beta gamma').runs }, { runs: p('delta epsilon zeta').runs }], base: [p('alpha beta gamma'), p('delta epsilon zeta')], marks: [], units: [] })
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

  it("a carried mark a few tenths off its glyph changes nothing: a piece is its own glyphs, its base glyph and no comma after it", async () => {
    // the opening mark carried 0.36 pt right of the formula's first glyph (2307.16209's $\\Psi_0$, $\\ell$), the closing
    // mark 0.2 pt into the comma after its formula; in the stream, each point where TeX set it
    const runs: Run[] = [{ s: 'shown by', x: 72, y: 700 }, { s: 'P', x: 117, y: 700 }, { s: '0', x: 122, y: 698, size: 7 }, { s: 'and more', x: 130.5, y: 700 }, { s: 'x', x: 175.5, y: 700 }, { s: ', then', x: 180.5, y: 700 }]
    const { file } = await made({
      pages: [{ runs, points: { 'p0.1a': [1, 0], 'p0.3b': [5, 0] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 210.5, 700], ['p0.1a', 1, 117.36, 700], ['p0.1b', 1, 125.5, 700], ['p0.3a', 1, 170.5, 700], ['p0.3b', 1, 180.7, 700]],
      units: [unit('para', [text('shown by '), ph('$P_0$'), text(' and more '), ph('$x$'), text(', then')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, 0, 1, 117, 700, 125.5, 707.5, 696.25])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 0, 0, 1, 175.5, 700, 180.5, 707.5, 697.5])
  })

  it("a placeholder across lines takes a row between them only where it lies between its marks' lines: never a text line", async () => {
    // the anchor's rows out of order: the line above comes between the formula's two lines in the content stream
    const runs: Run[] = [{ s: 'first line ends with', x: 72, y: 700 }, { s: 'a+', x: 177, y: 700 }, { s: 'words of a line above', x: 72, y: 712 }, { s: 'b', x: 72, y: 688 }, { s: 'then the rest', x: 82, y: 688 }]
    const { file, stats } = await made({
      // in TeX's content stream the line above comes first
      pages: [{ runs }], marked: [{ runs, order: [2, 0, 1, 3, 4] }],
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
    const marks = await marksOf(w, '', ['math'])
    const out = await makeLayout({ units: w.units, marks, arxiv: baseOf(w), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' })
    if (!('file' in out)) throw new Error('refused')
    expect(out.file.ph.map(r => [r[1], r[3]])).toEqual([[1, PH_FLAG.LOST], [3, 0]])
  })

  it("a display whose own ink the base page does not hold is LOST, not EMPTY", async () => {
    // the draft set x=y where the base page has the next unit's words (a draft's ink the final pass sets otherwise)
    const more = Array.from({ length: 12 }, (_, j): Run => ({ s: words(10 + 10 * j, 10), x: 72, y: 660 - 12 * j }))
    const theirs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b and more', x: 72, y: 680 }, ...more]
    const ours: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'x=y', x: 150, y: 690 }, { s: 'a=b and more', x: 72, y: 680 }, ...more]
    const lost = await made({
      pages: [{ runs: theirs }], marked: [{ runs: ours }], base: [{ runs: theirs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 217, 700], ['p0.1a', 1, 217, 700], ['1s', 1, 72, 680], ['1e', 1, 267, 528]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\[x=y\\]')]), unit('para', [text(`a=b and more ${words(10, 120)}`)])],
    })
    expect(phOf(lost.file, 0, 1)).toEqual([0, 1, 1, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
    expect(lost.stats.ph.empty).toBe(0)
  })
})

describe('makeLayout, the LOST survey (2026-10-15): a display group, a piece outside the unit, a part on its marks\' line', () => {
  it('a display group: the first display found with the group\'s ink, the later one JOINED, no segments of its own', async () => {
    // TeX sets no point for the second display (the empty paragraph between two displays): its ink is the first's
    const runs: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: 'a=b', x: 150, y: 680 }, { s: 'c=d', x: 150, y: 660 }, { s: 'where x holds', x: 72, y: 640 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 640], ['p0.1a', 1, endOf(runs[0] as Run), 700]],
      units: [unit('para', [text(`${words(0, 10)} `), ph('\\[a=b\\]'), text('\n'), ph('\\[c=d\\]'), text(' where x holds')])],
    })
    const first = phOf(file, 0, 1)
    expect(first[3]).toBe(0)
    expect(chunk(first.slice(4), 6).map(sg => sg[2])).toEqual([680, 660])
    expect(phOf(file, 0, 3)).toEqual([0, 3, 1, PH_FLAG.JOINED])
    expect(stats.ph).toMatchObject({ joined: 1, lost: 0, found: 1 })
    // the first not found: the later one LOST too
    const none = await made({ pages: [{ runs: runs.slice(0, 3) }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, endOf(runs[0] as Run), 700]], units: [unit('para', [text(`${words(0, 10)} `), ph('\\[a=b\\]'), text('\n'), ph('\\[c=d\\]'), text(' where x holds')])] })
    expect((phOf(none.file, 0, 3)[3] ?? 0) & PH_FLAG.LOST).toBe(PH_FLAG.LOST)
  })
  it("a display opening a unit, its start mark on the unit's first line, is OUTSIDE (the rows before the mark are no line of the unit's: the thesis's u69, u113, u432, u445)", async () => {
    // the start mark at the first text below the display; the unit's lines from it
    const runs: Run[] = [{ s: 'x=y+1', x: 150, y: 700 }, { s: words(0, 10), x: 72, y: 680 }, { s: words(10, 10), x: 72, y: 668 }]
    for (const lead of [{}, { lead: 'xy ' }]) {
      // (with the display's letters, latex-front's `lead`, the anchor gives the unit the display's row too, and the head
      // drop takes it away)
      const { file, stats } = await made({
        pages: [{ runs }],
        marks: [['0s', 1, 72, 680], ['0e', 1, endOf(runs[2] as Run), 668]],
        units: [unit('para', [ph('\\[x=y+1\\]'), text(`\n${words(0, 20)}`)], lead)],
      })
      expect(stats.lines.held).toBe('lead' in lead ? 1 : 0)
      expect(chunk(rowsOf(file, 0, 'lines'), 8).map(l => l[3])).toEqual([680, 668])
      expect(phOf(file, 0, 0)).toEqual([0, 0, 1, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
      // what makes it OUTSIDE: the first line begins at the start mark or past it, so no line of the unit's holds the display
      expect(chunk(rowsOf(file, 0, 'lines'), 8)[0]?.[1]).toBeGreaterThanOrEqual(72)
    }
  })
  it("the first line the head drop leaves is cut at the start mark: a head glued to the first word is no glyph of it, and is looked for beside the mark", async () => {
    // a display, then \\bert's "BERT" glued to the first word (1.5 pt, under GLUE's 0.2 em), the start mark between them
    const runs: Run[] = [{ s: 'x=y+1', x: 150, y: 700 }, { s: 'BERT', x: 72, y: 680 }, { s: words(0, 10), x: 93.5, y: 680 }, { s: words(10, 10), x: 72, y: 668 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 93.5, 680], ['0e', 1, endOf(runs[3] as Run), 668]],
      // (the display's letters, latex-front's `lead`: the anchor's lead walk gives the unit the display's row, which the
      // head drop takes away)
      units: [unit('para', [ph('\\[x=y+1\\]'), ph('\\bert'), text(` ${words(0, 20)}`)], { lead: 'xy ' })],
    }
    // the probe says nothing of the macro: it stays LOST, outside the unit's lines, and the first line holds none of its ink
    const { file, stats } = await made(w)
    expect(stats.lines.held).toBe(1)
    const lines = chunk(rowsOf(file, 0, 'lines'), 8)
    expect(lines.map(l => l[3])).toEqual([680, 668])
    expect(lines[0]?.[1]).toBeGreaterThanOrEqual(93.5)
    expect(chunk(rowsOf(file, 0, 'erase'), 5).every(e => (e[1] as number) >= 93.5 - 0.5 || e[0] !== 0)).toBe(true)
    expect(phOf(file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
    // the probe's "BERT": found beside the mark, a segment of the first line, which takes it in and erases it
    const found = await made({ ...w, texts: [['\\bert', 'BERT']] })
    expect(phOf(found.file, 0, 1).slice(3, 8)).toEqual([0, 1, 72, 680, 92])
    expect(chunk(rowsOf(found.file, 0, 'lines'), 8)[0]?.[1]).toBe(72)
    expect(phOf(found.file, 0, 0)).toEqual([0, 0, 1, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
  })
  it('a head text symbol drawn as its character keeps its glyph in the first line the head drop leaves: erased once, drawn once', async () => {
    // a display, then \\#'s "#" glued to the first word (1 pt), the start mark between them: symbolsOf counted the "#" on
    // that line (TEXT) before the drop, and the cut at the mark keeps it, so the erase takes it in
    const runs: Run[] = [{ s: 'x=y+1', x: 150, y: 700 }, { s: '#', x: 72, y: 680 }, { s: words(0, 10), x: 78, y: 680 }, { s: words(10, 10), x: 72, y: 668 }]
    const { file, stats } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 78, 680], ['0e', 1, endOf(runs[3] as Run), 668]],
      units: [unit('para', [ph('\\[x=y+1\\]'), ph('\\#'), text(` ${words(0, 20)}`)], { lead: 'xy ' })],
    })
    expect(stats.lines.held).toBe(1)
    expect(phOf(file, 0, 1)[3]).toBe(PH_FLAG.TEXT)
    expect(chunk(rowsOf(file, 0, 'lines'), 8)[0]?.slice(1, 4)).toEqual([72, 223, 680])
    expect(chunk(rowsOf(file, 0, 'erase'), 5)[0]?.[1]).toBe(72)
    expect(phOf(file, 0, 0)).toEqual([0, 0, 1, PH_FLAG.LOST | PH_FLAG.OUTSIDE])
  })
  it("an inline part on no line goes to the line both its marks stand on, within the line's size of its baseline (2608.16117's \\frac)", async () => {
    // a fraction's numerator 7.6 pt over its line's baseline, past the part rule's reach
    const runs: Run[] = [{ s: 'the quantity', x: 72, y: 700 }, { s: 'pq', x: 140, y: 707.6 }, { s: 'FM', x: 140, y: 693 }, { s: 'is the stress', x: 160, y: 700 }]
    const { file, stats } = await made({
      // in the stream, the fraction between its two points
      pages: [{ runs, points: { 'p0.1a': [1, 0], 'p0.1b': [3, 0] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 700], ['p0.1a', 1, 135, 700], ['p0.1b', 1, 152, 700]],
      units: [unit('para', [text('the quantity '), ph('$\\frac{pq}{FM}$'), text(' is the stress')])],
    })
    const row = phOf(file, 0, 1)
    expect((row[3] ?? 0) & PH_FLAG.LOST).toBe(0)
    expect(row[6]).toBe(700)
    expect(stats.ph.lost).toBe(0)
  })
})

describe('makeLayout, the content stream (Task 6b)', () => {
  const segsOf = (row: number[]) => chunk(row.slice(4), 6)

  it("a sum raised off its line, and its limits, are the formula's own on its line: whole (1706.03762's 34.9)", async () => {
    // the line above is the unit's own: its baseline nearer the raised sum than the formula's line
    const ours: Run[] = [
      { s: 'the dot product of two words', x: 72, y: 712 }, { s: 'is', x: 72, y: 700 }, { s: 'q·k=', x: 87, y: 700 }, { s: '∑', x: 107, y: 706.72 },
      { s: 'dk', x: 112, y: 703.6, size: 7 }, { s: 'i=1', x: 112, y: 697.5, size: 7 }, { s: 'qiki', x: 123, y: 700 }, { s: 'over all', x: 148, y: 700 },
    ]
    // a paragraph below, so that the lines found are most of the page's
    const below = Array.from({ length: 12 }, (_, j): Run => ({ s: words(10 * j, 10), x: 72, y: 600 - 12 * j }))
    const { file, stats } = await made({
      pages: [{ runs: [...ours, ...below] }], marked: [{ runs: [...ours, ...below], points: { 'p0.1a': [2, 0], 'p0.1b': [7, 0] } }],
      marks: [['0s', 1, 72, 712], ['0e', 1, 188, 700], ['p0.1a', 1, 82, 700], ['p0.1b', 1, 143, 700], ['1s', 1, 72, 600], ['1e', 1, endOf(below[11] as Run), 468]],
      units: [unit('para', [text('the dot product of two words is '), ph('$q\\cdot k=\\sum_{i=1}^{d_k}q_ik_i$'), text(' over all')]), unit('para', [text(words(0, 120))])],
    })
    const segs = segsOf(phOf(file, 0, 1))
    // one segment on the formula's line, the sum's top in it
    expect(segs).toEqual([[1, 87, 700, 143, 706.72 + 7.5, 697.5 - 1.75]])
    expect(stats.ph).toMatchObject({ found: 1, lost: 0, unmatched: 0, twice: 0 })
  })

  it("a fraction's bar and its denominator's script 5.27 pt below the line are its own (1706.03762's 33.3)", async () => {
    const runs: Run[] = [
      { s: 'divided by', x: 72, y: 700 }, { s: '1', x: 123, y: 705.5, size: 7 }, { s: '√', x: 121, y: 699, size: 7 }, { s: 'd', x: 125.5, y: 696.5, size: 7 },
      { s: 'k', x: 129, y: 694.73, size: 5 }, { s: 'and more', x: 140, y: 700 },
    ]
    const { file } = await made({
      pages: [{ runs, boxes: [[121, 702.3, 133.5, 702.7, 2]], points: { 'p0.1a': [1, 0], 'p0.1b': [5, 0] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 180, 700], ['p0.1a', 1, 122, 700], ['p0.1b', 1, 135, 700]],
      units: [unit('para', [text('divided by '), ph('$\\frac{1}{\\sqrt{d_k}}$'), text(' and more')])],
    })
    // the k's bottom, the numerator's top, the bar inside
    expect(segsOf(phOf(file, 0, 1))).toEqual([[1, 121, 700, 133.5, 705.5 + 5.25, 694.73 - 1.25]])
  })

  it("a closing bracket past the carried closing mark is the piece's own: an eqref's ')', a cite's ']' (2307.16209's 429.18, 210.43)", async () => {
    const runs: Run[] = [{ s: 'by', x: 72, y: 700 }, { s: '(3.83)', x: 87, y: 700 }, { s: 'and', x: 122, y: 700 }, { s: '[52]', x: 142, y: 700 }, { s: 'then more', x: 167, y: 700 }]
    const { file } = await made({
      pages: [{ runs, points: { 'p0.1b': [1, 6], 'p0.3b': [3, 4] } }],
      // the closing marks carried 2.8 pt before the bracket's end, and inside the 2 before it
      marks: [['0s', 1, 72, 700], ['0e', 1, 212, 700], ['p0.1a', 1, 82, 700], ['p0.1b', 1, 114.2, 700], ['p0.3a', 1, 137, 700], ['p0.3b', 1, 155, 700]],
      units: [unit('para', [text('by '), ph('\\eqref{e}'), text(' and '), ph('\\cite{l}'), text(' then more')])],
    })
    expect(phOf(file, 0, 1).slice(5, 8)).toEqual([87, 700, 117])
    expect(phOf(file, 0, 3).slice(5, 8)).toEqual([142, 700, 162])
  })

  it('a piece whose own glyph or rule the base page lacks is LOST, never found short', async () => {
    const ours: Run[] = [{ s: 'we have', x: 72, y: 700 }, { s: 'x+y', x: 112, y: 700 }, { s: 'here and', x: 132, y: 700 }]
    const w: World = {
      // (arXiv's page the base page's: the page drawable)
      pages: [{ runs: [ours[0], { s: 'x+', x: 112, y: 700 }, ours[2]] as Run[] }], marked: [{ runs: ours }], base: [{ runs: [ours[0], { s: 'x+', x: 112, y: 700 }, ours[2]] as Run[] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 172, 700], ['p0.1a', 1, 107, 700], ['p0.1b', 1, 127, 700]],
      units: [unit('para', [text('we have '), ph('$x+y$'), text(' here and')])],
    }
    const short = await made(w)
    expect(phOf(short.file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(short.stats.ph.why).toEqual({ 'a glyph of its own not on the base page': 1 })
    // its bar not on the base page
    const r: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: 'x', x: 140, y: 700 }, { s: 'y', x: 185, y: 700 }, { s: 'and more', x: 200, y: 700 }]
    const bar: World = {
      pages: [{ runs: r }], marked: [{ runs: r, boxes: [[151, 703, 179, 703.4, 3]] }], base: [{ runs: r }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 240, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 190, 700]],
      units: [unit('para', [text('see '), ph('$\\overline{x y}$'), text(' and more')])],
    }
    const nobar = await made(bar)
    expect(phOf(nobar.file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
    expect(nobar.stats.ph.why).toEqual({ 'a rule of its own not on the base page': 1 })
    // with it: found, the bar its own
    const withBar = await made({ ...bar, base: [{ runs: r, boxes: [[151, 703, 179, 703.4]] }] })
    expect(phOf(withBar.file, 0, 1).slice(4, 10)).toEqual([1, 140, 700, 190, 707.5, 697.5])
  })

  it("a found citation's and reference's own text: their glyphs' characters, a space where the glyphs stand apart; none of a control character", async () => {
    const runs: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: '[1, 2]', x: 92, y: 700 }, { s: 'and', x: 127, y: 700 }, { s: '3', x: 147, y: 700 }, { s: 'with', x: 157, y: 700 }, { s: 'x', x: 182, y: 700 }, { s: 'now', x: 192, y: 700 }]
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 207, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 122, 700], ['p0.3a', 1, 142, 700], ['p0.3b', 1, 152, 700], ['p0.5a', 1, 177, 700], ['p0.5b', 1, 187, 700]],
      units: [unit('para', [text('see '), ph('\\cite{a,b}'), text(' and '), ph('\\ref{s}'), text(' with '), ph('$x$'), text(' now')])],
    }
    const { file, stats } = await made(w)
    expect(file.pageText).toEqual([[0, 1, '[1, 2]'], [0, 3, '3']])
    expect(stats.ph.texts).toBe(2)
    // the 3 drawn under a control character's Unicode: found at its place, but no page text
    const control = await made({ ...w, pages: [{ runs: runs.map(r => (r.s === '3' ? { ...r, s: '\u0003' } : r)) }] })
    expect(phOf(control.file, 0, 3).slice(5, 8)).toEqual([147, 700, 152])
    expect(control.file.pageText).toEqual([[0, 1, '[1, 2]']])
  })
})

describe('makeLayout, the maker round (Fix 1): text symbols and the macros TeX says set no ink', () => {
  const pt = (f: LayoutFile, id: number, k: number) => f.pageText.find(e => e[0] === id && e[1] === k)?.[2] ?? null
  it('a \\% glued to its number, which the marking leaves unmarked, is TEXT where its line shows a %; LOST where none', async () => {
    const runs: Run[] = [{ s: 'error of 3.57% on the test', x: 72, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700]], units: [unit('para', [text('error of 3.57'), ph('\\%'), text(' on the test')])] }
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.TEXT])
    expect(pt(file, 0, 1)).toBe('%')
    expect(stats.ph).toMatchObject({ symbols: 1, unmarked: 0 })
    // the % is the line's: its glyph inside the erase
    const xs = chunk(rowsOf(file, 0, 'erase'), 5)
    expect(xs.some(([, x0, , x1]) => x0! <= 72 + 13 * 5 && x1! >= 72 + 14 * 5)).toBe(true)
    // arXiv's line with no % (another paper's definition): its rendering not found, LOST
    const other: Run[] = [{ s: 'error of 3.57 on the test', x: 72, y: 700 }]
    const lost = await made({ ...w, pages: [{ runs: other }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(other[0] as Run), 700]] })
    expect(phOf(lost.file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.LOST])
    expect(lost.stats.ph).toMatchObject({ symbols: 0, unmarked: 1 })
  })
  it('a paper\'s macro TeX showed sets one mark of punctuation (apacite\'s \\BPBI, ".~" between initials), glued to the initial before it: TEXT where its line shows that mark', async () => {
    const runs: Run[] = [{ s: 'Harrington, J. E., Jr. A study.', x: 72, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700]], units: [unit('reference', [text('Harrington, J'), ph('\\BPBI'), text(' E., Jr. A study.')])] }
    const said = await made({ ...w, texts: [['\\BPBI', '.']] })
    expect(phOf(said.file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.TEXT])
    expect(pt(said.file, 0, 1)).toBe('.')
    // (with no text from TeX, or one of letters, as before: its rendering not found)
    expect(phOf((await made(w)).file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.LOST])
    expect(phOf((await made({ ...w, texts: [['\\BPBI', 'and']] })).file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.LOST])
  })
  it('a \\# at a unit\'s head, before its start mark: its glyph right before the first word is the unit\'s, TEXT', async () => {
    const runs: Run[] = [{ s: '#', x: 72, y: 700 }, { s: 'layers of the net', x: 78, y: 700 }]
    const { file } = await made({ pages: [{ runs }], marks: [['0s', 1, 78, 700], ['0e', 1, endOf(runs[1] as Run), 700]], units: [unit('para', [ph('\\#'), text(' layers of the net')])] })
    expect(phOf(file, 0, 0)).toEqual([0, 0, 6, PH_FLAG.TEXT])
    // the first line from the # on
    expect(rowsOf(file, 0, 'lines')[1]).toBe(72)
  })
  it('a \\_ that OT1 draws as a rule on the baseline is TEXT, its rule taken into the erase', async () => {
    const runs: Run[] = [{ s: 'conv2', x: 72, y: 700 }, { s: 'x is the block', x: 100.6, y: 700 }]
    const { file } = await made({
      pages: [{ runs, boxes: [[97.6, 700, 100.6, 700.4]] }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 700]],
      units: [unit('para', [text('conv2'), ph('\\_'), text('x is the block')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.TEXT])
    expect(pt(file, 0, 1)).toBe('_')
    expect(chunk(rowsOf(file, 0, 'erase'), 5).some(([, x0, y0, x1, y1]) => x0! <= 97.6 && x1! >= 100.6 && y0! <= 700 && y1! >= 700.4)).toBe(true)
  })
  it('a macro TeX said sets no ink (marking.inkless) gets an EMPTY row, marked or not, whatever class the layer reads it as; one TeX did not say so is a head piece', async () => {
    const runs: Run[] = [{ s: 'Table rows of text', x: 72, y: 700 }]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700]]
    const units = [unit('para', [ph('\\rule{0pt}{2ex}'), text('Table rows of text')])]
    const said = await made({ pages: [{ runs }], marks, units, inkless: ['\\rule{0pt}{2ex}'] })
    expect(phOf(said.file, 0, 0)).toEqual([0, 0, 6, PH_FLAG.EMPTY])
    // (a macro whose argument holds letters, which the layer reads as a formula it draws from its row alone: 2608.02163v1's
    // `2025{\\natexlab{a}}` under a class that sets no label, its entry the original's with no row)
    const entry = [unit('para', [text('Wu, J. 2025'), ph('\\natexlab{a}'), text('. Table rows of text')])]
    const natexlab = await made({ pages: [{ runs: [{ s: 'Wu, J. 2025. Table rows of text', x: 72, y: 700 }] }], marks: [['0s', 1, 72, 700], ['0e', 1, 230, 700]], units: entry, inkless: ['\\natexlab{a}'] })
    expect(phOf(natexlab.file, 0, 1)).toEqual([0, 1, 6, PH_FLAG.EMPTY])
    // at the unit's head, nothing on its line before the start mark: EMPTY (headsOf)
    const not = await made({ pages: [{ runs }], marks, units })
    expect(phOf(not.file, 0, 0)).toEqual([0, 0, 6, PH_FLAG.EMPTY])
  })
})

describe('makeLayout: backref\'s list after an entry (latex-front.mjs BACKREF_LIST)', () => {
  it('owns the list\'s ink between the marks LAYOUT_TEX\'s hook sets around it, after the entry\'s end mark: found, its segment on the entry\'s line (2610.37668v1\'s "2, 25")', async () => {
    const entry: Run = { s: 'Jimmy Ba and Jamie Kiros. Layer normalization, 2016.', x: 72, y: 700 }, end = endOf(entry)
    const list: Run = { s: '2, 25', x: end + 6, y: 700 }
    const units = [unit('reference', [text('Jimmy Ba and Jamie Kiros. Layer normalization, 2016.'), ph('\\axtbackref')])]
    const marks: Mark[] = [['0s', 1, 72, 700], ['0e', 1, end, 700], ['p0.1a', 1, end, 700], ['p0.1b', 1, endOf(list), 700]]
    const { file } = await made({ pages: [{ runs: [entry, list] }], marks, units })
    const row = phOf(file, 0, 1)
    expect(row.slice(0, 4)).toEqual([0, 1, PH_KINDS.indexOf('macro'), 0])
    // (one segment, the list's own glyphs: from its first to its last, on the entry's baseline)
    expect(row[4]).toBe(1)
    expect(row[5]).toBeCloseTo(list.x, 1)
    expect(row[7]).toBeCloseTo(endOf(list), 1)
  })
  it('is EMPTY where TeX set no list (no point of its marks): an entry no page cites, or backref not loaded', async () => {
    const entry: Run = { s: 'Jimmy Ba and Jamie Kiros. Layer normalization, 2016.', x: 72, y: 700 }
    const units = [unit('reference', [text('Jimmy Ba and Jamie Kiros. Layer normalization, 2016.'), ph('\\axtbackref')])]
    const { file } = await made({ pages: [{ runs: [entry] }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(entry), 700]], units })
    expect(phOf(file, 0, 1)).toEqual([0, 1, PH_KINDS.indexOf('macro'), PH_FLAG.EMPTY])
    // (and its two points with nothing between them: EMPTY too, as any closed piece of no ink)
    const both = await made({ pages: [{ runs: [entry] }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(entry), 700], ['p0.1a', 1, endOf(entry), 700], ['p0.1b', 1, endOf(entry), 700]], units })
    expect(phOf(both.file, 0, 1)).toEqual([0, 1, PH_KINDS.indexOf('macro'), PH_FLAG.EMPTY])
  })
})

describe('makeLayout, the maker round (Fix 2): crops and erases from the glyphs\' own ink', () => {
  // a calligraphic F of CMSY10, which declares a descent of 0.96 em: its own outline reaches 0.03 em below its baseline
  FONTS.F3 = { name: 'ABCDEF+CMSY10', loadedName: 'F3L', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.775, descent: -0.96, isType3Font: false, vertical: false }
  const runs: Run[] = [{ s: 'see', x: 72, y: 700 }, { s: 'FF', x: 92, y: 700, font: 'F3' }, { s: 'and more words', x: 107, y: 700 }, { s: 'next line of the words here', x: 72, y: 688 }]
  const w: World = {
    pages: [{ runs }],
    marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[3] as Run), 688], ['p0.1a', 1, 92, 700], ['p0.1b', 1, 102, 700]],
    units: [unit('para', [text('see '), ph('$\\mathcal{FF}$'), text(' and more words next line of the words here')])],
  }
  it('a formula\'s crop is its glyphs\' own ink, never the next line\'s: the bar sees a crop that takes another glyph', async () => {
    for (const k of Object.keys(PATHS)) delete PATHS[k]
    // its font's declared box: the crop reaches the next line and takes its letters (the 6b review's I2)
    const declared = await made(w)
    expect(declared.stats.ph.foreign).toBeGreaterThan(0)
    PATHS.F3L_path_F = [0, 0.02, -0.03, 1, 0.48, -0.03, 1, 0.48, 0.69, 1, 0.02, 0.69, 4]
    const own = await made(w)
    const seg = phOf(own.file, 0, 1)
    // segment: page, x0, baseline, x1, top, bottom
    expect(seg[9]).toBeGreaterThan(699.5)
    expect(seg[8]).toBeLessThan(707.1)
    expect(own.stats.ph).toMatchObject({ found: 1, foreign: 0, shared: 0 })
    // and the line's erase reaches no lower than its own glyphs
    for (const [line, , y0] of chunk(rowsOf(own.file, 0, 'erase'), 5)) if (line === 0) expect(y0!).toBeGreaterThan(688 + 7.5)
    for (const k of Object.keys(PATHS)) delete PATHS[k]
  })
  it('a big delimiter of another cell, hanging from a baseline by this line\'s, is no glyph of this line', async () => {
    // a CMEX bracket piece whose origin is 4 pt below the line's baseline and whose ink hangs 1.8 em below it
    FONTS.F4 = { name: 'ABCDEF+CMEX10', loadedName: 'F4L', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.04, descent: -0.96, isType3Font: false, vertical: false }
    PATHS['F4L_path_['] = [0, 0, -1.8, 1, 0.3, -1.8, 1, 0.3, 0.05, 1, 0, 0.05, 4]
    const cell: Run[] = [{ s: '[', x: 70, y: 696, font: 'F4' }, { s: 'max pool stride', x: 72, y: 700 }]
    const { file } = await made({ pages: [{ runs: cell }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(cell[1] as Run), 700]], units: [unit('para', [text('max pool stride')])] })
    const line = rowsOf(file, 0, 'lines')
    // its line's foot is its own letters', not the bracket's 18 pt below
    expect(line[5]).toBeGreaterThan(697)
    for (const k of Object.keys(PATHS)) delete PATHS[k]
  })
})

describe('makeLayout, the maker round (Fix 3): the lines a unit\'s source does not write', () => {
  it('a display its source does not hold, given to it by its end mark after it, is no line of the unit\'s at its end; held in its middle', async () => {
    // TeX set the unit's end mark after the display (1706 page 4's unit 32, "... computed as:"): the anchor takes its lines
    const runs: Run[] = [{ s: 'the attention is computed as', x: 72, y: 700 }, { s: 'Z = W X + b', x: 150, y: 680 }]
    const end: World = { pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 680]], units: [unit('para', [text('the attention is computed as')])] }
    const tail = await made(end)
    expect(rowsOf(tail.file, 0, 'lines')).toHaveLength(8)
    expect(tail.file.held).toEqual([])
    expect(tail.stats.lines.held).toBe(1)
    // the same display between two lines of the unit's own words: held, never erased
    const mid: Run[] = [...runs, { s: 'where the words go on here', x: 72, y: 660 }]
    const both = await made({ pages: [{ runs: mid }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(mid[2] as Run), 660]], units: [unit('para', [text('the attention is computed as where the words go on here')])] })
    expect(rowsOf(both.file, 0, 'lines')).toHaveLength(24)
    expect(both.file.held).toEqual([[0, [1]]])
    expect(chunk(rowsOf(both.file, 0, 'erase'), 5).map(r => r[0])).not.toContain(1)
  })
  it('a paragraph\'s last line holding only the rest of a word cut by a hyphen is the unit\'s, its end mark carried there', async () => {
    // 1810.04805's "… of text generation mod-" / "els.": the rest is its first part's word, a word of the source's
    const runs: Run[] = [{ s: 'the robustness of text generation mod-', x: 72, y: 700, eol: true }, { s: 'els.', x: 72, y: 688 }]
    const { file, stats } = await made({ pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 688]], units: [unit('para', [text('the robustness of text generation models.')])] })
    expect(rowsOf(file, 0, 'lines')).toHaveLength(16)
    expect(rowsOf(file, 0, 'lines')[11]).toBe(688)
    expect(file.held).toEqual([])
    expect(stats.lines.held).toBe(0)
    expect(chunk(rowsOf(file, 0, 'erase'), 5).map(r => r[0])).toContain(1)
    // a word of its own hyphen cut there ("fine-" / "tuning.", 2608.04322's unit 95): the text layer joins its parts
    const own: Run[] = [{ s: 'used for safety-enhanced fine-', x: 72, y: 700, eol: true }, { s: 'tuning.', x: 72, y: 688 }]
    const joined = await made({ pages: [{ runs: own }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(own[1] as Run), 688]], units: [unit('para', [text('used for safety-enhanced fine-tuning.')])] })
    expect(rowsOf(joined.file, 0, 'lines')).toHaveLength(16)
    expect(joined.stats.lines.held).toBe(0)
  })
  it('a line of the unit\'s own words the anchor did not pair is the unit\'s: a word of its source anywhere counts', async () => {
    const runs: Run[] = [{ s: 'models learn residual functions', x: 72, y: 700 }, { s: 'functions residual learn models', x: 72, y: 688 }]
    const { file } = await made({ pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 688]], units: [unit('para', [text('models learn residual functions functions residual learn models')])] })
    expect(file.held).toEqual([])
    expect(rowsOf(file, 0, 'lines')).toHaveLength(16)
  })
})

describe('makeLayout, a unit\'s last line up to its end mark', () => {
  it('takes the glyphs before the end mark whatever the gap: a full stop after a formula whose script the line leaves out', async () => {
    // 1706's "… we scale the dot products by 1/√dk.": the k a script too far below the baseline for the line, the stop
    // past the gap it leaves; the end mark after the stop
    const runs: Run[] = [{ s: 'we scale the products by', x: 72, y: 700 }, { s: 'd', x: 195, y: 696, size: 7 }, { s: 'k', x: 198.5, y: 694, size: 5 }, { s: '.', x: 205, y: 700 }]
    const { file } = await made({ pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, 207.5, 700]], units: [unit('para', [text('we scale the products by '), ph('$d_k$'), text('.')])] })
    // the stop's own box, 205 to 210, in the line and its erase
    expect(rowsOf(file, 0, 'lines')[2]).toBe(210)
    expect(Math.max(...chunk(rowsOf(file, 0, 'erase'), 5).map(r => r[3] ?? 0))).toBeGreaterThanOrEqual(209)
  })
})

describe('makeLayout, a unit\'s head pieces: its macros before its start mark, where no mark goes', () => {
  // 1810.04805's "\\bert{} is conceptually simple …": \\newcommand\\bert{BERT\\xspace}, the start mark after it
  const runs: Run[] = [{ s: 'BERT is conceptually simple', x: 72, y: 700 }]
  const bert: World = { pages: [{ runs }], marks: [['0s', 1, 97, 700], ['0e', 1, endOf(runs[0] as Run), 700]], units: [unit('para', [ph('\\bert'), text(' is conceptually simple')])] }
  it('a macro whose letters the probe showed stand right before the start mark is found there, a segment of the first line', async () => {
    const { file, stats } = await made({ ...bert, texts: [['\\bert', 'BERT']] })
    const row = phOf(file, 0, 0)
    expect(row[3]).toBe(0)
    // page, x0, baseline, x1, top, bottom: its four glyphs
    expect(row.slice(4, 8)).toEqual([1, 72, 700, 92])
    expect(file.labels).toEqual([])
    // the first line begins where the paragraph does, and its erase takes the letters in
    expect(rowsOf(file, 0, 'lines')[1]).toBe(72)
    expect(chunk(rowsOf(file, 0, 'erase'), 5)[0]?.[1]).toBe(72)
    expect(stats.ph.heads).toEqual([1, 0])
    expect(stats.ph.unmarked).toBe(0)
  })
  it('one whose letters are not the probe\'s, or with no answer, stays LOST, its glyphs a label as before', async () => {
    for (const texts of [undefined, [['\\bert', 'BART']] as [string, string][]]) {
      const { file, stats } = await made({ ...bert, ...(texts ? { texts } : {}) })
      expect(phOf(file, 0, 0)[3]).toBe(PH_FLAG.LOST | PH_FLAG.OUTSIDE)
      expect(file.labels).toHaveLength(1)
      expect(stats.ph.heads).toEqual([0, 0])
    }
  })
  it('inline code at the head is a head piece too, found by the text TeX sets for it (MARKS_SCHEMA 10: 2610.21098v1 p13u138)', async () => {
    // "\\texttt{max\\_tokens} on Chat Completions routes": the probe asks about the code that leads a unit (marks.mjs leadSamples)
    const code: Run[] = [{ s: 'max_tokens on Chat routes', x: 72, y: 700 }]
    const w: World = { pages: [{ runs: code }], marks: [['0s', 1, xAt(code[0] as Run, 11), 700], ['0e', 1, endOf(code[0] as Run), 700]], units: [unit('para', [ph('\\texttt{max\\_tokens}'), text(' on Chat routes')])] }
    const { file, stats } = await made({ ...w, texts: [['\\texttt{max\\_tokens}', 'max_tokens']] })
    expect(phOf(file, 0, 0)[3]).toBe(0)
    expect(phOf(file, 0, 0).slice(4, 8)).toEqual([1, 72, 700, xAt(code[0] as Run, 10)])
    expect(stats.ph.heads).toEqual([1, 0])
    // (no text known: LOST as before; and code with nothing beside the mark set ink not known, LOST, never EMPTY)
    expect((phOf((await made(w)).file, 0, 0)[3] ?? 0) & PH_FLAG.LOST).toBe(PH_FLAG.LOST)
    const none: Run[] = [{ s: 'on Chat routes', x: 72, y: 700 }]
    const bare = await made({ pages: [{ runs: none }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(none[0] as Run), 700]], units: w.units, texts: [['\\texttt{max\\_tokens}', 'max_tokens']] })
    expect((phOf(bare.file, 0, 0)[3] ?? 0) & PH_FLAG.LOST).toBe(PH_FLAG.LOST)
  })
  it('a formula\'s glyph the probe spells as no character (INK_ANY) is any one glyph, only where nothing of ink stands between it and the mark (2610.21176v1 p13u88)', async () => {
    // "\\dprime{} tracks the gap": $d'$, a math italic d and a prime
    const runs: Run[] = [{ s: 'd\u2032 tracks the gap', x: 72, y: 700 }]
    const w: World = { pages: [{ runs }], marks: [['0s', 1, xAt(runs[0] as Run, 3), 700], ['0e', 1, endOf(runs[0] as Run), 700]], units: [unit('para', [ph('\\dprime{}'), text(' tracks the gap')])], texts: [['\\dprime{}', `d${INK_ANY}`]] }
    const { file, stats } = await made(w)
    expect(phOf(file, 0, 0)[3]).toBe(0)
    expect(phOf(file, 0, 0).slice(4, 8)).toEqual([1, 72, 700, xAt(runs[0] as Run, 2)])
    expect(stats.ph.heads).toEqual([1, 0])
    // (its spelled letter is the glyphs' own: another there, LOST)
    const other = await made({ ...w, pages: [{ runs: [{ s: 'x\u2032 tracks the gap', x: 72, y: 700 }] }] })
    expect((phOf(other.file, 0, 0)[3] ?? 0) & PH_FLAG.LOST).toBe(PH_FLAG.LOST)
    // (a footnote's call between the piece and the mark sets its mark nearer: the "1" is no formula's glyph, LOST)
    const noted: Run[] = [{ s: 'd1 tracks the gap', x: 72, y: 700 }]
    const n = await made({ ...w, pages: [{ runs: noted }], units: [unit('para', [ph('\\dprime{}'), ph('\\footnotemark'), text(' tracks the gap')])] })
    expect((phOf(n.file, 0, 0)[3] ?? 0) & PH_FLAG.LOST).toBe(PH_FLAG.LOST)
  })
  it('one that set nothing on the line before the start mark is EMPTY: a figure\'s image above its text, a row\'s rule', async () => {
    const text1: Run[] = [{ s: 'Retrieved from the reference', x: 72, y: 700 }]
    const fig: World = { pages: [{ runs: text1, boxes: [[72, 720, 200, 800]] }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(text1[0] as Run), 700]], units: [unit('para', [ph('\\includegraphics[width=5cm]{a.jpg}'), ph('\\\\'), text('\n\tRetrieved from the reference')])] }
    const { file, stats } = await made(fig)
    expect(phOf(file, 0, 0)[3]).toBe(PH_FLAG.EMPTY)
    expect(file.ph.some(r => r[0] === 0 && ((r[3] ?? 0) & PH_FLAG.LOST) !== 0)).toBe(false)
    expect(stats.ph.heads[1]).toBeGreaterThanOrEqual(1)
    // the image is no line of the unit's, and nothing erases it
    for (const [, , y0] of chunk(rowsOf(file, 0, 'erase'), 5)) expect(y0!).toBeLessThan(720)
  })
  it('after the end mark: 1706\'s panel title, its line break and image after it EMPTY; one with glyphs beside the mark LOST', async () => {
    const title: Run[] = [{ s: 'Scaled Attention', x: 150, y: 713 }, { s: 'Multi Head', x: 363, y: 713 }]
    const panel: World = { pages: [{ runs: title, boxes: [[150, 600, 260, 700]] }], marks: [['0s', 1, 150, 713], ['0e', 1, endOf(title[0] as Run), 713]], units: [unit('para', [ph('\\centering'), text('\n  Scaled Attention '), ph('\\\\'), text('\n  '), ph('\\vspace{0.5cm}'), text('\n  '), ph('\\includegraphics[scale=0.6]{a}'), text('\n')])] }
    const { file } = await made(panel)
    for (const k of [2, 4, 6]) { const row = file.ph.find(r => r[0] === 0 && r[1] === k); if (row) expect(row[3]).toBe(PH_FLAG.EMPTY) }
    expect(file.ph.some(r => r[0] === 0 && ((r[3] ?? 0) & PH_FLAG.LOST) !== 0)).toBe(false)
    // 1512's "… summarizes the architecture:" before its table: \\renewcommand, which looks ahead, has its opening mark
    // alone and owns no ink: a tail all the same
    const intro: Run[] = [{ s: 'the table summarizes it:', x: 72, y: 700 }]
    const table = await made({ pages: [{ runs: intro }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(intro[0] as Run), 700]], units: [unit('para', [text('the table summarizes it:'), ph('\\renewcommand'), ph('\\arraystretch{1.1}'), text('\n')])] })
    expect(table.file.ph.filter(r => r[0] === 0).map(r => r[3])).toEqual(table.file.ph.filter(r => r[0] === 0).map(() => PH_FLAG.EMPTY))
    // a tail with glyphs beside the end mark stays LOST: the panel's other title within LABEL_EM of it
    const near: Run[] = [{ s: 'Scaled Attention', x: 150, y: 713 }, { s: 'Multi Head', x: 240, y: 713 }]
    const close = await made({ ...panel, pages: [{ runs: near, boxes: [[150, 600, 260, 700]] }] })
    expect(close.file.ph.some(r => r[0] === 0 && ((r[3] ?? 0) & PH_FLAG.LOST) !== 0)).toBe(true)
  })
})

describe('makeLayout, an inline placeholder\'s line by its own glyphs\' baselines (the 6b review\'s I1)', () => {
  it('a radical whose origin TeX raises to the line above sits on its own line, not LOWERED (1706 31.8)', async () => {
    // \sqrt{d_k}: the radical's origin at its bar, on the line above's baseline; d on the line; k below it
    const runs: Run[] = [{ s: 'words of the line above', x: 72, y: 712 }, { s: 'see', x: 72, y: 700 }, { s: '\u221a', x: 92, y: 712 }, { s: 'd', x: 97, y: 700 }, { s: 'k', x: 102, y: 698, size: 7 }, { s: 'and more words', x: 110, y: 700 }]
    const { file } = await made({
      // the opening point before the radical in the stream, as TeX's content stream has it
      pages: [{ runs, points: { 'p0.1a': [2, 0] } }],
      marks: [['0s', 1, 72, 712], ['0e', 1, endOf(runs[5] as Run), 700], ['p0.1a', 1, 92, 700], ['p0.1b', 1, 106, 700]],
      units: [unit('para', [text('words of the line above see '), ph('$\\sqrt{d_k}$'), text(' and more words')])],
    })
    const seg = phOf(file, 0, 1)
    expect(seg[6]).toBe(700)
    expect((seg[3] ?? 0) & PH_FLAG.LOWERED).toBe(0)
  })
  it('a script-led formula sits on the line its largest glyphs do, not by its scripts\' baseline (2307 162.7)', async () => {
    // A^{(i)}: three of its four glyphs are its superscript's, 6 pt up, nearer the line above (11 pt up) than its own
    const runs: Run[] = [{ s: 'words of the line above', x: 72, y: 711 }, { s: 'the matrix', x: 72, y: 700 }, { s: 'A', x: 125, y: 700 }, { s: '(i)', x: 130, y: 706, size: 7 }, { s: 'is upper', x: 145, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 711], ['0e', 1, endOf(runs[4] as Run), 700], ['p0.1a', 1, 125, 700], ['p0.1b', 1, 140.5, 700]],
      units: [unit('para', [text('words of the line above the matrix '), ph('$A^{(i)}$'), text(' is upper')])],
    })
    expect(phOf(file, 0, 1)[6]).toBe(700)
  })
  it('a part on a line that is not the unit\'s is LOST, never given the line below (2307 128.5)', async () => {
    const runs: Run[] = [{ s: 'first line of the unit', x: 72, y: 700 }, { s: 'second line of it', x: 72, y: 688 }, { s: 'xyz', x: 72, y: 664 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 688], ['p0.1a', 1, 72, 664], ['p0.1b', 1, 87, 664]],
      units: [unit('para', [text('first line of the unit '), ph('$xyz$'), text(' second line of it')])],
    })
    expect(phOf(file, 0, 1)).toEqual([0, 1, 0, PH_FLAG.LOST])
  })
})

describe('makeLayout, a note\'s mark the first line begins with (the maker round)', () => {
  it('is the note\'s label where its start mark stands before it: kept, and the line starts after it; a digit of the source is no label', async () => {
    // 1706's notes: \u2217 set by the class before the note's text, the note's start mark before it
    const runs: Run[] = [{ s: '\u2217', x: 72, y: 703, size: 7 }, { s: 'Equal contribution of all', x: 76, y: 700 }]
    const { file } = await made({ pages: [{ runs }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 700]], units: [unit('footnote', [text('Equal contribution of all')])] })
    expect(file.labels).toEqual([[0, 3, 1, 72, 703, 75.5, expect.any(Number), expect.any(Number)]])
    expect(rowsOf(file, 0, 'lines')[1]).toBe(76)
    // a paragraph that begins with a number of its own text
    const own: Run[] = [{ s: '3 layers of the net', x: 72, y: 700 }]
    const n = await made({ pages: [{ runs: own }], marks: [['0s', 1, 72, 700], ['0e', 1, endOf(own[0] as Run), 700]], units: [unit('para', [text('3 layers of the net')])] })
    expect(n.file.labels).toEqual([])
    expect(rowsOf(n.file, 0, 'lines')[1]).toBe(72)
  })

  it("gives the closing punctuation a head sets after a note to the note's line, never the next unit's label (2610.18513v1 p35)", async () => {
    // amsthm's "Lemma A.1 (" before a note that ends in a citation, its ")." after it, the theorem's text on: the ")." was the
    // body's label row, which the reader showed again from the original where it stood, after the note's translation
    // (the note's end mark before its citation, as the marked source sets it, `\\axthmark{h…e} \\citep{…}`; the citation in
    // hyperref's blue, a text item of its own, as PDF.js reads a link's colour apart)
    const head: Run = { s: 'Lemma A.1 (Bobkov inequality for measures ', x: 72, y: 700 }
    const cite: Run = { s: '[BL09]', x: endOf(head), y: 700, fill: '#0071bc' }
    const rest: Run = { s: '). If the measure is concave then it holds', x: endOf(cite), y: 700 }
    const at = (r: Run, s: string) => xAt(r, r.s.indexOf(s))
    const { file } = await made({
      pages: [{ runs: [head, cite, rest] }],
      marks: [['0s', 1, at(head, 'Bobkov'), 700], ['0e', 1, cite.x, 700], ['p0.1a', 1, cite.x, 700], ['p0.1b', 1, endOf(cite), 700], ['1s', 1, at(rest, 'If'), 700], ['1e', 1, endOf(rest), 700]],
      units: [unit('heading', [text('Bobkov inequality for measures '), ph('\\cite{bl}')], { bracketed: true }), unit('theorem', [text('If the measure is concave then it holds')])],
    })
    expect(file.labels.map(l => [l[0], l[3], l[5]])).toEqual([[0, 72, at(head, 'Bobkov')]])
    // the note's line runs to the full stop, its erase with it; the theorem's starts at its text
    expect(rowsOf(file, 0, 'lines')[2]).toBe(at(rest, ' If'))
    expect(Math.max(...chunk(rowsOf(file, 0, 'erase'), 5).map(e => e[3] as number))).toBeGreaterThanOrEqual(at(rest, ' If') - 0.01)
    expect(rowsOf(file, 1, 'lines')[1]).toBe(at(rest, 'If'))
  })
})

describe('makeLayout, a line by its words (the maker round)', () => {
  it('a line whose formula sets more script glyphs than it has words is the line of its words: their baseline and size', async () => {
    // 1706's "and W^O ∈ R^{hd_v×d_model}.": 7 glyphs at 10 pt, 11 scripts at 7 and 5 pt, 3.6 pt up
    const runs: Run[] = [{ s: 'first line of the unit here', x: 72, y: 700 }, { s: 'and', x: 72, y: 688 }, { s: 'hdxmodel', x: 92, y: 691.6, size: 7 }, { s: 'ab', x: 120, y: 690.6, size: 5 }, { s: '.', x: 126, y: 688 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 127, 688], ['p0.1a', 1, 92, 688], ['p0.1b', 1, 126, 688]],
      units: [unit('para', [text('first line of the unit here and '), ph('$R^{hdxmodel}_{ab}$'), text('.')])],
    })
    const second = chunk(rowsOf(file, 0, 'lines'), 8)[1]!
    expect(second[3]).toBe(688)
    expect(second[6]).toBe(10)
  })
  it('a unit\'s closing full stop glued past its end mark is its line\'s (an end mark after a formula, carried short of it)', async () => {
    const runs: Run[] = [{ s: 'we scale it by xy', x: 72, y: 700 }, { s: '.', x: 157, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      // the end mark 0.5 pt short of the full stop, as a formula of another width on arXiv's leaves it
      marks: [['0s', 1, 72, 700], ['0e', 1, 156.5, 700]],
      units: [unit('para', [text('we scale it by xy.')])],
    })
    expect(rowsOf(file, 0, 'lines')[2]).toBeCloseTo(162, 1)
  })
})

describe("makeLayout, babel's names (D1a)", () => {
  /** a paragraph of three lines of one length (its column's edges: 72 to 207), and a heading over it no unit holds */
  const body: Run[] = [0, 1, 2].map(j => ({ s: 'one two three four five six', x: 72, y: 680 - 12 * j }))
  const para = unit('para', [text(body.map(r => r.s).join(' '))])
  const bodyMarks: Mark[] = [['0s', 1, 72, 680], ['0e', 1, endOf(body[2] as Run), 656]]
  const heading = (s: string, x: number): Run => ({ s, x, y: 700 })
  const nameMarks = (r: Run, key = 'abstract', n = 1): Mark[] => [[`n${n}.${key}.s`, 1, r.x, r.y], [`n${n}.${key}.e`, 1, endOf(r), r.y]]

  it('locates an occurrence by its two marks and the text between them: its line box, size, font, centred in its column', async () => {
    const h = heading('Abstract', 119.5)
    const { file, stats } = await made({ pages: [{ runs: [h, ...body] }], marks: [...bodyMarks, ...nameMarks(h)], units: [para] })
    // (leading no unit: -1 and no glue; its room its TeX column's text edges, the paragraph's 72 to 207)
    expect(file.names).toEqual([[1, NAME_KEYS.indexOf('abstract'), 1, 119.5, 700, endOf(h), 707.5, 697.5, 10, 0, NAME_FLAG.CENTRED, -1, 0, 72, endOf(body[0] as Run)]])
    expect(stats.names).toEqual({ marked: 1, located: 1, runIn: 0, why: {} })
    // (left where it stands: its left edge kept, no flag)
    const l = heading('Abstract', 72)
    expect((await made({ pages: [{ runs: [l, ...body] }], marks: [...bodyMarks, ...nameMarks(l)], units: [para] })).file.names[0]?.[10]).toBe(0)
  })

  it("is in capitals where its glyphs are and its macro's own text is not (the probe's answer), never otherwise", async () => {
    const h = heading('REFERENCES', 72)
    const world = (names: Record<string, 0 | 1> | undefined) => ({ pages: [{ runs: [h, ...body] }], marks: [...bodyMarks, ...nameMarks(h, 'ref')], units: [para], names })
    expect((await made(world({ ref: 1 }))).file.names[0]?.[10]).toBe(NAME_FLAG.CAPITALS)
    // (a class's own capitals: its macro's text holds no lowercase letter)
    expect((await made(world({ ref: 0 }))).file.names[0]?.[10]).toBe(0)
    // (no probe: not known)
    expect((await made(world(undefined))).file.names[0]?.[10]).toBe(0)
  })

  it("is left out where a mark is missing", async () => {
    const ours = heading('Abstract', 72)
    const half = await made({ pages: [{ runs: [ours, ...body] }], marks: [...bodyMarks, nameMarks(ours)[0] as Mark], units: [para] })
    expect(half.file.names).toEqual([])
    expect(half.stats.names.why).toEqual({ 'a mark not set, or set twice': 1 })
  })

  it("is no unit's label: IEEEtran's \\textit{\\abstractname}— before the abstract's start mark leaves the label its dash", async () => {
    const name: Run = { s: 'Abstract', x: 72, y: 700 }, dash: Run = { s: '\u2014', x: endOf(name), y: 700 }, first: Run = { s: 'we show a model of it', x: endOf(dash) + 1, y: 700 }
    const second: Run = { s: 'and more words here', x: 72, y: 688 }
    const runs = [name, dash, first, second]
    const marks: Mark[] = [['0s', 1, first.x, 700], ['0e', 1, endOf(second), 688], ...nameMarks(name)]
    const { file } = await made({ pages: [{ runs }], marks, units: [unit('abstract', [text('we show a model of it and more words here')])] })
    expect(file.names.map(r => r.slice(0, 6))).toEqual([[1, NAME_KEYS.indexOf('abstract'), 1, 72, 700, endOf(name)]])
    // the label: the dash alone, never the name's glyphs
    expect(file.labels.map(l => [l[0], l[3], l[5]])).toEqual([[0, dash.x, endOf(dash)]])
  })

  it("leads the unit TeX sets right after it on that unit's first line (RUN_IN), with the original's glue after its joint", async () => {
    const lead = async (gap: number) => {
      const name: Run = { s: 'Abstract', x: 72, y: 700 }, dash: Run = { s: '\u2014', x: endOf(name), y: 700 }, first: Run = { s: 'we show a model of it', x: endOf(dash) + gap, y: 700 }
      const second: Run = { s: 'and more words here', x: 72, y: 688 }
      const marks: Mark[] = [['0s', 1, first.x, 700], ['0e', 1, endOf(second), 688], ...nameMarks(name)]
      return made({ pages: [{ runs: [name, dash, first, second] }], marks, units: [unit('abstract', [text('we show a model of it and more words here')])] })
    }
    // IEEEtran's dash touching the text: no glue
    const touching = await lead(0)
    expect(touching.file.names.map(r => [r[10], r[11], r[12]])).toEqual([[NAME_FLAG.RUN_IN, 0, 0]])
    expect(touching.stats.names.runIn).toBe(1)
    // a space after the joint (amsthm's \labelsep): its width
    expect((await lead(3)).file.names.map(r => [r[10], r[11], r[12]])).toEqual([[NAME_FLAG.RUN_IN, 0, 3]])
    // the other column's first line on its baseline leads nothing: a heading over the left column, the right one's text
    // beside it (ACL's centred Abstract at the top of a page of two columns)
    const name: Run = { s: 'Abstract', x: 120, y: 700 }, right: Run = { s: 'we show a model of it', x: 320, y: 700 }
    const left: Run[] = [0, 1, 2].map(j => ({ s: 'one two three four five six', x: 60, y: 680 - 12 * j }))
    const two = await made({ pages: [{ runs: [name, right, ...left] }], marks: [COLS2(1), ['0s', 1, 60, 680], ['0e', 1, endOf(left[2] as Run), 656], ['1s', 1, right.x, 700], ['1e', 1, endOf(right), 700], ...nameMarks(name)], units: [para, unit('para', [text('we show a model of it')])] })
    expect(two.file.names.map(r => [(r[10] as number) & NAME_FLAG.RUN_IN, r[11], r[12]])).toEqual([[0, -1, 0]])
  })

  it("is a caption's label where a figure's or a table's name leads a caption (longtable's, no \\@captype): no row", async () => {
    const name: Run = { s: 'Table', x: 72, y: 700 }, first: Run = { s: '1: the results of it', x: endOf(name) + 3, y: 700 }
    const marks: Mark[] = [['0s', 1, first.x, 700], ['0e', 1, endOf(first), 700], ...nameMarks(name, 'table')]
    const { file, stats } = await made({ pages: [{ runs: [name, first, ...body] }], marks: [...marks, ['1s', 1, 72, 680], ['1e', 1, endOf(body[2] as Run), 656]], units: [unit('caption', [text('1: the results of it')]), para] })
    expect(file.names).toEqual([])
    expect(stats.names.why).toEqual({ "a caption's label": 1 })
  })

  it("takes its column's edges from the pages like its own where its page has no unit (a page of references alone)", async () => {
    const h = heading('References', 72)
    const { file } = await made({ pages: [{ runs: body }, { runs: [h] }], marks: [...bodyMarks, [`n1.ref.s`, 2, h.x, h.y], [`n1.ref.e`, 2, endOf(h), h.y]], units: [para] })
    expect(file.names.map(r => [r[2], r[13], r[14]])).toEqual([[2, 72, endOf(body[0] as Run)]])
    // no page with a body line of its kind of column: its own box (no room past it is known), never the page's half
    const alone = await made({ pages: [{ runs: [h] }], marks: [[`n1.ref.s`, 1, h.x, h.y], [`n1.ref.e`, 1, endOf(h), h.y]], units: [] })
    expect(alone.file.names.map(r => [r[3], r[5], r[13], r[14]])).toEqual([[72, endOf(h), 72, endOf(h)]])
  })
})

describe('makeLayout over arXiv\'s text read once (the prepare\'s step T, layout/arxiv.mjs)', () => {
  /** a world whose arXiv document counts its text reads */
  const counted = (w: World) => {
    const doc = baseOf(w), reads: number[] = []
    return { reads, doc: { numPages: doc.numPages, getPage: async (n: number) => { const p = await doc.getPage(n); return { ...p, getTextContent: async () => { reads.push(n); return p.getTextContent() } } } } }
  }
  const worlds: [string, World][] = [['a paragraph with a display', DISPLAY], ['two columns', { pages: [{ runs: Array.from({ length: 6 }, (_, j): Run => ({ s: words(10 * j, 10), x: 60, y: 700 - 12 * j })) }], marks: [['0s', 1, 60, 700], ['0e', 1, endOf({ s: words(50, 10), x: 60, y: 640 }), 640]], units: [unit('para', [text(words(0, 60))])] }]]
  for (const [name, w] of worlds) {
    it(`${name}: with the text given, no page's text is read again and the file is the same bytes, the floats' matches given or not`, async () => {
      const marks = await marksOf(w)
      const base = { units: w.units, marks, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
      const alone = counted(w), want = await makeLayout({ ...base, arxiv: alone.doc })
      expect(alone.reads).toEqual(w.pages.map((_, i) => i + 1))
      const read = counted(w), text = await readArxivText(read.doc)
      expect(read.reads).toEqual(w.pages.map((_, i) => i + 1))
      const texts = w.units.map((u, i) => ({ id: i, ...unitText(u.pieces as Parameters<typeof unitText>[0]), ...displayEdges(u) }))
      const floatMatch = floatMatches(text.tokens, texts, id => ['caption', 'footnote', 'cell', 'figure'].includes(w.units[id]?.kind ?? ''))
      for (const given of [{ text }, { text, floatMatch }]) {
        const got = await makeLayout({ ...base, arxiv: read.doc, ...given })
        if (!('file' in want) || !('file' in got)) throw new Error('refused')
        expect(encodeLayout(got.file)).toBe(encodeLayout(want.file))
      }
      expect(read.reads).toEqual(w.pages.map((_, i) => i + 1))
    })
  }

  it('the frame\'s rule is the caller\'s: by default today\'s (pageFrame), the same bytes; one given is the rule the anchors are placed under', async () => {
    const marks = await marksOf(DISPLAY)
    const base = { units: DISPLAY.units, marks, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
    const want = await makeLayout({ ...base, arxiv: arxivOf(DISPLAY.pages) })
    const calls: number[] = []
    const got = await makeLayout({ ...base, arxiv: arxivOf(DISPLAY.pages), frame: (doc, ms) => { calls.push(doc.length); return pageFrame(doc, ms) } })
    if (!('file' in want) || !('file' in got)) throw new Error('refused')
    expect(encodeLayout(got.file)).toBe(encodeLayout(want.file))
    // asked once, of arXiv's tokens
    expect(calls.length).toBe(1)
    expect(calls[0]).toBeGreaterThan(0)
  })

  it('the page stream places a range\'s units alone: under the whole run\'s frame rule it takes none (pageFrame over them is not the whole\'s), a TypeError; by default rule 1 gives it one', async () => {
    const marks = await marksOf(DISPLAY)
    const base = { units: DISPLAY.units, marks, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
    const first = await makerOf({ ...base, arxiv: arxivOf(DISPLAY.pages), rules: { frame: 'units' } })
    if ('refused' in first && first.refused) throw new Error('refused')
    for (let p = 1; p <= first.pages; p++) await first.readPage(p)
    await first.whole()
    const m = await makerOf({ ...base, arxiv: arxivOf(DISPLAY.pages), columnEdges: first.edges(), rules: { frame: 'units' } })
    if ('refused' in m && m.refused) throw new Error('refused')
    await expect(m.byStream()).rejects.toThrow(/frame/)
    const d = await makerOf({ ...base, arxiv: arxivOf(DISPLAY.pages), columnEdges: first.edges() })
    if ('refused' in d && d.refused) throw new Error('refused')
    await expect(d.byStream()).resolves.toBeTruthy()
  })

  it('a text of another page count than the document is the caller\'s mistake', async () => {
    const marks = await marksOf(DISPLAY)
    const text = await readArxivText(arxivOf([...DISPLAY.pages, ...DISPLAY.pages]))
    await expect(makeLayout({ units: DISPLAY.units, marks, arxiv: arxivOf(DISPLAY.pages), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', text })).rejects.toThrow(TypeError)
  })
})

describe('makeLayout with the add-on\'s plans (`plans`): each page\'s operator list read once for both', () => {
  // a paragraph over a stray glyph of another baseline under its rectangle (kept ink: the page is dirty, its removal
  // planned), a page of a display, a page of no unit's, and a page past the ink reader's cap
  const para: Run[] = [{ s: words(0, 10), x: 72, y: 700 }, { s: words(10, 10), x: 72, y: 688 }, { s: 'K', x: 100, y: 676, size: 14 }]
  const shown: Run[] = DISPLAY.pages[0]?.runs ?? []
  const pages: Page[] = [{ runs: para, boxes: [[150, 699, 160, 701]] }, { runs: shown }, { runs: [{ s: 'nobody', x: 72, y: 700 }] }, { runs: [{ s: words(40, 3), x: 72, y: 700 }], ops: 'capped' }]
  // (the base page: the stray glyph and the box the draft's marks do not own, page 4 past the cap)
  const w: World = {
    pages, base: pages,
    marked: [{ runs: [para[0] as Run, para[1] as Run] }, { runs: shown }, { runs: [{ s: 'nobody', x: 72, y: 700 }] }, { runs: [{ s: words(40, 3), x: 72, y: 700 }] }],
    marks: [['0s', 1, 72, 700], ['0e', 1, endOf(para[1] as Run), 688], ['1s', 2, 72, 700], ['1e', 2, 267, 648], ['p1.1a', 2, 217, 700], ['2s', 4, 72, 700], ['2e', 4, endOf({ s: words(40, 3), x: 72, y: 700 }), 700]],
    units: [unit('para', [text(words(0, 20))]), { ...(DISPLAY.units[0] as SourceUnit) }, unit('para', [text(words(40, 3))])],
  }
  it('the cell rules are pageRules\' of the same ink, page by page, and the file is the same bytes', async () => {
    const marks = await marksOf(w)
    const base = { units: w.units, marks, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
    const asked: number[] = []
    const got = await makeLayout({ ...base, arxiv: baseOf(w, asked), cellRules: true })
    const want = await makeLayout({ ...base, arxiv: baseOf(w) })
    if (!('file' in got) || !('file' in want)) throw new Error('refused')
    expect(encodeLayout(got.file)).toBe(encodeLayout(want.file))
    expect(asked).toEqual([1, 2, 3, 4])
    // (no cell on these pages: no rule near one)
    expect(got.cellRules).toEqual(new Map())
    // without `cellRules`, none
    expect('cellRules' in want).toBe(false)
  })

  it("a page the walk does not read whole, capped or timed out, keeps its units the original's end to end: none located, no cell rules", async () => {
    const marks = await marksOf(w)
    const base = { units: w.units, marks, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', cellRules: true }
    const slow: Page[] = w.pages.map((pg, i) => (i === 3 ? { ...pg, ops: 'slow' } : pg))
    // (page 4 past OPS_CAP, the world's; or walked past the backstop on a clock that moves INK_MS at each reading, which a
    // page of fewer steps than come between two readings never sees)
    const capped = await makeLayout({ ...base, arxiv: baseOf(w) })
    const real = performance.now.bind(performance)
    let skew = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => { skew += INK_MS; return real() + skew })
    const late = await makeLayout({ ...base, arxiv: arxivOf(slow) }).finally(() => clock.mockRestore())
    if (!('file' in capped) || !('file' in late)) throw new Error('refused')
    expect(capped.stats.capped).toEqual([4])
    expect(late.stats.inkTimedOut).toEqual([4])
    for (const got of [capped, late]) {
      // unit 2, the page's only one, located nowhere: the original's; no rules of the page
      expect(got.file.units.map(u => u[0])).not.toContain(2)
      expect(indexLayout(got.file).onPage(4)).toEqual([])
      expect(got.cellRules?.has(4)).toBe(false)
    }
  })
})

describe('makerOf: the passes as tasks, in any order the whole order allows', () => {
  it('runInOrder runs each page\'s tasks in their order, whatever it picks among those that may run', () => {
    const rand = seeded(11)
    const log: [number, string][] = []
    // tasks of four passes over six units, each on one or two pages of five, and a page task a page
    const tasks: { key: number[]; pages: number[]; run: () => void }[] = []
    for (let x = 0; x < 4; x++) for (let i = 0; i < 6; i++) { const pages = i % 3 === 0 ? [1 + (i % 5), 2 + (i % 4)] : [1 + (i % 5)]; tasks.push({ key: [x, i], pages, run: () => { for (const q of pages) log.push([q, `${x}.${i}`]) } }) }
    for (let q = 1; q <= 5; q++) tasks.push({ key: [1.5, q], pages: [q], run: () => log.push([q, `b.${q}`]) })
    tasks.push({ key: [9, 0], pages: [], run: () => {} })
    for (let s = 0; s < 20; s++) {
      log.length = 0
      runInOrder(tasks.slice().reverse(), ready => Math.floor(rand() * ready.length))
      for (let q = 1; q <= 5; q++) {
        const want = tasks.filter(t => t.pages.includes(q)).sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]!).map(t => (t.key[0] === 1.5 ? `b.${t.key[1]}` : `${t.key[0]}.${t.key[1]}`))
        expect(log.filter(([p]) => p === q).map(([, k]) => k)).toEqual(want)
      }
    }
  })

  it('a paper of three pages, paragraphs across their breaks, a display and a note: the same file in every order tried', async () => {
    const lines = (page: number, from: number, n: number): Run[] => Array.from({ length: n }, (_, j) => ({ s: words(1000 * page + from + 10 * j, 10), x: 72, y: 700 - 12 * j }))
    const p1 = [...lines(1, 0, 6), { s: 'a=b', x: 150, y: 620 }, { s: '(1)', x: 252, y: 620 }, ...lines(1, 100, 4).map(r => ({ ...r, y: r.y - 96 }))]
    const p2 = [...lines(2, 0, 8), { s: 'and a note', x: 72, y: 600 }, { s: '1', x: 122, y: 603.5, size: 7 }, { s: '. Then more', x: 125.5, y: 600 }]
    const p3 = lines(3, 0, 5)
    const pages: Page[] = [{ runs: p1 }, { runs: p2 }, { runs: p3 }]
    const last2 = p2.at(-1) as Run
    const note = unit('footnote', [text('A note.')])
    const w: World = {
      pages,
      marks: [
        ['0s', 1, 72, 700], ['0e', 1, endOf(p1[5] as Run), 640], ['p1.1a', 1, 150, 620],
        ['1s', 1, 72, 604], ['1e', 2, endOf(p2[7] as Run), 616], ['2s', 2, 72, 600], ['2e', 2, endOf(last2), 600], ['n2.2a', 2, 122, 600],
        ['3s', 3, 72, 700], ['3e', 3, endOf(p3[4] as Run), 652],
      ],
      units: [
        unit('para', [text(lines(1, 0, 6).map(r => r.s).join(' '))]),
        unit('para', [text(`${lines(1, 100, 4).map(r => r.s).join(' ')} `), ph('\\begin{equation}a=b\\end{equation}'), text(` ${lines(2, 0, 8).map(r => r.s).join(' ')}`)]),
        unit('para', [text('and a note'), { t: 'nested', unit: note }, text('. Then more')]),
        unit('para', [text(p3.map(r => r.s).join(' '))]),
        note,
      ],
    }
    const want = await made(w)
    // (every paragraph placed, the second across the break)
    expect(want.file.units.map(u => u[0])).toEqual([0, 1, 2, 3])
    expect(new Set(rowsOf(want.file, 1, 'lines').filter((_, j) => j % 8 === 0))).toEqual(new Set([1, 2]))
    for (let s = 0; s < 12; s++) {
      const got = await inOtherOrder(w, '')
      if (!('file' in got)) throw new Error('refused')
      expect(encodeLayout(got.file)).toBe(encodeLayout(want.file))
    }
  })
})

describe('makerOf, a page at a time: no unit decided before its match is final (the stage-1 review\'s B1)', () => {
  // a figure's text box is a paragraph by kind, in the text by floating(), and TeX sets it after the text that follows it in
  // the source: the units' order is not their bounds' order, so a unit's window between its bounded neighbours may miss it
  it('two figures\' text boxes set after the paragraphs that follow them: each anchored once its marks are carried', async () => {
    // five pages of ten lines; unit i's text on page at[i] (units 1 and 2 the boxes, set past units 3 and 4)
    const at = [1, 4, 5, 2, 3]
    const lines = (page: number): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * page + 10 * j, 10), x: 72, y: 700 - 12 * j }))
    const marks: Mark[] = []
    at.forEach((p, i) => { const ls = lines(p); marks.push([`${i}s`, p, 72, 700], [`${i}e`, p, endOf(ls[9] as Run), 592]) })
    const { file } = await made({ pages: [1, 2, 3, 4, 5].map(p => ({ runs: lines(p) })), marks, units: at.map(p => unit('para', [text(words(100 * p, 100))])) })
    expect(file.units.map(u => u[0])).toEqual([0, 1, 2, 3, 4])
  })

  it('a text box at the head of a page inside a paragraph running past it: the paragraph\'s first page waits for its marks', async () => {
    // four pages of twenty lines; unit 1 (the box) at page 3's head, inside unit 2, which runs from page 2's middle to page 4
    const L = (p: number, j: number): Run => ({ s: words(1000 * p + 10 * j, 10), x: 72, y: 700 - 12 * j })
    const span = (p: number, a: number, b: number) => Array.from({ length: b - a }, (_, k) => L(p, a + k))
    const pieces: [number, number, number][][] = [[[1, 0, 20], [2, 0, 10]], [[3, 0, 12]], [[2, 10, 20], [3, 12, 20], [4, 0, 5]], [[4, 5, 20]]]
    const marks: Mark[] = []
    pieces.forEach((ps, i) => {
      const [p0, a0] = ps[0] as [number, number, number], [p1, , b1] = ps.at(-1) as [number, number, number]
      const last = L(p1, b1 - 1)
      marks.push([`${i}s`, p0, 72, L(p0, a0).y], [`${i}e`, p1, endOf(last), last.y])
    })
    const units = pieces.map(ps => unit('para', [text(ps.flatMap(([p, a, b]) => span(p, a, b).map(r => r.s)).join(' '))]))
    const { file } = await made({ pages: [1, 2, 3, 4].map(p => ({ runs: span(p, 0, 20) })), marks, units })
    expect(file.units.map(u => u[0])).toEqual([0, 1, 2, 3])
  })
})

describe('makeLayout, a piece TeX broke over lines past the unit\'s lines (2609.26457 Table 3)', () => {
  // a table's cell whose citation, after its last word (the end mark set before it), wraps onto the cell's next line, a
  // line that holds no word of the cell's source; and the cell beside it, two lines on the same baselines
  const cellRuns: Run[] = [
    { s: 'decaying exploration', x: 72, y: 700 }, { s: '(Sutton and', x: 177, y: 700 }, { s: 'Barto, 2018)', x: 72, y: 688 },
    { s: 'within noise', x: 300, y: 700 }, { s: 'here too', x: 300, y: 688 },
  ]
  const cells: World = {
    // (the citation's closing point after its last glyph, on its second line)
    pages: [{ runs: cellRuns, points: { 'p0.1b': [2, 12] } }],
    marks: [['t0s', 1, 72, 700], ['t0e', 1, 177, 700], ['p0.1a', 1, 177, 700], ['p0.1b', 1, 132, 688], ['t1s', 1, 300, 700], ['t1e', 1, 340, 688]],
    units: [unit('cell', [text(' decaying exploration '), ph('\\citep{sutton}'), text(' ')]), unit('cell', [text(' within noise here too ')])],
  }
  it("a cell's citation wrapped onto its next line: that line is the cell's, the citation found on both", async () => {
    const { file, stats } = await made(cells)
    expect(chunk(rowsOf(file, 0, 'lines'), 8)).toEqual([[1, 72, 232, 700, 707.5, 697.5, 10, 0], [1, 72, 132, 688, 695.5, 685.5, 10, 0]])
    expect(phOf(file, 0, 1)).toEqual([0, 1, 2, 0, 1, 177, 700, 232, 707.5, 697.5, 1, 72, 688, 132, 695.5, 685.5])
    expect(file.pageText).toEqual([[0, 1, '(Sutton and Barto, 2018)']])
    // one frame of both lines; the second line erased, as the cell's
    expect(chunk(rowsOf(file, 0, 'frames'), 6).map(f => f.slice(0, 4))).toEqual([[1, 0, 0, 2]])
    expect(chunk(rowsOf(file, 0, 'erase'), 5).some(e => e[0] === 1 && (e[1] as number) <= 72 && (e[3] as number) >= 132)).toBe(true)
    expect(stats.ph).toMatchObject({ found: 1, lost: 0, why: {} })
    // the cell beside it keeps its own two lines
    expect(chunk(rowsOf(file, 1, 'lines'), 8).map(l => l.slice(0, 4))).toEqual([[1, 300, 360, 700], [1, 300, 340, 688]])
  })

  it('a citation after a paragraph\'s last word wrapped onto the next line: that line is the paragraph\'s', async () => {
    const runs: Run[] = [
      { s: words(0, 10), x: 72, y: 700 }, { s: 'w10 w11 w12 w13', x: 72, y: 688 }, { s: '(Smith and', x: 152, y: 688 }, { s: 'Winkler, 2006)', x: 72, y: 676 },
      { s: words(20, 10), x: 72, y: 652 },
    ]
    const { file } = await made({
      pages: [{ runs, points: { 'p0.1b': [3, 14] } }],
      marks: [['0s', 1, 72, 700], ['0e', 1, 152, 688], ['p0.1a', 1, 152, 688], ['p0.1b', 1, 142, 676], ['1s', 1, 72, 652], ['1e', 1, endOf(runs[4] as Run), 652]],
      units: [unit('para', [text(`${words(0, 10)} w10 w11 w12 w13 `), ph('\\citep{smith}')]), unit('para', [text(words(20, 10))])],
    })
    expect(chunk(rowsOf(file, 0, 'lines'), 8).map(l => l.slice(0, 4))).toEqual([[1, 72, endOf(runs[0] as Run), 700], [1, 72, 202, 688], [1, 72, 142, 676]])
    expect(phOf(file, 0, 1)).toEqual([0, 1, 2, 0, 1, 152, 688, 202, 695.5, 685.5, 1, 72, 676, 142, 683.5, 673.5])
    expect(chunk(rowsOf(file, 0, 'frames'), 6).map(f => f.slice(0, 4))).toEqual([[1, 0, 0, 3]])
    expect(chunk(rowsOf(file, 1, 'lines'), 8).map(l => l.slice(0, 4))).toEqual([[1, 72, endOf(runs[4] as Run), 652]])
  })

  it("a cell's citation TeX set whole on the next line, its line broken right after the opening point: that line is the cell's", async () => {
    // (2609.26457's cell 113: its opening point and its end mark at line 1's end, every glyph of it on line 2)
    const runs: Run[] = [{ s: 'majority voting', x: 72, y: 700 }, { s: '(Wang et al., 2023)', x: 72, y: 688 }]
    const { file } = await made({
      pages: [{ runs, points: { 'p0.1b': [1, 19] } }],
      marks: [['t0s', 1, 72, 700], ['t0e', 1, 152, 700], ['p0.1a', 1, 152, 700], ['p0.1b', 1, 167, 688]],
      units: [unit('cell', [text(' majority voting '), ph('\\citep{wang}'), text(' ')])],
    })
    expect(chunk(rowsOf(file, 0, 'lines'), 8).map(l => l.slice(0, 4))).toEqual([[1, 72, 147, 700], [1, 72, 167, 688]])
    expect(phOf(file, 0, 1)).toEqual([0, 1, 2, 0, 1, 72, 688, 167, 695.5, 685.5])
    expect(file.pageText).toEqual([[0, 1, '(Wang et al., 2023)']])
  })

  it('a line is added only where its run goes on to the very next line, a line of no other unit\'s', async () => {
    // (where TeX's points stand on one line, a part on no line of the unit's is LOST: 2307 128.5's, above.) Its run going
    // on three lines below, not on the next line
    const far: Run[] = [cellRuns[0] as Run, cellRuns[1] as Run, { s: 'Barto, 2018)', x: 72, y: 664 }, ...cellRuns.slice(3)]
    const gap = await made({ ...cells, pages: [{ runs: far, points: { 'p0.1b': [2, 12] } }] })
    expect(phOf(gap.file, 0, 1)).toEqual([0, 1, 2, PH_FLAG.LOST])
    expect(rowsOf(gap.file, 0, 'lines')).toHaveLength(8)
    // the line it goes on to is another unit's: its glyphs that unit's line
    const theirs: Run[] = [cellRuns[0] as Run, cellRuns[1] as Run, { s: 'Barto, 2018) more of it', x: 72, y: 688 }]
    const taken = await made({
      pages: [{ runs: theirs, points: { 'p0.1b': [2, 12] } }],
      marks: [['t0s', 1, 72, 700], ['t0e', 1, 177, 700], ['p0.1a', 1, 177, 700], ['p0.1b', 1, 132, 688], ['1s', 1, 72, 688], ['1e', 1, endOf(theirs[2] as Run), 688]],
      units: [unit('cell', [text(' decaying exploration '), ph('\\citep{sutton}'), text(' ')]), unit('para', [text('Barto 2018 more of it')])],
    })
    expect(phOf(taken.file, 0, 1)).toEqual([0, 1, 2, PH_FLAG.LOST])
    expect(rowsOf(taken.file, 0, 'lines')).toHaveLength(8)
  })
})

describe('makerOf, the marked original a page at a time (stage 2): its pages read beside arXiv\'s, the whole run\'s rows', () => {
  /** the maker fed the marked original's pages as markedPages reads them (byStream's `marked`), the whole run's frame and edges */
  async function streamed(w: World) {
    const input = { units: w.units, OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289' }
    let frameOf: unknown = null
    const first = await makerOf({ ...input, marks: await marksOf(w), arxiv: baseOf(w), frame: ((d: never, ms: never) => { frameOf = pageFrame(d, ms); return frameOf }) as never })
    if ('refused' in first) throw new Error('refused')
    for (let p = 1; p <= first.pages; p++) await first.readPage(p)
    const whole = await first.whole()
    const events = markedPages(markedOf(w.marked ?? w.pages, w.marks), '', { engine: 'pdflatex', units: w.units, OPS } as never)
    const head = ((await events.next()).value as { head: Parameters<typeof marksOfHead>[0] }).head
    const m = await makerOf({ ...input, marks: marksOfHead(head, 'pdflatex'), arxiv: baseOf(w), frame: () => frameOf as never, columnEdges: first.edges(), check: true })
    if ('refused' in m) throw new Error('refused')
    const st = await m.byStream({ head, events } as never)
    return { whole, st, stats: m.stats }
  }
  const lines = (page: number, n = 10): Run[] => Array.from({ length: n }, (_, j) => ({ s: words(100 * page + 10 * j, 10), x: 72, y: 700 - 12 * j }))

  it("a unit told keeps its placeholders' segments' pages alone in its stub, never a coloured row's fill as a page (#407)", async () => {
    // (a citation in hyperref's colorlinks blue: its row ends with the fill, 4 + 6n + 1 numbers)
    const parts: [string, string?][] = [['see the work '], ['[12]', '#0071bc'], [' and the rest of the line']]
    const runs: Run[] = []
    let x = 72
    for (const [s, fill] of parts) { runs.push({ s, x, y: 700, ...(fill ? { fill } : {}) }); x += s.length * CH * 10 }
    const at = (j: number) => 72 + j * CH * 10
    const w: World = {
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, x, 700], ['p0.1a', 1, at(13), 700], ['p0.1b', 1, at(17), 700]],
      units: [unit('para', [text('see the work '), ph('\\cite{k}'), text(' and the rest of the line')])],
    }
    const { whole, st } = await streamed(w)
    if (!('file' in whole) || 'refused' in st) throw new Error('refused')
    expect(phOf(whole.file, 0, 1).at(-1)).toBe(0x0071bc)
    // (told through page 1: the rows the cut of the parts after it reads of the unit, its pages)
    ;(st as unknown as { tell: (ids: number[], through: number) => void }).tell([0], 1)
    expect(st.layout([0]).ph).toEqual([[0, 0, 0, 0, 1, 0, 0, 0, 0, 0]])
  })

  it('a piece whose closing point is on the next page: its own ink is the unit\'s once that page is read, none too late', async () => {
    // a paragraph from page 1's last line to page 2's first, a formula across the break (x on page 1, y on page 2)
    const p1 = lines(1, 9), p2 = lines(2, 9)
    const x: Run = { s: 'x', x: 200, y: 592 }, y: Run = { s: 'y', x: 72, y: 712 }
    const pages: Page[] = [{ runs: [...p1, { s: words(190, 10), x: 72, y: 592 }, x] }, { runs: [y, ...p2] }]
    const marks: Mark[] = [['0s', 1, 72, 700], ['p0.1a', 1, 199, 592], ['p0.1b', 2, 78, 712], ['0e', 2, endOf(p2[8] as Run), p2[8]!.y]]
    const units = [unit('para', [text(`${[...p1.map(r => r.s), words(190, 10)].join(' ')} `), ph('$x y$'), text(` ${p2.map(r => r.s).join(' ')}`)])]
    const w: World = { pages, marks, units }
    await made(w)
    const { whole, st, stats } = await streamed(w)
    if (!('file' in whole) || 'refused' in st) throw new Error('refused')
    expect(mergeLayout([st.layout() as never]).ph).toEqual(whole.file.ph)
    expect(stats.late).toEqual({ rows: 0, vetoes: 0 })
  })

  it('a piece found only once a later page is read (its stop there): its unit waits for it, none too late', async () => {
    // page 1's body ends after the formula, the unit's end mark set past the body's end: the piece's stop, the next point in
    // its region, is the next unit's start mark on page 2 (stream.mjs ownedPages: found once page 2 is read)
    const r0: Run = { s: words(100, 10), x: 72, y: 700 }, r1: Run = { s: words(110, 9), x: 72, y: 688 }, x: Run = { s: 'x', x: 300, y: 688 }
    const p2 = lines(2)
    const pages: Page[] = [{ runs: [r0, r1, x], points: { bs1: [0, 0], be1: [2, 1] } }, { runs: p2, points: { bs2: [0, 0], be2: [p2.length, 0] } }]
    const marks: Mark[] = [['0s', 1, 72, 700], ['p0.1a', 1, 299, 688], ['0e', 1, 306, 688], ['1s', 2, 72, 700], ['1e', 2, endOf(p2[9] as Run), 592]]
    const units = [unit('para', [text(`${r0.s} ${r1.s} `), ph('$x$')]), unit('para', [text(p2.map(r => r.s).join(' '))])]
    const w: World = { pages, marks, units }
    await made(w)
    const { whole, st, stats } = await streamed(w)
    if (!('file' in whole) || 'refused' in st) throw new Error('refused')
    expect(mergeLayout([st.layout() as never]).ph).toEqual(whole.file.ph)
    expect(stats.late).toEqual({ rows: 0, vetoes: 0 })
    // (the piece's row is the marked original's second page's: page 1's pieces are not all found with page 1)
    const found: number[] = []
    for await (const e of markedPages(markedOf(pages, marks), '', { engine: 'pdflatex', units, OPS } as never)) if ('page' in e) found.push((e as { page: { found: number } }).page.found)
    expect(found).toEqual([1, 3])
  })

  it('pages are let go before the marked original is read to its end', async () => {
    const w: World = { pages: [1, 2, 3, 4].map(p => ({ runs: lines(p) })), marks: [1, 2, 3, 4].flatMap((p): Mark[] => [[`${p - 1}s`, p, 72, 700], [`${p - 1}e`, p, endOf(lines(p)[9] as Run), 592]]), units: [1, 2, 3, 4].map(p => unit('para', [text(words(100 * p, 100))])) }
    await made(w)
    const { st } = await streamed(w)
    if ('refused' in st) throw new Error('refused')
    const trace = (st as unknown as { trace: { read: number; marked: number; released: number }[] }).trace
    expect(trace.map(t => t.marked)).toEqual([1, 2, 3, 4])
    // pages 1 and 2 let go with page 3 read on both sides, not at the end (page 1's range waits for the units after it to be
    // known: a mark of the marked page 3 may be carried to arXiv's page 2, and a unit with none searched MARGIN before it)
    expect(trace[2]!.released).toBe(2)
  })
})

describe('makerOf, the page stream\'s rules (`rules`): rule 3, the columns\' edges of the pages before a page and its own', () => {
  // page 1 holds a caption alone, centred on the column a paragraph on page 2 sets: today its edges are the pages like it, page
  // 2's among them; under rule 3 those before it and its own give none, and it takes those of the first later page that gives
  // some (a cover page: it waits for page 2)
  const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
  para.push({ s: 'last line of it', x: 72, y: 652 })
  const cap = [{ s: 'Figure caption text', x: 172 - 47.5, y: 600 }, { s: 'its end', x: 172 - 17.5, y: 588 }]
  const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
  const w: World = {
    pages: [{ runs: cap }, { runs: para }],
    marks: [['0s', 1, cap[0]?.x ?? 0, 600], ['0e', 1, endOf(cap[1] as Run), 588], ['1s', 2, 72, 700], ['1e', 2, endOf(para[4] as Run), 652]],
    units: [unit('caption', [text(ws(cap))]), unit('para', [text(ws(para))])],
  }
  const input = async (rules: object | null) => ({ units: w.units, marks: await marksOf(w), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', rules: rules as never, inFloat: [] })

  it('the whole run\'s edges are every page\'s like it; rule 3\'s those before a page and its own, a cover page the first later one\'s: page 1\'s caption CENTRED both ways', async () => {
    const today = await makeLayout({ ...(await input({ frame: 'units', edges: 'all', columns: 'units' })), arxiv: baseOf(w) })
    const rule3 = await makeLayout({ ...(await input({ frame: 'units', edges: 'earlier' })), arxiv: baseOf(w) })
    if (!('file' in today) || !('file' in rule3)) throw new Error('refused')
    expect((today.file.units[0]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
    expect((rule3.file.units[0]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
    expect(encodeLayout(rule3.file)).toBe(encodeLayout(today.file))
    // (page 1's column 0 takes page 2's: it waits for page 2; today's run borrows nothing ahead)
    expect(rule3.stats.edgesAhead).toEqual([[1, 0, 2]])
    expect(today.stats.edgesAhead).toEqual([])
    // (the default is DEFAULT_RULES', rules 1, 3 and 4: the same bytes as those rules given)
    const byDefault = await makeLayout({ ...(await input(null)), arxiv: baseOf(w) })
    const named = await makeLayout({ ...(await input({ frame: 'tokens', edges: 'earlier', columns: 'tokens' })), arxiv: baseOf(w) })
    if (!('file' in named) || !('file' in byDefault)) throw new Error('refused')
    expect(encodeLayout(byDefault.file)).toBe(encodeLayout(named.file))
    expect(byDefault.stats.edgesAhead).toEqual([[1, 0, 2]])
  })

  it('under rule 3 (and rule 1) a page at a time and the passes in another order make the whole run\'s file', async () => {
    for (const rules of [{ edges: 'earlier' }, { frame: 'tokens', edges: 'earlier' }, { frame: 'tokens', edges: 'earlier', floatSearch: 'forward' }]) {
      // (today's frame the whole run's, given to the stream; rule 1's the text's, made by each)
      let frameOf: unknown = null
      const whole1 = rules.frame ? {} : { frame: ((d: never, ms: never) => { frameOf = pageFrame(d, ms); return frameOf }) as never }
      const given = () => (rules.frame ? {} : { frame: (() => frameOf) as never })
      const first = await makerOf({ ...(await input(rules)), arxiv: baseOf(w), ...whole1 })
      if ('refused' in first) throw new Error('refused')
      for (let p = 1; p <= first.pages; p++) await first.readPage(p)
      const whole = await first.whole()
      if (!('file' in whole)) throw new Error('refused')
      const m = await makerOf({ ...(await input(rules)), arxiv: baseOf(w), columnEdges: first.edges(), check: true, ...given() })
      if ('refused' in m) throw new Error('refused')
      const st = await m.byStream()
      if ('refused' in st) throw new Error('refused')
      const rows = (f: Record<string, unknown>) => ({ ...Object.fromEntries(PART_KEYS.map(k => [k, f[k]])), unlaid: f.unlaid ?? null })
      expect(rows(mergeLayout([st.layout() as never]) as never)).toEqual(rows(whole.file as never))
      // (and its own rule-3 edges, a page at a time, none given: the whole run's, the cover page's caption waiting for page 2)
      const own = await makerOf({ ...(await input(rules)), arxiv: baseOf(w), check: true, ...given() })
      if ('refused' in own) throw new Error('refused')
      const so = await own.byStream()
      if ('refused' in so) throw new Error('refused')
      expect(rows(mergeLayout([so.layout() as never]) as never)).toEqual(rows(whole.file as never))
      expect(own.edges()).toEqual(first.edges())
      expect(own.stats.edgesAhead).toEqual(first.stats.edgesAhead)
      const t = await makerOf({ ...(await input(rules)), arxiv: baseOf(w), columnEdges: first.edges(), check: true, ...given() })
      if ('refused' in t) throw new Error('refused')
      for (let p = 1; p <= t.pages; p++) await t.readPage(p)
      const rand = seeded(seeds++)
      const tasks = await t.byTasks(ready => Math.floor(rand() * ready.length))
      if (!('file' in tasks)) throw new Error('refused')
      expect(encodeLayout(tasks.file)).toBe(encodeLayout(whole.file))
    }
  })

  it('a cover page of one column waits for a later page of one column, past the two-column pages between: the stream\'s file the whole run\'s', async () => {
    // (page 1 one column, a caption alone; pages 2-5 two columns, edges of their own but none for page 1's class; page 6 one
    // column, the paragraph whose column the caption is centred on: page 1's edges are page 6's, in the whole run and the stream)
    const COLS2 = (page: number): Mark => [`c2-${page}`, page, 0, 0]
    const twoOn = (o: number) => [...Array.from({ length: 4 }, (_, j): Run => ({ s: words(o + 10 * j, 10), x: 60, y: 700 - 12 * j })), ...Array.from({ length: 6 }, (_, j): Run => ({ s: words(o + 40 + 10 * j, 10), x: 320, y: 700 - 12 * j }))]
    const lastTwo = twoOn(0).at(-1) as Run
    const six: World = {
      pages: [{ runs: cap }, { runs: twoOn(0) }, { runs: twoOn(100) }, { runs: twoOn(200) }, { runs: twoOn(300) }, { runs: para }],
      marks: [
        ['0s', 1, cap[0]?.x ?? 0, 600], ['0e', 1, endOf(cap[1] as Run), 588],
        ...[2, 3, 4, 5].flatMap((pg, k): Mark[] => [COLS2(pg), [`${k + 1}s`, pg, 60, 700], [`${k + 1}e`, pg, endOf(lastTwo), lastTwo.y]]),
        ['5s', 6, 72, 700], ['5e', 6, endOf(para[4] as Run), 652],
      ],
      units: [unit('caption', [text(ws(cap))]), ...[0, 100, 200, 300].map(o => unit('para', [text(words(o, 100))])), unit('para', [text(ws(para))])],
    }
    const of = async (rules: object | null) => ({ units: six.units, marks: await marksOf(six), OPS, paper: { id: '2608.04322', version: 1 }, left: '', pdfjs: '6.3.289', rules: rules as never, inFloat: [] })
    const rows = (f: Record<string, unknown>) => ({ ...Object.fromEntries(PART_KEYS.map(k => [k, f[k]])), unlaid: f.unlaid ?? null })
    for (const rules of [{ frame: 'tokens', edges: 'earlier' }, null]) {
      const first = await makerOf({ ...(await of(rules)), arxiv: arxivOf(six.pages) })
      if ('refused' in first) throw new Error('refused')
      for (let p = 1; p <= first.pages; p++) await first.readPage(p)
      const whole = await first.whole()
      if (!('file' in whole)) throw new Error('refused')
      expect(first.stats.edgesAhead).toEqual([[1, 0, 6]])
      expect((whole.file.units[0]?.[3] ?? 0) & UNIT_FLAG.CENTRED).toBe(UNIT_FLAG.CENTRED)
      const own = await makerOf({ ...(await of(rules)), arxiv: arxivOf(six.pages), check: true })
      if ('refused' in own) throw new Error('refused')
      const so = await own.byStream()
      if ('refused' in so) throw new Error('refused')
      expect(rows(mergeLayout([so.layout() as never]) as never)).toEqual(rows(whole.file as never))
      expect(own.stats.edgesAhead).toEqual(first.stats.edgesAhead)
    }
    // and through every comparison made() holds (its default rules' branch among them)
    await made(six)
  })

  it('a rule that is none is refused', async () => {
    await expect(makerOf({ ...(await input({ edges: 'later' })), arxiv: baseOf(w) })).rejects.toThrow(TypeError)
    await expect(makerOf({ ...(await input({ float: 'forward' })), arxiv: baseOf(w) })).rejects.toThrow(TypeError)
  })
})


describe('makeLayout, the marking the marks file records: the complete macros, the boxes apart, a start mark at no word (#436)', () => {
  // (each character half an em of 10 pt: 5 pt; the maker replays the marking from the file, layoutMarking with its `complete`
  // and `apart`, and bounds a unit whose start mark stands at no word by the word its line reaches)
  const at = (j: number) => 72 + 5 * j
  it('a citation after a complete macro TeX answered for is the marking\'s, and found: the maker replays the marking with `complete`', async () => {
    const runs: Run[] = [{ s: 'The share is 91.5 [1] of all', x: 72, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(13), 700], ['p0.1b', 1, at(17), 700], ['p0.3a', 1, at(18), 700], ['p0.3b', 1, at(21), 700]],
      units: [unit('para', [text('The share is '), ph('\\share{}'), text(' '), ph('\\cite{a}'), text(' of all')])],
      complete: { share: 0 }, switches: { '\\share': '00000000', '\\cite': '00000000' },
    })
    expect(phOf(file, 0, 3)[3]).toBe(0)
    expect(phOf(file, 0, 3).slice(5, 8)).toEqual([at(18), 700, at(21)])
    expect(phOf(file, 0, 1)[3]).toBe(0)
  })
  it('a macro glued to a number whose box begins with a kern is the marking\'s, and found: the maker replays it with `apart`', async () => {
    const runs: Run[] = [{ s: 'a gap of 0.58pp more', x: 72, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[0] as Run), 700], ['p0.1a', 1, at(13), 700], ['p0.1b', 1, at(15), 700]],
      units: [unit('para', [text('a gap of 0.58'), ph('\\pp{}'), text(' more')])],
      complete: { pp: 0 }, switches: { '\\pp': '00000000' }, apart: ['\\pp{}'],
    })
    expect(phOf(file, 0, 1)[3]).toBe(0)
    expect(phOf(file, 0, 1).slice(5, 8)).toEqual([at(13), 700, at(15)])
  })
  it('a unit that opens with a formula, its start mark at no word, is placed from its line\'s first word after the mark', async () => {
    // (the formula's glyphs give no text: a run of blanks)
    const runs: Run[] = [{ s: 'xxxx', x: 72, y: 700, blank: true }, { s: 'is a word here', x: 95, y: 700 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 700], ['p0.0a', 1, 72, 700], ['p0.0b', 1, 92, 700]],
      units: [unit('para', [ph('$x$'), text(' is a word here')])],
    })
    expect(chunk(rowsOf(file, 0, 'lines'), 8)).toHaveLength(1)
  })
  it('but not from a word of the other column on its baseline, whatever the reading order: unplaced as before', async () => {
    const runs: Run[] = [{ s: 'xxxxxxxxxx', x: 60, y: 700, blank: true }, { s: 'Other text here', x: 320, y: 700 }, { s: 'is the unit', x: 60, y: 688 }]
    // (its paper's one unit unplaced, none laid: the file is refused, the paper falls back to arXiv's PDF; with a unit beside it
    // that is laid, it has no row of its own in the file)
    const second: Run = { s: 'a second paragraph laid', x: 60, y: 600 }
    const w: World = {
      pages: [{ runs: [...runs, second] }],
      marks: [COLS2(1), ['0s', 1, 60, 700], ['0e', 1, endOf(runs[2] as Run), 688], ['p0.0a', 1, 60, 700], ['p0.0b', 1, 110, 700], ['1s', 1, 60, 600], ['1e', 1, endOf(second), 600]],
      units: [unit('para', [ph('$x$'), text(' is the unit')]), unit('para', [text('a second paragraph laid')])],
    }
    const { file } = await made(w)
    expect(file.lines.find(([u]) => u === 0)).toBeUndefined()
    expect(file.lines.map(([u]) => u)).toEqual([1])
    expect(await make({ ...w, pages: [{ runs }], marks: w.marks.slice(0, 5), units: w.units.slice(0, 1) })).toMatchObject({ refused: 'carry', stats: { units: { unplaced: 1, located: 0 } } })
  })
  it('nor a sideways cell\'s: its start mark on a turned word reaches none, and the paragraph beside its table keeps every line (2602.23285v2)', async () => {
    // (a \rotatebox{90} cell of a table set beside a paragraph, on a page of one column: its marks stand one above the other on
    // its turned run, its start mark at no upright word; the nearest upright word on that baseline is the next cell's, and the
    // last word before its end mark on the end's baseline the paragraph's, which the text layer gives after the table's. The
    // paragraph's second line ends in a word TeX broke at a hyphen, the rest of which opens the third, before the table: the
    // cell bounded from the next cell's word to the paragraph's took the third line's words and their glyphs, the rest's too,
    // and the paragraph, left that rest alone for its third line, found no glyph of its own there and was laid not at all)
    const name: Run = { s: 'ODEBRAIN', x: 345, y: 645 }, turned: Run = { s: 'Discrete Continuous', x: 330, y: 645, turn: true }
    const runs: Run[] = [
      { s: words(0, 5), x: 72, y: 764 }, { s: `${words(5, 4)} com-`, x: 72, y: 752, eol: true }, { s: 'pare', x: 72, y: 740 },
      name, turned, { s: words(10, 4), x: 97, y: 740 }, { s: words(15, 3), x: 72, y: 728 },
    ]
    const last = runs[6] as Run
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 330, 645], ['0e', 1, 330, 645 + endOf(turned) - turned.x], ['1s', 1, 72, 764], ['1e', 1, endOf(last), 728]],
      units: [unit('cell', [text('Discrete Continuous')]), unit('para', [text(`${words(0, 9)} compare ${words(10, 4)} ${words(15, 3)}`)])],
    })
    // (the paragraph's lines, each from its first word to its last: the third from the rest to the last word after the table)
    expect(chunk(rowsOf(file, 1, 'lines'), 8).map(r => [r[3], r[1], r[2]])).toEqual([[764, 72, endOf(runs[0] as Run)], [752, 72, endOf(runs[1] as Run)], [740, 72, endOf(runs[5] as Run)], [728, 72, endOf(last)]])
    expect(file.lines.map(([u]) => u)).toEqual([1])
    // (the cell the original's, and the file says why: its own marks bound nothing)
    expect(file.unlaid).toEqual([[0, 'unplacedMarks']])
  })
  it('a unit whose line\'s glyphs a unit laid before it took is not laid, and the file says why (`lineTaken`)', async () => {
    // (two units' words on one line, the first's two either side of the second's: the first's line runs from its first word
    // to its last and takes every glyph between them, the second's word among them)
    const runs: Run[] = [{ s: 'alpha', x: 72, y: 700 }, { s: 'omega', x: 290, y: 700 }, { s: 'inner', x: 150, y: 700 }, { s: 'a paragraph laid', x: 72, y: 600 }]
    const { file } = await made({
      pages: [{ runs }],
      marks: [['0s', 1, 72, 700], ['0e', 1, endOf(runs[1] as Run), 700], ['1s', 1, 150, 700], ['1e', 1, endOf(runs[2] as Run), 700], ['2s', 1, 72, 600], ['2e', 1, endOf(runs[3] as Run), 600]],
      units: [unit('para', [text('alpha omega')]), unit('para', [text('inner')]), unit('para', [text('a paragraph laid')])],
    })
    expect(file.units.map(u => u[0])).toEqual([0, 2])
    expect(file.unlaid).toEqual([[1, 'lineTaken']])
  })
})
