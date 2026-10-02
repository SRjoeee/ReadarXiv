import { describe, expect, it } from 'vitest'
import { copyTexts, decideWrite, pipelineCurrentFor, reusable, seedAgain, seedFrom, sourceHash, unitsOf, unsetAfter } from '@/pdf-reader/engine/cache.mjs'
import { type Compiled, compilerKeeper, keptFor, openPaper, runLive } from '@/pdf-reader/engine/live.mjs'
import type { Marks } from '@/pdf-reader/engine/typeset/places.mjs'

// The reader's compiles with the typesetting rule (experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md,
// "The compile sequence"; the evaluation's rulings in the F2 brief): the font probe with its width probe; the first
// preview as today; the marked original in full, with its line probes, right after it; later previews planned on their
// snapshot; the last preview of the whole translation, complete, measures the final — else a draft one-pass of it does;
// no plan, today's setting. Over a compiler that answers each compile with the log and the PDF a real one would, read
// by the rule's own readers

const PARAS = 12
const sourceOf = (paras: number) => `\\documentclass{article}\\begin{document}\n${Array.from({ length: paras }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')}\\end{document}\n`
/** a paper of twelve paragraphs, two batches of the service's (the first is small, live.mjs nextBatch); `paras` fewer */
const paper = (paras = PARAS) => openPaper(new Map([['main.tex', new TextEncoder().encode(sourceOf(paras))]]))
/** the font probe's log: Computer Modern at 10 pt in a 345 pt column, its sizes below (as typeset-plan.test.ts) */
const FONT_LOG = `AXT-FONTS rm=cmr;sf=cmss;tt=cmtt;body=10;\nAXT-WIDTH 1300.0pt 10 345.0pt\n${[0.9, 0.95].map(f => `AXT-SIZE ${f} ${(1300 * f).toFixed(1)}pt 1300.0pt`).join('\n')}\n`
/** a compile's line probes: each unit 4 lines at 12 pt on a 10 pt size, and the end of the document */
const linesLog = (n: number) => `${Array.from({ length: n }, (_, i) => `AXT-LINES ${i} 4 12.0pt 10`).join('\n')}\nAXT-END\n`
/** each unit a sixth of a page, in one column */
const MARKS = (n: number): Marks => {
  const marks = new Map<string, { page: number; x: number; y: number }>()
  for (let i = 0; i < n; i++) { const page = Math.floor(i / 6), y = 700 - (i % 6) * 100; marks.set(`${i}s`, { page, x: 72, y }); marks.set(`${i}e`, { page, x: 300, y: y - 48 }) }
  return { pages: Math.ceil(n / 6), width: 612, height: 792, columns: Array(Math.ceil(n / 6)).fill(1), marks }
}
type Req = { main: string; engine: string; rerun: boolean; bibtex: boolean | null; overrides: Map<string, Uint8Array> }
const main = (q: Req) => new TextDecoder('latin1').decode(q.overrides.get(q.main))
/** what a compile is, by what it was given */
const kindOf = (q: Req) => (main(q).includes('AXT-FONTS') ? 'probe' : /xeCJK|CJKutf8/.test(main(q)) ? (q.rerun ? 'final' : 'preview') : 'original')
/** the rule's TeX in a compile of the translation: its unit leadings */
const ruled = (q: Req) => /\\csname axtlead@\d+\\endcsname/.test(main(q))

/** Chinese for every English word of a wire text, markers left as they are; `hold` keeps the second batch back until
 *  it is released */
function translator() {
  let release: () => void = () => {}
  const held = new Promise<void>(r => { release = r })
  let batches = 0
  const translate = async (texts: string[]) => {
    if (++batches > 1) await held
    return texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
  }
  return { translate, release: () => release() }
}

/** a compiler that answers as TeX would, and calls `on` with each compile's kind before it answers */
type Answering = { on?: (kind: string) => void; log?: (kind: string, q: Req) => string | null; fail?: (kind: string, q: Req) => boolean }
function compiler(n: number, { on = () => {}, log = () => null, fail = () => false }: Answering = {}) {
  const calls: { kind: string; ruled: boolean; rerun: boolean }[] = []
  const compile = async (q: Req): Promise<Compiled> => {
    const kind = kindOf(q)
    calls.push({ kind, ruled: ruled(q), rerun: q.rerun })
    on(kind)
    if (fail(kind, q)) return { ok: false, pdf: null, log: '! LaTeX Error: a failure.', ms: 1 }
    const given = log(kind, q)
    return { ok: true, pdf: new Uint8Array([calls.length]), aux: '\\bibcite{a}{1}\n', bbl: null, log: given ?? (kind === 'probe' ? FONT_LOG : linesLog(n)), ms: 1 }
  }
  return { calls, compile }
}

