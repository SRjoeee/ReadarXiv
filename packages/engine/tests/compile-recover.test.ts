import { describe, expect, it } from 'vitest'
import { compileMarked, judge, regionOf, texErrors } from '../src/compile/recover.ts'
import { markSource } from '../src/marks/mark.ts'
import { NO_DEFINITIONS } from '../src/source/definitions.ts'
import { readSource } from '../src/source/read.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()
const paper = (body: string) => {
  const files = new Map([
    ['main.tex', enc.encode(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)],
  ])
  const tree = { main: 'main.tex', files }
  return { tree, doc: readSource(tree, NO_DEFINITIONS) }
}
const PDF = new Uint8Array([37, 80, 68, 70])
const ran = (errors = '') => `This is pdfTeX, Version 3.141592653 (TeX Live 2025)\n${errors}\nAXT-END\n`
/** a TeX error as the log writes it: the message, the line of input and the text before and after the place */
const error = (message: string, line: number, before: string, after: string, context: string[] = []) =>
  `! ${message}\n${context.join('\n')}${context.length ? '\n' : ''}l.${line} ${before}\n${' '.repeat(before.length + 3)}${after}\n`

describe('the recovery of a marked compile', () => {
  it('reads TeX’s errors: the message, the line of input, the text around the place, the context above it', () => {
    const log = ran(error('Undefined control sequence.', 7, 'We see \\foo', ' here', ['<argument> \\axtmark {3s}x']))
    expect(texErrors(log)).toEqual([
      {
        message: 'Undefined control sequence.',
        line: 7,
        before: 'We see \\foo',
        after: 'here',
        context: ['<argument> \\axtmark {3s}x'],
      },
    ])
  })
  it('judges a compile by its run through and by its errors the unmarked pass has not, our marks aside', () => {
    const own = ran(error('Undefined control sequence.', 7, 'We see \\foo', ' here'))
    // (the paper's own error, with a mark of ours before it in the marked log: the same error)
    expect(
      judge(
        { pdf: PDF, log: ran(error('Undefined control sequence.', 9, 'We \\axtpma{p0.1a}see \\foo', ' here')) },
        own,
      ).ok,
    ).toBe(true)
    expect(judge({ pdf: PDF, log: ran(error('Missing } inserted.', 9, 'x', 'y')) }, own)).toMatchObject({
      ok: false,
      errors: [{ line: 9 }],
    })
    expect(judge({ pdf: PDF, log: 'This is pdfTeX\n! Emergency stop.\n' }, '').why).toBe('TeX did not run through')
    expect(judge({ pdf: null, log: ran() }, '').why).toBe('no PDF')
    // (a letter a font lacks is the paper's text, never the marks')
    expect(
      judge({ pdf: PDF, log: ran(error('Missing character: There is no ψ (U+03C8) in font cmr10!', 3, 'a', 'b')) }, '')
        .ok,
    ).toBe(true)
  })
  it('names the region: the units with a mark on the line TeX names, and those whose marks its context shows', () => {
    const { tree, doc } = paper('First words here.\n\nSecond words here.\n\nThird words.')
    const { tree: marked, plan } = markSource(tree, doc)
    const lines = dec.decode(marked.files.get('main.tex')).split('\n')
    const n = lines.findIndex((l) => l.includes('Second words')) + 1
    const e = texErrors(ran(error('Missing } inserted.', n, 'Second words', ' here.')))
    expect([...regionOf(e, plan, tree, marked).units]).toEqual([1])
    const c = texErrors(ran(error('Missing } inserted.', 1, 'zzz', 'zzz', ['<argument> \\axtmark {2s}Thi...'])))
    expect([...regionOf(c, plan, tree, marked).units]).toEqual([2])
  })
  it('compiles once more without the region’s marks, then with the units’ marks alone, else no layer and why', async () => {
    const { tree, doc } = paper('First words $x$ here.\n\nSecond words $y$ here.')
    const steps: string[] = []
    // (a compile whose error stands on the second paragraph's line while that paragraph is marked)
    const second = async (fails: (line: string, text: string) => boolean) =>
      compileMarked({
        tree,
        doc,
        options: {},
        unmarkedLog: ran(),
        compile: async (m, plan, step) => {
          steps.push(step)
          const text = dec.decode(m.files.get('main.tex'))
          const lines = text.split('\n')
          const n = lines.findIndex((l) => l.includes('Second words')) + 1
          return {
            pdf: PDF,
            log: fails(lines[n - 1] as string, text.slice(plan.head))
              ? ran(error('Missing } inserted.', n, 'Second words', ' $y$'))
              : ran(),
          }
        },
      })
    const a = await second((l) => l.includes('\\axtmark{1s}'))
    expect(a).toMatchObject({ ok: true, step: 'region' })
    expect(a.attempts.map((x) => [x.step, x.ok, x.unmarked])).toEqual([
      ['marked', false, []],
      ['region', true, [1]],
    ])
    expect(a.ok && a.plan.units[1]).toMatchObject({ marked: false, why: 'the recovery: unmarked' })
    // (an error wherever a placeholder is marked, raised on the second paragraph's line: the units' marks alone stand)
    steps.length = 0
    const b = await second((_l, text) => text.includes('\\axtpm'))
    expect(steps).toEqual(['marked', 'region', 'units'])
    expect(b).toMatchObject({ ok: true, step: 'units' })
    // (an error whatever is marked: no layer, and why)
    const c = await second(() => true)
    expect(c).toMatchObject({ ok: false })
    expect(!c.ok && c.why).toMatch(/^the marked compile failed with unit marks only: errors the unmarked pass has not/)
    expect(c.attempts).toHaveLength(3)
  })
})
