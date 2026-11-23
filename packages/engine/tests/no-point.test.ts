// A unit whose marks the marked original should carry and on whose page TeX sets no point of it: the unit stays unlocated
// (own/own.ts ownOf: no start and no end point; locate/place.ts `unlocated: marks`), and the page reading's ink units take its
// printed lines instead. Two causes of our own, each shown here on content of our own (RED until each is fixed):
//
// 1. A note written in a paragraph that holds no text of its own (`\renewcommand{\thefootnote}{…}` then `\footnotetext[1]{…}`,
//    the commands of a title block's notes) is never written into the marked original. The walker makes the note a unit nested
//    in the paragraph it is building (source/latex-front.ts, the `footnote` branch: `inner.nested = true`, a nested piece of its
//    parent); the paragraph, fewer than two letters of its own, is then dropped (Builder.flush), and the note is left nested in no
//    unit. patch writes a nested unit only inside its outer one (`!u.nested` at the top level), so the note's bytes are copied
//    as the paper's own and its marks are written nowhere. Twelve notes of nine papers of the lab's 245 (all of them in scope).
//
// 2. A heading's marks are lost where a class expands the heading's argument before it sets it. LAYOUT_TEX's \axthmark (and the
//    placeholders' \axtpma, \axtpmm, \axtpm) is an expandable gate: \ifx\protect\@typeset@protect it becomes its \protected inner
//    command, else \@gobble, so that nothing of ours is written into a file or a running head. Under LaTeX's \protected@edef
//    \protect is \@unexpandable@protect, so a class that stores the argument that way before setting it takes every mark off:
//    REVTeX 4.0, which carries textcase v0.06 (1998) and sets \section's title through its \MakeTextUppercase (a \protected@edef
//    and then \uppercase), and thmtools' proof (thm-patch.sty: its optional argument through a \protected@edef). Made robust
//    alone (\protected), the mark survives the expansion but not the case change: \uppercase turns its name's letters (h5s) to
//    H5S, a point no reading names. Seventeen headings of four papers of the 245 (every \section of the three REVTeX 4.0 papers
//    and one proof's note). The property asked here is TeX's: after LaTeX's \protected@edef and \uppercase, the marks the marking
//    writes into the heading's argument still set the unit's own points, by the same names.
import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../src/compile/live.ts'
import { LAYOUT_CLASSES } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
const paperOf = (tex: string) => openPaper(new Map([['main.tex', enc(tex)]]))
/** the marked original's main file, as the prepare's marked compile writes it (the layout marks of every class) */
const markedOf = (tex: string) =>
  dec(originalFiles(paperOf(tex), { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
const LAST = 'Our own last paragraph, long enough to be a unit of its own.'

describe('a note written in a paragraph of no text of its own', () => {
  const forms: [string, string][] = [
    [
      'a \\footnotetext after the commands that set its mark',
      '\\renewcommand{\\thefootnote}{1}\n\\footnotetext[1]{A note of our own that stands alone in its paragraph.}\n\\renewcommand{\\thefootnote}{\\arabic{footnote}}',
    ],
    [
      'a \\footnotetext in a group of its own',
      '\\begingroup\n\\renewcommand{\\thefootnote}{\\fnsymbol{footnote}}\n\\footnotetext[1]{A note of our own set apart in a group.}\n\\endgroup',
    ],
    // (an unnumbered note of three forced lines, `{\let\thefootnote\relax\footnotetext{…}}`: its lines drawn run together
    // while its ink was an ink unit's, read off the glyphs with no break)
    [
      'an unnumbered \\footnotetext of three forced lines in a group',
      '{\\let\\thefootnote\\relax\\footnotetext{\n$^{a}$ A first line of our note. \\\\\n$^{b}$ A second line of ours. \\\\\n$^{c}$ A third line of ours.\n}}',
    ],
    // (a note in a paragraph of words: the rule otherwise holds)
    [
      'a \\footnote in a paragraph of words',
      'Words of ours before it.\\footnote{A note of ours in a paragraph.} Words after it.',
    ],
  ]
  for (const [what, block] of forms) {
    const tex = `\\documentclass{article}\n\\begin{document}\nOur own first paragraph, with a mark\\footnotemark[1] for a note set apart.\n\n${block}\n\n${LAST}\n\\end{document}\n`
    it(`${what}: no unit is left nested in no unit, and the note's two marks are written`, () => {
      const paper = paperOf(tex)
      const held = new Set(paper.units.flatMap((u) => u.pieces.flatMap((p) => (p.t === 'nested' ? [p.unit] : []))))
      const notes = paper.units.map((u, i) => [u, i] as const).filter(([u]) => u.kind === 'footnote')
      expect(notes).toHaveLength(1)
      const [note, i] = notes[0]!
      expect(!!note.nested && !held.has(note), 'nested in no unit').toBe(false)
      // (its forced breaks its own pieces, which its part states as breaks)
      expect(note.pieces.filter((p) => p.t === 'ph' && p.src === '\\\\')).toHaveLength(block.split('\\\\\n').length - 1)
      const marked = markedOf(tex)
      expect(marked).toContain(`\\axtmark{${i}s}`)
      expect(marked).toContain(`\\axtend{${i}e}`)
    })
  }
})

/** the definition the marked original's head gives a control word: its parameter text and its body, or null */
function definitionOf(head: string, cs: string): { protectedDef: boolean; params: string; body: string } | null {
  const m = new RegExp(String.raw`(\\protected)?\\def\\${cs}(?![A-Za-z@])((?:#\d)*)\{`).exec(head)
  if (!m) return null
  let depth = 1,
    k = m.index + m[0].length
  const from = k
  for (; k < head.length && depth > 0; k++) depth += head[k] === '{' ? 1 : head[k] === '}' ? -1 : 0
  return { protectedDef: !!m[1], params: m[2]!, body: head.slice(from, k - 1) }
}
/** LaTeX's \protected@edef over a run of our marks (control word, braced argument), as TeX expands each: a \protected one is
 *  kept as it is; one whose body tests \protect against \@typeset@protect takes \@gobble's branch there, itself and its
 *  argument gone */
function afterProtectedEdef(head: string, marks: readonly [string, string][]): [string, string][] {
  return marks.filter(([cs]) => {
    const d = definitionOf(head, cs)
    if (!d) throw new Error(`\\${cs} is not defined in the head`)
    if (d.protectedDef) return true
    if (/\\ifx\\protect\\@typeset@protect.*\\@gobble/.test(d.body)) return false
    throw new Error(`\\${cs}: a definition this test does not model`)
  })
}
/** TeX's \uppercase over a mark's argument: every letter upper case (its \uccode), every other character as it is */
const uppercased = (arg: string) => arg.replace(/[a-z]/g, (c) => c.toUpperCase())
/** the name of the point a mark sets, from its argument as its definition takes it: `\x#1{\inner{<pre>#1<post>}}` the argument
 *  between pre and post; a gate or a command of no parameter, the argument itself */
function pointName(head: string, cs: string, arg: string): string {
  const d = definitionOf(head, cs)!
  const built = d.params === '#1' ? /^\\[A-Za-z@]+\{([^{}#]*)#1([^{}#]*)\}$/.exec(d.body) : null
  return built ? `${built[1]}${arg}${built[2]}` : arg
}
/** the marks of ours written in the braced argument that follows `opener` in the marked file: [control word, argument] */
function marksIn(marked: string, opener: string): [string, string][] {
  const at = marked.indexOf(opener)
  expect(at, opener).toBeGreaterThanOrEqual(0)
  const open = opener.endsWith('[') ? '[' : '{',
    close = open === '[' ? ']' : '}'
  let depth = 1,
    k = at + opener.length
  for (; k < marked.length && depth > 0; k++) depth += marked[k] === open ? 1 : marked[k] === close ? -1 : 0
  const arg = marked.slice(at + opener.length, k - 1)
  return [...arg.matchAll(/\\(axt[A-Za-z@]*)\{([^{}]*)\}/g)].map((m) => [m[1]!, m[2]!])
}

describe("a heading's marks survive what a class does with the argument before it sets it", () => {
  const cases: [string, string, string][] = [
    [
      "a section title with a formula (REVTeX 4.0's textcase: \\protected@edef, then \\uppercase)",
      `\\documentclass{article}\n\\begin{document}\n\\section{Introduction to $x$ and the test}\n${LAST}\n\\end{document}\n`,
      '\\section{',
    ],
    [
      "a proof's note with a reference (thmtools' proof: its optional argument through \\protected@edef)",
      `\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n\\begin{theorem}\\label{t}Our own statement of a theorem.\\end{theorem}\n\\begin{proof}[Proof of Theorem \\ref{t}]\n${LAST}\n\\end{proof}\n\\end{document}\n`,
      '\\begin{proof}[',
    ],
  ]
  for (const [what, tex, opener] of cases) {
    it(`${what}: after LaTeX's \\protected@edef and \\uppercase the same points are set, by the same names`, () => {
      const marked = markedOf(tex)
      const head = marked.slice(0, marked.indexOf('\\begin{document}'))
      const written = marksIn(marked, opener)
      // (the heading's own two marks are among them: this is the unit the test is about)
      const heading = paperOf(tex).units.findIndex((u) => u.kind === 'heading')
      const names = written.map(([cs, arg]) => pointName(head, cs, arg))
      expect(names).toContain(`h${heading}s`)
      expect(names).toContain(`h${heading}e`)
      const kept = afterProtectedEdef(head, written)
      expect(kept.map(([cs, arg]) => pointName(head, cs, uppercased(arg)))).toEqual(names)
    })
  }
})
