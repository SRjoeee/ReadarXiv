// The marked compile's passes (compile/paper.ts markedOfPaper), on compile doubles: no TeX runs, every answer is written here.
// Without `converge` (today's reader's, and the default): every request and every result byte is what the engine made at
// d5673d033, held by digests taken there. With `converge` (Q1, design-performance Q1: the marked compile as the engine's pass
// loop, convergeThenMark): pass 1 the marked files as a draft, every later pass the final main file in full, the first pass
// that writes back the files it was given is B and the log; the fallbacks are today's request and its final pass; the bound.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DRIVER_OUTPUT_MARK } from '../src/compile/base.ts'
import { type Compiled, type CompileRequest, DRAFT_OPTION, NO_DRIVER_GROUP, openPaper } from '../src/compile/live.ts'
import { madeBibliography, type Marked, type MarkedCompileOptions, markedOfPaper } from '../src/compile/paper.ts'
import { POINTS_TEX, POINTS_TEX_REDUCED } from '../src/marks/marks.ts'
import { lastTexLog } from '../src/source/latex-front.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | null | undefined) => new TextDecoder().decode(b ?? new Uint8Array(0))
const SOURCE =
  '\\documentclass{article}\n\\begin{document}\nWe use the method of \\cite{a} as in Section~\\ref{s} here.\n\nAnother paragraph of words.\n\\end{document}\n'
const readme = (compiler: string) =>
  JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], process: { compiler } })
const paperOf = (more: Record<string, string> = {}) =>
  openPaper(
    new Map([['main.tex', enc(SOURCE)], ...Object.entries(more).map(([p, t]): [string, Uint8Array] => [p, enc(t)])]),
  )
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
const PROBE_LOG = `${TEX}LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\n`
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const END = 'AXT-END\n'
/** a log TeX wrote to the document's end, `body` before its end line */
const logOf = (body = '', pages = 1) => `${TEX}${body}${END}Output written on main.pdf (${pages} pages, 999 bytes).\n`
const DAY = 1_760_531_400
const files = (o: Record<string, string>) =>
  new Map(Object.entries(o).map(([p, t]): [string, Uint8Array] => [p, enc(t)]))
const AUX = '\\relax \n\\newlabel{s}{{1}{1}}\n'
const AUX2 = '\\relax \n\\newlabel{s}{{1}{2}}\n'

/** a compiler that answers in order and records what it was asked */
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
const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex').slice(0, 16)
/** a request as one digest: every field and every file it carries, in its order */
const requestDigest = (q: CompileRequest) => {
  const h = createHash('sha256')
  const { overrides, ...rest } = q
  h.update(
    JSON.stringify(
      Object.keys(rest)
        .sort()
        .map((k) => [k, (rest as Record<string, unknown>)[k]]),
    ),
  )
  for (const [p, b] of overrides) h.update(`\n${p}\n`).update(b)
  return h.digest('hex').slice(0, 16)
}
/** a result as digests of what a host reads of it */
const resultDigest = (m: Marked) =>
  'refused' in m
    ? { refused: m.refused, why: m.why ?? null, guard: m.guard ?? null, ms: Object.keys(m.ms).sort() }
    : {
        pdf: sha(m.pdf),
        log: sha(m.log),
        options: sha(JSON.stringify(m.options, (_k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v))),
        base: m.base ? ('pdf' in m.base ? { pdf: sha(m.base.pdf), log: sha(m.base.log) } : m.base) : null,
        guard: m.guard ?? null,
        cm: m.cm ?? null,
        ms: Object.keys(m.ms).sort(),
      }

