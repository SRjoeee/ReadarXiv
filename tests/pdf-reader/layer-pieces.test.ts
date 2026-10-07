import { describe, expect, it } from 'vitest'
import { COLOUR_SHIFT, kOfSource, LAYER_COLOURS, STYLE, slotKs, styleOf, type TrPiece, trPiecesOf, trText } from '@/pdf-reader/engine/layer/pieces.mjs'
import { openPaper } from '@/pdf-reader/engine/live.mjs'
import { plainTranslated, SPACING, serialize, shown, translateUnits } from '@/pdf-reader/engine/mt.mjs'

// A translated unit's pieces as the layer takes them (spec §4.3): each placeholder, and each group's open and close, by
// `k`, the index of its source piece in its unit; text as the compiled PDF shows it; a group's style as flags

type Piece = { t: string; s?: string; src?: string; id?: number; tr?: boolean; unit?: unknown; pre?: string; post?: string }
const text = (s: string, tr = false): Piece => (tr ? { t: 'text', tr: true, s } : { t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const open = (id: number, src: string): Piece => ({ t: 'open', id, src })
const close = (id: number, src = '}'): Piece => ({ t: 'close', id, src })
const nested = (s: string): Piece => ({ t: 'nested', pre: '\\footnote{', unit: { kind: 'footnote', pieces: [text(s)] }, post: '}' })
/** a unit's pieces through a record: what a copy read from JSON holds */
const viaJson = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** every unit this file builds, translated and not: what the shared rules are checked over */
const UNITS: Piece[][] = []
const unit = (pieces: Piece[]) => { UNITS.push(pieces); return { pieces } }

describe('styleOf', () => {
  it("each command's flags", () => {
    expect(STYLE).toEqual({ BOLD: 1, ITALIC: 2, EMPH: 4, UPRIGHT: 8, MONO: 16, SANS: 32, SERIF: 64, CAPS: 128, MEDIUM: 256, NORMAL: 512, SWITCH: 1024 })
    expect(COLOUR_SHIFT).toBe(11)
    expect(LAYER_COLOURS).toEqual(['black', 'white', 'red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'brown', 'lime', 'orange', 'pink', 'purple', 'teal', 'violet', 'olive', 'darkgray', 'gray', 'lightgray'])
    const rows: [string[], number][] = [
      [['textbf', 'bf', 'bfseries', 'mathbf', 'boldsymbol'], STYLE.BOLD],
      [['textmd', 'mdseries'], STYLE.MEDIUM],
      [['emph', 'em'], STYLE.EMPH],
      [['textit', 'it', 'itshape', 'textsl', 'sl', 'slshape', 'mathit'], STYLE.ITALIC],
      [['textup', 'upshape'], STYLE.UPRIGHT],
      [['textsc', 'sc', 'scshape'], STYLE.CAPS],
      [['texttt', 'tt', 'ttfamily', 'url', 'path', 'code', 'lstinline'], STYLE.MONO],
      [['textsf', 'sf', 'sffamily'], STYLE.SANS],
      [['textrm', 'rm', 'rmfamily'], STYLE.SERIF],
      [['textnormal', 'normalfont'], STYLE.NORMAL],
    ]
    for (const [names, flags] of rows) for (const name of names) {
      // an open's source, a switch's, and either after a brace and white space
      for (const src of [`\\${name}{`, `\\${name}`, `{\\${name} `, `{ \\${name}`]) expect([src, styleOf(src)]).toEqual([src, flags])
      // followed by a letter, the command is another
      expect(styleOf(`\\${name}x{`)).toBe(0)
    }
    LAYER_COLOURS.forEach((name, i) => {
      expect(styleOf(`\\textcolor{${name}}{`)).toBe((i + 1) << 11)
      expect(styleOf(`\\color{${name}}`)).toBe((i + 1) << 11)
      expect(styleOf(`{\\color{ ${name} }`)).toBe((i + 1) << 11)
    })
    expect(styleOf('\\textcolor{chartreuse}{')).toBe(0)
    expect(styleOf('\\color[rgb]{1,0,0}')).toBe(0)
    expect(styleOf('\\underline{')).toBe(0)
    expect(styleOf('{')).toBe(0)
    expect(styleOf('{\\bf ')).toBe(STYLE.BOLD)
    expect(styleOf('\\bfseries')).toBe(STYLE.BOLD)
  })
})

describe('trPiecesOf and kOfSource', () => {
  // a 2 $x$ b \textbf{c} $x$.
  const source = [text('a '), ph('$x$'), text(' b '), open(1, '\\textbf{'), text('c'), close(1), ph('$x$'), text('.')]
  unit(source)
  // the translation with the second $x$ first: the source's own objects, as rehydrate gives them back
  const translated = [text('A ', true), source[6], text(' B ', true), source[3], text('C', true), source[5], source[1], text('.', true)] as Piece[]
  unit(translated)

  it('by identity tells two equal placeholders apart', () => {
    expect(trPiecesOf(translated, kOfSource(source))).toEqual([[0, 'A '], [1, 6], [0, ' B '], [2, 3, STYLE.BOLD], [0, 'C'], [3, 5], [1, 1], [0, '.']])
  })

  it('from JSON takes equal placeholders in order', () => {
    // a copy's pieces are equal to their source's, not the same objects: the first unused of the same t and src
    expect(trPiecesOf(viaJson(translated), kOfSource(source))).toEqual([[0, 'A '], [1, 1], [0, ' B '], [2, 3, STYLE.BOLD], [0, 'C'], [3, 5], [1, 6], [0, '.']])
    // and the source itself through JSON
    expect(trPiecesOf(translated, kOfSource(viaJson(source)))).toEqual([[0, 'A '], [1, 1], [0, ' B '], [2, 3, STYLE.BOLD], [0, 'C'], [3, 5], [1, 6], [0, '.']])
  })

  it('identity first, and a piece taken by identity is not taken again from JSON', () => {
    const kOf = kOfSource(source)
    // the first $x$ object taken by identity; a copy of $x$ after it takes the one left, 6
    expect([kOf(source[1]), kOf(viaJson(source[1])), kOf(viaJson(source[1]))]).toEqual([1, 6, -1])
  })

  it("an open or a close is matched by its id too", () => {
    const two = [open(1, '\\textbf{'), text('a'), close(1), open(2, '\\textbf{'), text('b'), close(2)]
    unit(two)
    const kOf = kOfSource(two)
    expect([kOf(viaJson(two[3])), kOf(viaJson(two[5])), kOf(viaJson(two[0])), kOf(viaJson(two[2])), kOf({ t: 'open', id: 3, src: '\\textbf{' })]).toEqual([3, 5, 0, 2, -1])
  })

  it('a switch, a tie, a space and a break', () => {
    const fn = nested('A note.')
    const pieces = [text('x '), ph('\\bfseries'), ph('~'), ph('\\nobreakspace'), ph('\\,'), ph('\\hspace{2pt}'), ph('\\quad'), ph('\\\\'), ph('\\\\[2pt]'), ph('\\newline'), ph('\\linebreak[2]'), ph('\\label{x}'), fn, ph('\\color{red}'), ph('\\em'), ph('\\color[rgb]{1,0,0}'), ph('\\textbf{x}'), ph('$y$'), text(' z')]
    unit(pieces)
    expect(trPiecesOf(pieces, kOfSource(pieces))).toEqual([
      [0, 'x '],
      [2, 1, STYLE.BOLD | STYLE.SWITCH],
      [0, ' '], [0, ' '], [0, ' '], [0, ' '], [0, ' '],
      [0, '\n'], [0, '\n'], [0, '\n'], [0, '\n'],
      [1, 11],
      [1, 12],
      [2, 13, (3 << COLOUR_SHIFT) | STYLE.SWITCH],
      [2, 14, STYLE.EMPH | STYLE.SWITCH],
      // a colour by a model is a switch the table does not name
      [2, 15, STYLE.SWITCH],
      // a command with its argument held as one placeholder is a placeholder, whatever its style
      [1, 16],
      [1, 17],
      [0, ' z'],
    ])
  })

  it('a piece with no source is refused', () => {
    expect(trPiecesOf([...translated, ph('$z$')], kOfSource(source))).toBeNull()
    expect(trPiecesOf([text('a', true), { t: 'open', id: 9, src: '\\textbf{' }, text('b', true), { t: 'close', id: 9, src: '}' }], kOfSource(source))).toBeNull()
    // and pieces not of their shape
    for (const bad of [null, 'text', 1, {}, { t: 3 }, { t: 'text' }, { t: 'text', s: 1 }]) expect(trPiecesOf([text('a', true), bad], kOfSource(source))).toBeNull()
    expect(trPiecesOf('pieces' as never, kOfSource(source))).toBeNull()
    expect(trPiecesOf([], kOfSource(source))).toEqual([])
  })
})

describe('trText', () => {
  // eight units, each translated by a fake engine that adds TeX's specials to its words: a percent, an ampersand, a
  // backslash (rehydrate escapes them as TeX sets them: \%, \&, \textbackslash{})
  const SOURCE = String.raw`\documentclass{article}\usepackage{xcolor}\begin{document}
Plain words in a paragraph of their own.

Words $x$ between \cite{a} and \ref{b} placeholders, and $x$ again.

Some \textbf{bold \emph{and emphasised} words} and {\bf a switch} here.

See Figure~\ref{f} now, and a\,thin space.

First line\\ second line\newline third.

A claim\footnote{A note of its own.} stands.

\section{A heading}
Caf\'e and na\"ive words, {\color{red} red} and \textcolor{blue}{blue}, to the document's end.
\end{document}
`
  const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
  const reply = (s: string) => `${s.replace(/(?<![@a-z])[A-Za-z]{2,}/g, w => w.toUpperCase())} 5% R&amp;D a\\b`

  it('is plainTranslated', async () => {
    const units = paper.units as { pieces: Piece[] }[]
    expect(units.length).toBeGreaterThanOrEqual(8)
    const { results } = await translateUnits(units as never, async (texts: string[]) => texts.map(t => ({ text: reply(t), by: 'B' })), 'markers')
    let checked = 0
    for (const u of units) {
      const r = results.get(u as never) as { pieces?: Piece[]; state: string } | undefined
      expect(r?.state).toBe('whole')
      const p = r?.pieces as Piece[]
      unit(p); unit(u.pieces)
      // the escapes are in the pieces, as TeX sets them
      expect(p.some(q => q.t === 'text' && q.tr && /\\%.*\\&.*\\textbackslash\{\}/.test(q.s ?? ''))).toBe(true)
      for (const pieces of [p, u.pieces]) {
        const tr = trPiecesOf(pieces, kOfSource(u.pieces)) as TrPiece[]
        expect(tr).not.toBeNull()
        expect(trText(tr)).toBe(plainTranslated(pieces as never))
      }
      checked++
    }
    expect(checked).toBe(units.length)
    // the shapes asked for are among them: a tie, a forced break, a footnote call, a group in a group, a lead and a trail
    const all = units.flatMap(u => u.pieces)
    expect(all.some(q => q.src === '~')).toBe(true)
    expect(all.some(q => q.src === '\\\\')).toBe(true)
    expect(all.some(q => q.t === 'nested')).toBe(true)
    expect(units.some(u => u.pieces.filter(q => q.t === 'open').length >= 2)).toBe(true)
    expect(units.some(u => /^\s/.test(u.pieces[0]?.s ?? ''))).toBe(true)
    expect(units.some(u => /\s$/.test(u.pieces.at(-1)?.s ?? ''))).toBe(true)
  })

  it('every non-text piece a space, white space collapsed, trimmed', () => {
    expect(trText([[0, '  a'], [1, 3], [0, 'b\n'], [2, 4, 1], [0, '\n'], [0, 'c'], [3, 6], [0, ' ']])).toBe('a b c')
    expect(trText([])).toBe('')
  })
})

describe('slotKs', () => {
  it("are the slots' own indices", () => {
    // text, $x$, an open, text, a close, \cite{a}
    const u = unit([text('a '), ph('$x$'), open(1, '\\textbf{'), text('b'), close(1), ph('\\cite{a}')])
    expect(slotKs(u, serialize(u as never).slots)).toEqual([1, 2, 4, 5])
    // slots read from JSON (the early's, from the Worker) find the same
    expect(slotKs(u, viaJson(serialize(u as never).slots))).toEqual([1, 2, 4, 5])
  })
})

describe("the shared rules are mt.mjs's", () => {
  it("text as mt.mjs shown gives it, and its spacing set", () => {
    const pieces = UNITS.flat()
    expect(pieces.filter(p => p.t === 'text').length).toBeGreaterThan(50)
    for (const p of pieces) if (p.t === 'text') expect(trPiecesOf([p], kOfSource([p]))).toEqual([[0, shown(p as never)]])
    // every placeholder's source met, and every one of the set's alternatives with its near misses
    const sources = new Set([...pieces.filter(p => p.t === 'ph').map(p => p.src as string), '~', '\\ ', '\\,', '\\;', '\\:', '\\quad', '\\qquad', '\\enspace', '\\thinspace', '\\nobreakspace', '\\hspace{1em}', '\\hspace*{1em}', '}', '\\quadx', '\\qquadq', '\\enskip', '\\!', '\\>', '\\hspacex', '\\vspace{1em}', '\\thinspaces', '\\@', '\\label{a}'])
    for (const src of sources) {
      const p = ph(src), [got] = trPiecesOf([p], kOfSource([p])) as TrPiece[]
      expect([src, got?.[0] === 0 && got[1] === ' ']).toEqual([src, SPACING.test(src)])
    }
  })
})