const run = async (options: { readMarks?: ((pdf: Uint8Array) => Promise<Marks>) | null; compiler: ReturnType<typeof compiler>; release?: () => void; translate: (texts: string[]) => Promise<{ text: string; by: string }[]> }) => {
  const p = paper(), notes: [string, Record<string, unknown>][] = []
  const r = await runLive(p, { lang: 'zh', compile: options.compiler.compile, translate: options.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: options.readMarks === undefined ? async () => MARKS(p.units.length) : options.readMarks, note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
  return { r, notes, calls: options.compiler.calls }
}

describe('the compile sequence with the typesetting rule', () => {
  it('probe, the first preview as today, the original in full with its line probes, then a planned preview that measures the final', async () => {
    const t = translator(), n = paper().units.length
    // the second batch comes once the original is asked for: the original goes right after the first preview
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } })
    const { r, calls } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
    expect(calls[2]?.rerun).toBe(true)
    expect(r.settled).toBe(true)
  })

  it('the font probe carries the width probe, and the original its line probes', async () => {
    const t = translator(), n = paper().units.length, given: Req[] = []
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { given.push(q); return base(q) }
    await run({ compiler: c, translate: t.translate })
    expect(main(given[0] as Req)).toContain('AXT-WIDTH')
    expect(main(given.find(q => kindOf(q) === 'original') as Req)).toContain('\\axtlines{0}')
  })

  it('a last preview that is not complete — a citation undefined — is no measure: a draft of the whole translation measures', async () => {
    const t = translator(), n = paper().units.length
    let previews = 0
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, log: k => (k === 'preview' && ++previews === 2 ? `LaTeX Warning: Citation \`x' on page 1 undefined on input line 3.\n${linesLog(n)}` : null) })
    const { calls } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'preview+rule', 'final+rule'])
    expect(calls[4]?.rerun).toBe(false)
  })

  it('a preview after the first reads the original\'s citations where its references have none: the first ran BibTeX after its one pass, and the second is complete, the measure', async () => {
    const t = translator(), n = paper().units.length
    let previews = 0
    // as TeX does it: a preview's citations are defined only where the aux it was given has them; a first preview's aux
    // has none (BibTeX ran after its pass), and the original's every one
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => {
      const r = await base(q), kind = kindOf(q), given = new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array())
      if (kind !== 'preview') return r
      const undefinedCites = !/\\bibcite\{/.test(given)
      return { ...r, aux: ++previews === 1 ? '\\citation{a}\n' : r.aux, log: `${undefinedCites ? "LaTeX Warning: Citation `a' on page 1 undefined on input line 3.\n" : ''}${r.log}` }
    }
    const { calls } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
  })

  it('no way to read a PDF\'s marks: no plan, every compile as today, and the original where it was (when the compiler waits)', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n)
    t.release()
    const given: Req[] = [], base = c.compile
    c.compile = async (q: Req) => { given.push(q); return base(q) }
    const { calls, r } = await run({ compiler: c, translate: t.translate, readMarks: null })
    expect(calls.some(q => q.ruled)).toBe(false)
    expect(main(given[0] as Req)).not.toContain('AXT-WIDTH')
    expect(main(given.find(q => kindOf(q) === 'original') ?? given[0] as Req)).not.toContain('\\axtlines{0}')
    expect(r.settled).toBe(true)
  })

  it('an original whose log stops short gives no plan: today\'s setting, and the reason noted once', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, log: k => (k === 'original' ? linesLog(n).replace('AXT-END\n', '') : null) })
    const { calls, notes } = await run({ compiler: c, translate: t.translate })
    expect(calls.some(q => q.ruled)).toBe(false)
    expect(notes.filter(([e]) => e === 'typeset').map(([, d]) => d.missing)).toEqual(["the original's log, whole"])
  })

  it('a TeX failure under the rule tries the same engine without it before the next strategy (ruling 6): a preview', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, fail: (k, q) => k === 'preview' && ruled(q) })
    const { calls, notes } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'preview', 'final'])
    expect(notes.filter(([e]) => e === 'next strategy')).toEqual([])
    expect(notes.filter(([e]) => e === 'typeset failed').map(([, d]) => d.strategy)).toEqual(['XeLaTeX + xeCJK'])
  })

  it('and the final: once without the rule on the same engine, then the next strategy, planned again', async () => {
    const t = translator(), n = paper().units.length
    // the paper's own engine is pdfLaTeX: xeCJK first, CJKutf8 next; every final of xeCJK fails, and CJKutf8's with the rule
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, fail: (k, q) => k === 'final' && (main(q).includes('xeCJK') || ruled(q)) })
    const kindOf2 = (q: { kind: string; ruled: boolean; rerun: boolean }) => `${q.kind}${q.ruled ? '+rule' : ''}`
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    const finals = calls.filter(q => q.rerun && q.kind !== 'original').map(kindOf2)
    expect(finals).toEqual(['final+rule', 'final', 'final+rule', 'final'])
    expect(notes.filter(([e]) => e === 'next strategy').length).toBe(1)
    expect(r.settled).toBe(true)
  })
})

// The marked original in a TeX frame of its own (the F2 review's I2, V1'): from the run's start, beside the probe and the
// first preview, which it never delays; a whole translation after the first preview waits for its readings, so that the
// preview it compiles is planned and measures the final
describe('the original in a compiler of its own', () => {
  const kinds = (calls: { kind: string; ruled: boolean }[]) => calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
  /** a compiler whose answers wait for `gate` (resolved by the test), each call logged in `order` as it is asked */
  const held = (n: number, order: string[], name: string) => {
    let open: () => void = () => {}
    const gate = new Promise<void>(r => { open = r })
    const c = compiler(n), base = c.compile
    c.compile = async (q: Req) => { order.push(`${name}:${kindOf(q)}`); await gate; return base(q) }
    return { ...c, open: () => open() }
  }

  it('is asked for from the start, the first preview not waiting for it; the whole translation after the first preview waits for its readings, and that preview, planned, measures the final', async () => {
    const t = translator(), n = paper().units.length, order: string[] = []
    const own = held(n, order, 'own')
    const main = compiler(n, { on: k => { order.push(`main:${k}`); if (k === 'preview') t.release() } })
    // the original answers once the translation is whole and the run has had time to compile it unplanned, if it would
    const p = paper(), notes: string[] = []
    const done = runLive(p, {
      lang: 'zh', compile: main.compile, compileOriginal: own.compile, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length),
      translate: async texts => { const r = await t.translate(texts); if (r.length && notes.includes('translated')) setTimeout(() => own.open(), 50); return r },
      note: e => notes.push(e),
    })
    const r = await done
    expect(order.slice(0, order.indexOf('main:preview'))).toContain('own:original')
    expect(kinds(main.calls)).toEqual(['probe', 'preview', 'preview+rule', 'final+rule'])
    expect(kinds(own.calls)).toEqual(['original'])
    expect(notes.filter(e => e === 'measure')).toEqual([])
    expect(r.settled).toBe(true)
  })

  it('a translation whole by the first preview: that preview is set as today, and the final is measured by a draft once the original is in', async () => {
    // one batch: the whole translation is in the first preview
    const t = translator(), p = paper(4), n = p.units.length, order: string[] = []
    const own = held(n, order, 'own')
    const main = compiler(n)
    const r = await runLive(p, {
      lang: 'zh', compile: main.compile, compileOriginal: own.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length),
      // held until the first preview is on screen: had the run waited for it, it would wait for ever
      onUpdate: ({ final }) => { if (!final) own.open() },
    })
    expect(kinds(main.calls)).toEqual(['probe', 'preview', 'preview+rule', 'final+rule'])
    expect(main.calls[2]?.rerun).toBe(false)
    expect(r.settled).toBe(true)
  })
})

describe('a seed taken as it is (ruling 4: a typesetting change never asks the service again)', () => {
  it('a current seed is not sent, is in the run\'s results as it was, and the final is compiled on the typesetting changed', async () => {
    const p = paper(), n = p.units.length, c = compiler(n), sent: string[] = []
    const pieces = (i: number) => (p.units[i]?.pieces ?? []).map(q => (q as { t: string }).t === 'text' ? { ...(q as object), tr: true } : q)
    // every unit but the last seeded current; the last a seed of another identity
    const seed = new Map(p.units.map((_, i) => [i, { pieces: pieces(i), state: 'whole', by: i < n - 1 ? 'B' : 'A', tried: 'B', current: i < n - 1 }]))
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: async texts => { sent.push(...texts); return texts.map(text => ({ text, by: 'B' })) }, format: 'markers', marks: new Map(), identity: 'B', seed, pipelineCurrent: false, readMarks: async () => MARKS(n) })
    expect(sent).toHaveLength(1)
    expect([...r.results.keys()].sort((a, b) => a - b)).toEqual(p.units.map((_, i) => i))
    expect([...r.results.values()].every(x => (x as { state: string; by: string }).state === 'whole' && (x as { by: string }).by === 'B')).toBe(true)
    expect(c.calls.some(q => q.kind === 'final')).toBe(true)
  })
})

