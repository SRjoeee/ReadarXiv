import { describe, expect, it } from 'vitest'
import { layoutMarksOfPaper, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { baseRefusalRetryable, RETRY_LIMITS } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { type Compiled, type CompileRequest, DRAFT_OPTION, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'

// Our compile as the base page (layout/paper.mjs markedOfPaper `base`, design note §3.1 and §3.3.2): once the guard accepts a
// marked compile, the final pass — its files with graphicx's draft option made an empty line, over what it wrote, one pass with
// no bibliography step, within the budget; every compile after the probe on arXiv's day; and no mark of ours printed as text.

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array(0))
const SOURCE = '\\documentclass{article}\n\\usepackage{url}\n\\begin{document}\nA first paragraph, see \\url{https://example.org}.\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = () => openPaper(new Map([['main.tex', enc(SOURCE)]]))
const PROBE_LOG = ['This is pdfTeX', 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n')
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
const log = (pages = 3) => `${TEX}AXT-END\nOutput written on main.pdf (${pages} pages, 9999 bytes).\n`
const DRAFT = enc('%PDF-1.7 the marked original'), FINAL = enc('%PDF-1.7 the final pass'), AGAIN = enc('%PDF-1.7 the marked original again')
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

describe('the final pass', () => {
  it('asks the marked compile for its files, then one pass of the paper\'s compiler over them: the draft line empty, no BibTeX', async () => {
    const c = compiler([PROBE, marked(), finalAnswer()])
    const made = await markedOfPaper(paperOf(), { compile: c.compile })
    expect(made).toMatchObject({ pdf: DRAFT, base: { pdf: FINAL, log: expect.stringContaining('AXT-END') }, ms: { final: expect.any(Number) } })
    expect(c.asked).toHaveLength(3)
    const [, m, f] = c.asked as [CompileRequest, CompileRequest, CompileRequest]
    expect(m).toMatchObject({ rerun: true, files: true })
    expect(f).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false })
    expect(f.files).toBeUndefined()
    expect(f.draft).toBeUndefined()
    // (the marked files with the draft option's line made empty: no line moves)
    const before = dec(m.overrides.get('main.tex')), after = dec(f.overrides.get('main.tex'))
    expect(before.startsWith(`${DRAFT_OPTION}\n`)).toBe(true)
    expect(after).toBe(`\n${before.slice(DRAFT_OPTION.length + 1)}`)
    expect(after.split('\n')).toHaveLength(before.split('\n').length)
    expect(after).toContain('\\Gin@setfile')
    // (over what the marked compile wrote, its own outputs aside)
    expect([...f.overrides.keys()].sort()).toEqual(['main.aux', 'main.bbl', 'main.tex', 'main.toc'])
    expect(dec(f.overrides.get('main.bbl'))).toContain('thebibliography')
  })

  it('is the engine\'s: xelatex and latex alike, one pass of that compiler', async () => {
    for (const compiler_ of ['xelatex', 'latex']) {
      const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], process: { compiler: compiler_ } })
      const paper = openPaper(new Map([['main.tex', enc(SOURCE)], ['00README.json', enc(readme)]]))
      const c = compiler([PROBE, marked(), finalAnswer()])
      expect(await markedOfPaper(paper, { compile: c.compile })).toMatchObject({ base: { pdf: FINAL } })
      expect(c.asked[2]).toMatchObject({ engine: paper.meta.compiler, rerun: false, bibtex: false })
    }
  })

  it('carries a converged compile\'s files: CM\'s carried files with its last pass\'s, its own beside', async () => {
    // (a draft, then a marked pass that writes what it was given: settled)
    const wrote = () => new Map([['main.aux', enc('\\relax\n')], ['main.out', enc('\\BOOKMARK\n')], ['main.pdf', DRAFT]])
    const draft: Compiled = { ok: true, log: log(), files: wrote(), ms: 100 }
    const pass: Compiled = { ok: true, pdf: DRAFT, log: log(), files: wrote(), ms: 100 }
    const c = compiler([PROBE, draft, pass, finalAnswer()])
    const made = await markedOfPaper(paperOf(), { compile: c.compile, converge: true })
    expect(made).toMatchObject({ base: { pdf: FINAL }, cm: { settled: true } })
    const f = c.asked.at(-1) as CompileRequest
    expect(f).toMatchObject({ rerun: false, bibtex: false })
    expect(dec(f.overrides.get('main.aux'))).toBe('\\relax\n')
    expect(f.overrides.has('main.out')).toBe(true)
    expect(f.overrides.has('main.pdf')).toBe(false)
  })

  it('is none (`final`) with no files to make it over, no compile left in the budget, a pass that did not run through or threw', async () => {
    const noFiles = compiler([PROBE, marked(DRAFT, null)])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: noFiles.compile }))).toEqual({ refused: 'final', why: 'the marked compile returned no files to make the final pass over' })
    expect(noFiles.asked).toHaveLength(2)
    // (a budget that holds no compile as long as the longest so far and a fifth)
    const tight = compiler([PROBE, { ...marked(), ms: 1000 }])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: tight.compile, compileBudgetMs: 2000 }))).toEqual({ refused: 'final', why: 'no compile left within the compile budget', limit: 'budget' })
    expect(tight.asked).toHaveLength(2)
    const roomy = compiler([PROBE, { ...marked(), ms: 1000 }, finalAnswer()])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: roomy.compile, compileBudgetMs: 2300 }))).toMatchObject({ pdf: FINAL })
    const halted = compiler([PROBE, marked(), { ok: true, pdf: FINAL, log: `${TEX}! Undefined control sequence.\nl.4 \\foo\n! Emergency stop.\n` }])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: halted.compile }))).toMatchObject({ refused: 'final', why: expect.stringMatching(/^the final pass did not run through: ! Undefined control sequence\./) })
    const limit = compiler([PROBE, marked(), { ok: false, log: '', limit: 'time', error: 'the compile passed its time limit' } as never])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: limit.compile }))).toMatchObject({ refused: 'final' })
    const threw = compiler([PROBE, marked(), new Error('the jail broke')])
    expect(baseOf(await markedOfPaper(paperOf(), { compile: threw.compile }))).toEqual({ refused: 'final', why: 'the final pass threw: the jail broke' })
    // (a failed allocation is the run's, never the paper's)
    const memory = compiler([PROBE, marked(), new RangeError(ALLOCATION_FAILED)])
    await expect(markedOfPaper(paperOf(), { compile: memory.compile })).rejects.toThrow(ALLOCATION_FAILED)
    // (no final pass where it is not asked, nor on a refusal)
    const off = compiler([PROBE, marked()])
    expect(await markedOfPaper(paperOf(), { compile: off.compile, final: false })).not.toHaveProperty('base')
    expect(off.asked[1]?.files).toBeUndefined()
  })

  it('every compile after the probe is made on the day given (asked once, after the probe), the final pass too', async () => {
    let asked = 0
    const c = compiler([PROBE, marked(), finalAnswer()])
    await markedOfPaper(paperOf(), { compile: c.compile, sourceDate: async () => { asked++; return 1_760_531_400 } })
    expect(asked).toBe(1)
    expect(c.asked.map(q => q.sourceDate)).toEqual([undefined, 1_760_531_400, 1_760_531_400])
    for (const bad of [null, -1, 1.5, 'x', async () => { throw new Error('no PDF') }]) {
      const d = compiler([PROBE, marked(), finalAnswer()])
      await markedOfPaper(paperOf(), { compile: d.compile, sourceDate: bad as never })
      expect(d.asked.map(q => q.sourceDate), String(bad)).toEqual([undefined, undefined, undefined])
    }
  })
})