// ---------------------------------------------------------------- today's: no `converge`
describe("without converge: today's requests and results, byte for byte (held at d5673d033)", () => {
  const DRAFT = enc('%PDF-1.7 the marked original'),
    AGAIN = enc('%PDF-1.7 the marked original again'),
    FINAL = enc('%PDF-1.7 the final pass')
  const WROTE = { 'main.aux': AUX, 'main.out': '\\BOOKMARK\n', 'main.pdf': 'pdf', 'main.log': 'log' }
  const marked = (pdf = DRAFT): Compiled => ({
    ok: true,
    pdf,
    log: logOf('AXT-LINES 0 3 12.0pt 10\n'),
    files: files(WROTE),
    ms: 100,
  })
  const final = (log = logOf()): Compiled => ({ ok: true, pdf: FINAL, log, ms: 100 })
  const cases: [string, (o: Partial<MarkedCompileOptions>) => Promise<{ asked: CompileRequest[]; made: Marked }>][] = [
    [
      'a paper: the probe, every pass, the final pass',
      async (o) => {
        const c = compiler([PROBE, marked(), final()])
        return { asked: c.asked, made: await markedOfPaper(paperOf(), { compile: c.compile, sourceDate: DAY, ...o }) }
      },
    ],
    [
      'its bibliography shipped',
      async (o) => {
        const c = compiler([PROBE, marked(), final()])
        const paper = paperOf({ 'main.bbl': '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n' })
        return { asked: c.asked, made: await markedOfPaper(paper, { compile: c.compile, sourceDate: DAY, ...o }) }
      },
    ],
    [
      'a mark printed: the guard compiles it again, the final pass over the second',
      async (o) => {
        const c = compiler([PROBE, marked(DRAFT), marked(AGAIN), final()])
        const textOf = async (pdf: Uint8Array) =>
          dec(pdf) === dec(DRAFT)
            ? ['We use the method of \\axtmark{0s}', 'Another']
            : ['We use the method of', 'Another']
        return {
          asked: c.asked,
          made: await markedOfPaper(paperOf(), { compile: c.compile, sourceDate: DAY, textOf, ...o }),
        }
      },
    ],
    [
      'under latex: the driver output read',
      async (o) => {
        const c = compiler([PROBE, marked(), final(`${logOf()}${DRIVER_OUTPUT_MARK}\nmain.dvi -> main.pdf\n[1]\n`)])
        const paper = paperOf({ '00README.json': readme('latex') })
        return { asked: c.asked, made: await markedOfPaper(paper, { compile: c.compile, sourceDate: DAY, ...o }) }
      },
    ],
    [
      'no final pass asked',
      async (o) => {
        const c = compiler([PROBE, marked()])
        return { asked: c.asked, made: await markedOfPaper(paperOf(), { compile: c.compile, final: false, ...o }) }
      },
    ],
  ]
  for (const [name, run] of cases)
    it(name, async () => {
      for (const converge of [undefined, false]) {
        const { asked, made } = await run(converge === undefined ? {} : { converge })
        const got = { asked: asked.map(requestDigest), made: resultDigest(made) }
        expect(got, `converge ${converge}`).toEqual(GOLDEN_AT_BASE[name])
      }
    })
})

// ---------------------------------------------------------------- Q1: `converge`, the marked compile as the pass loop
const P2 = enc('%PDF-1.7 pass 2'),
  P3 = enc('%PDF-1.7 pass 3'),
  FINAL = enc('%PDF-1.7 the final pass'),
  TODAY = enc("%PDF-1.7 today's compile")
const LINES = 'AXT-LINES 0 3 12.0pt 10\n'
/** a draft's answer: TeX ran to the document's end, no PDF, the files it wrote */
const draftOf = (o: Record<string, string>, log = logOf()): Compiled => ({
  ok: true,
  pdf: null,
  log,
  files: files(o),
  ms: 100,
})
/** a full pass's answer: its PDF, its log, the files it wrote */
const fullOf = (o: Record<string, string>, pdf = P2, log = logOf(LINES)): Compiled => ({
  ok: true,
  pdf,
  log,
  files: files(o),
  ms: 100,
})
/** today's one compile of the marked original (latexmk's every pass), with the files it wrote */
const todayOf = (o: Record<string, string> = { 'main.aux': AUX }): Compiled => ({
  ok: true,
  pdf: TODAY,
  log: logOf(LINES),
  files: files(o),
  ms: 100,
})
const finalOf = (log = logOf()): Compiled => ({ ok: true, pdf: FINAL, log, ms: 100 })
type Run = { asked: CompileRequest[]; made: Marked }
/** the marked compile of `paper`, the probe answered, then `answers` in order, on DAY */
const run = async (
  paper: ReturnType<typeof paperOf>,
  answers: (Compiled | Error)[],
  o: Partial<MarkedCompileOptions> = {},
): Promise<Run> => {
  const c = compiler([PROBE, ...answers])
  return { asked: c.asked, made: await markedOfPaper(paper, { compile: c.compile, sourceDate: DAY, ...o }) }
}
const today = (
  paper: ReturnType<typeof paperOf>,
  answers: (Compiled | Error)[],
  o: Partial<MarkedCompileOptions> = {},
) => run(paper, answers, o)
const q1 = (paper: ReturnType<typeof paperOf>, answers: (Compiled | Error)[], o: Partial<MarkedCompileOptions> = {}) =>
  run(paper, answers, { converge: true, ...o })
/** a request's files as [path, text], by path */
const sorted = (q: CompileRequest | undefined) =>
  [...(q?.overrides ?? new Map<string, Uint8Array>())]
    .map(([p, b]) => [p, dec(b)])
    .sort((a, b) => (a[0]! < b[0]! ? -1 : 1))
/** a request without its files */
const shape = (q: CompileRequest | undefined) => {
  const { overrides: _, ...rest } = q ?? ({} as CompileRequest)
  return rest
}
/** the main file a full pass is given: the marked one's with graphicx's draft line made NO_DRIVER_GROUP's, one line for one */
const fullMain = (marked: Uint8Array | undefined) => {
  const t = dec(marked)
  expect(t.startsWith(`${DRAFT_OPTION}\n`)).toBe(true)
  return `${NO_DRIVER_GROUP}\n${t.slice(DRAFT_OPTION.length + 1)}`
}
const pdfOf = (m: Marked) => {
  if (!('pdf' in m)) throw new Error(`refused: ${m.refused} ${m.why ?? ''}`)
  return m
}

