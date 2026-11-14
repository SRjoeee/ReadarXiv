// @vitest-environment node
// The layout marks' code change of the typing lane T6 (packages/engine/src/marks/marks.mjs), held to the module before it
// (helpers/marks-before.mjs, 9461947a4 verbatim but its imports), value for value: four reads of a value that may be none made
// explicit — TeX's answer for a piece of no command (`switches[commandOf(p) ?? '']`: a switch's key is a control word or a
// look-ahead pair, never '' nor the 'null' the old key read), the first character of a text of none after a piece whose command
// moves a punctuation mark (`next.s[0] !== undefined && PUNCT.includes(…)`), the source of a footnote's call, which a nested unit
// has none of, before its closing mark (`p.src ?? ''` for ENDS_IN_CS, a white space's end and ENDS_ENV), and the first character of
// a text of none after a piece of an asked class (`after[0] !== undefined && MOVED.includes(…)`). Each gave what the old reading
// gave on every input: a test of none, false. Held on projects written here and seeded ones, read by the source reader (units of
// every class: formulas, citations, references, footnotes and their calls, URLs, code, identifiers, numbers, a paper's macros
// complete or not, text symbols, colours, breaks, cells, headings, entries), some of their units given texts of none between their
// pieces, each marked under seeded answers of TeX's (every code at every follower, look-ahead pairs, macros of no ink, complete
// macros in each of their three forms, macros apart): the marked units, each unit's and each copy's mark, what the marking says of
// every opening mark the marked units hold and of every other name, and each unit's head.
import { describe, expect, it } from 'vitest'
import { completeMacros, inMemory, loadProject } from '../../packages/engine/src/source/latex-front.ts'
import * as NOW from '../../packages/engine/src/marks/marks.ts'
import * as BEFORE from './helpers/marks-before.mjs'

type Unit = Parameters<typeof NOW.layoutMarking>[0][number]
type Options = NonNullable<Parameters<typeof NOW.layoutMarking>[2]>
const now = NOW

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
type Seeded = ReturnType<typeof seeded>

/** what a call gives, or the error it throws */
function outcome<T>(f: () => T): { value: T } | { error: string } {
  try {
    return { value: f() }
  } catch (e) {
    return { error: String((e as { message?: unknown })?.message ?? e) }
  }
}

