// @vitest-environment node
// Conditions of the front half whose other side none of the recorded inputs took (the papers, the holdout, the third set and the
// tests: lab/rules' ledger), each fed that side here through its module's public reading. Each side is a valid input, so the
// condition stays, and decides there: red where it is folded to the outcome the papers gave, green as it stands.
import { describe, expect, it } from 'vitest'
import { layoutMarking, MARK_CLASSES } from '../../src/marks/marks.ts'
import { ownOf } from '../../src/own/own.ts'
import { displayLetters, inMemory, loadProject } from '../../src/source/latex-front.ts'

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n\\usepackage{xspace}\\usepackage{amsmath}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`
const unitsOf = (body: string, preamble = '') =>
  loadProject(inMemory(new Map([['main.tex', enc(doc(body, preamble))]])), 'main.tex', {}).units
const shown = (pieces: readonly Piece[]) => pieces.map((p) => (p.t === 'text' ? p.s : `[${p.src}]`)).join('')

describe("a paper's macro whose expansion sets words, nested (source/latex-front.ts EXPANSION_DEPTH)", () => {
  /** `n` macros, each setting a word, its argument, and a call of the next with a word of its own; the last a word and its argument */
  const nested = (n: number) =>
    Array.from({ length: n }, (_, k) =>
      k === n - 1
        ? `\\newcommand{\\m${'abcde'[k]}}[1]{Word${k} #1}`
        : `\\newcommand{\\m${'abcde'[k]}}[1]{Word${k} #1 \\m${'abcde'[k + 1]}{w${k}}}`,
    ).join('\n')
  it('is its expansion as text up to three nested expansions; past them the call is one placeholder, its source as written', () => {
    expect(unitsOf('The words of \\ma{inner} said here.', nested(3)).map((u) => shown(u.pieces).trim())).toEqual([
      'The words of Word0 inner Word1 w0 Word2 w1 said here.',
    ])
    expect(unitsOf('The words of \\ma{inner} said here.', nested(4)).map((u) => shown(u.pieces).trim())).toEqual([
      'The words of [\\ma{inner}] said here.',
    ])
  })
})

describe("a display's letters with the paper's macros put in (source/latex-front.ts displayLetters)", () => {
  it('puts a macro in where the text it makes stays within 20,000 code units; past them, the pass is not taken', () => {
    expect(displayLetters('\\rmx + y', new Map([['rmx', '\\mathbf{x}']]))).toBe('xy mathbf')
    // (a body of 30,000 letters: the source as it was, the macro's name read as a command's)
    expect(displayLetters('\\huge + y', new Map([['huge', 'x'.repeat(30000)]]))).toBe('y huge')
  })
})

/** a page of glyphs, one unit wide each, from x 10 on the baseline 700: `{ s }` a run of characters (`size`, 10 by default;
 *  `dy` above the baseline), `{ dx }` a gap before the next glyph, `{ pt }` a point */
type Item = { s: string; size?: number; dy?: number } | { dx: number } | { pt: string }
function page(items: Item[]) {
  const glyphs: { u: string; x0: number; x1: number; y: number; size: number; top: number; bottom: number }[] = []
  const points: { name: string; glyph: number; box: number }[] = []
  let x = 10
  for (const it of items) {
    if ('s' in it)
      for (const u of it.s) {
        const y = 700 + (it.dy ?? 0),
          size = it.size ?? 10
        glyphs.push({ u, x0: x, x1: x + 5, y, size, top: y + 0.7 * size, bottom: y - 0.2 * size })
        x += 5
      }
    else if ('dx' in it) x += it.dx
    else points.push({ name: it.pt, glyph: glyphs.length, box: 0 })
  }
  return { glyphs, points, boxes: [], paths: [], boxAt: glyphs.map(() => 0), view: [0, 0, 612, 792] as [number, number, number, number] }
}
/** the text of each group on the pages */
function groupsOf(r: ReturnType<typeof ownOf>, pages: readonly ReturnType<typeof page>[]) {
  const out: Record<string, string> = {}
  r.glyphs.forEach((G, p) => {
    G.forEach((g, i) => {
      if (g) out[g] = (out[g] ?? '') + pages[p]!.glyphs[i]!.u
    })
  })
  return out
}