describe("Q1 (converge): each pass reads what today's pass of the same number reads", () => {
  it("pass 1 is today's marked files as a draft; pass 2 today's final pass's files in full; the first that writes back what it was given is B and the log, and no final pass follows", async () => {
    const t = await today(paperOf(), [todayOf({ 'main.aux': AUX }), finalOf()])
    const { asked, made } = await q1(paperOf(), [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })])
    expect(asked).toHaveLength(3)
    expect(asked[0]).toEqual(t.asked[0])
    // pass 1: today's marked files, one pass that writes no PDF, its files asked, BibTeX after it (the paper ships no
    // bibliography), on the day
    expect(asked[1]).toEqual({
      main: 'main.tex',
      engine: 'pdflatex',
      rerun: false,
      bibtex: true,
      overrides: t.asked[1]!.overrides,
      draft: true,
      files: true,
      sourceDate: DAY,
    })
    // pass 2: the files today's final pass is given over the same files written (the draft's line the drivers' hooks), in
    // full, its files asked, no BibTeX (its input as the step last read it), on the day
    expect(shape(asked[2])).toEqual({
      main: 'main.tex',
      engine: 'pdflatex',
      rerun: false,
      bibtex: false,
      draft: false,
      files: true,
      sourceDate: DAY,
    })
    expect(sorted(asked[2])).toEqual(sorted(t.asked[2]))
    expect(dec(asked[2]!.overrides.get('main.tex'))).toBe(fullMain(t.asked[1]!.overrides.get('main.tex')))
    // B, the base page and the log are pass 2's, one pass
    const m = pdfOf(made)
    expect(m.pdf).toBe(P2)
    expect(m.log).toBe(lastTexLog(logOf(LINES)))
    expect(m.base).toEqual({ pdf: P2, log: lastTexLog(logOf(LINES)) })
    expect(m.cm).toEqual({ drafts: 1, marked: 1, settled: true })
    expect(m.ms).not.toHaveProperty('final')
    // (the options the marks are read with: today's)
    expect(m.options).toEqual(pdfOf(t.made).options)
  })

  it('takes the first settled pass: one that wrote other files than it was given is compiled again in them', async () => {
    const lines4 = logOf('AXT-LINES 0 4 12.0pt 10\n')
    const t = await today(paperOf(), [todayOf({ 'main.aux': AUX2 }), finalOf()])
    const { asked, made } = await q1(paperOf(), [
      draftOf({ 'main.aux': AUX }),
      fullOf({ 'main.aux': AUX2 }, P2),
      fullOf({ 'main.aux': AUX2 }, P3, lines4),
    ])
    expect(asked).toHaveLength(4)
    expect(dec(asked[2]!.overrides.get('main.aux'))).toBe(AUX)
    // (pass 3 is given what pass 2 wrote: today's final pass's files where latexmk stopped there)
    expect(sorted(asked[3])).toEqual(sorted(t.asked[2]))
    const m = pdfOf(made)
    expect(m.pdf).toBe(P3)
    expect(m.base).toEqual({ pdf: P3, log: lastTexLog(lines4) })
    expect(m.log).toContain('AXT-LINES 0 4 12.0pt 10')
    expect(m.cm).toEqual({ drafts: 1, marked: 2, settled: true })
  })

  it("stops at five TeX passes, then one full pass more over the fifth's files (today's final pass): B that pass's, the log the fifth's", async () => {
    const moving = (n: number) =>
      fullOf({ 'main.aux': `\\relax \n\\newlabel{s}{{1}{${n}}}\n` }, P2, logOf(`AXT-LINES 0 ${n} 12.0pt 10\n`))
    const { asked, made } = await q1(paperOf(), [
      draftOf({ 'main.aux': AUX }),
      moving(2),
      moving(3),
      moving(4),
      moving(5),
      finalOf(),
    ])
    // the probe, the draft, four full passes, the final pass
    expect(asked).toHaveLength(7)
    const fifth = asked[5]!,
      last = asked[6]!
    expect(shape(last)).toEqual({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false, sourceDate: DAY })
    expect(dec(last.overrides.get('main.aux'))).toBe('\\relax \n\\newlabel{s}{{1}{5}}\n')
    expect(dec(last.overrides.get('main.tex'))).toBe(dec(fifth.overrides.get('main.tex')))
    const m = pdfOf(made)
    expect(m.base).toEqual({ pdf: FINAL, log: lastTexLog(logOf()) })
    expect(m.log).toContain('AXT-LINES 0 5 12.0pt 10')
    expect(m.cm).toEqual({ drafts: 1, marked: 4, settled: false })
  })

  it('asks BibTeX after pass 1 where the paper ships no bibliography, then only where its input changed; none where it ships one', async () => {
    const aux1 = '\\relax \n\\citation{a}\n\\bibdata{refs}\n\\bibstyle{plain}\n\\newlabel{s}{{1}{1}}\n'
    const aux2 = '\\relax \n\\citation{a}\n\\citation{b}\n\\bibdata{refs}\n\\bibstyle{plain}\n\\newlabel{s}{{1}{1}}\n'
    const bbl1 = '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n'
    const bbl2 = '\\begin{thebibliography}{2}\n\\bibitem{a} A.\n\\bibitem{b} B.\n\\end{thebibliography}\n'
    const { asked, made } = await q1(paperOf({ 'refs.bib': '@article{a}' }), [
      draftOf({ 'main.aux': aux1, 'main.bbl': bbl1 }),
      // (a citation pass 1 had not written: the bibliography's input changed, so pass 3 runs the step)
      fullOf({ 'main.aux': aux2 }),
      fullOf({ 'main.aux': aux2, 'main.bbl': bbl2 }),
      fullOf({ 'main.aux': aux2 }, P3),
    ])
    expect(asked.map((r) => r.bibtex)).toEqual([false, true, false, true, false])
    expect(dec(asked[4]!.overrides.get('main.bbl'))).toBe(bbl2)
    expect(pdfOf(made)).toMatchObject({ pdf: P3, cm: { drafts: 1, marked: 3, settled: true } })
    const shipped = paperOf({ 'main.bbl': bbl1 })
    const again = await q1(shipped, [
      draftOf({ 'main.aux': aux1 }),
      fullOf({ 'main.aux': aux2 }),
      fullOf({ 'main.aux': aux2 }),
    ])
    expect(again.asked.map((r) => r.bibtex)).toEqual([false, false, false, false])
  })

  it("gives each pass every file the passes before returned, the latest copy of each, over the paper's own but never over its own", async () => {
    const paper = paperOf({ 'extra.sty': "% the paper's own\n" })
    const toc = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}}\n'
    const { asked, made } = await q1(paper, [
      draftOf({ 'main.aux': toc, 'main.toc': '', 'extra.sty': "% written by the paper's filecontents\n" }),
      fullOf({ 'main.aux': toc, 'main.toc': 'T2\n' }),
      fullOf({ 'main.aux': toc, 'main.toc': 'T2\n' }, P3),
    ])
    expect(pdfOf(made)).toMatchObject({ pdf: P3, cm: { drafts: 1, marked: 2, settled: true } })
    expect(sorted(asked[3]).filter(([p]) => p !== 'main.tex')).toEqual([
      ['extra.sty', "% written by the paper's filecontents\n"],
      ['main.aux', toc],
      ['main.toc', 'T2\n'],
    ])
    // (a file a pass wrote at a path of its own files — the original's copy, under openout_any=p — never replaces the pass's)
    const over = await q1(paperOf(), [
      draftOf({ 'main.aux': AUX, 'main.tex': '% written by the pass\n' }),
      fullOf({ 'main.aux': AUX }),
    ])
    expect(dec(over.asked[2]!.overrides.get('main.tex'))).toBe(fullMain(over.asked[1]!.overrides.get('main.tex')))
  })

  it("takes a list that differs only by a babel name's marks as the same, and a changed label as another", async () => {
    const aux =
      '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Contents}{1}{section.1}}\n\\newlabel{s}{{1}{1}}\n'
    const named =
      '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}\\protect \\axtnma {contentsname}Contents\\protect \\axtnmb {contentsname}}{1}{section.1}}\n\\newlabel{s}{{1}{1}}\n'
    const same = await q1(paperOf(), [draftOf({ 'main.aux': aux }), fullOf({ 'main.aux': named })])
    expect(same.made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    const label = await q1(paperOf(), [
      draftOf({ 'main.aux': aux }),
      fullOf({ 'main.aux': named.replace('{{1}{1}}', '{{1}{2}}') }),
      fullOf({ 'main.aux': named.replace('{{1}{1}}', '{{1}{2}}') }),
    ])
    expect(label.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
  })
})