// The TeX page's protocol 2 (experiments/pdf-bilingual/poc-site/tex-page.mjs; the S3a report, "what the reader must do",
// and its review's I5): files a compile could not fetch for a network reason make it not the paper's; a failure of the
// page's own (an error, no log) says nothing of the paper either
describe('a compile the network or the page failed', () => {
  const kinds = (calls: { kind: string; ruled: boolean }[]) => calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
  it('one the network failed is asked once more as it was: no strategy changed, the run goes on', async () => {
    const t = translator(), n = paper().units.length
    let failedOnce = false
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { const r = await base(q); if (kindOf(q) === 'final' && !failedOnce) { failedOnce = true; return { ...r, ok: false, pdf: null, aux: '\\bibcite{x}{9}', network: ['t/xecjk.sty'] } } return r }
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    expect(kinds(calls)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule', 'final+rule'])
    expect(notes.filter(([e]) => e === 'next strategy')).toEqual([])
    expect(notes.filter(([e]) => e === 'compile again').length).toBe(1)
    expect(r.settled).toBe(true)
  })
  it('twice: the run stops as for a network down — nothing set, no strategy changed, nothing to remember', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { const r = await base(q); return kindOf(q) === 'final' ? { ...r, ok: false, pdf: null, network: ['t/xecjk.sty'] } : r }
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    expect(kinds(calls).filter(k => k.startsWith('final'))).toEqual(['final+rule', 'final+rule'])
    expect(notes.filter(([e]) => e === 'next strategy' || e === 'typeset failed')).toEqual([])
    expect([r.settled, r.exhausted, r.compiler?.down]).toEqual([false, false, 'network'])
  })
  it('the page\'s own failure (an error, no log) changes no strategy and leaves no "cannot typeset": the final once more, then the run stops, no compiler', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { if (kindOf(q) !== 'final') return base(q); c.calls.push({ kind: 'final', ruled: ruled(q), rerun: q.rerun }); return { ok: false, error: 'compile before init', network: [] } }
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    expect(kinds(calls).filter(k => k.startsWith('final'))).toEqual(['final+rule', 'final+rule'])
    expect(notes.filter(([e]) => e === 'next strategy' || e === 'typeset failed')).toEqual([])
    expect([r.settled, r.exhausted, r.compiler?.down]).toEqual([false, false, 'page'])
  })
  it('a preview the page failed once is asked again as it was, and the run goes on', async () => {
    const t = translator(), n = paper().units.length
    let failedOnce = false
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { if (kindOf(q) === 'preview' && !failedOnce) { failedOnce = true; c.calls.push({ kind: 'preview', ruled: ruled(q), rerun: q.rerun }); return { ok: false, error: 'compile before init', network: [] } } return base(q) }
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    expect(kinds(calls)).toEqual(['probe', 'preview', 'preview', 'original', 'preview+rule', 'final+rule'])
    expect(notes.filter(([e]) => e === 'next strategy')).toEqual([])
    expect(r.settled).toBe(true)
  })
  it('the page\'s own failure throws its frame away: the next compile opens a fresh one', async () => {
    let opened = 0
    const keeper = compilerKeeper(async () => { opened++; return { compile: async () => (opened === 1 ? { ok: false, error: 'compile before init' } : { ok: true }), close: () => {} } })
    await keeper.compile({} as never)
    const second = await keeper.compile({} as never)
    expect([opened, second.ok]).toEqual([2, true])
  })
})


// The original's readings kept (the F2 review's I3): what the rule and the run read of the marked original, given back by
// a run, so that a run again in the visit, a revisit and another language compile no original (session.mjs, the
// store's `originals`, one per paper)
describe('the original\'s readings, kept', () => {
  const kinds = (calls: { kind: string; ruled: boolean }[]) => calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
  const ORIGINAL_LOG = (n: number) => `This is pdfTeX, Version 3.14\n(./main.tex\nLaTeX2e <2025-11-01>\nMissing character: There is no ^^c3 in font cmr10!\nOverfull \\hbox (1.2pt too wide) in paragraph at lines 3--4\n${linesLog(n)}Output written on main.pdf (2 pages).\n`

  it('a run gives back what it read of the original: the lines of its last pass that are read, its marks, its citations', async () => {
    const t = translator(), p = paper(4), n = p.units.length
    t.release()
    const c = compiler(n, { log: k => (k === 'original' ? ORIGINAL_LOG(n) : null) })
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect(r.original?.log.split('\n')).toEqual(['Missing character: There is no ^^c3 in font cmr10!', ...Array.from({ length: n }, (_, i) => `AXT-LINES ${i} 4 12.0pt 10`), 'AXT-END'])
    expect(r.original?.cites).toBe('\\bibcite{a}{1}')
    expect(r.original?.marks.pages).toBe(MARKS(n).pages)
  })

  it('given them with the left side\'s marks, a run compiles no original, and every preview is planned from the first', async () => {
    const p = paper(4), n = p.units.length, first = translator()
    first.release()
    const r1 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: first.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const t = translator(), c = compiler(n), own = compiler(n)
    t.release()
    const r = await runLive(p, { lang: 'zh', compile: c.compile, compileOriginal: own.compile, translate: t.translate, format: 'markers', marks: new Map([['0s', {}]]), original: r1.original, identity: 'B', readMarks: async () => MARKS(n) })
    expect(kinds(c.calls)).toEqual(['probe', 'preview+rule', 'final+rule'])
    expect(own.calls).toEqual([])
    expect([r.settled, r.originalOk, r.original]).toEqual([true, true, r1.original])
  })

  it('given them without the left side\'s marks, the original is compiled for those, and its readings are the run\'s', async () => {
    const p = paper(4), n = p.units.length, first = translator()
    first.release()
    const r1 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: first.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const t = translator(), c = compiler(n), own = compiler(n)
    t.release()
    const r = await runLive(p, { lang: 'zh', compile: c.compile, compileOriginal: own.compile, translate: t.translate, format: 'markers', marks: null, original: r1.original, identity: 'B', readMarks: async () => MARKS(n) })
    expect(kinds(own.calls)).toEqual(['original'])
    expect(r.original).not.toBe(r1.original)
    expect(r.original).toEqual(r1.original)
  })
})

