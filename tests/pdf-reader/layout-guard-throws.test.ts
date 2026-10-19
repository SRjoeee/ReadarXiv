import { describe, expect, it, vi } from 'vitest'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// markedOfPaper never throws (layout/paper.mjs; the web's prepare child calls it bare): a throw of the layout guard's own
// (layout/guard.mjs) is no paper's refusal. Before the compile the brace check is skipped; after it the marked original is
// taken as it was before the guard (ran through with a PDF, else the compile's refusal). A failed allocation goes on as itself

const fault = vi.hoisted(() => ({ at: null as null | 'braces' | 'aux', error: null as unknown }))
vi.mock('@/pdf-reader/engine/layout/guard.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/pdf-reader/engine/layout/guard.mjs')>()
  const thrower = <F extends (...a: never[]) => unknown>(at: 'braces' | 'aux', f: F) => ((...a: Parameters<F>) => { if (fault.at === at) throw fault.error; return f(...a) }) as F
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

describe('markedOfPaper: a throw of the guard\'s own is no refusal', () => {
  it('skips the brace check that threw: the marked original compiled as before, no guard record', async () => {
    fault.at = 'braces'
    fault.error = new Error('the check broke')
    try {
      const c = compiler([PROBE, ran])
      expect(await markedOfPaper(paperOf(), { compile: c.compile })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: { probe: expect.any(Number), compile: expect.any(Number) } })
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

  it('lets a failed allocation go on as itself', async () => {
    for (const at of ['braces', 'aux'] as const) {
      fault.at = at
      fault.error = failedAllocation()
      try { await expect(markedOfPaper(paperOf(), { compile: compiler([PROBE, ran]).compile })).rejects.toBe(fault.error) } finally { fault.at = null }
    }
  })
})