describe("Q1's fallbacks: today's request and its final pass, judged as today's", () => {
  const BIB = { 'refs.bib': '@article{a}' }
  const cases: [
    string,
    (Compiled | Error)[],
    NonNullable<NonNullable<Marked['cm']>['fallback']>,
    Partial<MarkedCompileOptions>?,
  ][] = [
    ['pass 1 not ok (a limit)', [{ ...draftOf({ 'main.aux': AUX }), ok: false, error: 'limit cpu' }], 'draft-failed'],
    ['pass 1 stopped short', [draftOf({ 'main.aux': AUX }, `${TEX}! Emergency stop.\n${END}`)], 'draft-failed'],
    ['pass 1 short of AXT-END', [draftOf({ 'main.aux': AUX }, `${TEX}the log of a halted pass\n`)], 'draft-failed'],
    ['pass 1 returned no files', [{ ok: true, pdf: null, log: logOf() }], 'no-files'],
    [
      "a bibliography job beside the main one's (chapterbib, multibib)",
      [draftOf({ 'main.aux': AUX, 'chap.aux': '\\relax \n\\bibstyle{plain}\n\\bibdata{refs}\n' })],
      'aux-jobs',
    ],
    ['a .bib the project lacks', [draftOf({ 'main.aux': `${AUX}\\bibdata{refs,more}\n` })], 'bib-missing'],
    [
      "pass 1's files past the host's bound",
      [draftOf({ 'main.aux': AUX, 'a.dat': 'x', 'b.dat': 'x' })],
      'files-bound',
      { filesBound: { count: 2, bytes: 1e6 } },
    ],
    [
      'the files carried past the bound by a later pass',
      [draftOf({ 'main.aux': AUX, 'a.dat': 'x' }), fullOf({ 'main.aux': AUX2, 'b.dat': 'x', 'c.dat': 'x' })],
      'files-bound',
      { filesBound: { count: 3, bytes: 1e6 } },
    ],
    [
      'a full pass that did not run through',
      [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX }, P2, `${TEX}! Emergency stop.\n`)],
      'pass-failed',
    ],
    [
      'a full pass with no PDF',
      [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX }, new Uint8Array(0))],
      'pass-failed',
    ],
    [
      'a full pass that returned no files',
      [draftOf({ 'main.aux': AUX }), { ok: true, pdf: P2, log: logOf(LINES) }],
      'no-files',
    ],
  ]
  for (const [why, answers, fallback, o = {}] of cases)
    it(`${why}: ${fallback}`, async () => {
      const paper = () => paperOf(fallback === 'bib-missing' ? {} : BIB)
      const t = await today(paper(), [todayOf(), finalOf()], o)
      const { asked, made } = await q1(paper(), [...answers, todayOf(), finalOf()], o)
      // today's request for the marked original and its final pass, exactly
      expect(asked.slice(-2)).toEqual(t.asked.slice(1))
      expect(asked).toHaveLength(answers.length + 3)
      // and today's result, CM's record beside it
      const { cm, ms, ...rest } = pdfOf(made)
      const { ms: msToday, ...restToday } = pdfOf(t.made)
      expect(rest).toEqual(restToday)
      expect(Object.keys(ms).sort()).toEqual(Object.keys(msToday).sort())
      expect(cm).toMatchObject({ drafts: 1, settled: false, fallback })
    })

  it("today's compile that fails after a fallback goes to the guard as today's: the same refusal, CM's record beside it", async () => {
    const STOP = `${TEX}${LINES}! File ended while scanning use of \\next.\n! Emergency stop.\n`
    const answer: Compiled = { ok: true, pdf: TODAY, log: STOP }
    const unmarked: Compiled = { ok: true, pdf: TODAY, log: logOf('', 3) }
    const t = await today(paperOf(), [answer, answer, unmarked])
    expect(t.made).toMatchObject({ refused: 'marks' })
    const { asked, made } = await q1(paperOf(), [draftOf({ 'main.aux': AUX }, STOP), answer, answer, unmarked])
    expect(asked.slice(2)).toEqual(t.asked.slice(1))
    const { cm, ms, ...rest } = made
    const { ms: _, ...restToday } = t.made
    expect(rest).toEqual(restToday)
    expect(cm).toEqual({ drafts: 1, marked: 0, settled: false, fallback: 'draft-failed' })
  })

  it("a compile that throws is the compile's refusal, with CM's record", async () => {
    const thrown = await q1(paperOf(), [draftOf({ 'main.aux': AUX }), new Error('the jail broke')])
    expect(thrown.made).toEqual({
      refused: 'compile',
      why: 'the compile threw',
      ms: { probe: expect.any(Number), compile: expect.any(Number) },
      cm: { drafts: 1, marked: 1, settled: false },
    })
  })
})

