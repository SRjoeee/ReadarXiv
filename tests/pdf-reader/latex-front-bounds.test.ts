// @vitest-environment node
// The source reader's code changes of the typing lane T6 (packages/engine/src/source/latex-front.mjs), held to the module before
// them (helpers/latex-front-before.mjs, 074329318 verbatim but its imports), value for value and error for error: its latin1 the
// engine's one (bounded-reads.ts: slices of 8192 bytes, not 32768, read by Reflect.apply), and six reads of a value that may be
// none made explicit — unitForm's paper macro of none (`macro && macro.params > 0`), tailOf's token before a body's only one
// (`at[n - 1] ?? -1`), identifiersIn's closing bracket of no pair (`PAIRS[open ?? '']`), tikzText's character past the text
// (`s[k + 2] ?? ''`), the walk's \texorpdfstring of no arguments read (`!!args && …`), newifValues of a paper with no \newif
// (`new Map()`, the empty Map it returned). Each read gave what the old one gave on every input: an index or a key of none read
// none, a comparison with none false. Held on byte strings of every length round both slices, on seeded strings of brackets,
// quotes and identifiers, and on projects written here (each changed reading's inputs by hand, then seeded ones of every
// snippet, cut short anywhere) and the repository's own TeX fixtures: the units and every field loadProject gives, each unit's
// marks, start and call, the patched files, the file readers.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: the module is JavaScript until its typing commit (no declaration in the package)
import * as NOW from '../../packages/engine/src/source/latex-front.mjs'
import * as BEFORE from './helpers/latex-front-before.mjs'

type Module = typeof BEFORE
const now = NOW as Module

/** a seeded generator (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T
  return { next, int, pick }
}

/** what a call gives, or the error it throws: the same either way on both modules */
function outcome<T>(f: () => T): { value: T } | { error: string } {
  try {
    return { value: f() }
  } catch (e) {
    return { error: String((e as { message?: unknown })?.message ?? e) }
  }
}

const latin1Of = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const utf8Of = (s: string) => new TextEncoder().encode(s)

describe('latin1, the engine\'s one', () => {
  it('reads every byte as its code unit, round each slice of both lengths', () => {
    const r = seeded(7)
    const lengths = [0, 1, 2, 255, 256, 8191, 8192, 8193, 16384, 32767, 32768, 32769, 40000, 65536, 65537, 100003]
    for (const n of lengths) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i++) bytes[i] = r.int(256)
      expect(now.latin1(bytes), `${n}`).toBe(BEFORE.latin1(bytes))
      // (a view into a larger buffer, and a Node Buffer, which is a Uint8Array)
      const view = new Uint8Array(n + 13).subarray(5, 5 + n)
      view.set(bytes)
      expect(now.latin1(view)).toBe(BEFORE.latin1(view))
      expect(now.latin1(Buffer.from(bytes))).toBe(BEFORE.latin1(Buffer.from(bytes)))
    }
    const every = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(now.latin1(every)).toBe(BEFORE.latin1(every))
    expect(now.texText(latin1Of('a\r\nb\rc\n'))).toBe(BEFORE.texText(latin1Of('a\r\nb\rc\n')))
  })

  it('refuses what is no byte array as before', () => {
    for (const x of [null, undefined, 'abc', [65, 66], { length: 2 }, 42]) {
      expect(outcome(() => now.latin1(x)).hasOwnProperty('error'), String(x)).toBe(outcome(() => BEFORE.latin1(x)).hasOwnProperty('error'))
    }
  })
})

