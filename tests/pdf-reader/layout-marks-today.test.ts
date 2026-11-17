import { createHash } from 'node:crypto'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import type { LayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'
import { encodeLayoutMarks, LAYOUT_CLASSES, layoutMarksOf, MARK_CLASSES, MARKS_CAP, MARKS_SCHEMA, MARKS_VALUES, OWNED_ALL, parseLayoutMarks, askedCommands, AHEAD_PROBE_MAX, GLYPHS_PIECE, INK_ANY, INK_BUDGET, readSkipProbe, probeRow, markedPages, readMarked, readMarkProbe, readProbe, switchedOf } from '@/pdf-reader/engine/layout/marks.mjs'
import { GLYPHS_PAGE } from '@readarxiv/engine'
import { markWords, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { OWNED, OWNED_HOW } from '@/pdf-reader/engine/layout/stream.mjs'
import { marksOf } from '@/pdf-reader/engine/pipeline/typeset/places.mjs'
import { settleWithClock } from './helpers/clock'
import { ALLOCATION_FAILED } from '@readarxiv/engine'

// The layout marks as text: which placeholder gets which mark, the units' own marks, the TeX that goes with them, the
// marks file and its bounds. What the TeX does under TeX — that no line moves, that nothing written to a file changes —
// is checked natively by lab/pdf/spikes/layout-marks-cases.mjs

type Piece = { t: string; s?: string; src?: string; id?: number; unit?: unknown; pre?: string; post?: string }
const text = (s: string): Piece => ({ t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const unit = (kind: string, pieces: Piece[], more: Partial<SourceUnit> = {}): SourceUnit => ({ kind, file: 'main.tex', start: 0, end: 0, pieces, ...more }) as SourceUnit
/** the i-th of a list, which the test knows is there */
const nth = <T>(xs: readonly T[], i: number): T => { const x = xs[i]; if (x === undefined) throw new Error(`no item ${i}`); return x }

afterEach(() => { vi.restoreAllMocks() })

/** a switch of `n` commands, each \\axtq and its number in letters, every mark safe */
const switchOf = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`\\axtq${i.toString(26).replace(/\d/g, d => String.fromCharCode(113 + Number(d)))}`, '00000000']))

// three sources: typeset-tex.test.ts's, one with a table and a footnote, one with a heading and displays
const SOURCES = {
  plain: '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n',
  table: '\\documentclass{article}\n\\begin{document}\nA paragraph with a note\\footnote{The note\'s own text, with $y$.} and a citation \\cite{k} and Fig.~\\ref{t}.\n\n\\begin{table}\\centering\n\\begin{tabular}{lc}\n\\hline\nName & Value $x$ \\\\\n\\cline{1-2}\nFirst cell & \\texttt{code} \\\\\n\\end{tabular}\n\\caption{The table\'s caption.}\\label{t}\n\\end{table}\n\\end{document}\n',
  display: '\\documentclass{article}\n\\newcommand\\bert{BERT}\n\\begin{document}\n\\section{The $x$ model}\nWe set \\bert{} as\n\\[ a = b \\]\nfor every $n$, see \\eqref{e} and \\url{https://x.org}.\n\\begin{equation}\\label{e} c = d \\end{equation}\n\\end{document}\n',
}
/** originalFiles' main.tex at 3cb5a733 (the pin), SHA-256, recorded before the layout option was added; with the line probes
 *  (`lines`), LINES_TEX's as it states each paragraph's \parskip too (the borrowing ruling of 2026-11-08) */
const PIN: Record<string, { plain: string; lines: string }> = {
  plain: { plain: '0b6fe69122e06d17b3d9716a34dbaa1d87ac0596b0b70fee4dfbed6f5f696a2e', lines: '4e4fd26b8effb203ad1d83110e1a3b54da39bd8a346091ece3acf98ed15fa03a' },
  table: { plain: '3d2f67c0fe4d6b2bd8adcea768bbb2b018b02d5b9650c73427612dc86ee2bdfe', lines: '9ed40c4269744cbeb22cdf89922b176f2c0412b0f11303d0f78356662bf4f686' },
  display: { plain: 'f521d7df749a560de860e34b2df4b428e48cb91d6e9e0e9d09ba9d25a2c1390d', lines: '908d0b0776ae045c42080edb85ad94f779e9eb23e7c6f2304f99a85c877e6a68' },
}
const paperOf = (src: string) => openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const decode = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe('the paper\'s own switch: TeX asked what a mark does before what follows', () => {
  it('readProbe: the rows of every section, tagged; a line of another marker is no row; readMarkProbe takes its own and no other', () => {
    expect(probeRow('punct', 3, '\\axt@qo')).toBe('\\typeout{LAYOUT-PROBE 1 punct 3 \\axt@qo}')
    const log = 'LAYOUT-PROBE 1 punct 0 00000000\nLAYOUT-PROBE 1 role 4 display\nother line\nLAYOUT-PROBE 2 punct 1 22222222\nLAYOUT-PROBE 1 punct 1 22222200\nLAYOUT-PROBE 1 punct 2 2200000\nLAYOUT-PROBE 1 punct 7 22222222\nLAYOUT-PROBE 1 punct 0\n'
    expect(readProbe(log).map(r => [r.tag, r.fields.join(' ')])).toEqual([['punct', '0 00000000'], ['role', '4 display'], ['punct', '1 22222200'], ['punct', '2 2200000'], ['punct', '7 22222222'], ['punct', '0']])
    const samples = [{ command: '\\cite' }, { command: '\\autocite' }, { command: '\\footnote' }]
    // a line of another marker, a section of another tag, a code cut short, a sample the probe has not: no answer
    expect(readMarkProbe(log, samples)).toEqual({ '\\cite': '00000000', '\\autocite': '22222200' })
    // an error TeX logged in a box answers nothing: in the box as the paper sets it, no answer (x); with the opening
    // mark, no mark (2); with both marks alone, no closing mark (1, REVTeX's citeautoscript); one before any row is no
    // box's
    const errs = ['! Early.', 'LAYOUT-PROBE 1 punct-at 0 4 a', '! Missing \\endcsname inserted.', 'l.12 ...', 'LAYOUT-PROBE 1 punct-at 0 5 c', './main.tex:12: Extra }, or forgotten $.', 'LAYOUT-PROBE 1 punct-at 0 5 d', 'LAYOUT-PROBE 1 punct-at 0 6 c', '! Argument of \\super@cite@swap has an extra }.', 'LAYOUT-PROBE 1 punct-at 0 6 d', 'LAYOUT-PROBE 1 punct-at 0 2 d', '! Undefined.', 'LAYOUT-PROBE 1 punct 0 00000000'].join('\n')
    expect(readMarkProbe(errs, samples)).toEqual({ '\\cite': '0020x110' })
    expect(switchedOf({ '\\cite': '00000000', '\\autocite': '22222200', '\\footnote': '00000002' })).toEqual(['\\autocite'])
  })
  it('originalFiles passes `switches` on; without `layout` it changes no byte', () => {
    const p = paperOf('\\documentclass{article}\n\\begin{document}\nA claim \\cite{k}. And \\cite{j} again, see \\ref{t}.\n\\end{document}\n')
    const v1 = decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: { '\\cite': '22220000', '\\ref': '00000000' } }))
    expect(v1).toContain('A claim \\cite{k}. And \\axtpma{p0.3a}\\cite{j}\\axtpm{p0.3b} again')
    expect(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: null }))).toBe(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES })))
    expect([...askedCommands(p.units)]).toEqual(['\\cite', '\\ref'])
    const t = paperOf(SOURCES.table)
    for (const lines of [false, true]) expect(sha(originalFiles(t, { lines, switches: { '\\cite': '22222222' } }).get('main.tex') as Uint8Array)).toBe(PIN.table?.[lines ? 'lines' : 'plain'])
  })
})

// a PDF.js document as layoutMarksOf and marksOf read it: its pages, their views and text, its destinations
type Dest = [{ num: number; gen: number }, { name: string }, number | null, number | null, null]
function fakeDocument(pages: { view: number[]; items?: unknown[] }[], dests: [string, number, number | null, number | null][]) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => ({ view: nth(pages, n - 1).view, getTextContent: async () => ({ items: nth(pages, n - 1).items ?? [], styles: {} }) }),
    getDestinations: async () => new Map<string, Dest>(dests.map(([name, page, x, y]) => [name, [{ num: 100 + page, gen: 0 }, { name: 'XYZ' }, x, y, null]])),
    getPageIndex: async (ref: { num: number }) => ref.num - 101,
  }
}
const item = (str: string, x: number, y: number, size = 10) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5, height: size, fontName: 'f1', hasEOL: false })
/** a page's operator list in stream order: a run of glyphs at its place (each 5 pt wide at 10 pt), a point (`/axt-<name> ri`),
 *  a rule */
type Shown = [s: string, x: number, y: number, size?: number] | { at: string } | { rule: number[] } | { glyphs: string[]; x: number; y: number; size?: number; step?: number }
const FONT = { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false }
function opsOf(shown: Shown[]) {
  const ops: [number, unknown[]][] = []
  for (const s of shown) {
    if (Array.isArray(s)) {
      const [str, x, y, size = 10] = s
      ops.push([OPS.beginText, []], [OPS.setFont, ['f1', size]], [OPS.setTextMatrix, [[1, 0, 0, 1, x, y]]], [OPS.showText, [[...str].map(c => (c === ' ' ? -500 : { unicode: c, width: 500, isSpace: false, fontChar: c, vmetric: null }))]], [OPS.endText, []])
    } else if ('glyphs' in s) {
      // each glyph a Unicode string of its own (a ligature's, or many distinct ones), `step` its advance in thousandths
      const step = s.step ?? 500
      ops.push([OPS.beginText, []], [OPS.setFont, ['f1', s.size ?? 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, s.x, s.y]]], [OPS.showText, [s.glyphs.map(u => ({ unicode: u, width: step, isSpace: false, fontChar: u, vmetric: null }))]], [OPS.endText, []])
    } else if ('at' in s) ops.push([OPS.setRenderingIntent, [{ name: `axt-${s.at}` }]])
    else ops.push([OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from(s.rule)]])
  }
  return { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }
}
/** fakeDocument's, with each page's operator list */
function streamDocument(pages: { view: number[]; items?: unknown[]; shown: Shown[] }[], dests: [string, number, number | null, number | null][]) {
  const doc = fakeDocument(pages, dests)
  return { ...doc, getPage: async (n: number) => ({ ...(await doc.getPage(n)), rotate: 0, commonObjs: { get: () => FONT }, getOperatorList: async () => opsOf(nth(pages, n - 1).shown) }) }
}