describe('Q1: what the settled pass is judged by', () => {
  it("under latex, the driver's checks today's final pass makes are made of it", async () => {
    const paper = () => paperOf({ '00README.json': readme('latex') })
    const given = `${logOf(LINES)}${DRIVER_OUTPUT_MARK}\nmain.dvi -> main.pdf\n[1]\n`
    const ok = await q1(paper(), [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX }, P2, given)])
    expect(ok.asked).toHaveLength(3)
    expect(pdfOf(ok.made).base).toEqual({ pdf: P2, log: lastTexLog(given) })
    // (no driver's output given: the base page is none, as today's final pass with none is)
    const none = await q1(paper(), [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })])
    const t = await today(paper(), [todayOf(), finalOf()])
    expect(none.asked).toHaveLength(3)
    expect(pdfOf(none.made).base).toEqual(pdfOf(t.made).base)
    expect(pdfOf(none.made).base).toMatchObject({ refused: 'final' })
  })

  it("the guard reads it as it reads today's compile: a mark printed is mended by today's request, and the final pass is made over that", async () => {
    const textOf = async (pdf: Uint8Array) =>
      dec(pdf) === dec(P2) ? ['We use the method of \\axtmark{0s}', 'Another'] : ['We use the method of', 'Another']
    const { asked, made } = await q1(
      paperOf(),
      [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX }), todayOf(), finalOf()],
      {
        textOf,
      },
    )
    expect(asked).toHaveLength(5)
    expect(shape(asked[3])).toEqual({
      main: 'main.tex',
      engine: 'pdflatex',
      rerun: true,
      bibtex: null,
      files: true,
      sourceDate: DAY,
    })
    expect(dec(asked[3]!.overrides.get('main.tex'))).not.toContain('\\axtmark{0s}')
    expect(shape(asked[4])).toEqual({
      main: 'main.tex',
      engine: 'pdflatex',
      rerun: false,
      bibtex: false,
      sourceDate: DAY,
    })
    expect(pdfOf(made)).toMatchObject({
      pdf: TODAY,
      base: { pdf: FINAL },
      guard: { extra: 1, unmarked: [0], failed: ['text'] },
      cm: { drafts: 1, marked: 1, settled: true },
    })
  })
})