describe('identifiersIn and identifierSource', () => {
  const HAND = ['x_y」', '「x_y', 'foo_bar）', '（foo_bar', 'x_y⟩', '⟨x_y', 'call_x(arg)', '(see conv5_x)', '[sentence_1]', 'id_2]', '[id_3',
    '{root_question}', 'a_b}', 'host_label(result).', '"quoted_name"', '«a_b»', 'snake_case_word', '__init__', '_x', 'x86_64', 'a_b】', '【a_b',
    'test_parser.py', '--view_range', 'e.g.', 'x_\u0000y', 'p_q_r) s_t( u_v', '']
  it('gives each identifier as before, a closing bracket of no pair among them', () => {
    for (const s of HAND) expect(now.identifiersIn(s), s).toEqual(BEFORE.identifiersIn(s))
    const r = seeded(11)
    const alphabet = ['a', 'b', 'Z', '0', '9', '_', '_', '(', ')', '[', ']', '{', '}', '「', '」', '（', '）', '⟨', '⟩', '【', '】', '"', "'", '`', '«', '»', '“', '”', '‘', '’', '.', ',', ';', ':', '!', '?', ' ', '\n', '\u0000', '\\', '@', '$', '-']
    for (let n = 0; n < 4000; n++) {
      let s = ''
      for (let k = r.int(30); k > 0; k--) s += r.pick(alphabet)
      expect(now.identifiersIn(s), JSON.stringify(s)).toEqual(BEFORE.identifiersIn(s))
      expect(now.identifierSource(s), JSON.stringify(s)).toBe(BEFORE.identifierSource(s))
    }
    for (const x of [null, undefined, 3, '\\textbf{x_y}', 'a\\_b', 'a\\textunderscore b']) expect(now.identifierSource(x)).toBe(BEFORE.identifierSource(x))
  })
})

// ---------------------------------------------------------------- projects
const PREAMBLE = [
  '\\renewcommand\\section{\\@startsection{section}{1}{0pt}{1ex}{1ex}{\\bfseries}}',
  '\\renewcommand{\\section}[2]{\\textbf{#1} #2}',
  '\\renewcommand{\\subsection}[1][x]{#1}',
  '\\newcommand{\\mysec}[1]{\\textbf{#1}\\section}',
  '\\newcommand{\\only}[1]{\\section}',
  '\\newcommand\\strange[1]{\\renewcommand{\\thechapter}{#1}\\chapter}',
  '\\newcommand\\keep[1]{#1\\let\\saved=\\section}',
  '\\newcommand\\shown[1]{#1\\string\\section}',
  '\\def\\pair#1#2{#1 and #2\\caption}',
  '\\newcommand{\\nb}[1]{Notebook~#1}',
  '\\newcommand{\\model}{Transformer model with many words in it}',
  '\\newif\\ifdraft',
  '\\draftfalse',
  '\\usepackage[latin1]{inputenc}',
  '\\usepackage{hyperref}',
  '\\usepackage{tikz}',
  '\\title{A Title\\thanks{Supported by words}}',
  '\\author{First Author \\and Second Author}',
  '\\newcommand{\\caption}[1]{#1}',
]
const BODY = [
  'Plain words of a sentence, then more words. ',
  '\n\n',
  '\\section{Introduction}',
  '\\section*{A starred one}',
  '\\section[Short]{A long title}',
  '\\subsection{Sub}',
  '\\subsection[opt]{Two forms}',
  '\\section{One}{Two}',
  '\\mysec{x}{The heading after the call}',
  '\\mysec{x} Words',
  '\\only{y}{Title}',
  '\\strange{$\\infty$}{The End of Training}',
  '\\keep{z} Text after it.',
  '\\shown{w} More text.',
  '\\pair{a}{b}{A caption}',
  '\\nb{4} and \\nb{5}',
  '\\model\\ again',
  '\\caption{A caption of a figure}',
  '\\footnote{A note with several words}',
  '\\texorpdfstring{A $x$ title}{A x title}',
  '\\section{\\texorpdfstring{Title $y$}{Title y}}',
  '\\texorpdfstring{one}',
  '\\texorpdfstring',
  '\\texorpdfstring{}{}',
  'the snake_case_word in text, call_x(arg), and foo_bar） here, 「x_y」 and ⟨x_y⟩ too. ',
  'see (conv5_x) and [sentence_1] and {root\\_question} ',
  'an e-mail first.last@example.org and https://example.org/a_b. ',
  '\\begin{tikzpicture}\\node at (0,0) {Node text}; \\draw (0,0) -- (1,1) node[right] (n) at (1,1) {Label text};\\end{tikzpicture}',
  '\\begin{tikzpicture}\\draw (0,0) node at',
  '\\begin{tikzpicture}\\node at',
  '\\ifdraft Draft words here\\else Final words here\\fi',
  '\\iftrue Kept words\\fi',
  '\\if 0 hidden words\\fi',
  '\\ifdefined\\foo Some words\\else Other words\\fi',
  '\\begin{itemize}\\item One item\\item Two items\\end{itemize}',
  '\\begin{tabular}{cc} Cell one & Cell two \\\\ \\hline Third cell & Fourth \\end{tabular}',
  '\\begin{figure}\\centering\\caption{Inside a float}\\end{figure}',
  'Caf\\\'e and El Ni{\\~n}o, \\L ukasz, Bj\\o rn, 5\\% of R\\&D. ',
  '\\begin{equation} x = y. \\end{equation}',
  '$a_b$ and \\(c\\) and \\[d\\] ',
  '\\input{part}',
  '\\begin{abstract}An abstract of words.\\end{abstract}',
  '{\\bfseries bold group} ',
  '\\textbf{bold} \\emph{emphasis} ',
  '% a comment line\n',
  'Naïve café words in UTF-8. ',
]