// The original's labels and bibliography (the F2 re-review's N1): a draft with no references of its own — a re-set's
// measure, where no preview ran (every unit taken: a typesetting change), or the first preview — is given the
// original's \newlabel and \bibcite lines and its .bbl, kept with its readings; and the first preview runs no BibTeX or
// biber, whose citations are undefined either way (2608.29181, biber: 6.4 s against 15.5 s), the compiles after it
// reading the original's bibliography. 2608.08872 (biblatex) re-set without them went +1 page / 0.162 → +2 / 0.520
describe('the original\'s labels and bibliography, for a draft with none of its own', () => {
  const AUX = '\\relax\n\\newlabel{sec:a}{{1}{1}{Intro}{section.1}{}}\n\\newlabel{broken}{{1}{1}{An unclosed\n\\bibcite{a}{1}\n\\abx@aux@cite{0}{a}\n'
  const BBL = '% $ biblatex bbl format version 3.3 $\n\\refsection{0}\n\\entry{a}{article}{}{1}\n\\endentry\n\\endrefsection\n'
  const text = (q: Req | undefined, path: string) => (q?.overrides.get(path) ? new TextDecoder().decode(q.overrides.get(path)) : null)
  /** a draft's own aux after its one pass with no bibliography: its labels, no citation */
  const OWN = '\\relax\n\\newlabel{sec:a}{{1}{2}{Own}{section.1}{}}\n'
  /** a compiler whose marked original's aux and bbl are AUX and BBL, a preview's aux OWN and, as TeX writes them from
   *  the bibliography it was given, its citations; every request kept */
  const withOriginal = (n: number, answering: Answering = {}, aux = AUX) => {
    const c = compiler(n, answering), base = c.compile, given: Req[] = []
    c.compile = async (q: Req) => {
      given.push(q)
      const r = await base(q), kind = kindOf(q), cites = q.overrides.has('main.bbl') && aux.includes('\\bibcite') ? '\\bibcite{a}{1}\n' : ''
      return !r.ok ? r : kind === 'original' ? { ...r, aux, bbl: BBL } : kind === 'preview' ? { ...r, aux: OWN + cites } : r
    }
    return { ...c, given }
  }
  const taken = (p: ReturnType<typeof paper>) => new Map(p.units.map((u, i) => [i, { pieces: u.pieces.map(q => ((q as { t: string }).t === 'text' ? { ...(q as object), tr: true } : q)), state: 'whole', by: 'B', tried: 'B', current: true }]))

  it('the readings carry the original\'s whole \\newlabel lines and its bbl beside its citations', async () => {
    const p = paper(4), n = p.units.length, t = translator()
    t.release()
    const c = withOriginal(n)
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect([r.original?.labels, r.original?.cites, r.original?.bbl]).toEqual(['\\newlabel{sec:a}{{1}{1}{Intro}{section.1}{}}', '\\bibcite{a}{1}', BBL])
  })

  it('a re-set — every unit taken, so no preview — measures the final with the original\'s labels, citations and bibliography, and runs no bibliography program for it', async () => {
    const p = paper(4), n = p.units.length, c = withOriginal(n)
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: async () => { throw new Error('nothing is sent') }, format: 'markers', marks: new Map(), identity: 'B', seed: taken(p), pipelineCurrent: false, readMarks: async () => MARKS(n) })
    const measure = c.given.find(q => kindOf(q) === 'preview')
    expect(text(measure, 'main.aux')).toContain('\\newlabel{sec:a}{{1}{1}{Intro}{section.1}{}}')
    expect(text(measure, 'main.aux')).toContain('\\bibcite{a}{1}')
    expect(text(measure, 'main.aux')).not.toContain('broken')
    expect([text(measure, 'main.bbl'), measure?.bibtex]).toEqual([BBL, false])
    expect(text(c.given.find(q => kindOf(q) === 'final'), 'main.bbl')).toBe(BBL)
    expect(r.settled).toBe(true)
  })

  it('so does one given the readings a run before kept: no original compiled, the stored labels and bibliography handed on', async () => {
    const p = paper(4), n = p.units.length, first = translator()
    first.release()
    const r1 = await runLive(p, { lang: 'zh', compile: withOriginal(n).compile, translate: first.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const kept = JSON.parse(JSON.stringify({ ...r1.original, marks: { ...r1.original?.marks, marks: [...(r1.original?.marks.marks ?? [])] } }))
    const c = withOriginal(n)
    await runLive(p, { lang: 'zh', compile: c.compile, translate: async () => { throw new Error('nothing is sent') }, format: 'markers', marks: new Map([['0s', {}]]), original: { ...kept, marks: { ...kept.marks, marks: new Map(kept.marks.marks) } }, identity: 'B', seed: taken(p), pipelineCurrent: false, readMarks: async () => MARKS(n) })
    expect(c.given.some(q => kindOf(q) === 'original')).toBe(false)
    const measure = c.given.find(q => kindOf(q) === 'preview')
    expect([text(measure, 'main.aux')?.includes('\\newlabel{sec:a}'), text(measure, 'main.bbl'), measure?.bibtex]).toEqual([true, BBL, false])
  })

  it('the first preview runs no bibliography program; the preview after the original, and the final, are given its bibliography', async () => {
    const t = translator(), n = paper().units.length
    const c = withOriginal(n, { on: k => { if (k === 'original') t.release() } })
    await run({ compiler: c, translate: t.translate })
    const previews = c.given.filter(q => kindOf(q) === 'preview')
    expect(previews.map(q => [q.bibtex, text(q, 'main.bbl')])).toEqual([[false, null], [false, BBL]])
    // the first preview's own aux, its labels, and the original's citations, which it has none of
    expect(text(previews[1], 'main.aux')).toBe(`${OWN}\n\\bibcite{a}{1}`)
    expect(text(c.given.find(q => kindOf(q) === 'final'), 'main.bbl')).toBe(BBL)
  })

  it('without the rule the original may come late: the first preview runs it as before', async () => {
    const t = translator(), n = paper().units.length
    t.release()
    const c = withOriginal(n)
    await run({ compiler: c, translate: t.translate, readMarks: null })
    expect(c.given.find(q => kindOf(q) === 'preview')?.bibtex).toBe(true)
  })

  it('under biblatex (no \\bibcite anywhere), a preview that read no bibliography, or whose citation biblatex left undefined (its warning wrapped at 79 columns), is no measure: a draft of the whole translation measures', async () => {
    const BIBLATEX = AUX.replace('\\bibcite{a}{1}\n', '')
    const wrapped = `LaTeX Warning: Citation 'Cybenko89ApproximationSuperpositionsSigmoidal' on page\n 1 undefined on input line 318.\n`
    const sequence = async (said: string) => {
      const t = translator(), n = paper().units.length
      let previews = 0
      const c = withOriginal(n, { on: k => { if (k === 'original') t.release() }, log: k => (k === 'preview' && ++previews === 2 ? `${said}${linesLog(n)}` : null) }, BIBLATEX)
      await run({ compiler: c, translate: t.translate })
      return c.calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
    }
    for (const missing of ['No file main.bbl.\n', wrapped]) expect(await sequence(missing)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'preview+rule', 'final+rule'])
    // and one that read it, its citations defined: the measure, whatever else biblatex says of every one-pass draft
    expect(await sequence("LaTeX Warning: There were undefined references.\nPackage biblatex Warning: Please (re)run Biber on the file:\n")).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
  })
})