describe("the probe's raw log, returned beside the answers read from it", () => {
  it('with converge and without: the log the answers were read from', async () => {
    for (const o of [{}, { converge: true }]) {
      const answers =
        'converge' in o ? [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })] : [todayOf(), finalOf()]
      const { made } = await run(paperOf(), answers, o)
      expect(pdfOf(made).probeLog).toBe(lastTexLog(PROBE_LOG))
    }
  })
})
describe("the answers TeX gave where the document uses a macro (B4's `uses`), taken over the probe's", () => {
  it("the marking's inkless with them: a source answered there takes that answer, the probe's stand elsewhere", async () => {
    const answers = () => [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })]
    const plain = await run(paperOf(), answers(), { converge: true })
    const asked = await run(paperOf(), answers(), { converge: true, uses: { inkless: ['\\nada'], inked: [] } })
    expect([...(pdfOf(plain.made).options.inkless as Iterable<string>)]).toEqual([])
    expect([...(pdfOf(asked.made).options.inkless as Iterable<string>)]).toEqual(['\\nada'])
  })
})
/** what the engine asked and made at d5673d033 (this file's cases run there, before Q1), each request and result as digests */
const GOLDEN_AT_BASE: Record<string, unknown> = {
  'a paper: the probe, every pass, the final pass': {
    asked: ['5f1f37c8ef8db092', 'f8bf604f842ce399', '66ed7620758abc60'],
    made: {
      pdf: 'ba5627208b38c012',
      log: 'ee997e55c8c8064b',
      options: '5faa12ddb15d137d',
      base: {
        pdf: '545493fe6d654c8c',
        log: '0a642e14b0d5ae81',
      },
      guard: null,
      cm: null,
      ms: ['compile', 'final', 'probe'],
    },
  },
  'its bibliography shipped': {
    asked: ['5f1f37c8ef8db092', '358a3dbc66252b16', '66ed7620758abc60'],
    made: {
      pdf: 'ba5627208b38c012',
      log: 'ee997e55c8c8064b',
      options: '5faa12ddb15d137d',
      base: {
        pdf: '545493fe6d654c8c',
        log: '0a642e14b0d5ae81',
      },
      guard: null,
      cm: null,
      ms: ['compile', 'final', 'probe'],
    },
  },
  'a mark printed: the guard compiles it again, the final pass over the second': {
    asked: ['5f1f37c8ef8db092', 'f8bf604f842ce399', '0e5ab5bc8bf03338', '6964c9cca387d228'],
    made: {
      pdf: 'bca44c74041aebf9',
      log: 'ee997e55c8c8064b',
      options: '5faa12ddb15d137d',
      base: {
        pdf: '545493fe6d654c8c',
        log: '0a642e14b0d5ae81',
      },
      guard: {
        extra: 1,
        unmarked: [0],
        names: true,
        failed: ['text'],
      },
      cm: null,
      ms: ['compile', 'final', 'guard', 'probe'],
    },
  },
  'under latex: the driver output read': {
    asked: ['fd71859814c2da41', '34d155818ab5093c', 'f01a8461e905ede9'],
    made: {
      pdf: 'ba5627208b38c012',
      log: 'ee997e55c8c8064b',
      options: 'deee039e79c48b70',
      base: {
        pdf: '545493fe6d654c8c',
        log: '05a653048ac5e3ef',
      },
      guard: null,
      cm: null,
      ms: ['compile', 'final', 'probe'],
    },
  },
  'no final pass asked': {
    asked: ['5f1f37c8ef8db092', '73c0c9ecd4d448b1'],
    made: {
      pdf: 'ba5627208b38c012',
      log: 'ee997e55c8c8064b',
      options: '5faa12ddb15d137d',
      base: null,
      guard: null,
      cm: null,
      ms: ['compile', 'probe'],
    },
  },
}