describe('reading the marked original', () => {
  it('marksOf reads none of the layout marks', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792] }], [['axt-12s', 1, 72, 700], ['axt-12e', 1, 300, 650], ['axt-c2-1', 1, 0, 0], ['axt-t4s', 1, 80, 500], ['axt-h0s', 1, 72, 720], ['axt-p3.14a', 1, 100, 700], ['axt-n3.2b', 1, 120, 700], ['axt-g9t', 1, 300, 400]])
    const m = await marksOf(doc)
    expect([...m.marks.keys()].sort()).toEqual(['12e', '12s'])
    expect(m.columns).toEqual([2])
  })
  it('layoutMarksOf drops a name set twice', async () => {
    const doc = fakeDocument(
      [{ view: [0, 0, 612, 792], items: [item('The model', 72, 700), item('x', 140, 700)] }, { view: [0, 0, 612, 792], items: [item('the end', 72, 720)] }],
      [['axt-0s', 1, 72, 700], ['axt-0e', 1, 150.123, 700], ['axt-h3s', 2, 72, 720], ['axt-p0.1a', 1, 100, 700], ['axt-c1-1', 1, 0, 0], ['axt-c2-2', 2, 0, 0], ['other', 1, 1, 1], ['axt-zz', 1, 1, 1], ['axt-g1t', 2, 300, 400]],
    )
    // the warning as TeX writes it in the log, cut at 79 characters
    const warning = 'pdfTeX warning (dest): destination with the same identifier (name{axt-h3s}) has been already used, duplicate ignored'
    const log = `This is pdfTeX\n${warning.slice(0, 79)}\n${warning.slice(79)}\nAXT-LINES 3 5 12.0pt 10\nAXT-LINES 0 2 12.0pt 10\n`
    const m = await layoutMarksOf(doc, log, { engine: 'pdflatex' })
    expect(m.dropped).toEqual(['h3s'])
    expect(m.marks.map(x => x[0])).not.toContain('h3s')
    expect(m.marks).toContainEqual(['0e', 1, 150.12, 700])
    expect(m.marks.map(x => x[0]).sort()).toEqual(['0e', '0s', 'c1-1', 'c2-2', 'g1t', 'p0.1a'])
    expect(m.columns).toEqual([1, 2])
    expect(m.lines).toEqual([[0, 2], [3, 5]])
    expect(m.views).toEqual([0, 0, 612, 792, 0, 0, 612, 792])
    expect(m.pages).toBe(2)
    expect(m.engine).toBe('pdflatex')
    expect(m.words).toEqual(['the', 'model', 'x', 'end'])
    expect(m.tokens.length).toBe(6 * 5)
    expect(m.tokens.slice(0, 6)).toEqual([1, 72, 700, 15, 10, 0])
    expect(m.tokens.slice(24, 30)).toEqual([2, 92, 720, 15, 10, 3])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf writes the rest of a word cut by a hyphen as word -1 after it, and none after a word left out', async () => {
    const eol = (str: string, x: number, y: number) => ({ ...item(str, x, y), hasEOL: true })
    const long = 'x'.repeat(201)
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('text generation', 72, 700), eol('mod-', 160, 700), item('els.', 72, 688), eol(`${long}-`, 72, 676), item('tail', 72, 664)] }], [])
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect(m.words).toEqual(['text', 'generation', 'models'])
    // models, then its rest at the next line's start; the 201-letter word and its rest left out
    expect(m.tokens.slice(12, 24)).toEqual([1, 160, 700, 15, 10, 2, 1, 72, 688, 15, 10, -1])
    expect(m.tokens.length).toBe(6 * 4)
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf records the classes and the paper\'s switch the marked original was made with', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('kept', 72, 700)] }], [['axt-0s', 1, 72, 700]])
    // no probe run: null, which the maker re-marks as LAYOUT_TEX sets every mark; a probe that answered nothing is {},
    // which the maker re-marks with no mark for an asked command (Task 2's m4): the two kept apart through the file
    const plain = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect(plain.marking).toEqual({ classes: [...LAYOUT_CLASSES], switches: null, inkless: null, texts: null, names: null, lineskip: null, complete: null, apart: null })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(plain))).marking.switches).toBeNull()
    const none = await layoutMarksOf(doc, '', { engine: 'pdflatex', switches: {} })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(none))).marking.switches).toEqual({})
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', classes: ['math', 'cite'], switches: { '\\cite': '22220000', '\\ref': 'x0000000' } })
    expect(m.marking).toEqual({ classes: ['math', 'cite'], switches: { '\\cite': '22220000', '\\ref': 'x0000000' }, inkless: null, texts: null, names: null, lineskip: null, complete: null, apart: null })
    // the names' answers (readNameProbe), in NAME_KEYS' order; a key of none, or a value not 0 or 1, refused
    const cased = await layoutMarksOf(doc, '', { engine: 'pdflatex', names: { ref: 0, abstract: 1 } })
    expect(Object.keys(cased.marking.names ?? {})).toEqual(['abstract', 'ref'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(cased))).marking.names).toEqual({ abstract: 1, ref: 0 })
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', names: { chapter: 1 } as never })).rejects.toThrow(LayoutRefusal)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', names: { ref: 2 } as never })).rejects.toThrow(LayoutRefusal)
    // the probe's texts, as readInkTexts gives them, written flat (the file nests no deeper)
    const said = await layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\bert', 'BERT'], ['\\ours', 'OURS']] })
    expect(said.marking.texts).toEqual(['\\bert', 'BERT', '\\ours', 'OURS'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(said))).marking.texts).toEqual(['\\bert', 'BERT', '\\ours', 'OURS'])
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\bert', 'BE RT']] })).rejects.toThrow(LayoutRefusal)
    // (MARKS_SCHEMA 10: a number's punctuation, \\texttt's underscore, a formula's glyph spelled by no character, through the file;
    // a text that spells no character is none)
    const leads = await layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\CompletionTokenCap{}', '1,024'], ['\\texttt{max\\_tokens}', 'max_tokens'], ['\\dprime{}', `d${INK_ANY}`]] })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(leads))).marking.texts).toEqual(['\\CompletionTokenCap{}', '1,024', '\\texttt{max\\_tokens}', 'max_tokens', '\\dprime{}', `d${INK_ANY}`])
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\checkmark', INK_ANY]] })).rejects.toThrow(LayoutRefusal)
    const none2 = await layoutMarksOf(doc, '', { engine: 'pdflatex', inkless: ['\\rule{0pt}{2ex}'] })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(none2))).marking.inkless).toEqual(['\\rule{0pt}{2ex}'])
    // the paper's \\lineskip and \\lineskiplimit as readSkipProbe gives them (PDF units: 1pt is 0.9962640099626402), written to
    // a hundredth like every number of the file
    const skips = await layoutMarksOf(doc, '', { engine: 'pdflatex', lineskip: [0.9962640099626402, -0.004] })
    // (held as the file holds them: the marks in memory are their file's)
    expect(skips.marking.lineskip).toEqual([1, 0])
    expect(Object.is(skips.marking.lineskip?.[1], 0)).toBe(true)
    expect(encodeLayoutMarks(skips)).toContain('"lineskip":[1,0]')
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(skips))).marking.lineskip).toEqual([1, 0])
    // TeX's \maxdimen, which \offinterlineskip sets \lineskiplimit to, from the probe to the file and back: written
    // 16322.79, over the exact 16322.7895 by the rounding, and read again (the 16384pt the probe reads at most alike)
    for (const [log, max] of [['LAYOUT-PROBE 1 lineskip -16383.99998pt 16383.99998pt', [-16322.79, 16322.79]], ['LAYOUT-PROBE 1 lineskip 0.0pt 16384.0pt', [0, 16322.79]]] as const) {
      const most = await layoutMarksOf(doc, '', { engine: 'pdflatex', lineskip: readSkipProbe(log) })
      expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(most))).marking.lineskip, log).toEqual(max)
    }
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m))).marking).toEqual(m.marking)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', switches: { '\\cite': '2222000y' } })).rejects.toThrow(LayoutRefusal)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', classes: ['math', 'tikz' as 'math'] })).rejects.toThrow(LayoutRefusal)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', switches: { '\\cite': '2222' } })).rejects.toThrow(LayoutRefusal)
    // no operator list read without the units and PDF.js's operator codes: no piece owns anything
    expect(m.owned).toEqual([])
    expect(m.chars).toEqual([])
  })
  it('layoutMarksOf writes past its caps as not owned, and nothing its own parser refuses (the 6b review\'s I3 and Minor 1)', async () => {
    // pieces of $x$ each between its points; their glyphs given as runs of many glyphs
    const pieceOf = (n: number) => unit('para', Array.from({ length: n }, (_, k) => [text(k ? ' and ' : 'see '), ph('$x$')]).flat())
    const parse = async (units: SourceUnit[], shown: Shown[], dests: [string, number, number, number][], view = [0, 0, 612, 792]) => {
      const doc = streamDocument([{ view, items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
      const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
      return { m, back: parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m))) }
    }
    // a piece of GLYPHS_PIECE + 1 glyphs: not owned, how so
    {
      const glyphs = Array.from({ length: GLYPHS_PIECE + 1 }, () => 'x')
      const { back } = await parse([pieceOf(1)], [{ at: '0s' }, { at: 'p0.1a' }, { glyphs, x: 72, y: 700, step: 1 }, { at: 'p0.1b' }, { at: '0e' }], [['0s', 1, 72, 700], ['p0.1a', 1, 72, 700], ['p0.1b', 1, 300, 700], ['0e', 1, 300, 700]])
      expect(back.owned).toEqual([['p0.1a', OWNED_HOW.indexOf('more glyphs than a piece may own')]])
    }
    // 65,537 distinct characters over four pieces: the 65,536th place is '', which every one past it is written as
    {
      const per = 16_385, shown: Shown[] = [{ at: '0s' }], dests: [string, number, number, number][] = [['0s', 1, 72, 700]]
      for (let q = 0; q < 4; q++) {
        const k = 2 * q + 1, glyphs = Array.from({ length: per }, (_, i) => { const n = q * per + i; return String.fromCharCode(0x4e00 + (n % 20000)) + String.fromCharCode(0x4e00 + Math.floor(n / 20000)) })
        shown.push({ at: `p0.${k}a` }, { glyphs, x: 72, y: 700 - 10 * q, step: 1 }, { at: `p0.${k}b` })
        dests.push([`p0.${k}a`, 1, 72, 700 - 10 * q], [`p0.${k}b`, 1, 300, 700 - 10 * q])
      }
      shown.push({ at: '0e' }); dests.push(['0e', 1, 300, 670])
      const { m, back } = await parse([pieceOf(4)], shown, dests)
      expect(m.chars).toHaveLength(65_536)
      expect(m.chars.at(-1)).toBe('')
      expect(back.chars).toHaveLength(65_536)
    }
  }, 60_000)
  it('layoutMarksOf: past OWNED_ALL a paper\'s pieces are not owned, and past MARKS_CAP its last owned pieces are cut, never the file refused', async () => {
    // 14 pieces, counted in their opening points' order (p0.1a, p0.3a, …: the page stream finds them so, E2a) 12 of 20,000
    // glyphs and one of 9,999: 249,999 owned; the last, p0.27a, 20,000 more, past OWNED_ALL. Four pieces a page, each page
    // within GLYPHS_PAGE (a page past it has no ink)
    const n = 14, per = 20_000, past = OWNED_HOW.indexOf('past the glyphs a paper may own'), on = (q: number) => 1 + Math.floor(q / 4)
    const units = [unit('para', Array.from({ length: n }, (_, k) => [text(k ? ' and ' : 'see '), ph('$x$')]).flat())]
    const run = async (big: boolean) => {
      const shown: Shown[][] = Array.from({ length: on(n - 1) }, () => []), dests: [string, number, number, number][] = [['0s', 1, big ? 10_000 : 72, big ? 13_000 : 700]]
      shown[0]!.push({ at: '0s' })
      for (let q = 0; q < n; q++) {
        const k = 2 * q + 1, y = big ? 13_000.11 - 300 * q : 700 - 12 * q, count = q === n - 2 ? 9_999 : per
        // at coordinates of five digits on a page of 14,000 pt, each glyph a character of its own kind (an index of five
        // digits into `chars`): some 8.6 MB, past MARKS_CAP; else 4 MB of one character, within it
        const glyphs = Array.from({ length: count }, (_, i) => { if (!big) return 'x'; const c = 10_000 + ((q * per + i) % 55_000); return String.fromCharCode(0x4e00 + (c % 20000)) + String.fromCharCode(0x4e00 + Math.floor(c / 20000)) })
        shown[on(q) - 1]!.push({ at: `p0.${k}a` }, { glyphs, x: big ? 10_000.11 : 72, y, size: big ? 199.99 : 10, step: big ? 1 : 0.01 }, { at: `p0.${k}b` })
        dests.push([`p0.${k}a`, on(q), big ? 10_000 : 72, y], [`p0.${k}b`, on(q), big ? 13_000 : 80, y])
      }
      shown[on(n - 1) - 1]!.push({ at: '0e' }); dests.push(['0e', on(n - 1), big ? 13_000 : 80, big ? 9_000 : 500])
      const view = big ? [0, 0, 14_000, 14_000] : [0, 0, 612, 792]
      const doc = streamDocument(shown.map((sh, i) => ({ view, items: i ? [] : [item('see', dests[0]![2], dests[0]![3])], shown: sh })), dests.map(([nm, ...r]) => [`axt-${nm}`, ...r]))
      const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
      const written = encodeLayoutMarks(m)
      expect(new TextEncoder().encode(written).length).toBeLessThanOrEqual(MARKS_CAP)
      return parseLayoutMarks(new TextEncoder().encode(written))
    }
    // within the cap: the last piece alone past OWNED_ALL
    const small = await run(false)
    expect(small.owned.find(e => e[0] === 'p0.27a')).toEqual(['p0.27a', past])
    expect(small.owned.filter(e => e.length === 2).length).toBe(1)
    // past the cap: owned pieces from the last by name cut to fit the file, never the file refused
    const large = await run(true)
    expect(large.owned.find(e => e[0] === 'p0.27a')).toEqual(['p0.27a', past])
    expect(large.owned.at(-1)).toEqual(['p0.9a', past])
    expect(large.owned.filter(e => e.length === 2 && e[1] === past).length).toBeGreaterThan(1)
    expect(large.owned.some(e => e.length > 2)).toBe(true)
  }, 120_000)
  it('layoutMarksOf: a display group\'s first display owns the group, to the text after it; a later one, which TeX gives no point, is in it', async () => {
    // the empty paragraph between two displays holds no mark: p0.3a is never set, and its ink is the first's
    const units = [unit('para', [text('define '), ph('\\[a=b\\]'), text('\n'), ph('\\[c=d\\]'), text(' where '), ph('$x$'), text(' holds')])]
    const shown: Shown[] = [{ at: 'bs1' }, ['define', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['a=b', 150, 680], ['c=d', 150, 660], ['where', 72, 640], { at: 'p0.5a' }, ['x', 110, 640], { at: 'p0.5b' }, ['holds', 120, 640], { at: '0e' }, { at: 'be1' }]
    const dests: [string, number, number, number][] = [['0s', 1, 72, 700], ['p0.1a', 1, 102, 700], ['p0.5a', 1, 105, 640], ['p0.5b', 1, 115, 640], ['0e', 1, 145, 640]]
    const doc = streamDocument([{ view: [0, 0, 612, 792], items: [item('define', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
    const of = (name: string) => m.owned.find(e => e[0] === name)
    expect(of('p0.1a')?.slice(0, 3)).toEqual(['p0.1a', OWNED_HOW.indexOf('open, with the displays after it'), 6])
    expect(of('p0.3a')).toEqual(['p0.3a', OWNED_HOW.indexOf('in the display before it')])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf reads the marked compile\'s operator lists: each piece\'s own glyphs and rules by its points, and how', async () => {
    const units = [unit('para', [text('see '), ph('$x^2$'), text(' and '), ph('$\\frac{1}{d}$'), text(' by '), ph('\\bert'), text(' models. '), ph('\\[a=b\\]')]), unit('para', [text('Next words')])]
    const shown: Shown[] = [
      ['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 92, 700], ['2', 97, 703.5, 7], { at: 'p0.1b' }, ['and', 106, 700],
      { at: 'p0.3a' }, ['1', 130, 705], { rule: [130, 702, 135, 702.4] }, ['d', 130, 695], { at: 'p0.3b' }, ['by', 140, 700],
      { at: 'p0.5a' }, ['BERT', 155, 700], ['models.', 178, 700], { at: 'p0.7a' }, ['a=b', 150, 680], { at: '0e' }, { at: '1s' }, ['Next', 72, 660],
    ]
    const dests: [string, number, number, number][] = [['0s', 1, 72, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 100.5, 700], ['p0.3a', 1, 121, 700], ['p0.3b', 1, 135, 700], ['p0.5a', 1, 150, 700], ['p0.7a', 1, 213, 700], ['0e', 1, 213, 700], ['1s', 1, 72, 660]]
    const doc = streamDocument([{ view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
    const of = (name: string) => m.owned.find(e => e[0] === name)
    // each glyph its page, origin, baseline, size and character; each rule its page and box
    expect(m.chars).toEqual(['x', '2', '1', 'd', 'B', 'E', 'R', 'T', 'a', '=', 'b'])
    expect(of('p0.1a')).toEqual(['p0.1a', OWNED_HOW.indexOf('closed'), 2, 1, 92, 700, 10, 0, 1, 97, 703.5, 7, 1])
    expect(of('p0.3a')).toEqual(['p0.3a', OWNED_HOW.indexOf('closed'), 2, 1, 130, 705, 10, 2, 1, 130, 695, 10, 3, 1, 130, 702, 135, 702.4])
    // an opening mark alone: to where the text after it begins, a display to its unit's end mark
    expect(of('p0.5a')).toEqual(['p0.5a', OWNED_HOW.indexOf('open, to the text after it'), 4, 1, 155, 700, 10, 4, 1, 160, 700, 10, 5, 1, 165, 700, 10, 6, 1, 170, 700, 10, 7])
    expect(of('p0.7a')?.slice(0, 3)).toEqual(['p0.7a', OWNED_HOW.indexOf("open, to its unit's next mark"), 3])
    expect(m.owned.map(e => e[0])).toEqual(['p0.1a', 'p0.3a', 'p0.5a', 'p0.7a'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
    // the units' marks file the same but for the new fields: no stream read, nothing owned
    const plain = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect({ ...plain, owned: m.owned, chars: m.chars }).toEqual(m)
  })
  it("layoutMarksOf lets each page's operator list go once its ink is read: one cleanup a page, after its list, the file the same", async () => {
    const units = [unit('para', [text('see '), ph('$x^2$'), text(' and more')])]
    const page = { view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown: [['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 92, 700], ['2', 97, 703.5, 7], { at: 'p0.1b' }, ['and', 106, 700]] as Shown[] }
    const more = { view: [0, 0, 612, 792], items: [item('more', 72, 700)], shown: [['more', 72, 700]] as Shown[] }
    const doc = streamDocument([page, more, more], [['axt-0s', 1, 72, 700], ['axt-p0.1a', 1, 87, 700], ['axt-p0.1b', 1, 100.5, 700]])
    const events: string[] = []
    // PDF.js's page: its list answered, then let go (PDFPageProxy.cleanup)
    const watched = {
      ...doc,
      getPage: async (n: number) => {
        const p = await doc.getPage(n)
        return { ...p, getOperatorList: async () => { const list = await p.getOperatorList(); events.push(`ops ${n}`); return list }, cleanup: () => { events.push(`cleanup ${n}`); return true } }
      },
    }
    const m = await layoutMarksOf(watched, '', { engine: 'pdflatex', units, OPS })
    expect(events).toEqual(['ops 1', 'cleanup 1', 'ops 2', 'cleanup 2', 'ops 3', 'cleanup 3'])
    expect(m.owned).toEqual([['p0.1a', OWNED_HOW.indexOf('closed'), 2, 1, 92, 700, 10, 0, 1, 97, 703.5, 7, 1]])
    // the file of pages that have no cleanup (a fake document's, a PDF.js without it) is the same
    expect(m).toEqual(await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS }))
    // no ink asked: each page let go all the same, its list never asked
    events.length = 0
    await layoutMarksOf(watched, '', { engine: 'pdflatex' })
    expect(events).toEqual(['cleanup 1', 'cleanup 2', 'cleanup 3'])
  })
  it('the marked read is bounded a page: a list that fails is unread, one past GLYPHS_PAGE capped, one however late read; the next page read', async () => {
    const units = [unit('para', [text('see '), ph('$x^2$'), text(' and more')]), unit('para', [text('then '), ph('$y$'), text(' end')])]
    const first = { view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown: [['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 92, 700], ['2', 97, 703.5, 7], { at: 'p0.1b' }, ['and', 106, 700]] as Shown[] }
    const second = { view: [0, 0, 612, 792], items: [item('then', 72, 700)], shown: [['then', 72, 700], { at: '1s' }, { at: 'p1.1a' }, ['y', 100, 700], { at: 'p1.1b' }, ['end', 110, 700]] as Shown[] }
    const dests: [string, number, number, number][] = [['axt-0s', 1, 72, 700], ['axt-p0.1a', 1, 87, 700], ['axt-p0.1b', 1, 100.5, 700], ['axt-1s', 2, 72, 700], ['axt-p1.1a', 2, 95, 700], ['axt-p1.1b', 2, 105, 700]]
    const base = streamDocument([first, second], dests)
    const want = await readMarked(base, '', { engine: 'pdflatex', units, OPS } as never)
    expect(want.marks.owned.map(e => e[0])).toEqual(['p0.1a', 'p1.1a'])
    // page 1's operator list fails: page 1 has no ink, page 2's piece still owned
    const broken = { ...base, getPage: async (n: number) => { const p = await base.getPage(n); return n === 1 ? { ...p, getOperatorList: () => Promise.reject(new Error('broken page')) } : p } }
    const unread = await readMarked(broken, '', { engine: 'pdflatex', units, OPS } as never)
    // and page 1's operator list an hour late: waited for, read as it is (no clock decides what is read)
    vi.useFakeTimers()
    const slow = { ...base, getPage: async (n: number) => { const p = await base.getPage(n); return n === 1 ? { ...p, getOperatorList: () => new Promise(r => setTimeout(() => r(p.getOperatorList()), 3_600_000)) } : p } }
    const late = await settleWithClock(readMarked(slow, '', { engine: 'pdflatex', units, OPS } as never), 3_600_000)
    vi.useRealTimers()
    expect(late.dark).toEqual({ unread: [], capped: [], degraded: [] })
    expect(late.marks.owned.map(e => e[0])).toEqual(['p0.1a', 'p1.1a'])
    // (a memory-class failure of a page's list is no dark page: the read ends on it, C8.4)
    const oom = Object.assign(new Error(ALLOCATION_FAILED), { name: 'UnknownErrorException', details: `RangeError: ${ALLOCATION_FAILED}` })
    const failing = { ...base, getPage: async (n: number) => { const p = await base.getPage(n); return n === 1 ? { ...p, getOperatorList: () => Promise.reject(oom) } : p } }
    await expect(readMarked(failing, '', { engine: 'pdflatex', units, OPS } as never)).rejects.toBe(oom)
    // (a row's character by its index into its marks' `chars`, which the rows before it fill)
    const rowOf = (m: typeof want, name: string) => { const e = m.marks.owned.find(r => r[0] === name); return e && [...e.slice(0, 7), m.marks.chars[e[7] as number], ...e.slice(8)] }
    expect(unread.dark).toEqual({ unread: [1], capped: [], degraded: [] })
    expect(rowOf(unread, 'p1.1a')).toEqual(rowOf(want, 'p1.1a'))
    expect(unread.marks.owned.find(e => e[0] === 'p0.1a')).toBeUndefined()
    // page 1 showing past GLYPHS_PAGE glyphs: capped, its ink none
    const many = { ...first, shown: [...first.shown, { glyphs: Array.from({ length: GLYPHS_PAGE + 1 }, () => 'z'), x: 72, y: 600, step: 1 }] as Shown[] }
    const capped = await readMarked(streamDocument([many, second], dests), '', { engine: 'pdflatex', units, OPS } as never)
    expect(capped.dark).toEqual({ unread: [], capped: [1], degraded: [] })
    expect(capped.marks.owned.find(e => e[0] === 'p0.1a')).toBeUndefined()
    expect(rowOf(capped, 'p1.1a')).toEqual(rowOf(want, 'p1.1a'))
    // and nothing of the kind on the pages as they are
    expect(want.dark).toEqual({ unread: [], capped: [], degraded: [] })
  }, 60_000)

  it('each page of the marked read whose list fails is that page alone: every page asked, each unread, no count of them', async () => {
    const n = 11
    const pg = { view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown: [['see', 72, 700]] as Shown[] }
    const base = streamDocument(Array.from({ length: n }, () => pg), [])
    const asked: number[] = []
    const broken = { ...base, getPage: async (k: number) => { const p = await base.getPage(k); return { ...p, getOperatorList: () => { asked.push(k); return Promise.reject(new Error('broken page')) } } } }
    const got = await readMarked(broken, '', { engine: 'pdflatex', units: [unit('para', [text('see')])], OPS } as never)
    expect(asked).toEqual(Array.from({ length: n }, (_, i) => i + 1))
    expect(got.dark.unread).toEqual(Array.from({ length: n }, (_, i) => i + 1))
  }, 60_000)

  it('layoutMarksOf owns no ink off its page: the piece is written as not owned, and the file parses', async () => {
    const units = [unit('para', [text('see '), ph('$x$'), text(' and '), ph('$y$'), text(' end')])]
    const shown: Shown[] = [['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 5000, 700], { at: 'p0.1b' }, ['and', 106, 700], { at: 'p0.3a' }, ['y', 130, 700, 300], { at: 'p0.3b' }, ['end', 140, 700], { at: '0e' }]
    const dests: [string, number, number, number][] = [['0s', 1, 72, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 100.5, 700], ['p0.3a', 1, 121, 700], ['p0.3b', 1, 135, 700], ['0e', 1, 160, 700]]
    const doc = streamDocument([{ view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
    // a glyph past the page's view, a glyph past the size a glyph may have
    expect(m.owned).toEqual([['p0.1a', OWNED_HOW.indexOf('ink out of bounds')], ['p0.3a', OWNED_HOW.indexOf('ink out of bounds')]])
    expect(OWNED_HOW.indexOf('ink out of bounds')).toBeGreaterThanOrEqual(OWNED)
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf leaves out a mark or a word off its page, and refuses an engine it does not know', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('kept', 72, 700), item('off', 5000, 700), item('x'.repeat(201), 72, 650)] }], [['axt-0s', 1, 72, 700], ['axt-1s', 1, 9000, 700], ['axt-2s', 1, null, null]])
    const m = await layoutMarksOf(doc, '', { engine: 'xelatex' })
    expect(m.marks).toEqual([['0s', 1, 72, 700]])
    expect(m.words).toEqual(['kept'])
    await expect(layoutMarksOf(doc, '', { engine: 'context' })).rejects.toThrow(LayoutRefusal)
  })
  it('reads the duplicate warnings of LuaTeX and dvipdfmx too', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792] }], [['axt-h1s', 1, 72, 700], ['axt-h2s', 1, 72, 650], ['axt-t3s', 1, 72, 600]])
    const log = 'warning  (pdf backend): ignoring duplicate destination with the name \'axt-h1s\'\nxdvipdfmx:warning: Object @axt-t3s already defined.\n'
    const m = await layoutMarksOf(doc, log, { engine: 'lualatex' })
    expect(m.dropped.sort()).toEqual(['h1s', 't3s'])
    expect(m.marks.map(x => x[0])).toEqual(['h2s'])
  })
})

/** a made-up marks file of two pages, every field used */
const valid = (): LayoutMarks => ({
  schema: MARKS_SCHEMA, engine: 'pdflatex', marking: { classes: [...MARK_CLASSES], switches: { '\\cite': '22220000', '\\footnote': '00000012', '\\snr# #$\\geq 50$': '1', '\\pp##\\cite{a}': 'x' }, inkless: ['\\rule{0pt}{2ex}', '\\fontsize{7.6pt}{1em}'], texts: ['\\bert', 'BERT'], names: { abstract: 1, ref: 0 }, lineskip: [1, 0], complete: { bert: 0, kimi: 1 }, apart: ['\\pp'] }, pages: 2,
  views: [0, 0, 612, 792, 0, 0, 612, 792],
  columns: [1, 2],
  marks: [['0s', 1, 72, 700], ['0e', 1, 300.5, 650.25], ['c1-1', 1, 0, 0], ['c2-2', 2, 0, 0], ['p0.3a', 1, 100, 700], ['p0.3b', 1, 120.75, 700], ['h1s', 2, 72, 720], ['t2s', 2, 80, 500], ['n0.5a', 1, 200, 680], ['g1t', 2, 300, 400]],
  dropped: ['h4s'],
  lines: [[0, 3], [2, 1], [7, 12]],
  align: [[0, 'j'], [2, 'c'], [7, 'l']],
  colours: [[0, 3, 0x0000ff], [2, 1, 0xa60000], [2, 4, 0]],
  words: ['the', 'model', 'x'],
  tokens: [1, 72, 700, 15.5, 10, 0, 1, 90, 700, 25, 10, 1, 2, 72, 720, 6, 12, 2],
  chars: ['x', '2', '\u2211', ''],
  // p0.3: x and its raised 2, and a rule; n0.5: one glyph of a blank Unicode; p2.1: out of order
  owned: [['n0.5a', 1, 1, 1, 200, 680, 7, 3], ['p0.3a', 0, 2, 1, 100, 700, 10, 0, 1, 105, 703.5, 7, 1, 1, 100, 702, 110, 702.4], ['p2.1a', OWNED_HOW.indexOf('marks out of order')]],
  // a link over one glyph; one over none (counted for the order alone)
  links: [['appendix.C', 1, 196, 697, 203, 709, 197, 197, 1, 'C'], ['cite.k', 2, 100, 690, 120.5, 702, 0, 0, 0, '']],
})
const bytes = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v))
const refusal = (b: Uint8Array) => { try { parseLayoutMarks(b); return null } catch (e) { if (!(e instanceof LayoutRefusal)) throw e; return e.path } }

describe('the marks file', () => {
  it('parseLayoutMarks refuses a file nested deeper than its 3 levels before JSON.parse, and quickly', () => {
    // 999,000 arrays inside each other: 1.91 MiB of 999,000 values, inside both caps, which JSON.parse built in 70 ms
    const deep = bytes(`${'['.repeat(999_000)}${']'.repeat(999_000)}`)
    expect(deep.length).toBeLessThan(MARKS_CAP)
    const parse = vi.spyOn(JSON, 'parse')
    const t = performance.now()
    let why = ''
    try { parseLayoutMarks(deep) } catch (e) { if (!(e instanceof LayoutRefusal)) throw e; why = e.message }
    const ms = performance.now() - t
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
    expect(why).toBe('nested more than 3 deep')
    expect(ms).toBeLessThan(50)
  })
  it('encodeLayoutMarks and parseLayoutMarks round-trip', () => {
    const m = valid()
    expect(parseLayoutMarks(bytes(encodeLayoutMarks(m)))).toEqual(m)
    expect(Object.keys(JSON.parse(encodeLayoutMarks(m)))).toEqual(['schema', 'engine', 'marking', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'align', 'colours', 'words', 'tokens', 'chars', 'owned', 'links'])
  })
  it('parseLayoutMarks takes every call the ink section asked: more than 128 answers, a source past 200 code units (MARKS_SCHEMA 15)', () => {
    const m = valid()
    m.marking.inkless = [...Array.from({ length: 300 }, (_, i) => `\\m${i}`), `\\delete{${'x'.repeat(633)}}`]
    m.marking.apart = Array.from({ length: 300 }, (_, i) => `\\m${i}`)
    m.marking.texts = Array.from({ length: 300 }, (_, i) => [`\\m${i}`, 'A']).flat()
    expect(refusal(bytes(m))).toBe(null)
  })
  it('parseLayoutMarks refuses past its bounds', () => {
    const big = new Uint8Array(MARKS_CAP + 1).fill(0x20)
    expect(refusal(big)).toBe('')
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusal(bytes(`[${'0,'.repeat(MARKS_VALUES - 1)}0]`))).toBe('')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
    expect(refusal(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]))).toBe('')
    const rows: [string, (m: LayoutMarks & Record<string, unknown>) => void, string][] = [
      ['schema 1, a file before the stream', m => { m.schema = 1 as 15 }, 'schema'],
      ['schema 2, a file before the inkless macros', m => { m.schema = 2 as 15 }, 'schema'],
      ['schema 3, a file before the babel names', m => { m.schema = 3 as 15 }, 'schema'],
      ['schema 4, a file before the interline glue', m => { m.schema = 4 as 15 }, 'schema'],
      ['schema 5, a file before the empty-list marks, the column ends and the display groups', m => { m.schema = 5 as 15 }, 'schema'],
      ['schema 6, a file before the link annotations', m => { m.schema = 6 as 15 }, 'schema'],
      ['schema 7, a file before the alignment', m => { m.schema = 7 as 15 }, 'schema'],
      ['schema 8, a file before the complete macros and the boxes apart (its maker would replay a marking it was not made with)', m => { m.schema = 8 as 15 }, 'schema'],
      ['schema 9, a file before the texts as TeX sets them (its maker would find no lead of punctuation, code or a formula)', m => { m.schema = 9 as 15 }, 'schema'],
      ['schema 10, a file before the numbers a bibliography entry keeps (its maker would read no class `number`)', m => { m.schema = 10 as 15 }, 'schema'],
      ['schema 11, a file before the look-ahead pairs (its maker would replay a marking with no mark after a paper\'s macro)', m => { m.schema = 11 as 15 }, 'schema'],
      ['schema 12, a file before the entries\' own share (its reader refuses more than INK_MAX answers)', m => { m.schema = 12 as 15 }, 'schema'],
      ['schema 13, a file before a switch\'s 3 (its maker would replay no closing mark after a punctuation mark a command moves)', m => { m.schema = 13 as 15 }, 'schema'],
      ['schema 14, a file before every call asked (its reader refuses more than 128 answers or a source past 200 code units)', m => { m.schema = 14 as 15 }, 'schema'],
      ['complete macros of no object', m => { (m.marking as Record<string, unknown>).complete = ['bert', 0] }, 'marking.complete'],
      ['a complete macro\'s name with its backslash', m => { (m.marking as Record<string, unknown>).complete = { '\\bert': 0 } }, 'marking.complete.\\\\bert'],
      ['a complete macro of arity 10', m => { (m.marking as Record<string, unknown>).complete = { bert: 10 } }, 'marking.complete.bert'],
      ['a source apart twice', m => { (m.marking as Record<string, unknown>).apart = ['\\pp', '\\pp'] }, 'marking.apart[1]'],
      ['a marking without its apart', m => { delete (m.marking as Record<string, unknown>).apart }, 'marking.apart'],
      ['a lineskip of one number', m => { (m.marking as Record<string, unknown>).lineskip = [1] }, 'marking.lineskip'],
      ['a lineskip past \\maxdimen', m => { (m.marking as Record<string, unknown>).lineskip = [1, 1e6] }, 'marking.lineskip[1]'],
      ['a lineskip a hundredth past \\maxdimen as written', m => { (m.marking as Record<string, unknown>).lineskip = [1, 16322.8] }, 'marking.lineskip[1]'],
      ['engine context', m => { m.engine = 'context' }, 'engine'],
      ['marking not an object', m => { (m as Record<string, unknown>).marking = ['math'] }, 'marking'],
      ['marking with a key of no schema', m => { (m.marking as Record<string, unknown>).extra = [] }, 'marking.extra'],
      ['a class of no MARK_CLASSES', m => { (m.marking.classes as string[])[0] = 'tikz' }, 'marking.classes[0]'],
      ['a class twice', m => { (m.marking.classes as string[])[1] = 'math' }, 'marking.classes[1]'],
      ['the switch an array', m => { (m.marking as Record<string, unknown>).switches = ['\\cite'] }, 'marking.switches'],
      ['a switch of no command', m => { (m.marking.switches as Record<string, string>).cite = '00000000' }, 'marking.switches.cite'],
      ['a switch of 7 codes', m => { (m.marking.switches as Record<string, string>)['\\cite'] = '2222000' }, 'marking.switches.\\\\cite'],
      ['a switch of a code 3 past the punctuation marks', m => { (m.marking.switches as Record<string, string>)['\\cite'] = '22222230' }, 'marking.switches.\\\\cite'],
      // (the asked classes' commands and the paper's own complete macros, PROBE_MAX + COMPLETE_PROBE_MAX: one past them)
      ['a switch of 529 commands', m => { m.marking.switches = switchOf(529) }, 'marking.switches'],
      // (the look-ahead pairs, keyed by aheadKey: a macro's source, the white space after it, the placeholder's, joined by #)
      ['a look-ahead pair of two codes', m => { (m.marking.switches as Record<string, string>)['\\snr# #$\\geq 50$'] = '11' }, 'marking.switches.\\\\snr# #$\\\\geq 50$'],
      ['a look-ahead pair of a code 3', m => { (m.marking.switches as Record<string, string>)['\\snr# #$\\geq 50$'] = '3' }, 'marking.switches.\\\\snr# #$\\\\geq 50$'],
      ['a look-ahead pair whose macro is no control sequence', m => { (m.marking.switches as Record<string, string>)['snr# #$x$'] = '1' }, 'marking.switches.snr# #$x$'],
      ['a look-ahead pair with a tab between', m => { (m.marking.switches as Record<string, string>)['\\snr#\t#$x$'] = '1' }, 'marking.switches.\\\\snr#\\t#$x$'],
      ['a look-ahead pair of no placeholder', m => { (m.marking.switches as Record<string, string>)['\\snr# #'] = '1' }, 'marking.switches.\\\\snr# #'],
      ['a look-ahead pair whose placeholder holds #', m => { (m.marking.switches as Record<string, string>)['\\snr# #$#1$'] = '1' }, 'marking.switches.\\\\snr# #$#1$'],
      ['a look-ahead pair whose placeholder is 201 code units', m => { (m.marking.switches as Record<string, string>)[`\\snr# #$${'x'.repeat(199)}$`] = '1' }, `marking.switches.\\\\snr# #$${'x'.repeat(12)}`],
      ['129 look-ahead pairs', m => { m.marking.switches = Object.fromEntries(Array.from({ length: AHEAD_PROBE_MAX + 1 }, (_, i) => [`\\snr# #$${i}$`, '1'])) }, 'marking.switches'],
      ['no inkless key', m => { delete (m.marking as Partial<LayoutMarks['marking']>).inkless }, 'marking.inkless'],
      ['the inkless an object', m => { (m.marking as Record<string, unknown>).inkless = {} }, 'marking.inkless'],
      ['an inkless source twice', m => { (m.marking.inkless as string[])[1] = '\\rule{0pt}{2ex}' }, 'marking.inkless[1]'],
      ['an inkless source empty', m => { (m.marking.inkless as string[])[0] = '' }, 'marking.inkless[0]'],
      // (the ink section's samples fit INK_BUDGET's code units in all; MARKS_SCHEMA 15)
      ['inkless sources past INK_BUDGET code units in all', m => { m.marking.inkless = [`\\a{${'y'.repeat(INK_BUDGET / 2)}}`, `\\b{${'y'.repeat(INK_BUDGET / 2)}}`] }, 'marking.inkless[1]'],
      ['no texts key', m => { delete (m.marking as Partial<LayoutMarks['marking']>).texts }, 'marking.texts'],
      ['texts of an odd length', m => { (m.marking.texts as string[]).push('\\x') }, 'marking.texts'],
      ['texts in pairs, a level deeper than the file has', m => { (m.marking as Record<string, unknown>).texts = [['\\bert', 'BERT']] }, ''],
      ['a text source twice', m => { m.marking.texts = ['\\bert', 'BERT', '\\bert', 'B'] }, 'marking.texts[2]'],
      ['a text of a space', m => { m.marking.texts = ['\\bert', 'BE RT'] }, 'marking.texts[1]'],
      ['a text of 65 letters', m => { m.marking.texts = ['\\bert', 'B'.repeat(65)] }, 'marking.texts[1]'],
      ['a text of a formula\'s glyphs alone', m => { m.marking.texts = ['\\checkmark', `${INK_ANY}${INK_ANY}`] }, 'marking.texts[1]'],
      ['a text of OT1\'s quote', m => { m.marking.texts = ['\\q', '\'A\''] }, 'marking.texts[1]'],
      // (the samples' and the leads': INK_BUDGET's code units in all)
      ['text sources past INK_BUDGET code units in all', m => { m.marking.texts = [`\\a{${'y'.repeat(INK_BUDGET / 2)}}`, 'A', `\\b{${'y'.repeat(INK_BUDGET / 2)}}`, 'B'] }, 'marking.texts[2]'],
      ['chars not an array', m => { (m as Record<string, unknown>).chars = 'x2' }, 'chars'],
      ['a char of 33 code units', m => { m.chars[0] = 'x'.repeat(33) }, 'chars[0]'],
      ['a char that is a number', m => { (m.chars as unknown[])[1] = 2 }, 'chars[1]'],
      ['65,537 chars', m => { m.chars = Array.from({ length: 65_537 }, (_, i) => String(i)) }, 'chars'],
      ['a piece of 2,001 rules', m => { const e = nth(m.owned, 1); e.length = 3 + 5 * (e[2] as number); for (let r = 0; r < 2001; r++) e.push(1, 100, 702, 110, 702.4) }, 'owned[1]'],
      ['owned not an array', m => { (m as Record<string, unknown>).owned = {} }, 'owned'],
      ['an owned entry of one field', m => { (m.owned[2] as unknown[]).pop() }, 'owned[2]'],
      ['an owned name of no opening mark', m => { nth(m.owned, 1)[0] = 'p0.3b' }, 'owned[1][0]'],
      ['owned names not rising', m => { nth(m.owned, 2)[0] = 'n0.5a' }, 'owned[2][0]'],
      ['a how of no OWNED_HOW', m => { nth(m.owned, 2)[1] = OWNED_HOW.length }, 'owned[2][1]'],
      ['a piece not owned with glyphs', m => { (m.owned[2] as unknown[]).push(0) }, 'owned[2]'],
      ['an owned piece of no glyph count', m => { (m.owned[1] as unknown[]).length = 2 }, 'owned[1]'],
      ['a glyph count past its rows', m => { nth(m.owned, 1)[2] = 4 }, 'owned[1]'],
      ['a rule of four numbers', m => { (m.owned[1] as unknown[]).pop() }, 'owned[1]'],
      ['a glyph on page 3', m => { nth(m.owned, 1)[3] = 3 }, 'owned[1][3]'],
      ['a glyph 2 pt left of its view', m => { nth(m.owned, 1)[4] = -2 }, 'owned[1][4]'],
      ['a glyph of size 0', m => { nth(m.owned, 1)[6] = 0 }, 'owned[1][6]'],
      ['a glyph of size 201', m => { nth(m.owned, 1)[6] = 201 }, 'owned[1][6]'],
      ['a glyph of a char past chars', m => { nth(m.owned, 1)[7] = 4 }, 'owned[1][7]'],
      ['a rule right of its right edge', m => { nth(m.owned, 1)[14] = 111 }, 'owned[1][16]'],
      ['a rule off its page', m => { nth(m.owned, 1)[17] = 800 }, 'owned[1][17]'],
      ['pages 0', m => { m.pages = 0 }, 'pages'],
      ['pages 10,001', m => { m.pages = 10001 }, 'pages'],
      ['a missing key', m => { delete (m as Partial<LayoutMarks>).dropped }, 'dropped'],
      ['a key of no schema', m => { m.extra = 1 }, 'extra'],
      ['views of 4 × pages − 1 numbers', m => { m.views.pop() }, 'views'],
      ['a view with x0 = x1', m => { m.views[2] = 0 }, 'views[2]'],
      ['a coordinate 14,401', m => { m.views[2] = 14401 }, 'views[2]'],
      ['columns one short', m => { m.columns.pop() }, 'columns'],
      ['a column of 3', m => { m.columns[1] = 3 }, 'columns[1]'],
      ['a mark name p3a', m => { nth(m.marks, 4)[0] = 'p3a' }, 'marks[4][0]'],
      ['a mark of three fields', m => { (m.marks[1] as unknown[]).pop() }, 'marks[1]'],
      ['a mark on page pages + 1', m => { nth(m.marks, 6)[1] = 3 }, 'marks[6][1]'],
      ['a mark 2 pt outside its view', m => { nth(m.marks, 1)[2] = 614 }, 'marks[1][2]'],
      ['a mark 2 pt below its view', m => { nth(m.marks, 1)[3] = -2 }, 'marks[1][3]'],
      ['a name twice', m => { nth(m.marks, 5)[0] = '0e' }, 'marks[5][0]'],
      ['a dropped name no mark takes', m => { m.dropped[0] = 'axt-h4s' }, 'dropped[0]'],
      ['lines not rising', m => { nth(m.lines, 2)[0] = 2 }, 'lines[2][0]'],
      ['a line count of 2,001', m => { nth(m.lines, 0)[1] = 2001 }, 'lines[0][1]'],
      ['an empty word', m => { m.words[1] = '' }, 'words[1]'],
      ['a word of 201 code units', m => { m.words[1] = 'x'.repeat(201) }, 'words[1]'],
      ['tokens of stride 5', m => { m.tokens.pop() }, 'tokens'],
      ['a token on page 3', m => { m.tokens[6] = 3 }, 'tokens[6]'],
      ['a token 2 pt left of its view', m => { m.tokens[1] = -2 }, 'tokens[1]'],
      ['a token 2,001 high', m => { m.tokens[4] = 2001 }, 'tokens[4]'],
      ['a negative width', m => { m.tokens[3] = -1 }, 'tokens[3]'],
      ['a word index past words', m => { m.tokens[5] = 3 }, 'tokens[5]'],
      // -1: the rest of the word before, given in parts; never the first token's, nor another negative
      ['the first token a rest', m => { m.tokens[5] = -1 }, 'tokens[5]'],
      ['a word index of -2', m => { m.tokens[11] = -2 }, 'tokens[11]'],
      ['a string where a number goes', m => { (m.marks[0] as unknown[])[2] = '72' }, 'marks[0][2]'],
      ['an array where a number goes, a level deeper than the file has', m => { (m.marks[0] as unknown[])[2] = [72] }, ''],
      // the links (the link-anchor locator's)
      ['no links key, a file before them', m => { delete (m as Partial<LayoutMarks>).links }, 'links'],
      ['links not an array', m => { (m as Record<string, unknown>).links = {} }, 'links'],
      ['a link of nine fields', m => { (m.links[0] as unknown[]).pop() }, 'links[0]'],
      ['a link of no name', m => { nth(m.links, 0)[0] = '' }, 'links[0][0]'],
      ['a link named with a line break', m => { nth(m.links, 0)[0] = 'appendix.\nC' }, 'links[0][0]'],
      ['a link name of 129 code units', m => { nth(m.links, 0)[0] = 'x'.repeat(129) }, 'links[0][0]'],
      ['a link on page 3', m => { nth(m.links, 1)[1] = 3 }, 'links[1][1]'],
      ['links not in page order', m => { nth(m.links, 0)[1] = 2; nth(m.links, 1)[1] = 1 }, 'links[1][1]'],
      ['a link of no width', m => { nth(m.links, 0)[4] = 196 }, 'links[0][4]'],
      ['a link of no height', m => { nth(m.links, 0)[5] = 697 }, 'links[0][5]'],
      ['a link a coordinate 14,401', m => { nth(m.links, 0)[2] = -14401 }, 'links[0][2]'],
      ['a link whose last glyph is left of its first', m => { nth(m.links, 0)[7] = 196 }, 'links[0][7]'],
      ['a link of 201 glyphs', m => { nth(m.links, 0)[8] = 201 }, 'links[0][8]'],
      ['a link of a fractional count', m => { nth(m.links, 0)[8] = 1.5 }, 'links[0][8]'],
      ['a text with no glyph', m => { nth(m.links, 1)[9] = 'k' }, 'links[1][9]'],
      ['no text with a glyph', m => { nth(m.links, 0)[9] = '' }, 'links[0][9]'],
      ['a text of 65 code units', m => { nth(m.links, 0)[9] = 'C'.repeat(65) }, 'links[0][9]'],
      ['20,001 links', m => { m.links = Array.from({ length: 20_001 }, (): LayoutMarks['links'][number] => ['cite.k', 1, 100, 690, 120, 702, 0, 0, 0, '']) }, 'links'],
    ]
    for (const [name, change, path] of rows) {
      const m = valid() as LayoutMarks & Record<string, unknown>
      change(m)
      expect(refusal(bytes(m)), name).toBe(path)
    }
    // a switch of every command the probe asks about at most stands
    const most = valid()
    most.marking.switches = switchOf(528)
    expect(refusal(bytes(most))).toBeNull()
    // and with them every look-ahead pair it asks about at most, each source at its longest
    most.marking.switches = { ...switchOf(528), ...Object.fromEntries(Array.from({ length: AHEAD_PROBE_MAX }, (_, i) => [`\\${'s'.repeat(199)}# #${`$${i}$`.padEnd(200, 'x')}`, '1'])) }
    expect(refusal(bytes(most))).toBeNull()
    // a later token the rest of the word before
    const rest = valid()
    rest.tokens[11] = -1
    expect(refusal(bytes(rest))).toBeNull()
    // a number written 1e400 is Infinity once parsed
    expect(refusal(bytes(JSON.stringify(valid()).replace('"0s",1,72,700', '"0s",1,1e400,700')))).toBe('marks[0][2]')
    expect(refusal(bytes(JSON.stringify(valid()).replace('[0,0,612,792,0,0,612,792]', '[0,0,612,1e400,0,0,612,792]')))).toBe('views[3]')
    // not an object at all
    expect(refusal(bytes('[]'))).toBe('')
    // a key of no schema, 100,000 code units long, is told by its first 20
    const long = { ...valid(), [`k${'y'.repeat(100_000)}`]: 1 }
    expect(refusal(bytes(long))).toBe(`k${'y'.repeat(19)}`)
    // a piece of 20,001 glyphs, and a paper of more than OWNED_ALL owned glyphs and rules
    const piece = valid()
    piece.owned[1] = ['p0.3a', 0, 20_001, ...Array.from({ length: 20_001 }, () => [1, 100, 700, 10, 0]).flat()]
    expect(refusal(bytes(piece))).toBe('owned[1][2]')
    const paper = valid()
    paper.owned = Array.from({ length: Math.ceil(OWNED_ALL / 10_000) + 1 }, (_, i) => [`p${String(i).padStart(3, '0')}.1a`, 0, 10_000, ...Array.from({ length: 10_000 }, () => [1, 100, 700, 10, 0]).flat()])
    expect(refusal(bytes(paper))).toBe('owned')
    // within every bound: 300,000 words
    const many = valid()
    many.words = Array.from({ length: 300_000 }, (_, i) => `w${i}`)
    expect(refusal(bytes(many))).toBeNull()
    many.words.push('one more')
    expect(refusal(bytes(many))).toBe('words')
  })
})

describe('readMarked: the marked original read once, a page at a time (the page stream, E2a)', () => {
  // two pages: a paragraph across them, a placeholder on each (one closed on its page, one closed on the next page across
  // the bodies), a heading and a cell's marks, the unit marks the left is anchored by
  const units = [unit('para', [text('the model '), ph('$x$'), text(' and more words '), ph('$y$'), text(' here')]), unit('heading', [text('Results')])]
  const pages = [
    { view: [0, 0, 612, 792], items: [item('the model', 72, 700), item('and more words', 120, 700)], shown: [{ at: 'bs1' }, { at: '0s' }, ['the model ', 72, 700], { at: 'p0.1a' }, ['x', 122, 700], { at: 'p0.1b' }, [' and more words ', 130, 700], { at: 'p0.3a' }, ['y1', 200, 700], { at: 'be1' }] as Shown[] },
    { view: [0, 0, 612, 792], items: [item('here', 72, 700), item('Results', 72, 650)], shown: [{ at: 'bs2' }, ['y2', 72, 712], { at: 'p0.3b' }, [' here', 80, 700], { at: '0e' }, { at: 'h1s' }, ['Results', 72, 650], { at: 'h1e' }, { at: 'be2' }] as Shown[] },
  ]
  const dests: [string, number, number, number][] = [['axt-0s', 1, 72, 700], ['axt-p0.1a', 1, 122, 700], ['axt-p0.1b', 1, 127, 700], ['axt-p0.3a', 1, 200, 700], ['axt-p0.3b', 2, 82, 712], ['axt-0e', 2, 100, 700], ['axt-h1s', 2, 72, 650], ['axt-h1e', 2, 107, 650]]
  /** the document, with each page's reads counted */
  const counted = () => {
    const reads = { text: [] as number[], ops: [] as number[], cleanup: [] as number[], index: 0 }
    const doc = streamDocument(pages, dests)
    return {
      reads,
      doc: {
        ...doc,
        getPageIndex: async (ref: { num: number }) => { reads.index++; return doc.getPageIndex(ref) },
        getPage: async (n: number) => {
          const p = await doc.getPage(n)
          return { ...p, getTextContent: async () => { reads.text.push(n); return p.getTextContent() }, getOperatorList: async () => { reads.ops.push(n); return p.getOperatorList() }, cleanup: () => { reads.cleanup.push(n) } }
        },
      },
    }
  }

  it('each page\'s text and operator list read once, each page looked up once; the marks in memory are their file\'s, layoutMarksOf\'s', async () => {
    const one = counted()
    const { marks, unitMarks } = await readMarked(one.doc, '', { engine: 'pdflatex', units, OPS })
    expect(one.reads).toEqual({ text: [1, 2], ops: [1, 2], cleanup: [1, 2], index: 2 })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(marks)))).toEqual(marks)
    expect(encodeLayoutMarks(marks)).toBe(encodeLayoutMarks(await layoutMarksOf(counted().doc, '', { engine: 'pdflatex', units, OPS })))
    // the piece closed on the next page owns its ink on both, the one closed on its own page its own
    const own = new Map(marks.owned.map(e => [e[0], e]))
    expect(own.get('p0.1a')?.slice(0, 3)).toEqual(['p0.1a', OWNED_HOW.indexOf('closed'), 1])
    expect(own.get('p0.3a')?.slice(0, 3)).toEqual(['p0.3a', OWNED_HOW.indexOf('closed'), 4])
    expect(marks.chars).toEqual(['x', 'y', '1', '2'])
    expect(unitMarks).not.toBeNull()
  })

  it('the unit marks are what the web read of the same document: its marks with their words (marksOfDoc), in the names\' order', async () => {
    const { doc } = counted()
    const { unitMarks } = await readMarked(doc, '', { engine: 'pdflatex', units, OPS })
    // the web's reading (container/src/run/geometry.ts marksOfDoc): every page's text, then each unit mark's page looked up
    const text = []
    for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); text.push({ page: p, items: tc.items, styles: tc.styles }) }
    const pdfMarks = new Map()
    for (const [name, d] of await doc.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) pdfMarks.set(name.slice(4), { page: (await doc.getPageIndex(d[0] as { num: number })) + 1, x: d[2], y: d[3] })
    const web = markWords(tokenizeDocument(text), pdfMarks)
    expect([...(unitMarks ?? [])]).toEqual([...web])
    expect(unitMarks?.get('0s')?.t).toBe('the')
    expect(unitMarks?.get('0e')?.t).toBe('here')
  })

  it('no unit marks where a unit mark\'s page cannot be looked up, as the web\'s reading threw; the marks all the same', async () => {
    const { doc } = counted()
    const broken = { ...doc, getPageIndex: async (ref: { num: number }) => { if (ref.num === 102) throw new Error('no such page'); return doc.getPageIndex(ref) } }
    const { marks, unitMarks } = await readMarked(broken, '', { engine: 'pdflatex', units, OPS })
    expect(unitMarks).toBeNull()
    expect(marks.marks.map(m => m[0])).toEqual(['0s', 'p0.1a', 'p0.1b', 'p0.3a'])
  })
})

describe('markedPages: the marked original a page at a time (the page stream, E2b)', () => {
  const units = [unit('para', [text('the model '), ph('$x$'), text(' and more words '), ph('$y$'), text(' here')]), unit('heading', [text('Results')])]
  const pages = [
    { view: [0, 0, 612, 792], items: [item('the model', 72, 700), item('and more words', 120, 700)], shown: [{ at: 'bs1' }, { at: '0s' }, ['the model ', 72, 700], { at: 'p0.1a' }, ['x', 122, 700], { at: 'p0.1b' }, [' and more words ', 130, 700], { at: 'p0.3a' }, ['y1', 200, 700], { at: 'be1' }] as Shown[] },
    { view: [0, 0, 612, 792], items: [item('here', 72, 700), item('Results', 72, 650)], shown: [{ at: 'bs2' }, ['y2', 72, 712], { at: 'p0.3b' }, [' here', 80, 700], { at: '0e' }, { at: 'h1s' }, ['Results', 72, 650], { at: 'h1e' }, { at: 'be2' }] as Shown[] },
  ]
  const dests: [string, number, number, number][] = [['axt-0s', 1, 72, 700], ['axt-p0.1a', 1, 122, 700], ['axt-p0.1b', 1, 127, 700], ['axt-p0.3a', 1, 200, 700], ['axt-p0.3b', 2, 82, 712], ['axt-0e', 2, 100, 700], ['axt-h1s', 2, 72, 650], ['axt-h1e', 2, 107, 650]]

  it('the head first, each page in order with what it found, the end; drained it is readMarked', async () => {
    const events: unknown[] = []
    for await (const x of markedPages(streamDocument(pages, dests), '', { engine: 'pdflatex', units, OPS })) events.push(x)
    const [head, p1, p2, end] = events as [{ head: { pages: number; unitMarks: Map<string, unknown> } }, { page: { p: number; owned: [string, unknown[]][]; words: string[]; tokens: number[] } }, { page: { p: number; owned: [string, unknown[]][]; words: string[] } }, { end: { owned: unknown[]; twice: Set<string> } }]
    expect(events).toHaveLength(4)
    expect(head.head.pages).toBe(2)
    expect([...head.head.unitMarks.keys()]).toEqual(['0s', '0e'])
    // page 1 finds nothing: its pieces wait for the one closed on page 2; page 2 finds both, each glyph's character itself
    expect(p1.page.p).toBe(1)
    expect(p1.page.owned).toEqual([])
    expect(p1.page.words).toEqual(['the', 'model', 'and', 'more', 'words'])
    expect(p2.page.owned.map(([name]) => name)).toEqual(['p0.1a', 'p0.3a'])
    expect(p2.page.owned[1]?.[1].filter(v => typeof v === 'string').slice(1)).toEqual(['y', '1', 'y', '2'])
    expect(p2.page.words).toEqual(['here', 'results'])
    expect(end.end.owned).toEqual([])
    expect(end.end.twice.size).toBe(0)
    // the pieces whose opening points stand before `found` are given: page 1's wait for page 2, then all are
    expect([(p1.page as unknown as { found: number }).found, (p2.page as unknown as { found: number }).found]).toEqual([1, 3])
  })

  it('a point read again on a later page is told on that page (`repeats`), as the end\'s `twice`; the head holds the log\'s lines and every page looked up', async () => {
    const again = [pages[0] as typeof pages[number], { ...(pages[1] as typeof pages[number]), shown: [{ at: 'p0.1a' }, ...(pages[1] as typeof pages[number]).shown] }]
    const events: { head?: { lines: unknown; pageOf: Map<string, number> }; page?: { repeats: string[] }; end?: { twice: Set<string> } }[] = []
    const log = 'AXT-LINES 0 3\n'
    for await (const x of markedPages(streamDocument(again, dests), log, { engine: 'pdflatex', units, OPS })) events.push(x as never)
    expect(events.filter(x => x.page).map(x => x.page?.repeats)).toEqual([[], ['p0.1a']])
    expect([...(events.at(-1)?.end?.twice ?? [])]).toEqual(['p0.1a'])
    const head = events[0]?.head
    expect(head?.lines).toEqual((events.at(-1) as unknown as { end: { lines: unknown } }).end.lines)
    expect(head?.pageOf.get('p0.3b')).toBe(2)
  })

  it('a page whose view is no view is refused there, with the place the marks\' view check names', async () => {
    const bad = [pages[0] as typeof pages[number], { ...(pages[1] as typeof pages[number]), view: [0, 0, 0, 792] }]
    const seen: number[] = []
    await expect((async () => { for await (const x of markedPages(streamDocument(bad, dests), '', { engine: 'pdflatex', units, OPS })) if ('page' in x) seen.push((x as { page: { p: number } }).page.p) })()).rejects.toThrow(/views\[6\]/)
    expect(seen).toEqual([1])
  })

  it('the paper-wide bounds (OWNED_ALL, WORDS_MAX) are the lab file\'s alone: the server\'s marks are bounded per piece', async () => {
    // 14 pieces of 20,000 glyphs but one: past OWNED_ALL in all, each within GLYPHS_PIECE; four a page, within GLYPHS_PAGE
    const n = 14, per = 20_000, on = (q: number) => 1 + Math.floor(q / 4)
    const many = [unit('para', Array.from({ length: n }, (_, k) => [text(k ? ' and ' : 'see '), ph('$x$')]).flat())]
    const shown: Shown[][] = Array.from({ length: on(n - 1) }, () => []), ds: [string, number, number, number][] = [['0s', 1, 72, 700]]
    shown[0]!.push({ at: '0s' })
    for (let q = 0; q < n; q++) {
      const k = 2 * q + 1, y = 700 - 12 * q
      shown[on(q) - 1]!.push({ at: `p0.${k}a` }, { glyphs: Array.from({ length: q === n - 2 ? 9_999 : per }, () => 'x'), x: 72, y, size: 10, step: 0.01 }, { at: `p0.${k}b` })
      ds.push([`p0.${k}a`, on(q), 72, y], [`p0.${k}b`, on(q), 80, y])
    }
    shown[on(n - 1) - 1]!.push({ at: '0e' }); ds.push(['0e', on(n - 1), 80, 500])
    const doc = () => streamDocument(shown.map((sh, i) => ({ view: [0, 0, 612, 792], items: i ? [] : [item('see', 72, 700)], shown: sh })), ds.map(([nm, ...r]) => [`axt-${nm}`, ...r]))
    const server = await readMarked(doc(), '', { engine: 'pdflatex', units: many, OPS })
    expect(server.marks.owned.every(e => e.length > 2)).toBe(true)
    const file = parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(doc(), '', { engine: 'pdflatex', units: many, OPS }))))
    expect(file.owned.filter(e => e.length === 2).map(e => e[0])).toEqual(['p0.27a'])
  }, 120_000)
})

describe("the marked compile's links (the link-anchor locator's)", () => {
  /** streamDocument's, each page with its Link annotations (getAnnotations: a list, a failure, or none at all) */
  /** each page's getAnnotations asked, by page */
  const asked: number[] = []
  const linked = (pages: { view: number[]; shown: Shown[]; annots?: unknown[] | 'fails' }[], dests: [string, number, number | null, number | null][]) => {
    const doc = streamDocument(pages, [['axt-0s', 1, 72, 700], ...dests])
    return {
      ...doc,
      getPage: async (n: number) => {
        const p = nth(pages, n - 1), page = await doc.getPage(n)
        return p.annots === undefined ? page : { ...page, getAnnotations: async () => { asked.push(n); if (p.annots === 'fails') throw new Error('no annotations'); return p.annots } }
      },
    }
  }
  const view = [0, 0, 612, 792]
  // "see Appendix C for" at 72: each character 5 pt, the C at 137
  const line: Shown = ['see Appendix C for', 72, 700]
  // (a reference's placeholder, whose two points stand on page 1, or from page 1 to page `to`: the pages whose links are read)
  const refUnits = [unit('para', [text('see '), ph('\\cref{app:c}'), text(' for')])]
  const pointsOn = (to = 1): [string, number, number, number][] => [['axt-p0.1a', 1, 92, 700], ['axt-p0.1b', to, 142, 700]]
  const read = (pages: Parameters<typeof linked>[0], withOps = true, to = 1) => layoutMarksOf(linked(pages, pointsOn(to)), '', { engine: 'pdflatex', ...(withOps ? { units: refUnits, OPS } : {}) })

  it('each Link annotation that names a destination, its glyphs by PDF.js\'s rule: their origins, count and text; none under it, n 0', async () => {
    const annots = [
      { subtype: 'Link', rect: [136, 697, 143, 709], dest: 'appendix.C' },
      { subtype: 'Link', rect: [72, 697, 90, 709], url: 'https://arxiv.org' },
      { subtype: 'Link', rect: [72, 697, 90, 709], dest: [{ num: 1, gen: 0 }, { name: 'XYZ' }] },
      { subtype: 'Text', rect: [72, 697, 90, 709] },
      { subtype: 'Link', rect: [300, 697, 310, 709], dest: 'figure.1' },
      // its rectangle given the other way about, over "see"
      { subtype: 'Link', rect: [88, 709, 71, 697], dest: 'cite.k' },
    ]
    const m = await read([{ view, shown: [line], annots }])
    expect(m.links).toEqual([['appendix.C', 1, 136, 697, 143, 709, 137, 137, 1, 'C'], ['figure.1', 1, 300, 697, 310, 709, 0, 0, 0, ''], ['cite.k', 1, 71, 697, 88, 709, 72, 82, 3, 'see']])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })

  it('a link of a text past its bound is kept with no glyph; a paper with a page whose annotations fail, or read without its operator lists, has none', async () => {
    const long: Shown = { glyphs: Array.from({ length: 70 }, () => 'x'), x: 72, y: 650 }
    const m = await read([{ view, shown: [line, long], annots: [{ subtype: 'Link', rect: [70, 647, 430, 660], dest: 'cite.long' }] }])
    expect(m.links).toEqual([['cite.long', 1, 70, 647, 430, 660, 0, 0, 0, '']])
    const fails = await read([{ view, shown: [line], annots: [{ subtype: 'Link', rect: [136, 697, 143, 709], dest: 'appendix.C' }] }, { view, shown: [line], annots: 'fails' }], true, 2)
    expect(fails.links).toEqual([])
    const noOps = await read([{ view, shown: [line], annots: [{ subtype: 'Link', rect: [136, 697, 143, 709], dest: 'appendix.C' }] }], false)
    expect(noOps.links).toEqual([])
    // and a page of no getAnnotations at all (a PDF.js of none: the tests' fakes) is one whose annotations are not known
    expect((await read([{ view, shown: [line] }])).links).toEqual([])
  })

  it('reads the links of the pages a placeholder that names a link has a point on, and no other page\'s', async () => {
    const annots = [{ subtype: 'Link', rect: [136, 697, 143, 709], dest: 'appendix.C' }]
    asked.length = 0
    const m = await read([{ view, shown: [line], annots }, { view, shown: [line], annots }, { view, shown: [line], annots }])
    // (page 1 holds the reference's points; pages 2 and 3 none: never asked)
    expect(asked).toEqual([1])
    expect(m.links).toEqual([['appendix.C', 1, 136, 697, 143, 709, 137, 137, 1, 'C']])
    // a piece across pages 1 and 2: both read, and the page beyond neither point is not
    asked.length = 0
    const across = await read([{ view, shown: [line], annots }, { view, shown: [line], annots }, { view, shown: [line], annots }], true, 2)
    expect(asked).toEqual([1, 2])
    expect(across.links.map(l => l[1])).toEqual([1, 2])
    // no placeholder names a link (a formula's): no page asked, no link
    asked.length = 0
    const none = await layoutMarksOf(linked([{ view, shown: [line], annots }], pointsOn()), '', { engine: 'pdflatex', units: [unit('para', [text('see '), ph('$x$'), text(' for')])], OPS })
    expect(asked).toEqual([])
    expect(none.links).toEqual([])
  })
})

describe("each colour piece's fill, as TeX set its run in the marked original (PR-C)", () => {
  it('the marks file holds them, rising, each a fill 0 to 0xFFFFFF', () => {
    const v = valid()
    const back = parseLayoutMarks(bytes(encodeLayoutMarks(v)))
    expect(back.colours).toEqual(v.colours)
    for (const colours of [[], [[0, 3]], [[2, 1, 1], [0, 3, 1]], [[0, 3, 0x1000000]], [[0, 3, -1]], 'x']) expect(() => parseLayoutMarks(bytes({ ...v, colours })), JSON.stringify(colours)).toThrow(LayoutRefusal)
  })
  it('a marks file with none, one of before among them, holds no key: read as none, and written back the bytes it was', () => {
    const { colours: _none, ...before } = valid()
    const text = JSON.stringify(JSON.parse(encodeLayoutMarks({ ...before, colours: [] } as never)))
    expect(JSON.parse(text)).not.toHaveProperty('colours')
    const back = parseLayoutMarks(bytes(text))
    expect(back.colours).toEqual([])
    expect(encodeLayoutMarks(back)).toBe(encodeLayoutMarks({ ...before, colours: [] } as never))
  })
})