// The contents lists (the F2 re-review's N2): a one-pass draft reads its \tableofcontents, \listoffigures and
// \listoftables from the files a pass writes at its end from the aux's \@writefile lines, and was given the aux alone:
// every list set empty, every unit after it measured early by its height (zh 2608.02459, its contents before 550 of its
// 555 units: 0.939 of a page's start drift, 0.098 with them). A draft is given the lists of the aux it is given; one
// that set a list from nothing (LaTeX's "No file main.toc.") is no measure, and a re-set's measure, which has no aux of
// the translation's, is measured again with its own lists
describe('the contents lists, for every draft', () => {
  /** each draft's aux: its contents, its heading translated, numbered by the draft */
  const OWN = (k: number) => `\\relax\n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}\u8bba\u6587 ${k}}{1}{section.1}\\protected@file@percent }\n\\bibcite{a}{1}\n`
  const list = (q: Req | undefined, ext: string) => (q?.overrides.get(`main.${ext}`) ? new TextDecoder().decode(q.overrides.get(`main.${ext}`)) : null)
  /** as TeX does: a draft's aux writes its list, and a draft given no list file says so in its log; every request kept */
  const withLists = (n: number, answering: Answering = {}, lists = true) => {
    const c = compiler(n, answering), base = c.compile, given: Req[] = []
    let drafts = 0
    c.compile = async (q: Req) => {
      given.push(q)
      const r = await base(q)
      if (!r.ok || kindOf(q) !== 'preview' || !lists) return r
      return { ...r, aux: OWN(++drafts), log: `${q.overrides.has('main.toc') ? '' : 'No file main.toc.\n'}${r.log}` }
    }
    return { ...c, given }
  }
  const taken = (p: ReturnType<typeof paper>) => new Map(p.units.map((u, i) => [i, { pieces: u.pieces.map(q => ((q as { t: string }).t === 'text' ? { ...(q as object), tr: true } : q)), state: 'whole', by: 'B', tried: 'B', current: true }]))
  const reset = (c: ReturnType<typeof withLists>, notes: string[] = []) => {
    const p = paper(4), n = p.units.length
    return runLive(p, { lang: 'zh', compile: c.compile, translate: async () => { throw new Error('nothing is sent') }, format: 'markers', marks: new Map(), identity: 'B', seed: taken(p), pipelineCurrent: false, readMarks: async () => MARKS(n), note: (e: string) => notes.push(e) })
  }
  const TOC = (k: number) => `\\contentsline {section}{\\numberline {1}\u8bba\u6587 ${k}}{1}{section.1}\\protected@file@percent \n`

  it('a first visit: the first preview has no lists, as it has no aux; every draft after it the lists of the one before; the final writes its own', async () => {
    const t = translator(), n = paper().units.length
    const c = withLists(n, { on: k => { if (k === 'original') t.release() } })
    await run({ compiler: c, translate: t.translate })
    expect(c.given.filter(q => kindOf(q) === 'preview').map(q => list(q, 'toc'))).toEqual([null, TOC(1)])
    const final = c.given.find(q => kindOf(q) === 'final')
    expect([list(final, 'toc'), list(final, 'lof')]).toEqual([null, null])
  })

  it('a re-set — every unit taken, so no preview — sets its lists from nothing in its measure: measured once more, given its own lists, and the final set from that', async () => {
    const c = withLists(paper(4).units.length), notes: string[] = []
    const r = await reset(c, notes)
    const measures = c.given.filter(q => kindOf(q) === 'preview')
    expect(measures.map(q => list(q, 'toc'))).toEqual([null, TOC(1)])
    expect(notes.filter(e => e === 'measure')).toHaveLength(2)
    expect(r.settled).toBe(true)
  })

  it('a re-set of a paper whose aux writes no list is measured once', async () => {
    const c = withLists(paper(4).units.length, {}, false), notes: string[] = []
    await reset(c, notes)
    expect(notes.filter(e => e === 'measure')).toHaveLength(1)
  })

  it('the last preview of the whole translation, had it set a list from nothing, is no measure: a draft measures, given its lists', async () => {
    const t = translator(), n = paper().units.length
    let previews = 0
    const c = withLists(n, { on: k => { if (k === 'original') t.release() }, log: k => (k === 'preview' && ++previews === 2 ? `No file main.toc.\n${linesLog(n)}` : null) })
    await run({ compiler: c, translate: t.translate })
    expect(c.calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'preview+rule', 'final+rule'])
    expect(list(c.given.filter(q => kindOf(q) === 'preview')[2], 'toc')).toBe(TOC(2))
  })
})

// A run again after a run whose translation changed but whose final never reached the screen (C1 of PR #309's fix round):
// the TeX page down for the final, the retry offered. The run again is seeded with that translation (seedAgain), which no
// PDF sets, and finds nothing changed against it: it wrote it as provenance over the copy's PDF, which sets the old one,
// labelled current and never set again. It compiles its final instead, and no provenance write keeps a PDF whose text is
// not the units'
describe('a run again after a final that never reached the screen', () => {
  const answer = (word: string, by: string) => async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, word), by }))
  /** the TeX page down for every final: asked twice, then the run stops with no compiler */
  const pageDownForFinals = (n: number) => {
    const c = compiler(n), base = c.compile
    c.compile = async (q: Req) => { const r = await base(q); return kindOf(q) === 'final' ? { ...r, ok: false, pdf: null, network: ['t/xecjk.sty'] } : r }
    return c
  }
  /** a copy by B (OLD), then a run by C that answers anew (NEW) and whose final the TeX page was down for */
  const visit = async () => {
    const p = paper(3), n = p.units.length
    const r0 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: answer('OLD', 'B'), format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ marks: [['0s', {}]], units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r0.results) }))
    const { seed } = await seedFrom(record, p.units)
    const r1 = await runLive(p, { lang: 'zh', compile: pageDownForFinals(n).compile, translate: answer('NEW', 'C'), format: 'markers', marks: new Map(record.marks), identity: 'C', seed: reusable(seed, { identity: 'C', copyWire: true }), pipelineCurrent: true, readMarks: async () => MARKS(n) })
    return { p, n, hashes, record, seed, r1 }
  }
  /** the retry, as session.mjs makes it: the last run's results over the copy's seed, and this run's own final shown */
  const again = async (v: Awaited<ReturnType<typeof visit>>, pipelineCurrent: boolean) => {
    const made = v.r1.results as never, finals: { id: number; text: string }[][] = []
    const r = await runLive(v.p, { lang: 'zh', compile: compiler(v.n).compile, translate: answer('NEW', 'C'), format: 'markers', marks: new Map(v.record.marks), identity: 'C', seed: reusable(seedAgain(v.seed, made), { identity: 'C', copyWire: true, made }), pipelineCurrent, readMarks: async () => MARKS(v.n), onUpdate: ({ final, texts }) => { if (final) finals.push(texts as { id: number; text: string }[]) } })
    const units = unitsOf(v.p.units, keptFor(v.p, 'zh'), v.hashes, r.results)
    return { r, units, final: finals.at(-1), how: decideWrite({ result: r, cached: v.record, units, marks: v.record.marks, shown: finals.length > 0 }) }
  }

  it('one that compiles nothing does not write that translation over the copy\'s PDF, which sets the old one', async () => {
    const v = await visit()
    expect([v.r1.changed, v.r1.compiler?.down]).toEqual([true, 'network'])
    // the copy's compile current, as the reader judged it before: nothing compiled
    const { r, units, how } = await again(v, true)
    expect(r.changed).toBe(false)
    expect([v.record.units[0].tr, units[0]?.tr].map(t => t?.split(' ')[0])).toEqual(['OLD', 'NEW'])
    expect(how).toBeNull()
  })

  it('the visit holds the translation no PDF sets until a run\'s own final is shown: the run again compiles its final, and the copy written sets what its PDF does', async () => {
    const v = await visit()
    const unset = unsetAfter(false, v.r1, false)
    expect(pipelineCurrentFor({ copy: true, finalShown: false, unset })).toBe(false)
    const { r, units, final, how } = await again(v, pipelineCurrentFor({ copy: true, finalShown: false, unset }))
    expect([r.changed, r.settled, how]).toEqual([true, true, 'full'])
    expect(copyTexts(units).map(t => t.text)).toEqual(final?.map(t => t.text))
    expect(unsetAfter(unset, r, true)).toBe(false)
  })

  it('a final an earlier run showed does not answer for a later run\'s translation; a run that changed nothing keeps what the visit held', () => {
    // run 1 showed its final; run 2 changed and its own did not reach the screen: run 3 compiles
    const unset = unsetAfter(unsetAfter(false, { changed: true }, true), { changed: true }, false)
    expect(pipelineCurrentFor({ copy: true, finalShown: true, unset })).toBe(false)
    expect(unsetAfter(true, { changed: false }, false)).toBe(true)
    expect(unsetAfter(false, { changed: false }, false)).toBe(false)
    expect([pipelineCurrentFor({ copy: false, finalShown: true, unset: false }), pipelineCurrentFor({ copy: true, finalShown: false, unset: false }), pipelineCurrentFor({ copy: false, finalShown: false, unset: false })]).toEqual([true, true, false])
  })
})

