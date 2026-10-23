import { describe, expect, it, vi } from 'vitest'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// markedOfPaper never throws (layout/paper.mjs; the web's prepare child calls it bare): a throw of the layout guard's own
// (layout/guard.mjs) is no paper's refusal. Before the compile the brace check is skipped; after it the marked original is
// taken as it was before the guard (ran through with a PDF, else the compile's refusal). A failed allocation goes on as itself

// (`skip`: the calls of the check answered as they are before it throws)
const fault = vi.hoisted(() => ({ at: null as null | 'braces' | 'aux', error: null as unknown, skip: 0 }))
vi.mock('@/pdf-reader/engine/layout/guard.mjs', async importOriginal => {
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
const stopped: Compiled = { ok: true, pdf: PDF, log: `${TEX}! Undefined control sequence.\nl.3 x\n! Emergency stop.\n` }
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
/** an error TeX logs on the marked main file's line that holds `text`, its place before it */
const errorOn = (req: CompileRequest, text: string) => {
  const lines = new TextDecoder().decode(req.overrides.get('main.tex')).split('\n'), n = lines.findIndex(l => l.includes(text))
  const k = (lines[n] as string).indexOf(text)
  return `! Undefined control sequence.\n<recently read> \\foo \n\nl.${n + 1} ${(lines[n] as string).slice(0, k)}\n${(lines[n] as string).slice(k)}\n`
}
const PDF1 = enc('%PDF-1.7 the first remedy')

describe('markedOfPaper: a throw of the guard\'s own is no refusal', () => {
  it('skips the brace check that threw: the marked original compiled as before, no guard record', async () => {
    fault.at = 'braces'
    fault.error = new Error('the check broke')
    try {
      const c = compiler([PROBE, ran])
      expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: { probe: expect.any(Number), compile: expect.any(Number) } })
      expect(c.asked).toHaveLength(2)
      expect(new TextDecoder().decode(c.asked[1]?.overrides.get('main.tex'))).toContain('\\axtmark{0s}')
    } finally { fault.at = null }
  })

  it('takes the marked original as before the guard where its checks threw: one that ran through, else the compile\'s refusal', async () => {
    fault.at = 'aux'
    fault.error = new TypeError('the check broke')
    try {
      const c = compiler([PROBE, ran])
      expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF })
      expect(c.asked).toHaveLength(2)
      // (one that did not run through: the auxiliary files are read of the remedy's compile, which did, and throw there)
      const d = compiler([PROBE, stopped, ran])
      expect(await markedOfPaper(paperOf(), { compile: d.compile })).toMatchObject({ refused: 'compile', why: 'the marked original did not run through; the layout guard failed: the check broke' })
    } finally { fault.at = null }
  })

  it('takes no marked original of more pages than arXiv\'s where its checks threw, the base page asked: as the guard\'s own rule', async () => {
    fault.at = 'aux'
    fault.error = new Error('the check broke')
    try {
      const five: Compiled = { ...ran, log: `${TEX}AXT-END\nOutput written on main.pdf (5 pages, 9 bytes).\n` }
      const c = compiler([PROBE, five])
      expect(await markedOfPaper(paperOf(), { compile: c.compile, pages: 4 })).toMatchObject({ refused: 'compile', why: 'the marked original has 5 pages, arXiv\'s PDF 4; the layout guard failed: the check broke' })
      expect(c.asked).toHaveLength(2)
      // (without the base page, or with arXiv's pages, as before: the marked original taken)
      expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([PROBE, five]).compile, pages: 4 })).toMatchObject({ pdf: PDF })
      expect(await markedOfPaper(paperOf(), { compile: compiler([PROBE, five]).compile, pages: 5 })).toMatchObject({ pdf: PDF })
    } finally { fault.at = null }
  })

  it('keeps a remedy that passed where a later check throws: not the marked original that failed', async () => {
    // (the marked original stops at an error in unit 0; unit 0 unmarked and the names off, it passes; the smaller remedy's
    // checks then throw)
    fault.at = 'aux'
    fault.error = new Error('the check broke')
    fault.skip = 1
    try {
      const c = asking((req, n) => (n === 0 ? PROBE : n === 1 ? { ...stopped, log: `${TEX}${errorOn(req, 'One paragraph')}! Emergency stop.\n` } : n === 2 ? { ...ran, pdf: PDF1 } : ran))
      const made = await markedOfPaper(paperOf(), { compile: c.compile })
      expect(c.asked).toHaveLength(4)
      expect(made).toMatchObject({ pdf: PDF1, guard: { unmarked: [0], names: false, judged: 'the layout guard failed: the check broke' } })
    } finally { fault.at = null; fault.skip = 0 }
  })

  it('lets a failed allocation go on as itself', async () => {
    for (const at of ['braces', 'aux'] as const) {
      fault.at = at
      fault.error = failedAllocation()
      try { await expect(markedOfPaper(paperOf(), { compile: compiler([PROBE, ran]).compile })).rejects.toBe(fault.error) } finally { fault.at = null }
    }
    // (in the guard's own compiles too: a remedy's marked original, and the unmarked original, never a paper's refusal)
    const memory = failedAllocation()
    const remedy = asking((req, n) => (n === 0 ? PROBE : n === 1 ? { ...stopped, log: `${TEX}${errorOn(req, 'One paragraph')}! Emergency stop.\n` } : memory as Error))
    await expect(markedOfPaper(paperOf(), { compile: remedy.compile })).rejects.toBe(memory)
    expect(remedy.asked).toHaveLength(3)
    const unmarked = asking((req, n) => (n === 0 ? PROBE : n === 1 ? { ...ran, log: `${TEX}${errorOn(req, 'One paragraph')}AXT-END\nOutput written on main.pdf (2 pages, 9 bytes).\n` } : memory as Error))
    await expect(markedOfPaper(paperOf(), { compile: unmarked.compile })).rejects.toBe(memory)
    expect(new TextDecoder().decode(unmarked.asked[2]?.overrides.get('main.tex'))).not.toContain('\\axtmark')
  })

  it('lets a failed allocation of the host\'s page count go on; any other failure of it leaves the page check out', async () => {
    const memory = failedAllocation()
    await expect(markedOfPaper(paperOf(), { compile: compiler([PROBE, ran]).compile, pages: async () => { throw memory } })).rejects.toBe(memory)
    const c = compiler([PROBE, ran])
    expect(await markedOfPaper(paperOf(), { compile: c.compile, pages: async () => { throw new Error('arXiv\'s PDF is not here') } })).toMatchObject({ pdf: PDF })
    expect(c.asked).toHaveLength(2)
  })

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
