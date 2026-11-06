import { describe, expect, it } from 'vitest'
import { markSource } from '../../src/marks/mark.ts'
import { FRAMES_TEX, SENTENCE_TEX, STATE_TEX } from '../../src/marks/statements.ts'
import { LAYOUT_TEX } from '../../src/marks/tex.ts'
import { NO_DEFINITIONS } from '../../src/source/definitions.ts'
import { readSource } from '../../src/source/read.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()
const paper = (body: string, preamble = '') => {
  const files = new Map([
    ['main.tex', enc.encode(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)],
  ])
  const tree = { main: 'main.tex', files }
  return { tree, doc: readSource(tree, NO_DEFINITIONS) }
}

describe('markSource: the marks written into the paper’s own bytes, and the plan', () => {
  it('writes a unit’s start, end and line probe and a formula’s marks where today’s writer puts them, comments kept', () => {
    const { tree, doc } = paper('We see $x$ here % a comment\nand more words.')
    const { tree: marked, plan } = markSource(tree, doc)
    const text = dec.decode(marked.files.get('main.tex'))
    expect(text.startsWith(FRAMES_TEX)).toBe(true)
    expect(text).toContain(STATE_TEX)
    expect(text).toContain(LAYOUT_TEX)
    expect(text).toContain(
      '\\axtlines{0}\\leavevmode\\axtmark{0s}We see \\axtpmm{p0.1a}$x$\\axtpm{p0.1b} here % a comment\nand more words.\\axtend{0e}',
    )
    expect(plan.marks.map((m) => [m.name, m.kind, m.pieceId])).toEqual([
      ['0l', 'lines', null],
      ['0s', 'start', null],
      ['p0.1a', 'open', 'e0'],
      ['p0.1b', 'close', 'e0'],
      ['0e', 'end', null],
    ])
    // (each mark's offset is where it stands in the paper's own text)
    const source = dec.decode(tree.files.get('main.tex'))
    expect(source.slice(plan.marks[2]?.at, (plan.marks[2]?.at ?? 0) + 3)).toBe('$x$')
    expect(text.slice(plan.head).replace(/\\(?:axtlines|leavevmode\\axtmark|axtpmm|axtpm|axtend)\{[^}]*\}/g, '')).toBe(
      source,
    )
  })
  it('marks a table’s cells with their own marks and a heading with its own', () => {
    const { tree, doc } = paper(
      '\\section{A heading here}\n\\begin{tabular}{ll}\nOne cell & Two cell \\\\\n\\end{tabular}',
    )
    const { plan } = markSource(tree, doc)
    expect(plan.marks.map((m) => m.name)).toEqual(['h0s', 'h0e', 't1s', 't1e', 't2s', 't2e'])
  })
  it('writes a mark before a CR LF line end, never between the CR and the LF (TeX would drop it with the CR)', () => {
    const src = '\\documentclass{article}\r\n\\begin{document}\r\nWe see here.\r\n\r\n\\end{document}\r\n'
    const tree = { main: 'main.tex', files: new Map([['main.tex', new TextEncoder().encode(src)]]) }
    const doc = readSource(tree, NO_DEFINITIONS)
    const text = new TextDecoder().decode(markSource(tree, doc).tree.files.get('main.tex'))
    expect(text).toContain('here.\\axtend{0e}\r\n')
    expect(text).not.toMatch(/\r\\axt/)
  })
  it('writes a sentence end’s mark after a stop that more text follows, where the file holds the text (sentences on)', () => {
    const { tree, doc } = paper('First one. Second (two).  Third? Yes.')
    const { tree: marked, plan } = markSource(tree, doc, { sentences: true })
    const text = dec.decode(marked.files.get('main.tex'))
    expect(text).toContain('First one.\\axtsf{s0.0} Second (two).\\axtsf{s0.1}  Third?\\axtsf{s0.2} Yes.\\axtend{0e}')
    expect(plan.marks.filter((m) => m.kind === 'sentence').map((m) => m.name)).toEqual(['s0.0', 's0.1', 's0.2'])
    expect(text).toContain(SENTENCE_TEX)
    expect(dec.decode(markSource(tree, doc).tree.files.get('main.tex'))).not.toContain('axtsf')
  })
})