// A measure that could not set a letter (the F2 re-review's N2, its Important finding: zh 2608.02459's re-set measured
// under xeCJK, which has no σ there): no measure, as a preview that loses one is not shown — the chain moves on before
// the final, and the final is set from a plan measured under the strategy it is compiled with, not from the next
// strategy's plan uncorrected after the first strategy's final failed
describe('a measure that could not set a letter', () => {
  const SIGMA = 'Missing character: There is no σ (U+03C3) in font [lmroman10-regular]:mapping=tex-text;!\n'
  const strategyOf = (q: Req) => (main(q).includes('xeCJK') ? ':xe' : main(q).includes('CJKutf8') ? ':cjk' : '')
  /** a compiler whose drafts and finals under the strategies `losing` lose σ, each compile kept with its strategy; with
   *  `lists`, a draft's aux writes a contents list, and a draft given none says so in its log (as TeX does) */
  const losing = (n: number, which: string[], lists = false) => {
    const c = compiler(n), base = c.compile, seen: string[] = []
    c.compile = async (q: Req) => {
      const r = await base(q), kind = kindOf(q), s = strategyOf(q)
      seen.push(`${kind}${ruled(q) ? '+rule' : ''}${s}`)
      if (kind === 'probe' || kind === 'original') return r
      const lost = which.includes(s) ? SIGMA : '', listed = lists && kind === 'preview'
      return { ...r, aux: listed ? `\\relax\n\\@writefile{toc}{\\contentsline {section}{1}{1}}\n${r.aux}` : r.aux, log: `${lost}${listed && !q.overrides.has('main.toc') ? 'No file main.toc.\n' : ''}${r.log}` }
    }
    return { ...c, seen }
  }
  const taken = (p: ReturnType<typeof paper>) => new Map(p.units.map((u, i) => [i, { pieces: u.pieces.map(q => ((q as { t: string }).t === 'text' ? { ...(q as object), tr: true } : q)), state: 'whole', by: 'B', tried: 'B', current: true }]))
  /** a re-set: every unit taken (a typesetting change), so no preview, and the final measured by a draft */
  const reset = (c: ReturnType<typeof losing>, notes: [string, Record<string, unknown>][]) => {
    const p = paper(4), n = p.units.length
    return runLive(p, { lang: 'zh', compile: c.compile, translate: async () => { throw new Error('nothing is sent') }, format: 'markers', marks: new Map(), identity: 'B', seed: taken(p), pipelineCurrent: false, readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
  }
  const steps = (notes: [string, Record<string, unknown>][]) => notes.filter(([e, d]) => e === 'measure' || e === 'next strategy' || e === 'final' || (e === 'typeset' && d.final)).map(([e, d]) => `${e}${d.strategy ? `:${d.strategy}` : ''}${e === 'typeset' ? `:${d.measured}` : ''}`)

  it('a re-set\'s measure under xeCJK that loses σ moves the chain before the final: CJKutf8 measured, and its final set from that measure', async () => {
    const c = losing(paper(4).units.length, [':xe']), notes: [string, Record<string, unknown>][] = []
    const r = await reset(c, notes)
    expect(c.seen).toEqual(['probe', 'original', 'preview+rule:xe', 'preview+rule:cjk', 'final+rule:cjk'])
    expect(steps(notes)).toEqual(['measure:XeLaTeX + xeCJK', 'next strategy:pdfLaTeX + CJKutf8', 'measure:pdfLaTeX + CJKutf8', 'typeset:draft', 'final:pdfLaTeX + CJKutf8'])
    expect(r.settled).toBe(true)
  })

  it('one that loses it under the last strategy too: the final as before, which cannot set it either', async () => {
    const c = losing(paper(4).units.length, [':xe', ':cjk'])
    const r = await reset(c, [])
    expect(c.seen).toEqual(['probe', 'original', 'preview+rule:xe', 'preview+rule:cjk', 'final+rule:cjk'])
    expect([r.settled, r.exhausted]).toEqual([false, true])
  })

  it('one that also set a list from nothing is not measured again under its strategy: the next strategy\'s is, with its own lists', async () => {
    const c = losing(paper(4).units.length, [':xe'], true), notes: [string, Record<string, unknown>][] = []
    const r = await reset(c, notes)
    expect(c.seen).toEqual(['probe', 'original', 'preview+rule:xe', 'preview+rule:cjk', 'preview+rule:cjk', 'final+rule:cjk'])
    expect(r.settled).toBe(true)
  })
})

// Every unit sent and the last batch still out: a preview of part of the translation waits for it, once, as long as the
// last preview took — the whole translation's would replace it within that time, and only the whole one measures the
// final (zh 2608.02163 on the protocol-2 page: the last batch came 0.13 s after a preview of 200 of its 337 units began,
// and the final was 2.1 s later for it)
describe('a preview of part of the translation, the last batch out', () => {
  /** three batches (live.mjs nextBatch: the first small): the second given back once the first preview is shown, the
   *  third `lag` ms after the second */
  const batches = (lag: number) => {
    let n = 0, second: () => void = () => {}, third: () => void = () => {}
    const g2 = new Promise<void>(r => { second = r }), g3 = new Promise<void>(r => { third = r })
    const translate = async (texts: string[]) => {
      const k = n++
      if (k === 1) { await g2; setTimeout(third, lag) }
      if (k === 2) await g3
      return texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
    }
    return { translate, release: () => second() }
  }
  const go = async (lag: number) => {
    const p = paper(70), n = p.units.length, t = batches(lag), shown: number[] = []
    const c = compiler(n), base = c.compile
    // a preview takes 50 ms
    c.compile = async (q: Req) => { const r = await base(q); if (kindOf(q) === 'preview') { await new Promise(res => setTimeout(res, 50)); return { ...r, ms: 50 } } return r }
    const known = (await runLive(paper(4), { lang: 'zh', compile: compiler(paper(4).units.length).compile, translate: async texts => texts.map(text => ({ text, by: 'B' })), format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })).original
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map([['0s', {}]]), original: { ...known!, log: linesLog(n), marks: MARKS(n) }, identity: 'B', readMarks: async () => MARKS(n), onUpdate: ({ translated, final }) => { if (!final) { shown.push(translated); t.release() } } })
    return { r, shown, n: n - p.kept.size }
  }

  it('waits for it when it comes within a preview\'s time: the next preview is of the whole translation', async () => {
    const { r, shown, n } = await go(10)
    expect(shown.length).toBe(2)
    expect(shown.at(-1)).toBe(n)
    expect(r.settled).toBe(true)
  })

  it('and no longer: a batch later than that, the preview of part is compiled', async () => {
    const { shown, n } = await go(400)
    expect(shown.length).toBe(3)
    expect(shown[1]).toBeLessThan(n)
  })
})

