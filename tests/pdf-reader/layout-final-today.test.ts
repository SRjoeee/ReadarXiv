import { describe, expect, it } from 'vitest'
import { layoutMarksOfPaper, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { baseRefusalRetryable, RETRY_LIMITS } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { type Compiled, type CompileRequest, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// Our compile as the base page (layout/paper.mjs markedOfPaper `base`, design note §3.1 and §3.3.2): once the guard accepts a
// marked compile, the final pass — its files with graphicx's draft option's line made the drivers' hooks (NO_DRIVER_GROUP), over
// what it wrote, one pass with no bibliography step, within the budget; every compile after the probe on arXiv's day; and no
// mark of ours printed as text.

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array(0))
const SOURCE = '\\documentclass{article}\n\\usepackage{url}\n\\begin{document}\nA first paragraph, see \\url{https://example.org}.\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = () => openPaper(new Map([['main.tex', enc(SOURCE)]]))
const PROBE_LOG = ['This is pdfTeX', 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n')
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
const log = (pages = 3) => `${TEX}AXT-END\nOutput written on main.pdf (${pages} pages, 9999 bytes).\n`
const DRAFT = enc('%PDF-1.7 the marked original'), FINAL = enc('%PDF-1.7 the final pass')
/** what the marked compile wrote: its aux, bibliography and lists, and its own outputs (the PDF, the log) */
const WROTE = new Map([['main.aux', enc('\\relax\n')], ['main.bbl', enc('\\begin{thebibliography}{1}\\end{thebibliography}\n')], ['main.toc', enc('')], ['main.pdf', DRAFT], ['main.log', enc('a log')], ['main.blg', enc('a blg')]])
const marked = (pdf = DRAFT, files: Map<string, Uint8Array> | null = WROTE): Compiled => ({ ok: true, pdf, log: log(), ...(files ? { files } : {}), ms: 1000 })
/** the result's base page, where it has one */
const baseOf = (r: unknown) => (r as { base?: unknown }).base
const finalAnswer = (pdf = FINAL): Compiled => ({ ok: true, pdf, log: log(), ms: 200 })

function compiler(answers: (Compiled | Error)[]) {
  const asked: CompileRequest[] = []
  return {
    asked,
    compile: async (req: CompileRequest): Promise<Compiled> => {
      asked.push(req)
      const a = answers[asked.length - 1] ?? { ok: false, error: 'not asked for' }
      if (a instanceof Error) throw a
      return a
    },
  }
}

// A fallback is a layer for good (its head is committed); a refusal a host's limit or its compile budget caused may not be the
// paper's at all, so the host retries it instead (the box's call): such a refusal names the limit (`limit`, limitOf's name, or
// 'budget'), and baseRefusalRetryable is that and nothing else
describe('a refusal a host\'s limit or the compile budget caused names it, and is the one kind retried', () => {
  const STOPPED = { ok: false, log: TEX, limit: 'wall', error: 'the compile passed its wall limit' } as never
  it('the final pass: out of budget or stopped by the host, retryable; a pass that failed or threw, not', async () => {
    const tight = compiler([PROBE, { ...marked(), ms: 1000 }])
    const budget = baseOf(await markedOfPaper(paperOf(), { compile: tight.compile, compileBudgetMs: 2000 }))
    expect(budget).toEqual({ refused: 'final', why: 'no compile left within the compile budget', limit: 'budget' })
    const stopped = baseOf(await markedOfPaper(paperOf(), { compile: compiler([PROBE, marked(), STOPPED]).compile }))
    expect(stopped).toEqual({ refused: 'final', why: 'the final pass was stopped by the host\'s wall limit', limit: 'wall' })
    expect([budget, stopped].map(baseRefusalRetryable)).toEqual([true, true])
    const halted = baseOf(await markedOfPaper(paperOf(), { compile: compiler([PROBE, marked(), { ok: true, pdf: FINAL, log: `${TEX}! Emergency stop.\n` }]).compile }))
    const threw = baseOf(await markedOfPaper(paperOf(), { compile: compiler([PROBE, marked(), new Error('the jail broke')]).compile }))
    for (const r of [halted, threw]) { expect(r).not.toHaveProperty('limit'); expect(baseRefusalRetryable(r)).toBe(false) }
  })

  it('the guard: the marked original or the paper\'s own source stopped by the host, or no compile left to tell whose fault, retryable', async () => {
    const markedStopped = await markedOfPaper(paperOf(), { compile: compiler([PROBE, STOPPED]).compile })
    expect(markedStopped).toMatchObject({ refused: 'compile', why: 'the marked original was stopped by the host\'s wall limit', limit: 'wall' })
    const fail: Compiled = { ok: true, pdf: DRAFT, log: `${TEX}! Undefined control sequence.\nl.3 \\foo\n! Emergency stop.\n` }
    const ownStopped = await markedOfPaper(paperOf(), { compile: compiler([PROBE, fail, fail, STOPPED]).compile })
    expect(ownStopped).toMatchObject({ refused: 'compile', why: 'the paper\'s own source was stopped by the host\'s wall limit', limit: 'wall' })
    const untold = await markedOfPaper(paperOf(), { compile: compiler([PROBE, { ...fail, ms: 100 }]).compile, compileBudgetMs: 150 })
    expect(untold).toMatchObject({ refused: 'compile', why: expect.stringContaining('the paper\'s own source was not compiled'), limit: 'budget' })
    expect([markedStopped, ownStopped, untold].map(baseRefusalRetryable)).toEqual([true, true, true])
    // (the paper's own source failing as itself is the paper's: no limit, for good)
    const own = await markedOfPaper(paperOf(), { compile: compiler([PROBE, fail, fail, fail]).compile })
    expect(own).toMatchObject({ refused: 'compile' })
    expect(own).not.toHaveProperty('limit')
    expect(baseRefusalRetryable(own)).toBe(false)
  })

  it('retries the wall clock and the budget alone (the host\'s rule: once); a cpu, file-size or disk limit, any other code, none', () => {
    expect(RETRY_LIMITS).toEqual(['wall', 'budget'])
    for (const limit of ['wall', 'budget']) for (const refused of ['compile', 'final']) expect(baseRefusalRetryable({ refused, why: 'x', limit }), `${refused} ${limit}`).toBe(true)
    // (the same paper meets a cpu, file-size or disk limit on the same box again; 'time', another host's timeout, is no box's wall)
    for (const limit of ['cpu', 'fsize', 'disk', 'time']) expect(baseRefusalRetryable({ refused: 'compile', limit }), limit).toBe(false)
    for (const r of [{ refused: 'carry', why: 'x' }, { refused: 'marks' }, { refused: 'boxes' }, { refused: 'engine' }, { refused: 'texlive' }, { refused: 'final', why: 'the final pass is not the draft\'s page' }, { refused: 'final', limit: '' }, { refused: 'final', limit: null }, null, undefined, 'budget', {}]) expect(baseRefusalRetryable(r as never), JSON.stringify(r)).toBe(false)
  })
})

describe('layoutMarksOfPaper: the base page checked against the draft', () => {
  /** a document of `marks` (name → [page, x, y]) and its pages, PDF.js's shapes */
  const docOf = (marks: Record<string, [number, number, number]>, pages = 3) => ({
    numPages: pages,
    getPage: async () => ({ view: [0, 0, 612, 792], rotate: 0, userUnit: 1, getTextContent: async () => ({ items: [] }), getOperatorList: async () => ({ fnArray: [], argsArray: [] }), commonObjs: { get: () => null } }),
    getDestinations: async () => Object.fromEntries(Object.entries(marks).map(([n, [p, x, y]]) => [n, [{ num: p, gen: 0 }, { name: 'XYZ' }, x, y, null]])),
    getPageIndex: async (ref: { num: number }) => ref.num - 1,
  })
  it('a final pass whose marks are the draft\'s is the base page; one whose mark moved is none', async () => {
    const opened: string[] = []
    const open = (final: Record<string, [number, number, number]>) => async (pdf: Uint8Array) => {
      opened.push(dec(pdf))
      return { doc: dec(pdf) === dec(FINAL) ? docOf(final) : docOf({ 'axt-0s': [1, 72, 700] }), close: async () => {} }
    }
    const same = await layoutMarksOfPaper(paperOf(), { compile: compiler([PROBE, marked(), finalAnswer()]).compile, open: open({ 'axt-0s': [1, 72, 700] }), OPS: {} })
    expect(same).toMatchObject({ base: { pdf: FINAL, check: { marks: 1 } } })
    expect(opened).toEqual([dec(DRAFT), dec(FINAL)])
    const moved = await layoutMarksOfPaper(paperOf(), { compile: compiler([PROBE, marked(), finalAnswer()]).compile, open: open({ 'axt-0s': [1, 72.5, 700] }), OPS: {} })
    expect(moved).toMatchObject({ base: { refused: 'final', why: expect.stringMatching(/^the final pass is not the draft's page: the mark 0s moved/) } })
  })

  it('keeps the base page\'s bytes whole where opening a PDF takes its buffer (PDF.js transfers it to its worker)', async () => {
    const open = async (pdf: Uint8Array) => {
      const text = dec(pdf)
      structuredClone(pdf.buffer, { transfer: [pdf.buffer] })
      return { doc: docOf({ 'axt-0s': [1, 72, 700] }), close: async () => { void text } }
    }
    const got = await layoutMarksOfPaper(paperOf(), { compile: compiler([PROBE, marked(enc('%PDF-1.7 the marked original')), finalAnswer(enc('%PDF-1.7 the final pass'))]).compile, open, OPS: {} })
    expect(got).toMatchObject({ base: { check: { marks: 1 } } })
    expect(dec((got as { base: { pdf: Uint8Array } }).base.pdf)).toBe('%PDF-1.7 the final pass')
  })
})
