// The rebuilt prepare's statements (marks.ts STATEMENTS_TEX, lane cm-b's: the separations by class and the statements after
// them), asked by one option (`statements`) that compiledOf sets and that travels through markedOfPaper and originalFiles:
// off, the marked files are today's bytes; on, the main file carries the constant right after the layout marks, on their line.
// The constant is replaced here by one of this test's own, so that the test holds whatever the constant is (an empty
// placeholder on lane cm-a's branch alone, cm-b's TeX once the two are merged).
import { describe, expect, it, vi } from 'vitest'

const SENTINEL = vi.hoisted(() => '\\def\\axtstatementsoftest{}')
vi.mock('../src/marks/marks.ts', async (real) => ({
  ...(await real<typeof import('../src/marks/marks.ts')>()),
  STATEMENTS_TEX: SENTINEL,
}))
const { openPaper, originalFiles, reducedFiles } = await import('../src/compile/live.ts')
const { LAYOUT_CLASSES, LAYOUT_TEX } = await import('../src/marks/marks.ts')
const { markedOfPaper } = await import('../src/compile/paper.ts')

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b)
const SOURCE =
  '\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\nA paragraph of words.\n\\end{document}\n'
const readme = (compiler: string) =>
  JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], process: { compiler } })
const paperOf = (more: [string, string][] = []) =>
  openPaper(new Map([['main.tex', enc(SOURCE)], ...more.map(([p, t]): [string, Uint8Array] => [p, enc(t)])]))

describe('the statements option', () => {
  it("off: the marked files are today's bytes; on: the main file carries the statements right after the layout marks, every line where it was", () => {
    for (const more of [[], [['00README.json', readme('latex')]]] as [string, string][][]) {
      for (const reduced of [false, true]) {
        const off = originalFiles(paperOf(more), { lines: true, layout: LAYOUT_CLASSES, reduced })
        const on = originalFiles(paperOf(more), { lines: true, layout: LAYOUT_CLASSES, reduced, statements: true })
        expect(dec(off.get('main.tex'))).not.toContain(SENTINEL)
        // (a reduced compile writes none: the statements state no ownership and no text, Q2)
        if (reduced) expect(dec(on.get('main.tex'))).toBe(dec(off.get('main.tex')))
        else
          expect(dec(on.get('main.tex'))).toBe(
            dec(off.get('main.tex')).replace(LAYOUT_TEX, () => `${LAYOUT_TEX}${SENTINEL}`),
          )
        expect(dec(on.get('main.tex')).split('\n')).toHaveLength(dec(off.get('main.tex')).split('\n').length)
        expect([...on.keys()]).toEqual([...off.keys()])
      }
    }
    // (a request's files reduced: the statements left out with the optional points, as originalFiles `reduced` writes them)
    for (const more of [[], [['00README.json', readme('latex')]]] as [string, string][][]) {
      const on = originalFiles(paperOf(more), { lines: true, layout: LAYOUT_CLASSES, statements: true })
      const reduced = originalFiles(paperOf(more), {
        lines: true,
        layout: LAYOUT_CLASSES,
        statements: true,
        reduced: true,
      })
      expect(dec(reducedFiles(on, 'main.tex').get('main.tex'))).toBe(dec(reduced.get('main.tex')))
    }
    // (no layout marks, no statements: the bytes as before)
    expect(dec(originalFiles(paperOf(), { lines: true, statements: true }).get('main.tex'))).toBe(
      dec(originalFiles(paperOf(), { lines: true }).get('main.tex')),
    )
  })
  it("markedOfPaper's `statements` writes them into every marked request; absent, none", async () => {
    const PROBE = { ok: true, log: 'This is pdfTeX\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\n' }
    const asked = async (o: { statements?: boolean }) => {
      const qs: { overrides: Map<string, Uint8Array> }[] = []
      await markedOfPaper(paperOf(), {
        final: false,
        ...o,
        compile: async (q) => {
          qs.push(q)
          return qs.length === 1 ? PROBE : { ok: true, pdf: enc('%PDF'), log: 'This is pdfTeX\nAXT-END\n' }
        },
      })
      return qs.map((q) => dec(q.overrides.get('main.tex')).includes(SENTINEL))
    }
    expect(await asked({})).toEqual([false, false])
    expect(await asked({ statements: true })).toEqual([false, true])
  })
})