// A strategy that sets the author block as the paper has it (CJKutf8, scripts.mjs `authors: false`): the right side's
// texts and the record say the author unit is in the source there, though it was translated and is kept for the next
// run (the F2 review's M2: ja 2608.18090's right side read the byline in Japanese where the PDF set it in English)
describe('the author block a strategy sets as the paper has it', () => {
  it('is the source in the texts shown, and marked set in the source in the run\'s results, its translation kept', async () => {
    const src = `\\documentclass{article}\\title{A Title of the Paper}\\author{Yousef Radwan\\\\King Abdullah University}\\begin{document}\\maketitle\n${Array.from({ length: 3 }, (_, k) => `Paragraph ${k} of the paper, with words that run on for a line.\n`).join('\n')}\\end{document}\n`
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode(src)]])), n = p.units.length
    const author = p.units.findIndex(u => u.kind === 'author'), t = translator()
    t.release()
    // xeCJK fails every compile: CJKutf8 sets the translation
    const c = compiler(n, { fail: (k, q) => k !== 'original' && k !== 'probe' && main(q).includes('xeCJK') })
    const shown: { final: boolean; texts: { id: number; text: string }[] }[] = []
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), onUpdate: ({ final, texts }) => shown.push({ final, texts: texts as { id: number; text: string }[] }) })
    expect(r.settled).toBe(true)
    const authorText = (s: (typeof shown)[number]) => s.texts.find(x => x.id === author)?.text
    for (const s of shown) expect(authorText(s)).toContain('Yousef Radwan')
    const result = r.results.get(author) as { pieces?: unknown[]; inSource?: boolean; state: string }
    expect([!!result.pieces, result.state, result.inSource]).toEqual([true, 'whole', true])
    expect((r.results.get(author + 1) as { inSource?: boolean }).inSource).toBeUndefined()
  })
})

// The mark is the copy's PDF's (Devin and Codex on #309): a run again that sets no final — every piece typeset as it was,
// only who made or tried a unit changed — writes the units' provenance over the copy's PDF, which still sets the author
// block in the source; the mark goes with it, and the copy shown anchors the author on its source. A final that sets the
// unit again says anew whether it set it in the source
describe('a copy whose author block was set in the source, run again', () => {
  const SOURCE = `\\documentclass{article}\\title{A Title of the Paper}\\author{Yousef Radwan\\\\King Abdullah University}\\begin{document}\\maketitle\n${Array.from({ length: 3 }, (_, k) => `Paragraph ${k} of the paper, with words that run on for a line.\n`).join('\n')}\\end{document}\n`
  const zh = (by: string) => async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by }))
  /** xeCJK fails every compile of the translation: CJKutf8 sets it, the author block as the paper has it */
  const noXeCJK = (n: number) => compiler(n, { fail: (k, q) => k !== 'original' && k !== 'probe' && main(q).includes('xeCJK') })
  /** the first visit's copy as the store keeps it (JSON), made by `B` under CJKutf8 */
  const firstVisit = async () => {
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]])), n = p.units.length
    const r = await runLive(p, { lang: 'zh', compile: noXeCJK(n).compile, translate: zh('B'), format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ marks: [['0s', {}]], units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r.results) }))
    return { p, n, hashes, record, author: p.units.findIndex(u => u.kind === 'author') }
  }
  type Visit = Awaited<ReturnType<typeof firstVisit>>
  /** a run again as the reader makes it (session.mjs): the copy's seed, the seeds this identity made taken as they are */
  const again = async (v: Visit, identity: string, { pipelineCurrent = true, compile = noXeCJK(v.n).compile } = {}) => {
    const { seed } = await seedFrom(v.record, v.p.units)
    const r = await runLive(v.p, { lang: 'zh', compile, translate: zh(identity), format: 'markers', marks: new Map(v.record.marks), identity, seed: reusable(seedAgain(seed, null), { identity, copyWire: true }), pipelineCurrent, readMarks: async () => MARKS(v.n) })
    const units = unitsOf(v.p.units, keptFor(v.p, 'zh'), v.hashes, r.results)
    return { r, units, how: decideWrite({ result: r, cached: v.record, units, marks: v.record.marks, shown: false }) }
  }

  it('every unit sent again and answered the same by another identity: a provenance write that keeps the mark, and the author anchored on its source', async () => {
    const v = await firstVisit()
    expect(v.record.units[v.author].inSource).toBe(true)
    const { r, units, how } = await again(v, 'C')
    expect([r.changed, how]).toEqual([false, 'provenance'])
    expect(units[v.author]?.inSource).toBe(true)
    expect(copyTexts(units)[v.author]?.text).toBe(v.record.units[v.author].src)
  })

  it('the author taken as it is, beside a unit sent again and answered the same: the mark kept', async () => {
    const v = await firstVisit()
    const para = v.p.units.findIndex(u => u.kind === 'para')
    v.record.units[para].by = 'A'
    const { r, units, how } = await again(v, 'B')
    expect([r.changed, how]).toEqual([false, 'provenance'])
    expect(units[v.author]?.inSource).toBe(true)
    expect(copyTexts(units)[v.author]?.text).toBe(v.record.units[v.author].src)
  })

  it('a final that sets the author again says anew: translated under xeCJK, the mark gone; in the source under CJKutf8, the mark', async () => {
    const v = await firstVisit()
    const set = await again(v, 'B', { pipelineCurrent: false, compile: compiler(v.n).compile })
    expect([set.r.settled, set.units[v.author]?.inSource]).toEqual([true, undefined])
    expect(copyTexts(set.units)[v.author]?.text).not.toBe(v.record.units[v.author].src)
    const source = await again(v, 'B', { pipelineCurrent: false })
    expect([source.r.settled, source.units[v.author]?.inSource]).toEqual([true, true])
  })
})

