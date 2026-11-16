import { describe, expect, it, vi } from 'vitest'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// markedOfPaper never throws (layout/paper.mjs; the web's prepare child calls it bare): a throw of the layout guard's own
// (layout/guard.mjs) is no paper's refusal. Before the compile the brace check is skipped; after it the marked original is
// taken as it was before the guard (ran through with a PDF, else the compile's refusal). A failed allocation goes on as itself

// (`skip`: the calls of the check answered as they are before it throws)
const fault = vi.hoisted(() => ({ at: null as null | 'braces' | 'aux', error: null as unknown, skip: 0 }))
// (the guard where its code lives: the moved compile/paper.ts imports it there, not through its old path)
vi.mock('../../packages/engine/src/compile/guard.ts', async importOriginal => {
  const real = await importOriginal<typeof import('@/pdf-reader/engine/layout/guard.mjs')>()
  const thrower = <F extends (...a: never[]) => unknown>(at: 'braces' | 'aux', f: F) => ((...a: Parameters<F>) => { if (fault.at === at && fault.skip-- <= 0) throw fault.error; return f(...a) }) as F
  return { ...real, unbalancedUnits: thrower('braces', real.unbalancedUnits), auxUnits: thrower('aux', real.auxUnits) }
})

const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = () => openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\nOne paragraph of words here.\n\nAnother paragraph of words.\n\\end{document}\n')]]))
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025)\n'
const PROBE: Compiled = { ok: true, log: `${TEX}LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\n` }
const PDF = enc('%PDF-1.7 the marked original')
const ran: Compiled = { ok: true, pdf: PDF, log: `${TEX}AXT-END\nOutput written on main.pdf (2 pages, 9 bytes).\n`, aux: '\\relax\n' }
function compiler(answers: Compiled[]) {
  const asked: CompileRequest[] = []
  return { asked, compile: async (req: CompileRequest): Promise<Compiled> => { asked.push(req); return answers[asked.length - 1] ?? { ok: false, error: 'not asked for' } } }
}
/** a real failed allocation, as V8 throws it */
function failedAllocation(): unknown {
  try { void new ArrayBuffer(2 ** 50) } catch (e) { return e }
  throw new Error('this machine gave a 1 PiB ArrayBuffer')
}

/** a compiler whose answers are made of what it is asked (`answer(req, n)`, n from 0) */
function asking(answer: (req: CompileRequest, n: number) => Compiled | Error) {
  const asked: CompileRequest[] = []
  return { asked, compile: async (req: CompileRequest): Promise<Compiled> => { asked.push(req); const a = answer(req, asked.length - 1); if (a instanceof Error) throw a; return a } }
}

describe('markedOfPaper: a throw of the guard\'s own is no refusal', () => {

  it('lets a failed allocation of the probe\'s, the marked compile\'s, or the marked PDF\'s reading go on, never a stage\'s refusal', async () => {
    const memory = failedAllocation()
    await expect(markedOfPaper(paperOf(), { compile: asking(() => memory as Error).compile })).rejects.toBe(memory)
    await expect(markedOfPaper(paperOf(), { compile: asking((_, n) => (n === 0 ? PROBE : memory as Error)).compile })).rejects.toBe(memory)
    const { layoutMarksOfPaper } = await import('@/pdf-reader/engine/layout/paper.mjs')
    const OPS = {}
    await expect(layoutMarksOfPaper(paperOf(), { compile: compiler([PROBE, ran]).compile, OPS, open: async () => { throw memory } })).rejects.toBe(memory)
    await expect(layoutMarksOfPaper(paperOf(), { compile: compiler([PROBE, ran]).compile, OPS, open: async () => ({ doc: { numPages: 0 }, close: async () => { throw memory } }) })).rejects.toBe(memory)
    // (any other failure is the stage's refusal, as before)
    expect(await markedOfPaper(paperOf(), { compile: asking((_, n) => (n === 0 ? PROBE : new Error('the compiler threw'))).compile })).toMatchObject({ refused: 'compile' })
  })
})