// ---------------------------------------------------------------- Q2: `reduce`, a marked request that dies asked once more
/** pdfTeX dying in a pass (2610.30769v1's shipout): TeX ran, no error of TeX's, no host limit, the log cut short of AXT-END */
const DIED = `${TEX}LAYOUT-PROBE pages so far\n[1] [2`
const died = (files_: Record<string, string> | null = { 'main.aux': AUX }): Compiled => ({
  ok: false,
  pdf: null,
  log: DIED,
  ...(files_ ? { files: files(files_) } : {}),
})
/** whether a request's main file carries the paragraph ends' TeX (the optional class) */
const paraEnds = (q: CompileRequest | undefined) => dec(q?.overrides.get('main.tex')).includes('para/end')
/** a request's files, its main file's paragraph ends left out: what its reduced request must be */
const reducedOf = (q: CompileRequest) =>
  sorted(q).map(([p, t]) => [p, p === 'main.tex' ? t!.split(POINTS_TEX).join(POINTS_TEX_REDUCED) : t])

describe('Q2 (reduce): a marked request that died is asked once more without the optional classes, and every one after it', () => {
  it("off (today's reader): a death is not asked again", async () => {
    const { asked, made } = await q1(paperOf(), [died(), todayOf(), finalOf()])
    expect(asked).toHaveLength(4)
    expect(asked.every((q, i) => i === 0 || paraEnds(q))).toBe(true)
    expect(pdfOf(made).cm).toMatchObject({ fallback: 'draft-failed' })
    expect(pdfOf(made).guard).toBeUndefined()
  })

  it('pass 1 dies: asked again reduced over the same files, then every pass reduced; B the settled reduced pass, said so', async () => {
    const { asked, made } = await q1(paperOf(), [died(), draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })], {
      reduce: true,
    })
    expect(asked).toHaveLength(4)
    expect(paraEnds(asked[1])).toBe(true)
    // (the same request, its main file's paragraph ends left out, nothing else)
    expect(shape(asked[2])).toEqual(shape(asked[1]))
    expect(sorted(asked[2])).toEqual(reducedOf(asked[1]!))
    expect(paraEnds(asked[2])).toBe(false)
    expect(paraEnds(asked[3])).toBe(false)
    expect(dec(asked[3]!.overrides.get('main.tex')).split('\n')[0]).toBe(NO_DRIVER_GROUP)
    const m = pdfOf(made)
    expect(m.pdf).toBe(P2)
    expect(m.base).toEqual({ pdf: P2, log: lastTexLog(logOf(LINES)) })
    expect(m.guard).toEqual({ extra: 0, unmarked: [], names: true, failed: [], reduced: true })
    expect(m.cm).toEqual({ drafts: 1, marked: 1, settled: true })
  })

  it('a full pass dies: asked again reduced over the files carried to it, the passes after it reduced', async () => {
    const { asked, made } = await q1(
      paperOf(),
      [draftOf({ 'main.aux': AUX }), died(), fullOf({ 'main.aux': AUX2 }), fullOf({ 'main.aux': AUX2 }, P3)],
      { reduce: true },
    )
    expect(asked).toHaveLength(5)
    expect(sorted(asked[3])).toEqual(reducedOf(asked[2]!))
    expect(dec(asked[3]!.overrides.get('main.aux'))).toBe(AUX)
    expect(paraEnds(asked[4])).toBe(false)
    expect(pdfOf(made)).toMatchObject({ pdf: P3, guard: { reduced: true }, cm: { settled: true } })
  })

  it("is asked once: a reduced request that dies is the loop's and the guard's as today", async () => {
    const { asked, made } = await q1(paperOf(), [died(), died(), todayOf(), finalOf()], { reduce: true })
    // (the death, its reduced request, then today's request, reduced too, and its final pass)
    expect(asked).toHaveLength(5)
    expect([2, 3, 4].map((i) => paraEnds(asked[i]))).toEqual([false, false, false])
    expect(shape(asked[3])).toMatchObject({ rerun: true })
    expect(pdfOf(made)).toMatchObject({
      pdf: TODAY,
      base: { pdf: FINAL },
      cm: { fallback: 'draft-failed' },
      guard: { reduced: true },
    })
  })

  it("is not asked where TeX said why: a TeX error, a host's limit, TeX that never ran", async () => {
    const cases: [string, Compiled][] = [
      ['an error of TeX', { ok: false, pdf: null, log: `${TEX}! Undefined control sequence.\nl.4 \\foo\n` }],
      ["the host's limit", { ok: false, pdf: null, log: DIED, limit: 'cpu' } as Compiled],
      ['a timeout', { ok: false, pdf: null, log: DIED, error: 'Compilation timeout' }],
      ['no TeX', { ok: false, pdf: null, log: 'the jail could not start' }],
    ]
    for (const [why, answer] of cases) {
      const { asked } = await q1(paperOf(), [answer, todayOf(), finalOf()], { reduce: true })
      expect(asked, why).toHaveLength(4)
      expect(paraEnds(asked[2]), why).toBe(true)
    }
  })

  it("without the loop: today's compile that dies is asked again reduced, and its final pass is the reduced one's", async () => {
    const { asked, made } = await run(paperOf(), [died(), todayOf(), finalOf()], { reduce: true })
    expect(asked).toHaveLength(4)
    expect(shape(asked[2])).toEqual(shape(asked[1]))
    expect(sorted(asked[2])).toEqual(reducedOf(asked[1]!))
    expect(paraEnds(asked[3])).toBe(false)
    expect(pdfOf(made)).toMatchObject({ pdf: TODAY, base: { pdf: FINAL }, guard: { reduced: true } })
  })

  it("the guard's remedy and the final pass that die are asked again reduced", async () => {
    // (a mark printed: the guard's remedy, today's request, dies and is asked again reduced)
    const textOf = async (pdf: Uint8Array) =>
      dec(pdf) === dec(P2) ? ['We use the method of \\axtmark{0s}', 'Another'] : ['We use the method of', 'Another']
    const g = await q1(
      paperOf(),
      [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX }), died(), todayOf(), finalOf()],
      {
        reduce: true,
        textOf,
      },
    )
    expect(g.asked).toHaveLength(6)
    expect(sorted(g.asked[4])).toEqual(reducedOf(g.asked[3]!))
    expect(pdfOf(g.made)).toMatchObject({
      pdf: TODAY,
      base: { pdf: FINAL },
      guard: { extra: 1, failed: ['text'], reduced: true },
    })
    // (the final pass after five passes dies: asked again reduced over the same files)
    const moving = (n: number) => fullOf({ 'main.aux': `\\relax \n\\newlabel{s}{{1}{${n}}}\n` })
    const f = await q1(
      paperOf(),
      [draftOf({ 'main.aux': AUX }), moving(2), moving(3), moving(4), moving(5), died(null), finalOf()],
      {
        reduce: true,
      },
    )
    expect(f.asked).toHaveLength(8)
    expect(sorted(f.asked[7])).toEqual(reducedOf(f.asked[6]!))
    expect(pdfOf(f.made)).toMatchObject({ base: { pdf: FINAL }, guard: { reduced: true } })
  })
})