// A final the rule did not set for a passing reason — a PDF's marks that could not be read — is not this typesetting's:
// the run says so, and the record is labelled with no typesetting, set again on the next visit (the F2 review's M3)
describe('a final set short of the rule for a passing reason', () => {
  it('the original\'s marks not read: today\'s setting, and the run says it was a passing failure', async () => {
    const t = translator(), p = paper(4), n = p.units.length
    t.release()
    const c = compiler(n)
    let reads = 0
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => { if (++reads === 1) throw new Error('the worker went away'); return MARKS(n) } })
    expect([r.settled, r.passing, c.calls.some(q => q.ruled)]).toEqual([true, true, false])
  })

  it('a preview\'s marks not read for the measure: the final from the plan uncorrected, a passing failure', async () => {
    const t = translator(), p = paper(4), n = p.units.length
    t.release()
    const c = compiler(n)
    let reads = 0
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => { if (++reads > 1) throw new Error('the worker went away'); return MARKS(n) } })
    expect([r.settled, r.passing, c.calls.at(-1)?.ruled]).toEqual([true, true, true])
  })

  it('a final the rule set, or one no plan could be made for whatever is tried, is no passing failure', async () => {
    const t = translator(), p = paper(4), n = p.units.length
    t.release()
    expect((await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })).passing).toBe(false)
    const short = compiler(n, { log: k => (k === 'original' ? linesLog(n).replace('AXT-END\n', '') : null) })
    expect((await runLive(p, { lang: 'zh', compile: short.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })).passing).toBe(false)
  })
})

// BusyTeX's 180 s given up: the machine slow, not the page down nor the paper (the F2 review's M5) — a preview, a measure
// or the original that timed out is not asked again, the run going on to its final as before the page's protocol 2; the
// final is asked once more, and twice timed out the run ends with what is shown
describe('a compile BusyTeX gave up on', () => {
  const kinds = (calls: { kind: string; ruled: boolean }[]) => calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
  const TIMEOUT = { ok: false, error: 'Error: Compilation timeout\n    at busytex', network: [] }
  /** a compiler whose compiles `which` (by kind and count) time out */
  const timing = (n: number, which: (kind: string, k: number, q: Req) => boolean, on?: (kind: string) => void) => {
    const c = compiler(n), base = c.compile, seen = new Map<string, number>()
    c.compile = async (q: Req) => {
      const kind = kindOf(q), k = (seen.get(kind) ?? 0) + 1
      seen.set(kind, k)
      on?.(kind)
      if (which(kind, k, q)) { c.calls.push({ kind, ruled: ruled(q), rerun: q.rerun }); return TIMEOUT }
      return base(q)
    }
    return c
  }

  it('a preview: not asked again, not shown, no strategy changed; the run goes on to its final', async () => {
    const t = translator(), n = paper().units.length
    const c = timing(n, (kind, k) => kind === 'preview' && k === 1, k => { if (k === 'preview') t.release() })
    const notes: string[] = []
    const r = await runLive(paper(), { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: e => notes.push(e) })
    // the second preview, of the batch come since, is the first shown
    expect(kinds(c.calls).slice(0, 3)).toEqual(['probe', 'preview', 'preview'])
    expect(notes.filter(e => e === 'next strategy' || e === 'compile again' || e === 'typeset failed')).toEqual([])
    expect([r.settled, r.compiler]).toEqual([true, undefined])
  })

  it('the final: asked once more; twice, the run ends with what is shown — no strategy changed, nothing exhausted, no compiler down', async () => {
    const p = paper(4), n = p.units.length, t = translator()
    t.release()
    const once = timing(n, (kind, k) => kind === 'final' && k === 1)
    expect((await runLive(p, { lang: 'zh', compile: once.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })).settled).toBe(true)
    const twice = timing(n, kind => kind === 'final')
    const notes: string[] = []
    const r = await runLive(p, { lang: 'zh', compile: twice.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: e => notes.push(e) })
    expect(kinds(twice.calls).filter(k => k.startsWith('final'))).toEqual(['final+rule', 'final+rule'])
    expect(notes.filter(e => e === 'next strategy' || e === 'typeset failed')).toEqual([])
    expect([r.settled, r.exhausted, r.compiler]).toEqual([false, false, undefined])
  })

  it('the original: today\'s setting, a passing failure', async () => {
    const p = paper(4), n = p.units.length, t = translator()
    t.release()
    const c = timing(n, kind => kind === 'original')
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect([r.settled, r.passing, c.calls.some(q => q.ruled)]).toEqual([true, true, false])
  })

  it('the measure: the final from the plan uncorrected, a passing failure', async () => {
    const p = paper(4), n = p.units.length, t = translator()
    t.release()
    // the second preview-kind compile, ruled, is the draft that measures the final (the first preview is set as today)
    const c = timing(n, (kind, k, q) => kind === 'preview' && ruled(q))
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect(kinds(c.calls)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
    expect([r.settled, r.passing]).toEqual([true, true])
  })
})

// The final carries no line probes: nothing reads its lines (the F2 review's M7)
describe('the final\'s TeX', () => {
  it('has the rule\'s leadings and no line probes; a preview has both', async () => {
    const t = translator(), n = paper().units.length, given: Req[] = []
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile
    c.compile = async (q: Req) => { given.push(q); return base(q) }
    await run({ compiler: c, translate: t.translate })
    const final = main(given.find(q => kindOf(q) === 'final' && ruled(q)) as Req), preview = main(given.find(q => kindOf(q) === 'preview' && ruled(q)) as Req)
    expect([/\\axtlines\{\d/.test(final), final.includes('AXT-LINES'), /\\axtlead\{\d/.test(final)]).toEqual([false, false, true])
    expect([/\\axtlines\{\d/.test(preview), preview.includes('AXT-LINES')]).toEqual([true, true])
  })
})
