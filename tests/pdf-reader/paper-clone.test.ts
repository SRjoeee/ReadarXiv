// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// The opened paper is plain data but for its `fsys` (pipeline/live.mjs openPaper): a host hands it from one process to another as a
// structured clone (readarxiv-web's container/src/run/paper-wire.ts: the prepare child's paper to the maker child, which then reads it
// in place of opening the paper again). A clone keeps the graph as it is — every key in its order, every value, the Set of kept
// cells holding the units themselves, the units array the project shares — and gives an object of a class back as a plain one, and a
// function not at all. So nothing of the paper may be a function, an accessor or an object of a class of its own: a field that is
// one fails here, and the host, which checks the same, opens the paper again rather than hand on another paper.

const enc = (s: string) => new TextEncoder().encode(s)
const SAMPLE = new URL('../fixtures/pdf/sample-1/', import.meta.url)
const sample = () => new Map(['main.tex', 'main.bbl', 'refs.bib'].map(name => [name, new Uint8Array(readFileSync(new URL(name, SAMPLE)))]))
/** papers that fill every field: a bibliography, floats and their captions, a table's cells, theorem-like environments a paper
 *  defines, an author block, footnotes, structural names */
const SOURCES: Record<string, () => Map<string, Uint8Array>> = {
  'the sample paper (its .bbl)': sample,
  'floats, a table, theorems, an author block': () => new Map([['main.tex', enc([
    '\\documentclass{article}', '\\newtheorem{recall}{Recall}', '\\title{A Title}', '\\author{A. Author\\thanks{University.} \\and B. Author}',
    '\\begin{document}', '\\maketitle', '\\begin{abstract}An abstract of two sentences. It ends here.\\end{abstract}',
    '\\section{Introduction}', 'A paragraph with a footnote\\footnote{The note.} and a citation.',
    '\\begin{figure}\\centering\\caption{A figure\'s caption.}\\label{f}\\end{figure}',
    '\\begin{table}\\centering\\begin{tabular}{ll}Name & Value\\\\ First & 1\\end{tabular}\\caption{A table.}\\end{table}',
    '\\begin{recall}A theorem of a name the paper defines.\\end{recall}', '\\end{document}', '',
  ].join('\n'))]]),
  // (a table of models' names: cells the kept Set holds, the units themselves)
  'a table of names, its cells kept': () => new Map([['main.tex', enc([
    '\\documentclass{article}', '\\begin{document}', '\\section{Results}', 'We compare the models below on the benchmark.',
    '\\begin{table}\\centering\\begin{tabular}{lc}Model & Accuracy\\\\ BERT & 84.1\\\\ RoBERTa & 87.3\\\\ XLNet & 86.0\\end{tabular}\\caption{Accuracy of each model.}\\end{table}',
    '\\end{document}', '',
  ].join('\n'))]]),
}
/** the kept cells each source holds at least: the clone's identity check of them is no empty loop */
const KEPT: Record<string, number> = { 'a table of names, its cells kept': 3 }

/** where a graph holds what a structured clone would not give back as itself, or null */
function notPlain(root: unknown): string | null {
  const plain = new Set<object | null>([Object.prototype, Array.prototype, Map.prototype, Set.prototype, RegExp.prototype, Date.prototype, ArrayBuffer.prototype, null])
  const seen = new Set<object>(), stack: [unknown, string][] = [[root, 'paper']]
  while (stack.length) {
    const [v, path] = stack.pop() as [unknown, string]
    if (typeof v === 'function' || typeof v === 'symbol') return `${path}: a ${typeof v}`
    if (v === null || typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    if (ArrayBuffer.isView(v)) continue
    if (!plain.has(Object.getPrototypeOf(v))) return `${path}: an object of a class`
    if (v instanceof Map) { for (const [k, x] of v) stack.push([k, `${path}'s key`], [x, `${path}'s value`]); continue }
    if (v instanceof Set) { for (const x of v) stack.push([x, `${path}'s item`]); continue }
    for (const k of Object.getOwnPropertyNames(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k) as PropertyDescriptor
      if (d.get || d.set) return `${path}.${k}: an accessor`
      stack.push([d.value, `${path}.${k}`])
    }
  }
  return null
}
/** the first difference between two graphs, or null: the same prototypes, own keys in their order, values (Object.is), Set and Map
 *  entries in their order, and the same sharing */
function graphDiff(a: unknown, b: unknown, path = 'paper', pairs = new Map<object, object>(), back = new Map<object, object>()): string | null {
  if (typeof a !== typeof b) return `${path}: ${typeof a} against ${typeof b}`
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return Object.is(a, b) ? null : `${path}: ${String(a)} against ${String(b)}`
  if (pairs.has(a) || back.has(b)) return pairs.get(a) === b && back.get(b) === a ? null : `${path}: shared otherwise`
  pairs.set(a, b)
  back.set(b, a)
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path}: prototypes`
  const entries = (v: object): [unknown, unknown][] => (v instanceof Map ? [...v] : v instanceof Set ? [...v].map(x => [x, x]) : Object.getOwnPropertyNames(v).map(k => [k, (v as Record<string, unknown>)[k]]))
  const x = entries(a), y = entries(b)
  if (x.length !== y.length) return `${path}: ${x.length} entries against ${y.length}`
  for (let i = 0; i < x.length; i++) {
    const [ka, va] = x[i] as [unknown, unknown], [kb, vb] = y[i] as [unknown, unknown]
    const d = graphDiff(ka, kb, `${path}<key ${i}>`, pairs, back) ?? graphDiff(va, vb, `${path}.${String(ka)}`, pairs, back)
    if (d) return d
  }
  return null
}

describe('openPaper\'s paper is plain data but for its fsys: a structured clone of it is the same paper', () => {
  for (const [name, files] of Object.entries(SOURCES)) {
    it(name, () => {
      const { fsys, ...rest } = openPaper(files())
      expect(typeof fsys.read).toBe('function')
      expect(notPlain(rest)).toBeNull()
      const clone = structuredClone(rest)
      expect(graphDiff(clone, rest)).toBeNull()
      // (the kept cells are the units themselves, and the units the project's: the clone keeps both)
      expect(clone.units).toBe(clone.project.units)
      expect(clone.kept.size).toBe(rest.kept.size)
      expect(rest.kept.size).toBeGreaterThanOrEqual(KEPT[name] ?? 0)
      for (const u of clone.kept) expect(clone.units.includes(u)).toBe(true)
    })
  }
  it('the check sees what a clone would not give back: a function, an object of a class, an accessor', () => {
    const { fsys: _fsys, ...rest } = openPaper(sample())
    class Cell { kind = 'cell' }
    expect(notPlain({ ...rest, meta: { ...rest.meta, guess: () => 'pdflatex' } })).toMatch(/a function/)
    expect(notPlain({ ...rest, units: [...rest.units, new Cell()] })).toMatch(/an object of a class/)
    expect(notPlain({ ...rest, meta: Object.defineProperty({ ...rest.meta }, 'main', { get: () => 'main.tex', enumerable: true }) })).toMatch(/an accessor/)
    expect(graphDiff(structuredClone({ ...rest, units: [...rest.units, new Cell()] }), { ...rest, units: [...rest.units, new Cell()] })).toMatch(/prototypes/)
  })
})