describe("a babel name's counter and number on its line, set under 5 pt (own/own.ts MR 6b and 6c)", () => {
  // (a quarter of the larger size off the name's baseline, of 5 pt at the least: the name and its counter set at 4 pt, the
  // counter 1.1 pt off, within a quarter of 5 and past a quarter of 4)
  it("gives the name the counter TeX set after it, a glyph 1.1 pt off its baseline at 4 pt: on the name's line", () => {
    const pages = [page([{ pt: 'n3.appendix.s' }, { s: 'Appendix', size: 4 }, { pt: 'n3.appendix.e' }, { dx: 1.5 }, { s: 'A', size: 4, dy: 1.1 }])]
    expect(groupsOf(ownOf(pages, { units: [] }), pages)).toEqual({ n3: 'AppendixA' })
  })
  it("gives the name the number TeX set right before it, a glyph 1.1 pt off its baseline at 4 pt: on the name's line", () => {
    const pages = [page([{ s: '9.', size: 4, dy: 1.1 }, { dx: 2 }, { pt: 'n1.ref.s' }, { s: 'REFERENCES', size: 4 }, { pt: 'n1.ref.e' }])]
    expect(groupsOf(ownOf(pages, { units: [] }), pages)).toEqual({ 'n1.l': '9.', n1: 'REFERENCES' })
  })
})

describe("a mark set before a unit's first word, smaller than it and on its baseline (own/own.ts gluedMark)", () => {
  it("is no script glued to the word: not the unit's lead, left the original's ink where it stands (labelKept)", () => {
    // (as 2604.14228v3's "†Corresponding" but the mark on the word's baseline: a smaller glyph, no superscript)
    const notes = [
      { kind: 'affiliation', src: 'These' },
      { kind: 'affiliation', src: 'Corr' },
    ]
    const at = (dy: number) => {
      const pg = page([{ pt: '0s' }, { s: 'These' }, { pt: '0e' }, { s: ',' }, { dx: 4 }, { s: '#' }, { pt: '1s' }, { s: 'Corr' }, { pt: '1e' }])
      const i = pg.glyphs.findIndex((g) => g.u === '#')
      pg.glyphs[i] = { u: '†', x0: 45.5, x1: 48.5, y: 700 + dy, size: 6, top: 709, bottom: 702 }
      return [pg]
    }
    // (raised, it is the word's lead: the condition's other side beside it)
    const raised = at(4)
    expect(groupsOf(ownOf(raised, { units: notes }), raised)).toEqual({ u0: 'These,', u1: 'Corr', 'u1.l': '†' })
    const level = at(0)
    const r = ownOf(level, { units: notes })
    expect(groupsOf(r, level)).toEqual({ u0: 'These,', u1: 'Corr' })
    expect(r.units.get(1)?.labelKept).toBe(true)
  })
})

describe('a placeholder that may read the token after it: a prefix past white space, \\xspace (marks/marks.ts LOOKS_AHEAD)', () => {
  const marked = (body: string) =>
    layoutMarking(unitsOf(body), MARK_CLASSES, {}).units.map((u) => shown(u.pieces as Piece[]).trim())
  it("gives the piece after \\protect no mark where white space stands between them: TeX skips it, the pair one command", () => {
    // (TeX's tokenizer skips the space after a control word: `\protect \eqref` is `\protect\eqref`, and a mark between them would
    // take the \protect and be written to the list of figures as itself)
    expect(marked('\\begin{figure}\\caption{See \\protect \\eqref{eq:1} for the words here.}\\end{figure}')).toEqual([
      'See [\\protect] [\\eqref{eq:1}] for the words here.',
    ])
    // (glued, the pair's marks stand before the prefix)
    expect(marked('\\begin{figure}\\caption{See \\protect\\eqref{eq:1} for the words here.}\\end{figure}')).toEqual([
      'See [\\axtpma{p0.2a}][\\protect][\\eqref{eq:1}][\\axtpm{p0.2b}] for the words here.',
    ])
    // (a second \protect: the piece after it is the first's next token's, as TeX reads the pair)
    expect(marked('Words before \\protect\\protect\\ref{fig:a} and words after it here.')).toEqual([
      'Words before [\\protect][\\protect][\\ref{fig:a}] and words after it here.',
    ])
  })
  it('gives the piece after \\xspace no mark: \\xspace reads the next token to decide on its space', () => {
    expect(marked('The model\\xspace \\cite{a} is good and words here.')).toEqual([
      'The model[\\xspace] [\\cite{a}] is good and words here.',
    ])
    expect(marked('The model\\xspace\\cite{a} is good and words here.')).toEqual([
      'The model[\\xspace][\\cite{a}] is good and words here.',
    ])
    // (a control word that reads nothing after it, the kernel's \relax: the citation has both its marks)
    expect(marked('The model\\relax \\cite{a} is good and words here.')).toEqual([
      'The model[\\relax] [\\axtpma{p0.3a}][\\cite{a}][\\axtpm{p0.3b}] is good and words here.',
    ])
  })
})