/** a project of the files given (a name to its text, its bytes latin1 where `latin` names it) */
function project(files: Record<string, string>, latin: readonly string[] = []) {
  return new Map(Object.entries(files).map(([f, t]) => [f, latin.includes(f) ? latin1Of(t) : utf8Of(t)]))
}

/** both modules on one project: everything loadProject gives and what reads it, the same */
function same(files: Map<string, Uint8Array>, label: string, tables = false) {
  const a = outcome(() => now.loadProject(now.inMemory(files), 'main.tex', { tables }))
  const b = outcome(() => BEFORE.loadProject(BEFORE.inMemory(files), 'main.tex', { tables }))
  expect(a, label).toEqual(b)
  if (!('value' in a) || !('value' in b)) return
  const ua = a.value.units, ub = b.value.units
  expect(ua.map((u) => now.calledAt(u)), label).toEqual(ub.map((u) => BEFORE.calledAt(u)))
  const ma = now.markUnits(ua), mb = BEFORE.markUnits(ub), fa = now.frontMarks(ua), fb = BEFORE.frontMarks(ub)
  expect(ua.map((u) => [ma(u), fa(u), now.startOf(u.pieces), now.unitText(u)]), label).toEqual(ub.map((u) => [mb(u), fb(u), BEFORE.startOf(u.pieces), BEFORE.unitText(u)]))
  // (every other unit translated, as a pseudo-translation's text pieces: the patched files, marked)
  const tr = (units: typeof ua) => new Map(units.filter((_, k) => k % 2 === 0).map((u) => [u, u.pieces.map((p) => ((p as { t?: string }).t === 'text' ? { t: 'text', tr: true, s: 'tr ' } : p))]))
  const pa = outcome(() => now.patch(a.value, tr(ua), { mark: ma, spans: [] }))
  const pb = outcome(() => BEFORE.patch(b.value, tr(ub), { mark: mb, spans: [] }))
  expect(pa, label).toEqual(pb)
  expect(outcome(() => now.texFilesOf(now.inMemory(files), 'main.tex')), label).toEqual(outcome(() => BEFORE.texFilesOf(BEFORE.inMemory(files), 'main.tex')))
  for (const [f, bytes] of files) {
    const t = now.texText(bytes)
    expect([now.documentBounds(t), now.inputencOf(t), now.urlPercents(t, f), now.completeMacros([{ file: f, text: t }])], `${label} ${f}`).toEqual([BEFORE.documentBounds(t), BEFORE.inputencOf(t), BEFORE.urlPercents(t, f), BEFORE.completeMacros([{ file: f, text: t }])])
  }
}

