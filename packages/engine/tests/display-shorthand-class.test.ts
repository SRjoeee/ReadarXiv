// A display a paper's own macro sets (`\be … \ee`, which the source reader reads as one placeholder and states a display's,
// PhPiece.closes) is a display to the marking too: its class the source reader's statement, never its spelling. Read by its
// spelling it was a paper's macro (marks.ts classOf `macro`), which may read what follows it (LOOKS_AHEAD): the formula or the
// piece after it got no mark, and the display's own opening was blocked by it (an opening alone, an unmarked piece after it). A
// spelled display reads nothing after it, and so does this one. Content of our own, through the source reader and the marking.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { classOf, LAYOUT_CLASSES, layoutMarking, looksAhead } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
const PREAMBLE = '\\usepackage{amsmath}\n\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\n'
function marked(body: string) {
  const paper = openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${PREAMBLE}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  )
  const { units } = layoutMarking(paper.units, LAYOUT_CLASSES)
  const at = (begins: string) => {
    for (const [i, u] of (paper.units as { pieces: Ph[] }[]).entries()) {
      const k = u.pieces.findIndex((p) => p.t === 'ph' && (p.src ?? '').startsWith(begins))
      if (k >= 0)
        return {
          piece: u.pieces[k]!,
          name: `p${i}.${k}`,
          written: (units[i]!.pieces as Ph[]).map((p) => p.src ?? p.s).join(''),
        }
    }
    throw new Error(`no placeholder ${begins}`)
  }
  return at
}

describe("a display a paper's macro sets is a display to the marking", () => {
  it('its class is `display`, and it reads nothing after it', () => {
    const at = marked('The weights we keep are summed as\n\\be\nw = a + b .\n\\ee\nwhere every weight is read once.')
    const be = at('\\be')
    expect(classOf(be.piece as never)).toBe('display')
    expect(looksAhead(be.piece as never)).toBe(false)
  })
  it('the formula right after it keeps its marks', () => {
    const at = marked('The weights we keep are summed as\n\\be\nw = a + b .\n\\ee\n$x$ is read once.')
    const x = at('$x$')
    expect(x.written).toContain(`{${x.name}a}`)
  })
  it('a spelled display reads as before (control)', () => {
    const at = marked(
      'The weights we keep are summed as\n\\begin{equation}\nw = a + b .\n\\end{equation}\n$x$ is read once.',
    )
    expect(classOf(at('\\begin{equation}').piece as never)).toBe('display')
    const x = at('$x$')
    expect(x.written).toContain(`{${x.name}a}`)
  })
  it('a paper macro that sets no display stays a paper’s macro (control)', () => {
    const at = marked(
      'Our words of a paragraph with \\sys{} and $x$ after it.'.replace('\\sys{}', '\\textbf{a}\\sys{}'),
    )
    expect(classOf(at('\\sys').piece as never)).toBe('macro')
  })
})