describe('no mark of ours printed as text (design §3.3.2, the guard\'s `text`)', () => {
  it('a mark printed (2610.19860\'s \\url): its unit left unmarked and the paper compiled again, the guard\'s record says so', async () => {
    const texts = new Map<string, string[]>([[dec(DRAFT), ['A first paragraph, see \\axt@pma{p0.1a}https://example.org.', 'Another paragraph of words.']], [dec(AGAIN), ['A first paragraph, see https://example.org.', 'Another paragraph of words.']]])
    const textOf = async (pdf: Uint8Array) => texts.get(dec(pdf)) ?? null
    const c = compiler([PROBE, marked(DRAFT), marked(AGAIN), finalAnswer()])
    const made = await markedOfPaper(paperOf(), { compile: c.compile, textOf })
    expect(made).toMatchObject({ pdf: AGAIN, guard: { extra: 1, unmarked: [0], failed: ['text'] }, base: { pdf: FINAL } })
    expect(dec(c.asked[1]?.overrides.get('main.tex'))).toContain('\\axtmark{0s}')
    expect(dec(c.asked[2]?.overrides.get('main.tex'))).not.toContain('\\axtmark{0s}')
    // (the final pass is made over the compile that stands: the second)
    expect(dec(c.asked[3]?.overrides.get('main.tex'))).not.toContain('\\axtmark{0s}')
  })

  it('a reader that fails reads none; a mark printed that no compile mends stands as the guard\'s best, for the page pass to refuse', async () => {
    const failing = compiler([PROBE, marked(), finalAnswer()])
    expect(await markedOfPaper(paperOf(), { compile: failing.compile, textOf: async () => { throw new Error('no reader') } })).toMatchObject({ pdf: DRAFT, base: { pdf: FINAL } })
    const always = async () => ['\\axtmark{n1.abstract.s}']
    const c = compiler([PROBE, marked(), marked(AGAIN), { ok: true, pdf: enc('%PDF unmarked'), log: log() }])
    const made = await markedOfPaper(paperOf(), { compile: c.compile, textOf: always })
    expect(made).toMatchObject({ pdf: DRAFT, guard: { failed: ['text'], names: true } })
  })
})

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