const doc = (preamble: string, body: string) => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('loadProject and what reads its units', () => {
  it('reads each changed reading\'s inputs as before', () => {
    // (a heading of the kernel's, and of a paper that defines it with no parameter, with two, with an optional one)
    same(project({ 'main.tex': doc('', '\\section{Kernel} words here. \\subsection[a]{b} more words.') }), 'kernel headings')
    same(project({ 'main.tex': doc(PREAMBLE[0]!, '\\section{Own of none} words here.') }), 'heading of no parameter')
    same(project({ 'main.tex': doc(PREAMBLE[1]!, '\\section{One}{Two} words here.') }), 'heading of two')
    same(project({ 'main.tex': doc(PREAMBLE[2]!, '\\subsection[o]{t} words here.') }), 'heading of an optional one')
    // (macros whose body ends in a command: alone, after a \let and an `=`, after \string)
    same(project({ 'main.tex': doc(PREAMBLE.slice(3, 9).join('\n'), BODY.slice(8, 15).join(' ')) }), 'macro tails')
    // (a picture cut off at `node at`, the text's last characters, in a file of its own)
    same(project({ 'main.tex': doc('\\usepackage{tikz}', 'Words before.\\input{fig} Words after.'), 'fig.tex': '\\begin{tikzpicture}\\draw (0,0) node at' }), 'picture cut at its end')
    same(project({ 'main.tex': doc('\\usepackage{tikz}', 'Words.\\input{fig}'), 'fig.tex': '\\begin{tikzpicture}\\node at' }), 'picture cut at node at')
    same(project({ 'main.tex': '\\begin{document}\\begin{tikzpicture}\\node at' }), 'main cut at node at')
    // (\texorpdfstring with both groups, one, none)
    same(project({ 'main.tex': doc('\\usepackage{hyperref}', BODY.slice(19, 24).join(' ')) }), 'texorpdfstring')
    // (identifiers whose last character is a closing bracket of no pair in the table)
    same(project({ 'main.tex': doc('', BODY[24]! + BODY[25]!) }), 'identifiers')
    // (no \newif at all, one set false, one set both ways)
    same(project({ 'main.tex': doc('', '\\ifdraft Draft words\\else Final words\\fi') }), 'no newif')
    same(project({ 'main.tex': doc('\\newif\\ifdraft\\draftfalse', '\\ifdraft Draft words\\else Final words\\fi') }), 'newif false')
    same(project({ 'main.tex': doc('\\newif\\ifdraft\\draftfalse\\drafttrue', '\\ifdraft Draft words\\else Final words\\fi') }), 'newif both')
    // (a Latin-1 file, its inputenc declared; CR line ends)
    same(project({ 'main.tex': doc('\\usepackage[latin1]{inputenc}', 'Café naïve words here.') }, ['main.tex']), 'latin1 file')
    same(project({ 'main.tex': doc('', 'Line one\r\nline two\r\n\r\nA paragraph.\rEnd.') }), 'CR line ends')
  })

  it('reads seeded projects of every snippet, whole and cut short, as before', () => {
    const r = seeded(29)
    for (let n = 0; n < 800; n++) {
      const preamble = Array.from({ length: r.int(5) }, () => r.pick(PREAMBLE)).join('\n')
      const body = Array.from({ length: 1 + r.int(25) }, () => r.pick(BODY)).join(r.pick([' ', '\n', '']))
      let main = doc(preamble, body)
      // (cut short anywhere: an unclosed group, environment, conditional or picture at the text's end)
      if (r.next() < 0.3) main = main.slice(0, r.int(main.length + 1))
      const files: Record<string, string> = { 'main.tex': main }
      if (r.next() < 0.5) {
        let part = Array.from({ length: 1 + r.int(8) }, () => r.pick(BODY)).join(' ')
        if (r.next() < 0.4) part = part.slice(0, r.int(part.length + 1))
        files['part.tex'] = part
      }
      const latin = r.next() < 0.15 ? ['main.tex'] : []
      same(project(files, latin), `seeded ${n}`, r.next() < 0.5)
    }
  })

  it('reads the repository\'s TeX fixtures as before', () => {
    for (const f of ['tests/fixtures/pdf/sample-1/main.tex', 'tests/fixtures/pdf/figures/figures.tex', 'tests/fixtures/pdf/figures/inc-tounicode.tex', 'tests/fixtures/pdf/highlights/highlights.tex']) {
      const text = readFileSync(f)
      same(new Map([['main.tex', new Uint8Array(text)]]), f, true)
    }
  })
})