const PREAMBLE = [
  '\\usepackage{xspace}\\usepackage{xcolor}\\usepackage{hyperref}',
  '\\newcommand{\\model}{Transformer}',
  '\\newcommand{\\bert}{BERT\\xspace}',
  '\\newcommand{\\sys}{SysName}',
  '\\newcommand{\\fmt}[2]{#1/#2}',
  '\\newcommand{\\todo}[1]{}',
  '\\def\\snr{\\ac{SNR}\\xspace}',
]
const BODY = [
  'Words before a citation \\cite{a}. And after it. ',
  'See \\citep[p.~3]{a,b}, then \\ref{fig:a} and \\eqref{eq:1}; ',
  'As \\autoref{sec:x} says: ',
  'A note here\\footnote{A note of several words}. ',
  'A note here\\footnote{Another note of words}',
  'A call\\footnotemark{} then another\\footnotemark. ',
  'Calls\\footnote{First note words}\\footnote{Second note words} glued. ',
  'The formula $x+y$ and \\(z\\) here, \\ensuremath{w}! ',
  '\\[ a = b \\] then text. ',
  '\\begin{equation} e = mc^2 \\end{equation} after. ',
  'Code \\texttt{max\\_tokens} and \\verb|v_x| ok. ',
  'The id llm\\_equal\\_human is kept. ',
  '5\\% of R\\&D and \\S 3. ',
  'The \\model{} works; \\bert is good. ',
  '\\sys{}\\% share of it. ',
  '\\fmt{a}{b}. and \\fmt{x}{y} more ',
  '\\protect\\eqref{eq:2} words. ',
  '\\textcolor{red}{red words} and {\\color{blue} blue} ',
  'Line one\\\\ \\cite{c} line two\\\\\n\\model{} three. ',
  'A url \\url{https://example.org/a_b} and \\href{https://x.org}{link text}. ',
  'Zhou\\textsuperscript{1} and \\mbox{boxed} words. ',
  '\\label{sec:a} \\noindent Text after. ',
  '\\cite{a}\\cite{b} glued. ',
  '\\cite{z}.\n\n',
  '\\cite{a}.\\cite{b} and \\ref{c}, \\ref{d}',
  '\\section{A heading with \\cite{h}}',
  '\\begin{tabular}{cc} \\cite{t} & $c$ \\\\ \\model & 2 \\end{tabular}',
  '\\begin{thebibliography}{9}\\bibitem{a} A. Author. A title. 2023. doi:10.1000/xyz123 \\newblock More. \\end{thebibliography}',
  '\\todo{fix} words',
  'The \\snr $\\geq 50$ and \\snr\\cite{q} here. ',
  '\n\n',
  'Plain words of a sentence. ',
]
const doc = (preamble: string, body: string) => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`

/** a project's units, read by the one source reader both modules import; with `empty`, texts of none between some pieces */
function unitsOf(main: string, r: Seeded | null, tables: boolean): { units: Unit[]; text: string } | null {
  const files = new Map([['main.tex', new TextEncoder().encode(main)]])
  const p = outcome(() => loadProject(inMemory(files), 'main.tex', { tables }))
  if (!('value' in p)) return null
  const units: Unit[] = p.value.units
  if (r) for (const u of units) if (r.next() < 0.4) u.pieces = u.pieces.flatMap((q): Unit['pieces'] => (r.next() < 0.3 ? [q, { t: 'text', s: '' }] : [q]))
  return { units, text: main }
}

/** TeX's answers, seeded: every command the units write and every look-ahead pair, each code of each follower, '3' at any */
function switchesOf(r: Seeded, units: readonly Unit[]): Record<string, string> | null {
  if (r.next() < 0.1) return null
  const out: Record<string, string> = {}
  const commands = new Set<string>()
  for (const u of units) for (const p of u.pieces) { const c = BEFORE.commandOf(p); if (c) commands.add(c) }
  for (const c of commands) if (r.next() < 0.85) out[c] = Array.from({ length: 8 }, () => r.pick(['0', '0', '1', '2', '3', 'x'])).join('')
  for (const s of BEFORE.aheadSamples(units)) if (r.next() < 0.8) out[s.key] = r.pick(['0', '1', '2', 'x'])
  return out
}

/** the marking's options, seeded: answers, macros of no ink, complete macros (pairs, a map or the marks file's object), apart */
const OWN: readonly (readonly [string, number])[] = [['model', 0], ['fmt', 2], ['sys', 0], ['snr', 0]]
function optionsOf(r: Seeded, units: readonly Unit[], text: string): Options {
  const ink = BEFORE.inkSamples(units)
  const pairs = completeMacros([{ file: 'main.tex', text }])
  const complete = r.pick<Options['complete']>([null, pairs, new Map(pairs), BEFORE.completeCalled(units, pairs), OWN])
  return {
    lines: r.next() < 0.5,
    switches: switchesOf(r, units),
    inkless: r.next() < 0.5 ? ink.filter(() => r.next() < 0.3) : null,
    complete,
    apart: r.next() < 0.5 ? ink.filter(() => r.next() < 0.3) : null,
  }
}

const MARK_NAME = /\\axt(?:pma|pmm|pm|hpk|tg|hmark|brname|colour)\{([^{}]*)\}/g

/** both modules on one project's units under one set of options: the marking, the marks, what is said of each opening mark */
function same(units: readonly Unit[], classes: Parameters<typeof NOW.layoutMarking>[1], o: Options, r: Seeded, label: string) {
  const a = outcome(() => now.layoutMarking(units, classes, o))
  const b = outcome(() => BEFORE.layoutMarking(units, classes, o))
  if (!('value' in a) || !('value' in b)) {
    expect(a, label).toEqual(b)
    return
  }
  expect(a.value.units, label).toEqual(b.value.units)
  expect(units.map((u) => a.value.mark(u)), label).toEqual(units.map((u) => b.value.mark(u)))
  expect(a.value.units.map((u) => a.value.mark(u)), label).toEqual(b.value.units.map((u) => b.value.mark(u)))
  // (the destinations set: the marked units' marks, some dropped as a log's duplicates would have them)
  const names = new Set<string>()
  for (const u of a.value.units) for (const p of u.pieces) if (p.t === 'ph') for (const m of p.src.matchAll(MARK_NAME)) if (m[1] !== undefined && r.next() < 0.85) names.add(m[1])
  const ink = BEFORE.inkSamples(units)
  const said = ink.flatMap((s): [string, string][] => (r.next() < 0.6 ? [[s, r.pick(['BERT', '', '1,024', 'x', 'ab cd', '.', 'Transformer'])]] : []))
  const texts = r.pick<readonly string[] | ReadonlyMap<string, string> | null>([null, said.flat(), new Map(said)])
  const inkless = r.next() < 0.5 ? ink.filter(() => r.next() < 0.3) : null
  const fa = now.followsOf(units, names, texts, inkless), fb = BEFORE.followsOf(units, names, texts, inkless)
  const ha = now.headsOf(units, names), hb = BEFORE.headsOf(units, names)
  const asked = ['x', '0s', 'p0.0', 'p-1.0a', ...names]
  units.forEach((u, i) => {
    asked.push(`${i}s`)
    for (let k = 0; k <= u.pieces.length; k++) asked.push(`p${i}.${k}a`, `n${i}.${k}a`)
  })
  for (const name of asked) {
    expect(outcome(() => fa(name)), `${label} ${name}`).toEqual(outcome(() => fb(name)))
    expect(outcome(() => ha(name)), `${label} ${name}`).toEqual(outcome(() => hb(name)))
  }
}

describe('layoutMarking and followsOf', () => {
  it('mark each snippet alone as before, under every answer', () => {
    const r = seeded(11)
    for (const [n, body] of BODY.entries()) {
      const read = unitsOf(doc(PREAMBLE.join('\n'), body), null, n % 2 === 0)
      if (!read) continue
      for (let t = 0; t < 12; t++) same(read.units, BEFORE.MARK_CLASSES, optionsOf(r, read.units, read.text), r, `snippet ${n} ${t}`)
    }
  })

  it('mark seeded projects as before, texts of none between their pieces, under seeded answers and classes', () => {
    const r = seeded(31)
    for (let n = 0; n < 300; n++) {
      const preamble = PREAMBLE.filter(() => r.next() < 0.7).join('\n')
      const body = Array.from({ length: 1 + r.int(14) }, () => r.pick(BODY)).join(r.pick([' ', '\n', '']))
      const read = unitsOf(doc(preamble, body), r.next() < 0.6 ? r : null, r.next() < 0.5)
      if (!read) continue
      const classes = r.next() < 0.6 ? BEFORE.MARK_CLASSES : BEFORE.MARK_CLASSES.filter(() => r.next() < 0.6)
      for (let t = 0; t < 3; t++) same(read.units, classes, optionsOf(r, read.units, read.text), r, `seeded ${n} ${t}`)
    }
  })
})