// ---------------------------------------------------------------- option (i): the bibliography pass's files carried into pass 1
describe("the bibliography pass's files, carried into the loop's pass 1 (`carried`)", () => {
  const BIBSRC =
    '\\documentclass{article}\n\\begin{document}\nWe use the method of \\cite{a} here.\n\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n'
  const BBL =
    '\\begin{thebibliography}{1}\n\n\\bibitem{a}\nA.~Author.\n\\newblock A title of a paper.\n\\newblock 2020.\n\n\\end{thebibliography}\n'
  const BIBAUX = '\\relax \n\\citation{a}\n\\bibstyle{plain}\n\\bibdata{refs}\n'
  it('madeBibliography gives the files its pass wrote beside the .bbl it made', async () => {
    const paper = openPaper(
      new Map([
        ['main.tex', enc(BIBSRC)],
        ['refs.bib', enc('@article{a}')],
      ]),
    )
    const wrote = files({ 'main.aux': BIBAUX, 'main.bbl': BBL })
    const c = compiler([{ ok: true, pdf: null, log: logOf(), files: wrote }])
    const r = await madeBibliography(paper, { compile: c.compile })
    if (!('paper' in r)) throw new Error(`kept: ${r.kept}`)
    expect(r.files).toBe(wrote)
    expect(dec(r.made.bytes)).toBe(BBL)
  })
  it('with converge: pass 1 is given them beside its own, every later pass those no pass wrote again; without, no request carries them', async () => {
    const carried = files({ 'main.aux': BIBAUX, 'main.out': 'from the bibliography pass\n' })
    const { asked, made } = await q1(paperOf(), [draftOf({ 'main.aux': AUX }), fullOf({ 'main.aux': AUX })], {
      carried,
    })
    expect(dec(asked[1]!.overrides.get('main.aux'))).toBe(BIBAUX)
    expect(dec(asked[1]!.overrides.get('main.out'))).toBe('from the bibliography pass\n')
    // (pass 1 wrote main.aux again; main.out it did not: carried on as it was)
    expect(dec(asked[2]!.overrides.get('main.aux'))).toBe(AUX)
    expect(dec(asked[2]!.overrides.get('main.out'))).toBe('from the bibliography pass\n')
    // (the marked files are the pass's own, never a carried copy's)
    expect(dec(asked[1]!.overrides.get('main.tex'))).toContain(DRAFT_OPTION)
    expect(pdfOf(made).cm).toEqual({ drafts: 1, marked: 1, settled: true })
    const off = await today(paperOf(), [todayOf(), finalOf()], { carried })
    expect(off.asked.every((q) => !q.overrides.has('main.out'))).toBe(true)
    // (and held to the host's bound with the rest)
    const bound = await q1(paperOf(), [draftOf({ 'main.aux': AUX }), todayOf(), finalOf()], {
      carried,
      filesBound: { count: 1, bytes: 1e6 },
    })
    expect(pdfOf(bound.made).cm).toMatchObject({ fallback: 'files-bound' })
  })
})
