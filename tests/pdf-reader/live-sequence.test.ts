import { describe, expect, it } from 'vitest'
import { copyTexts, decideWrite, passagesInSource, pipelineCurrentFor, reusable, seedAgain, seedFrom, sourceHash, unitsOf, unsetAfter } from '@/pdf-reader/engine/cache.mjs'
import { citationLines, type Compiled, compilerKeeper, keptFor, openPaper, originalFiles, PIPELINE_VERSION, runLive, stoppedShort } from '@/pdf-reader/engine/live.mjs'
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

  it('and the final: once without the rule on the same engine, then without the references, the rule back, then the next strategy, planned again', async () => {
    const t = translator(), n = paper().units.length
    // the paper's own engine is pdfLaTeX: xeCJK first, CJKutf8 next; every final of xeCJK fails, and CJKutf8's with the rule
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, fail: (k, q) => k === 'final' && (main(q).includes('xeCJK') || ruled(q)) })
    const kindOf2 = (q: { kind: string; ruled: boolean; rerun: boolean }) => `${q.kind}${q.ruled ? '+rule' : ''}`
    const { calls, notes, r } = await run({ compiler: c, translate: t.translate })
    const finals = calls.filter(q => q.rerun && q.kind !== 'original').map(kindOf2)
    // xeCJK: with the rule, without it, with it again and without the references the run gave it (the run's remedies,
    // plans/2026-10-04-compile-resilience.md); CJKutf8: with the rule, without it
    expect(finals).toEqual(['final+rule', 'final', 'final+rule', 'final+rule', 'final'])
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

// What a pipeline change costs a copy (plans/2026-10-04-compile-resilience.md, Rulings, 3): the reader seeds its run
// from the copy by source hash (cache.mjs seedFrom), so the copy's translations are shown meanwhile, but takes a seed as
// it is only when the copy was made by this pipeline in this wire format (reusable's copyWire, as session.mjs passes it)
// — a copy of another pipeline has every unit sent again, the background's own cache answering what it still holds
describe('a copy made by another pipeline', () => {
  const visit = async (pipeline: string) => {
    const p = paper(4), n = p.units.length
    const r0 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: async texts => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' })), format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ pipeline, format: 'markers', marks: [['0s', {}]], units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r0.results) }))
    // as session.mjs reads it: the copy's units are this run's only on this pipeline
    const sameUnits = record.pipeline === PIPELINE_VERSION
    const { seed } = await seedFrom(record, p.units)
    const sent: string[] = []
    const r = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: async texts => { sent.push(...texts); return texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' })) }, format: 'markers', marks: new Map(record.marks), identity: 'B', seed: reusable(seed, { identity: 'B', copyWire: sameUnits && record.format === 'markers' }), pipelineCurrent: false, readMarks: async () => MARKS(n) })
    return { sent, seeded: seed.size, r, units: p.units.length - keptFor(p, 'zh').size }
  }
  it('on this pipeline: no unit sent again', async () => {
    const { sent, r } = await visit(PIPELINE_VERSION)
    expect(sent).toEqual([])
    expect(r.settled).toBe(true)
  })
  it('on another: every unit seeded by its source and sent again all the same', async () => {
    const { sent, seeded, units } = await visit(`${PIPELINE_VERSION}-before`)
    expect(seeded).toBe(units)
    expect(sent).toHaveLength(units)
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


// A compile that stopped short of the document's end: TeX's fatal errors — an emergency stop (a file that ended inside
// an argument, as 2608.16117's comment that never ended; a line read from no terminal; the job ended with no \end), its
// capacity exceeded, a hundred errors — under XeTeX leave the pages shipped before them, which xdvipdfmx makes a PDF. A
// compiler that answers with any PDF it made (the gates' native one: latexmk -f in nonstop mode) took it as set, and
// the run reported a three-page translation of a forty-page paper settled. The TeX page's BusyTeX halts on a TeX error, so
// that no PDF comes of it there
describe('a compile that stopped short of the document\'s end', () => {
  const kinds = (calls: { kind: string; ruled: boolean }[]) => calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)
  const STOP = 'Runaway argument?\n! File ended while scanning use of \\next.\n<inserted text> \n                \\par \n)\n! Emergency stop.\n<*> main.tex\n            \n*** (job aborted, no legal \\end found)\n\nOutput written on main.xdv (2 pages, 88144 bytes).\n'
  const STOPPED = '! File ended while scanning use of \\next.'
  /** a log of every unit's lines but those after `at`, and then the stop */
  const stopped = (at = 3) => `${linesLog(at)}${STOP}`

  it('is no translation: a preview not shown, the final not settled, the chain moved on as from a compile with no PDF', async () => {
    const t = translator(), n = paper().units.length
    t.release()
    const c = compiler(n, { log: k => (k === 'preview' || k === 'final' ? stopped() : null) })
    const { r, notes } = await run({ compiler: c, translate: t.translate })
    // the first batch's preview under xeCJK, then CJKutf8's of it and of the whole translation, its measure and its final
    const previews = notes.filter(([e]) => e === 'preview')
    expect(previews.map(([, d]) => [d.strategy, d.ok, d.error])).toEqual([['XeLaTeX + xeCJK', false, STOPPED], ['pdfLaTeX + CJKutf8', false, STOPPED], ['pdfLaTeX + CJKutf8', false, STOPPED]])
    expect(notes.filter(([e]) => e === 'next strategy').length).toBe(1)
    // under CJKutf8 the run's remedies before the chain ends, in their order: its first preview again without microtype,
    // its measure's failure the rule's to try first — a draft without it, not the final (the re-review's N-1) —, then a
    // draft without the references the original gave, the rule back (microtype tried already); the final, once
    expect(notes.filter(([e]) => e === 'measure' || e === 'final').map(([e, d]) => [e, d.ok])).toEqual([['measure', false], ['measure', false], ['measure', false], ['final', false]])
    expect(notes.filter(([e]) => /^without /.test(e)).map(([e]) => e)).toEqual(['without spacing', 'without references'])
    expect([r.previews, r.settled, r.exhausted, r.originalOk]).toEqual([0, false, true, true])
  })

  it('a marked original that stopped short: no marks, no readings, and the paper\'s own source did not set here', async () => {
    const t = translator(), n = paper().units.length
    t.release()
    const originals: string[] = []
    const c = compiler(n, { log: k => (k === 'original' || k === 'preview' || k === 'final' ? stopped() : null) })
    const p = paper()
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: t.translate, format: 'markers', marks: null, identity: 'B', readMarks: async () => MARKS(p.units.length), onOriginal: () => originals.push('shown') })
    expect(originals).toEqual([])
    expect([r.settled, r.exhausted, r.originalOk, r.original]).toEqual([false, true, false, null])
  })

  it('is read off the last TeX pass: an emergency stop, a fatal error, the capacity exceeded, a hundred errors; not an error TeX went past', () => {
    const end = 'Output written on main.pdf (12 pages, 412345 bytes).\nTranscript written on main.log.\n'
    // 2608.16117's Chinese final before the fix, its comment never ended: XeTeX wrote the pages before the stop
    expect(stoppedShort(`Excluding 'comment' comment.)\n${STOP}`)).toBe(true)
    expect(stoppedShort('! LaTeX Error: File `missing.sty\' not found.\n! Emergency stop.\n<read *> \n*** (cannot \\read from terminal in nonstop modes)\n!  ==> Fatal error occurred, no output PDF file produced!\n')).toBe(true)
    expect(stoppedShort('! TeX capacity exceeded, sorry [main memory size=5000000].\n!  ==> Fatal error occurred, no output PDF file produced!\n')).toBe(true)
    expect(stoppedShort(`! Undefined control sequence.\n(That makes 100 errors; please try again.)\n${end}`)).toBe(true)
    expect(stoppedShort(`! Undefined control sequence.\nl.12 \\foo\n${end}`)).toBe(false)
    expect([stoppedShort(''), stoppedShort(null), stoppedShort(undefined)]).toEqual([false, false, false])
    // the browser's compiler joins its steps' logs (latex-front.mjs lastTexLog): the last TeX pass decides
    const step = (cmd: string, log: string) => `$ ${cmd}\nEXITCODE: 0\n\nLOG:\n${log}\n==\nSTDOUT:\n${log}\n==\nSTDERR:\n\n======`
    expect(stoppedShort([step('xelatex main.tex', STOP), step('xelatex main.tex', end)].join('\n\n'))).toBe(false)
    expect(stoppedShort([step('xelatex main.tex', end), step('xelatex main.tex', STOP), step('xdvipdfmx main.xdv', '')].join('\n\n'))).toBe(true)
  })

  it('one that went past an error to the end is set, as before', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, log: k => (k === 'final' ? `! Undefined control sequence.\nl.12 \\foo\n${linesLog(n)}` : null) })
    const { r, calls } = await run({ compiler: c, translate: t.translate })
    expect(kinds(calls)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
    expect(r.settled).toBe(true)
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
  const losing = (n: number, which: string[], lists = false, inListsOnly = false) => {
    const c = compiler(n), base = c.compile, seen: string[] = []
    c.compile = async (q: Req) => {
      const r = await base(q), kind = kindOf(q), s = strategyOf(q)
      seen.push(`${kind}${ruled(q) ? '+rule' : ''}${s}`)
      if (kind === 'probe' || kind === 'original') return r
      const lost = which.includes(s) && (!inListsOnly || kind === 'final' || q.overrides.has('main.toc')) ? SIGMA : '', listed = lists && kind === 'preview'
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

  // Devin on #309 (4165873818): the measure taken again with its lists is checked as the first is — a list set in a face
  // without a letter its heading's face has loses it only once the list is there
  it('one that loses it only once its lists are there — measured again with them — moves the chain too', async () => {
    const c = losing(paper(4).units.length, [':xe'], true, true), notes: [string, Record<string, unknown>][] = []
    const r = await reset(c, notes)
    expect(c.seen).toEqual(['probe', 'original', 'preview+rule:xe', 'preview+rule:xe', 'preview+rule:cjk', 'preview+rule:cjk', 'final+rule:cjk'])
    expect(steps(notes)).toEqual(['measure:XeLaTeX + xeCJK', 'measure:XeLaTeX + xeCJK', 'next strategy:pdfLaTeX + CJKutf8', 'measure:pdfLaTeX + CJKutf8', 'measure:pdfLaTeX + CJKutf8', 'typeset:draft', 'final:pdfLaTeX + CJKutf8'])
    expect(r.settled).toBe(true)
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

// A compile that fails is tried again without what the run itself added to the paper before the chain moves on
// (plans/2026-10-04-compile-resilience.md, Task 1, and its rulings): the least lost first — the typesetting rule's TeX,
// then EVEN_SPACES' microtype (only spacing is lost), then the references a draft or the final is given (2610.02069: the
// original's \bibcite lines without apacite's \APACbibcite broke every citation under babel). A remedy that set the
// paper is kept for the strategy; one that did not is taken back before the next
describe('a compile that fails is tried again without what the run added, before the chain moves on', () => {
  /** what a compile is in any language: a translation's carry the run's \axtbalance, the original's and the probe's not */
  const kindAny = (q: Req) => (main(q).includes('AXT-FONTS') ? 'probe' : main(q).includes('\\def\\axtbalance') ? (q.rerun ? 'final' : 'preview') : 'original')
  const auxOf = (q: Req) => { const given = q.overrides.get('main.aux'); return given ? new TextDecoder().decode(given) : null }
  /** a translation compile fails where `bad` says (fault A's shape, or microtype's); the original's aux has a \bibcite */
  const failingWith = (bad: (q: Req) => boolean) => {
    const calls: { kind: string; aux: string | null; microtype: boolean; cjkutf8: boolean; ruled: boolean }[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindAny(q)
      calls.push({ kind, aux: auxOf(q), microtype: /\{microtype\}/.test(main(q)), cjkutf8: /CJKutf8/.test(main(q)), ruled: ruled(q) })
      if (kind !== 'probe' && kind !== 'original' && bad(q)) return { ok: false, pdf: null, log: '! Illegal parameter number in definition of \\B@my@dummy.\n', ms: 1 }
      const made = kind === 'original' ? '\\citation{a}\n\\bibcite{a}{1}\n' : '\\citation{a}\n'
      return { ok: true, pdf: new Uint8Array([calls.length]), aux: made, bbl: null, log: kind === 'probe' ? FONT_LOG : linesLog(paper().units.length), ms: 1 }
    }
    return { calls, compile }
  }
  /** the target's words for every English word, no batch held back (the file's translator() holds its second) */
  const go = async (c: ReturnType<typeof failingWith>, lang = 'zh') => {
    const notes: [string, Record<string, unknown>][] = [], p = paper()
    const translate = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, lang === 'de' ? 'W\u00f6rter' : '\u8bba\u6587'), by: 'B' }))
    const r = await runLive(p, { lang, compile: c.compile, translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    return { r, notes, events: notes.map(([e]) => e) }
  }
  const givenCites = (q: Req) => /\\bibcite/.test(auxOf(q) ?? '')

  it('the references it was given break TeX: the rule taken back, the paper set without them, the strategy kept', async () => {
    const c = failingWith(givenCites)
    const { r, events, notes } = await go(c)
    expect(r.settled).toBe(true)
    // XeLaTeX adds no microtype: the rule first, then the references
    expect(events.filter(e => ['typeset failed', 'typeset back', 'without spacing', 'without references', 'recovered'].includes(e))).toEqual(['typeset failed', 'typeset back', 'without references', 'recovered'])
    expect(notes.find(([e]) => e === 'recovered')?.[1]).toMatchObject({ strategy: 'XeLaTeX + xeCJK', by: 'references' })
    expect(events).not.toContain('next strategy')
    // the rule came back: the final is set by it, and given no references
    const final = c.calls.filter(q => q.kind === 'final').at(-1)
    expect([final?.ruled, final?.aux]).toEqual([true, null])
  })

  it("EVEN_SPACES' microtype breaks TeX under the paper's pdfLaTeX: set without it, the references kept, the strategy kept", async () => {
    const c = failingWith(q => /\{microtype\}/.test(main(q)))
    const { r, notes, events } = await go(c, 'de')
    expect(r.settled).toBe(true)
    expect(events.filter(e => ['without spacing', 'without references'].includes(e))).toEqual(['without spacing'])
    expect(notes.filter(([e]) => e === 'final').at(-1)?.[1]).toMatchObject({ ok: true, strategy: 'own engine' })
    const final = c.calls.filter(q => q.kind === 'final').at(-1)
    expect(final?.microtype).toBe(false)
    expect(final?.aux).toContain('\\bibcite{a}')
  })

  it('without each it fails too: each comes back for the compiles after, and the chain moves on as before', async () => {
    const c = failingWith(() => true)
    const { r, events } = await go(c)
    expect(r.exhausted).toBe(true)
    // under pdfLaTeX + CJKutf8 a retry left microtype out; the next compile of that strategy has it again
    const k = c.calls.findIndex(q => q.cjkutf8 && !q.microtype && q.kind !== 'original')
    expect(k).toBeGreaterThan(-1)
    expect(c.calls.slice(k + 1).filter(q => q.cjkutf8 && q.kind !== 'original').some(q => q.microtype)).toBe(true)
    expect(events).toContain('spacing back')
    expect(events).toContain('next strategy')
  })

  it('a compile that sets the paper pays nothing: the happy path compiles as before', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } })
    const { calls, notes } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
    expect(notes.map(([e]) => e).filter(e => /without|back|recovered/.test(e))).toEqual([])
  })

  it("a failed compile's aux is not taken over the last good one", async () => {
    // the preview after the original fails once, writing half an aux: the next draft is given the good one
    let previews = 0
    const c = failingWith(() => false), base = c.compile
    c.compile = async (q: Req) => { const r = await base(q); return kindAny(q) === 'preview' && ++previews === 2 ? { ...r, ok: false, pdf: null, aux: '\\citation{cut', log: '! Undefined control sequence.\n' } : r }
    await go(c)
    const after = c.calls.filter(q => q.kind === 'preview' || q.kind === 'final').slice(2)
    expect(after.every(q => !(q.aux ?? '').includes('\\citation{cut'))).toBe(true)
  })
})

// The safety net (plans/2026-10-04-compile-resilience.md, Task 2): a unit the log places a failure in is set in the
// source and the compile tried again, before the chain moves on — 2610.02069's apacite citation, its key sent as prose,
// broke every compile of the translation that held it. Within bounds: 3 rounds and max(3, 2 % of the units) per
// strategy, 8 remedies a run
describe('a unit the log places the failure in is set in the source, and the compile tried again', () => {
  const T = '\u8bba\u6587'
  /** the main file as TeX reads it, UTF-8 (the file's own `main` reads it as Latin-1, for its ASCII) */
  const text = (q: Req) => new TextDecoder().decode(q.overrides.get(q.main))
  /** the translator keeps each paragraph's number, so unit 7's translation is the one line that holds "T 7 T" */
  const numbered = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, T), by: 'B' }))
  /** TeX on unit 7's translation: an error at its line (halt: no PDF), or the error and a letter lost (nonstop) */
  const breaking = (mode: 'halt' | 'nonstop') => {
    const calls: { kind: string; has7: boolean }[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), lines = text(q).split('\n'), n = lines.findIndex(l => l.includes(`${T} 7 ${T}`)) + 1
      calls.push({ kind, has7: n > 0 })
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (n > 0) {
        const at = lines[n - 1] as string, k = at.indexOf(`${T} 7`) + 4
        const block = `! Missing $ inserted.\n<inserted text> \n                $\nl.${n} ${at.slice(Math.max(0, k - 30), k)}\n    ${at.slice(k, k + 30)}\n`
        if (mode === 'halt') return { ok: false, pdf: null, log: block, ms: 1 }
        return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: `${block}Missing character: There is no ${T[0]} (U+8BBA) in font cmmi10!\n${linesLog(12)}`, ms: 1 }
      }
      return { ok: true, pdf: new Uint8Array([calls.length]), aux: null, bbl: null, log: linesLog(12), ms: 1 }
    }
    return { calls, compile }
  }
  const go = async (compile: (q: Req) => Promise<Compiled>) => {
    const notes: [string, Record<string, unknown>][] = [], p = paper()
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    return { r, notes }
  }
  for (const mode of ['halt', 'nonstop'] as const) {
    it(`${mode}: unit 7 alone set in the source, said, and kept so in the record; the strategy kept`, async () => {
      const c = breaking(mode)
      const { r, notes } = await go(c.compile)
      expect(r.settled).toBe(true)
      expect(notes.filter(([e]) => e === 'in source').map(([, d]) => d)).toEqual([expect.objectContaining({ strategy: 'XeLaTeX + xeCJK', units: [7] })])
      expect(notes.map(([e]) => e)).not.toContain('next strategy')
      expect((r.results.get(7) as { inSource?: boolean }).inSource).toBe(true)
      expect((r.results.get(6) as { inSource?: boolean }).inSource).toBeUndefined()
      expect(r.inSource).toBe(1)
      expect(c.calls.filter(q => q.kind === 'final').every(q => !q.has7)).toBe(true)
    })
  }
  it("a failure in every unit is no unit's: per strategy at most the bound set in the source, then the chain moves on", async () => {
    // every translated line breaks TeX
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), lines = text(q).split('\n'), n = lines.findIndex(l => l.includes(T)) + 1
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (n > 0 && kind !== 'original') return { ok: false, pdf: null, log: `! Undefined control sequence.\nl.${n} ${(lines[n - 1] as string).slice(0, 40)}\n  x\n`, ms: 1 }
      return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: linesLog(12), ms: 1 }
    }
    const { r, notes } = await go(compile)
    expect(r.exhausted).toBe(true)
    // twelve units: the bound is max(3, ceil(2 % of 12)) = 3 per strategy, and 8 remedy compiles in all — the rule's
    // left out of them, as ruling 6's before the budget: once a strategy, its failure the same every time
    for (const name of ['XeLaTeX + xeCJK', 'pdfLaTeX + CJKutf8']) expect(notes.filter(([e, d]) => e === 'in source' && d.strategy === name).flatMap(([, d]) => d.units as number[]).length).toBeLessThanOrEqual(3)
    expect(notes.filter(([e]) => ['in source', 'without spacing', 'without references', 'lost letters'].includes(e)).length).toBeLessThanOrEqual(8)
    for (const name of ['XeLaTeX + xeCJK', 'pdfLaTeX + CJKutf8']) expect(notes.filter(([e, d]) => e === 'typeset failed' && d.strategy === name).length).toBeLessThanOrEqual(1)
    expect(r.inSource).toBe(0)
  })
  it('a letter lost and no TeX error to place it, under every strategy: the chain spent, back to the first, where one pass with \\tracinglostchars=3 places it, the letters the original loses skipped', async () => {
    // unit 7's translation alone holds the letter both strategies' fonts lack
    const L = '\u0416'
    const translate = async (texts: string[]) => (await numbered(texts)).map(t => ({ ...t, text: t.text.replace(`${T} 7 ${T}`, `${T} 7 ${L} ${T}`) }))
    const calls: string[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), src = text(q), lines = src.split('\n'), n = lines.findIndex(l => l.includes(`${T} 7 ${L}`)) + 1, tracked = /\\tracinglostchars=3/.test(src)
      calls.push(`${kind}${tracked ? '+tracked' : ''}`)
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (kind === 'original') return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: `Missing character: There is no ^^c3 in font cmr10!\n${linesLog(12)}`, ms: 1 }
      if (n === 0) return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: linesLog(12), ms: 1 }
      const at = lines[n - 1] as string, k = at.indexOf(L)
      // as TeX: the original's own lost letter, then unit 7's, each an error only under \tracinglostchars=3
      if (tracked) return { ok: false, pdf: null, log: `! Missing character: There is no ^^c3 in font cmr10!\nl.1 \\documentclass\n  x\n! Missing character: There is no ${L} (U+0416) in font cmr10!\nl.${n} ${at.slice(Math.max(0, k - 30), k)}\n    ${at.slice(k, k + 30)}\n`, ms: 1 }
      return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: `Missing character: There is no ${L} (U+0416) in font cmr10!\n${linesLog(12)}`, ms: 1 }
    }
    const notes: [string, Record<string, unknown>][] = [], p = paper()
    const r = await runLive(p, { lang: 'zh', compile, translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(r.settled).toBe(true)
    // the next strategy first, as for any letter a font lacks; none left that sets it, the first strategy again, unit 7
    // in the source there
    expect(notes.filter(([e]) => ['next strategy', 'back to strategy', 'in source'].includes(e)).map(([e, d]) => [e, d.strategy])).toEqual([['next strategy', 'pdfLaTeX + CJKutf8'], ['back to strategy', 'XeLaTeX + xeCJK'], ['in source', 'XeLaTeX + xeCJK']])
    expect(notes.find(([e]) => e === 'in source')?.[1]).toMatchObject({ units: [7] })
    expect(calls.filter(c => c.endsWith('+tracked')).length).toBe(1)
    expect(notes.filter(([e]) => e === 'final').at(-1)?.[1]).toMatchObject({ ok: true, strategy: 'XeLaTeX + xeCJK' })
    expect((r.results.get(7) as { inSource?: boolean }).inSource).toBe(true)
  })
  it('a footnote is set in the source with its paragraph', async () => {
    const src = `\\documentclass{article}\\begin{document}\n${Array.from({ length: 4 }, (_, k) => `Paragraph ${k} of the paper, with words${k === 2 ? '\\footnote{A note of the paper, with words.}' : ''} that run on for a line.\n`).join('\n')}\\end{document}\n`
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode(src)]])), n = p.units.length
    const para = p.units.findIndex(u => u.pieces.some(x => (x as { t: string }).t === 'nested'))
    // TeX on the paragraph's line: the footnote's translation breaks it
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), lines = text(q).split('\n'), at = lines.findIndex(l => l.includes('\\footnote{') && l.includes(T)) + 1
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (at > 0 && kind !== 'original') { const l = lines[at - 1] as string, k = l.indexOf('\\footnote{') + 10; return { ok: false, pdf: null, log: `! Undefined control sequence.\nl.${at} ${l.slice(Math.max(0, k - 30), k)}\n  ${l.slice(k, k + 30)}\n`, ms: 1 } }
      return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: linesLog(n), ms: 1 }
    }
    const notes: [string, Record<string, unknown>][] = []
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(r.settled).toBe(true)
    expect(notes.find(([e]) => e === 'in source')?.[1]).toMatchObject({ units: [para] })
    const nested = p.units.findIndex(u => (u as { nested?: boolean }).nested)
    expect([(r.results.get(para) as { inSource?: boolean }).inSource, (r.results.get(nested) as { inSource?: boolean }).inSource]).toEqual([true, true])
    expect(r.inSource).toBe(2)
  })
})

// The original's citation lines a draft is given (plans/2026-10-04-compile-resilience.md, Task 3): every closed aux line
// whose first argument is a key the aux cites, in its order — apacite's \APACbibcite after its \bibcite (babel loaded
// after apacite wraps the first, and only the second makes it whole again: 2610.02069), harvard's \harvardcite,
// backref's \backcite — not only \bibcite
describe('citationLines: every line of an aux for a key it cites, in its order', () => {
  it("apacite's second line, harvard's, backref's; not \\citation, not a label, not a list's line, not a line cut short", () => {
    const aux = ['\\relax', '\\citation{smith,jones}', '\\bibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\APACbibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\harvardcite{jones}{Jones}{Jones}{1999}', '\\backcite{smith}{{1}{1}{section.1}}', '\\newlabel{sec:a}{{1}{1}}', '\\newlabel{smith}{{2}{3}}', '\\@writefile{toc}{x}', '\\bibcite{cut}{{1}'].join('\n')
    expect(citationLines(aux).split('\n')).toEqual(aux.split('\n').slice(2, 6))
  })
  it('\\nocite{*}: the keys \\bibcite names', () => {
    expect(citationLines('\\citation{*}\n\\bibcite{a}{1}\n\\APACbibcite{a}{1}\n')).toBe('\\bibcite{a}{1}\n\\APACbibcite{a}{1}')
  })
  it("biblatex's lines name a refsection first, and are none; an aux with no citation, nothing", () => {
    expect(citationLines('\\abx@aux@cite{0}{a}\n\\abx@aux@segm{0}{0}{a}\n')).toBe('')
    expect(citationLines(null)).toBe('')
  })
  it("a draft is given the original's citation lines, both of apacite's, in the original's order; a draft's aux with its own is given as it is", async () => {
    const ORIGINAL = '\\relax\n\\citation{a}\n\\bibcite{a}{W}\n\\APACbibcite{a}{C}\n'
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } }), base = c.compile, given: (string | null)[] = []
    c.compile = async (q: Req) => {
      const r = await base(q), kind = kindOf(q), aux = q.overrides.get('main.aux')
      if (kind === 'preview' || kind === 'final') given.push(aux ? new TextDecoder().decode(aux) : null)
      return kind === 'original' ? { ...r, aux: ORIGINAL } : kind === 'preview' ? { ...r, aux: '\\relax\n\\citation{a}\n' } : r
    }
    const { r } = await run({ compiler: c, translate: t.translate })
    // the first preview has nothing; the one after the original its own aux and the original's two lines after it
    expect(given[1]?.endsWith('\\bibcite{a}{W}\n\\APACbibcite{a}{C}')).toBe(true)
    expect(r.original?.cites).toBe('\\bibcite{a}{W}\n\\APACbibcite{a}{C}')
  })
})

// The remedies' order and their taking back, after the reviews of 2026-10-04 (plans/2026-10-04-compile-resilience.md,
// "Review response"): the least lost first wherever a compile fails — the rule, the run's additions, then units —, a
// remedy kept off stays off, and what a strategy's fonts lack is the next strategy's to set before any unit goes to the
// source
describe('the remedies in their order, wherever a compile fails', () => {
  const T = '\u8bba\u6587'
  /** the main file as TeX reads it, UTF-8 */
  const text = (q: Req) => new TextDecoder().decode(q.overrides.get(q.main))
  /** each English word the target's, every paragraph keeping its number: unit 3's translation is the line with "T 3 T" */
  const numbered = async (texts: string[]) => texts.map(t => ({ text: t.replace(/(?<![@a-z])[A-Za-z]{2,}/g, T), by: 'B' }))
  const ok = (n: number, q: Req): Compiled => ({ ok: true, pdf: new Uint8Array([1]), aux: '\\citation{a}\n\\bibcite{a}{1}\n', bbl: null, log: kindOf(q) === 'probe' ? FONT_LOG : linesLog(n), ms: 1 })
  /** TeX stopped at unit `i`'s translation, as halt-on-error writes it */
  const failAt = (q: Req, i: number, message = 'Undefined control sequence.'): Compiled | null => {
    const lines = text(q).split('\n'), at = lines.findIndex(l => l.includes(`${T} ${i} ${T}`)) + 1
    if (!at) return null
    const l = lines[at - 1] as string, k = l.indexOf(`${T} ${i} ${T}`) + 4
    return { ok: false, pdf: null, log: `! ${message}\nl.${at} ${l.slice(Math.max(0, k - 30), k)}\n  ${l.slice(k, k + 30)}\n`, ms: 1 }
  }
  const REMEDIES = /^(?:typeset failed|typeset back|without |spacing back|references back|in source|lost letters|kept|recovered|next strategy|back to )/
  const remedies = (notes: [string, Record<string, unknown>][]) => notes.filter(([e]) => REMEDIES.test(e)).map(([e, d]) => `${e}${d.by ? ` by ${d.by}` : ''}${d.units ? ` ${JSON.stringify(d.units)}` : ''}`)

  it("a re-set whose measure fails only with the rule: the rule left out before any unit is set in the source, as before the safety net", async () => {
    // a copy's whole translation, current: a re-set — no preview, the measure first
    const p = paper(), n = p.units.length
    const r0 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ format: 'markers', units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r0.results) }))
    const { seed } = await seedFrom(record, p.units)
    const calls: string[] = [], notes: [string, Record<string, unknown>][] = []
    // the rule's TeX breaks on unit 3: its macros stand in the unit's own lines
    const compile = async (q: Req): Promise<Compiled> => {
      calls.push(`${kindOf(q)}${ruled(q) ? '+rule' : ''}`)
      return (kindOf(q) !== 'probe' && kindOf(q) !== 'original' && ruled(q) && failAt(q, 3)) || ok(n, q)
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', seed: reusable(seed, { identity: 'B', copyWire: true }), pipelineCurrent: false, readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    // leaving the rule out is tried with the measure's own draft, not with the final (the re-review's N-1)
    expect(calls).toEqual(['probe', 'original', 'preview+rule', 'preview', 'final'])
    expect(remedies(notes)).toEqual(['typeset failed', 'recovered by rule'])
    expect(r.settled).toBe(true)
    expect(r.inSource).toBe(0)
    expect([...r.results.values()].some(x => (x as { inSource?: boolean }).inSource)).toBe(false)
  })

  it("a re-set whose measure fails on a unit's own fault: leaving the rule out is tried with a draft, the ladder goes on in the measure, and the final is measured (N-1)", async () => {
    const p = paper(), n = p.units.length
    const r0 = await runLive(p, { lang: 'zh', compile: compiler(n).compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ format: 'markers', units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r0.results) }))
    const { seed } = await seedFrom(record, p.units)
    const calls: string[] = [], notes: [string, Record<string, unknown>][] = []
    // unit 3's translation breaks TeX whatever the setting (2610.02069's fault B on its next re-set)
    const compile = async (q: Req): Promise<Compiled> => {
      calls.push(`${kindOf(q)}${ruled(q) ? '+rule' : ''}`)
      return (kindOf(q) !== 'probe' && kindOf(q) !== 'original' && failAt(q, 3, 'Missing $ inserted.')) || ok(n, q)
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', seed: reusable(seed, { identity: 'B', copyWire: true }), pipelineCurrent: false, readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(calls).toEqual(['probe', 'original', 'preview+rule', 'preview', 'preview+rule', 'preview+rule', 'final+rule'])
    expect(remedies(notes)).toEqual(['typeset failed', 'typeset back', 'without references', 'references back', 'in source [3]', 'recovered by units'])
    expect(notes.filter(([e, d]) => e === 'typeset' && d.final).map(([, d]) => d.measured)).toEqual(['draft'])
    expect([r.settled, r.inSource]).toEqual([true, 1])
  })

  it('a final that fails with the rule and, without it, with the references: set with neither, the rule kept off', async () => {
    const p = paper(), n = p.units.length, finals: string[] = [], notes: [string, Record<string, unknown>][] = []
    const given = (q: Req) => /\\bibcite/.test(new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array()))
    // two faults of the final's own, one after the other: the rule's TeX, then the references it is given
    const compile = async (q: Req): Promise<Compiled> => {
      if (kindOf(q) !== 'final') return ok(n, q)
      finals.push(`final${ruled(q) ? '+rule' : ''}${given(q) ? '+refs' : ''}`)
      if (ruled(q)) return { ok: false, pdf: null, log: '! Undefined control sequence.\nl.1 \\axtbroken\n  x\n', ms: 1 }
      if (given(q)) return { ok: false, pdf: null, log: '! Illegal parameter number in definition of \\B@my@dummy.\nl.2 \\bibcite\n  x\n', ms: 1 }
      return ok(n, q)
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(finals).toEqual(['final+rule+refs', 'final+refs', 'final'])
    expect(remedies(notes)).toEqual(['typeset failed', 'kept by rule', 'without references', 'recovered by references'])
    expect([r.settled, r.exhausted]).toEqual([true, false])
  })

  it("the other way round: the references' fault hides the rule's — the rule, taken back, is tried again once the failure is another", async () => {
    const p = paper(), n = p.units.length, finals: string[] = [], notes: [string, Record<string, unknown>][] = []
    const given = (q: Req) => /\\bibcite/.test(new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array()))
    const compile = async (q: Req): Promise<Compiled> => {
      if (kindOf(q) !== 'final') return ok(n, q)
      finals.push(`final${ruled(q) ? '+rule' : ''}${given(q) ? '+refs' : ''}`)
      if (given(q)) return { ok: false, pdf: null, log: '! Illegal parameter number in definition of \\B@my@dummy.\nl.2 \\bibcite\n  x\n', ms: 1 }
      if (ruled(q)) return { ok: false, pdf: null, log: '! Undefined control sequence.\nl.1 \\axtbroken\n  x\n', ms: 1 }
      return ok(n, q)
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(finals).toEqual(['final+rule+refs', 'final+refs', 'final+rule', 'final'])
    expect(remedies(notes)).toEqual(['typeset failed', 'typeset back', 'without references', 'kept by references', 'typeset failed', 'recovered by rule'])
    expect([r.settled, r.exhausted]).toEqual([true, false])
  })

  it("the rule's remedy is not the budget's: with the run's remedies spent, a final that fails only with the rule is set without it, as before them", async () => {
    // four units, the bound three: every unit but the last breaks TeX under both strategies, the last under xeCJK too;
    // CJKutf8 fails with microtype, and its final and measure with the references or the rule
    const p = paper(4), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    const given = (q: Req) => /\\bibcite/.test(new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array()))
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q)
      if (kind === 'probe' || kind === 'original') return ok(n, q)
      const xe = /xeCJK/.test(text(q))
      if (!xe && /\{microtype\}/.test(text(q))) return { ok: false, pdf: null, log: '! Extra \\else.\nl.1 \\documentclass\n  x\n', ms: 1 }
      for (const i of xe ? [0, 1, 2, 3] : [0, 1, 2]) { const f = failAt(q, i); if (f) return f }
      if (given(q)) return { ok: false, pdf: null, log: '! Illegal parameter number in definition of \\B@my@dummy.\nl.2 \\bibcite\n  x\n', ms: 1 }
      if (kind === 'final' && ruled(q)) return { ok: false, pdf: null, log: '! Undefined control sequence.\nl.1 \\axtbroken\n  x\n', ms: 1 }
      return ok(n, q)
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    const spent = notes.filter(([e]) => ['in source', 'without spacing', 'without references', 'lost letters'].includes(e)).length
    expect(spent).toBe(8)
    expect(finalOf(notes)).toMatchObject({ ok: true, strategy: 'pdfLaTeX + CJKutf8', typeset: false })
    expect([r.settled, r.exhausted]).toEqual([true, false])
  })

  /** a compiler whose fonts under xeCJK (`lacks`) or CJKutf8 lack a letter unit 7's translation alone holds: a PDF with
   *  the letter left out, and under \\tracinglostchars=3 an error at its place */
  const L = '\u0416'
  const withLetter = async (texts: string[]) => (await numbered(texts)).map(t => ({ ...t, text: t.text.replace(`${T} 7 ${T}`, `${T} 7 ${L} ${T}`) }))
  const lacking = (n: number, lacks: (xe: boolean) => boolean, also: (q: Req) => Compiled | null = () => null) => {
    const calls: string[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), src = text(q), xe = /xeCJK/.test(src), tracked = /\\tracinglostchars=3/.test(src)
      calls.push(`${kind}${kind === 'preview' || kind === 'final' ? (xe ? '/xeCJK' : '/CJKutf8') : ''}${tracked ? '+tracked' : ''}`)
      if (kind === 'probe' || kind === 'original') return ok(n, q)
      const other = also(q)
      if (other) return other
      const lines = src.split('\n'), at = lines.findIndex(l => l.includes(`7 ${L}`)) + 1
      if (!at || !lacks(xe)) return ok(n, q)
      const l = lines[at - 1] as string, k = l.indexOf(L)
      if (tracked) return { ok: false, pdf: null, log: `! Missing character: There is no ${L} (U+0416) in font lmroman10-regular!\nl.${at} ${l.slice(Math.max(0, k - 30), k)}\n    ${l.slice(k, k + 30)}\n`, ms: 1 }
      return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: `Missing character: There is no ${L} (U+0416) in font lmroman10-regular!\n${linesLog(n)}`, ms: 1 }
    }
    return { calls, compile }
  }
  const finalOf = (notes: [string, Record<string, unknown>][]) => notes.filter(([e]) => e === 'final').at(-1)?.[1]

  it('a letter the first strategy lacks, in one unit, which the next sets: the next strategy, every unit translated, as before the safety net', async () => {
    const p = paper(), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    const c = lacking(n, xe => xe)
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: withLetter, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(remedies(notes)).toEqual(['next strategy'])
    expect(c.calls.some(k => k.endsWith('+tracked'))).toBe(false)
    expect(finalOf(notes)).toMatchObject({ ok: true, strategy: 'pdfLaTeX + CJKutf8' })
    expect([r.settled, r.inSource]).toEqual([true, 0])
    expect((r.results.get(7) as { inSource?: boolean }).inSource).toBeUndefined()
  })

  it('a letter only the last strategy lacks, the first having failed otherwise: its unit set in the source under the last', async () => {
    const p = paper(), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    // xeCJK refuses the paper in its preamble, no unit's fault; CJKutf8 lacks the letter
    const c = lacking(n, xe => !xe, q => (/xeCJK/.test(text(q)) ? { ok: false, pdf: null, log: '! LaTeX Error: Command \\foo already defined.\nl.3 \\newcommand{\\foo}\n  {x}\n', ms: 1 } : null))
    const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: withLetter, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(notes.filter(([e]) => ['next strategy', 'back to strategy', 'in source'].includes(e)).map(([e, d]) => [e, d.strategy])).toEqual([['next strategy', 'pdfLaTeX + CJKutf8'], ['in source', 'pdfLaTeX + CJKutf8']])
    expect(finalOf(notes)).toMatchObject({ ok: true, strategy: 'pdfLaTeX + CJKutf8' })
    expect([r.settled, r.inSource]).toEqual([true, 1])
  })

  it("a strategy's failure in no unit moves the chain on at once: an original under way in its own compiler is not waited for", async () => {
    const p = paper(), n = p.units.length, order: string[] = []
    let open: () => void = () => {}
    const gate = new Promise<void>(r => { open = r })
    // the original answers once the next strategy's first preview is asked for, or after a while, if the run waits for it
    const compileOriginal = async (q: Req): Promise<Compiled> => { await gate; order.push('original in'); return ok(n, q) }
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), xe = /xeCJK/.test(text(q))
      order.push(`${kind}${kind === 'preview' || kind === 'final' ? (xe ? '/xeCJK' : '/CJKutf8') : ''}`)
      // xeCJK refuses the paper in its preamble: a class's conflict, no unit's
      if (xe) return { ok: false, pdf: null, log: '! LaTeX Error: Command \\foo already defined.\nl.3 \\newcommand{\\foo}\n  {x}\n', ms: 1 }
      if (kind === 'preview') open()
      return ok(n, q)
    }
    setTimeout(() => open(), 300)
    const r = await runLive(p, { lang: 'zh', compile, compileOriginal, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect(order.indexOf('preview/CJKutf8')).toBeGreaterThan(-1)
    expect(order.indexOf('preview/CJKutf8')).toBeLessThan(order.indexOf('original in'))
    expect(r.settled).toBe(true)
  })

  it("the paper's own error, in a unit its original raises it in too, sets no unit in the source, whatever the text around it", async () => {
    // nonstop: the original sets with an error TeX went past in unit 4's source; the translation, whole, fails on it and
    // on a fatal error of no unit's — the error's context there is the translation's, never the original's
    const p = paper(), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    const at = (q: Req, needle: string) => { const lines = text(q).split('\n'), k = lines.findIndex(l => l.includes(needle)); return k < 0 ? null : { n: k + 1, l: lines[k] as string } }
    const own = (q: Req, needle: string) => { const x = at(q, needle); if (!x) return ''; const k = x.l.indexOf(needle) + needle.length; return `! Undefined control sequence.\nl.${x.n} ${x.l.slice(Math.max(0, k - 30), k)}\n  ${x.l.slice(k, k + 30)}\n` }
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q)
      if (kind === 'probe') return ok(n, q)
      if (kind === 'original') return { ...ok(n, q), log: `${own(q, 'Paragraph 4 of')}${linesLog(n)}` }
      const log = `${own(q, `${T} 4 ${T}`)}${linesLog(n)}`
      return at(q, `${T} 11 ${T}`) ? { ok: false, pdf: null, log: `${log}! Emergency stop.\n<*> main.tex\n`, ms: 1 } : { ...ok(n, q), log }
    }
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(notes.filter(([e]) => e === 'original').length).toBe(1)
    expect(notes.filter(([e]) => e === 'in source')).toEqual([])
    expect(r.exhausted).toBe(true)
  })

  it("the original's files are the same bytes with its units' lines asked for and without; each unit found on its own lines", () => {
    const p = paper(), spans: NonNullable<NonNullable<Parameters<typeof originalFiles>[1]>['spans']> = {}
    const plain = originalFiles(p, { lines: true }), withSpans = originalFiles(p, { lines: true, spans })
    expect([...withSpans].map(([f, b]) => [f, new TextDecoder('latin1').decode(b)])).toEqual([...plain].map(([f, b]) => [f, new TextDecoder('latin1').decode(b)]))
    const lines = new TextDecoder('latin1').decode(withSpans.get('main.tex')).split('\n'), found = spans.lines?.() ?? []
    expect(found.map(x => x.unit)).toEqual(p.units)
    for (const [i, x] of found.entries()) expect(lines.slice(x.first - 1, x.last).join('\n')).toContain(`Paragraph ${i} of`)
  })

  /** four paragraphs, the third with `notes` footnotes */
  const withNotes = (notes: number) => openPaper(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\\begin{document}\n${Array.from({ length: 4 }, (_, k) => `Paragraph ${k} of the paper, with words that run on${k === 2 ? Array.from({ length: notes }, (_, j) => `\\footnote{A note, number ${j + 5}, with words.}`).join('') : ''} for a line.\n`).join('\n')}\\end{document}\n`)]]))
  /** TeX stopped in the third paragraph's own words, in every compile of the translation that has them */
  const brokenThird = (n: number) => async (q: Req): Promise<Compiled> => (kindOf(q) === 'probe' || kindOf(q) === 'original' ? null : failAt(q, 2)) ?? ok(n, q)
  const inSourceOfResults = (r: { results: Map<number, unknown> }) => [...r.results.values()].filter(x => (x as { inSource?: boolean }).inSource).length

  it('a paragraph with five footnotes is six passages set in the source: more than the bound allows, and none is', async () => {
    const p = withNotes(5), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    // nine units: the bound is max(3, ceil(2 % of 9)) = 3
    expect(n).toBe(9)
    const r = await runLive(p, { lang: 'zh', compile: brokenThird(n), translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(notes.filter(([e]) => e === 'in source')).toEqual([])
    expect([r.exhausted, r.inSource ?? 0, inSourceOfResults(r)]).toEqual([true, 0, 0])
  })

  it('a paragraph with two footnotes is three passages: within the bound, all set in the source and counted', async () => {
    const p = withNotes(2), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    const para = p.units.findIndex(u => u.pieces.some(x => (x as { t: string }).t === 'nested'))
    const r = await runLive(p, { lang: 'zh', compile: brokenThird(n), translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(notes.filter(([e]) => e === 'in source').map(([, d]) => d.units)).toEqual([[para]])
    expect([r.settled, r.inSource, inSourceOfResults(r)]).toEqual([true, 3, 3])
  })

  it('a footnote the service lost and the safety net set in the source with its paragraph is counted once, as lost', async () => {
    const p = withNotes(1), n = p.units.length, note = p.units.findIndex(u => (u as { nested?: boolean }).nested)
    // one batch: the footnote's text lost to the service, the rest back
    const translate = async (texts: string[]) => {
      const back = await numbered(texts), k = texts.findIndex(t => t.includes('A note'))
      throw Object.assign(new Error('the network is down'), { kind: 'network', partial: back.map((x, j) => (j === k ? null : x)), lost: new Set([k]) })
    }
    const r = await runLive(p, { lang: 'zh', compile: brokenThird(n), translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect(r.stopped).toBe('network')
    expect((r.results.get(note) as { state?: string }).state).toBe('lost')
    // the paragraph set in the source is the one passage the safety net counts; the footnote is the service's
    expect([r.missing, r.inSource]).toEqual([1, 1])
  })

  it("an error in a footnote's own words sets the footnote alone in the source, its paragraph translated", async () => {
    const p = withNotes(1), n = p.units.length, notes: [string, Record<string, unknown>][] = []
    const note = p.units.findIndex(u => (u as { nested?: boolean }).nested), para = p.units.findIndex(u => u.pieces.some(x => (x as { t: string }).t === 'nested'))
    // TeX stopped in the note's words, and logged it where it had read the note's argument to its closing brace (as
    // compile-resilience-cases.mjs finds natively): its numbers the context before the place
    const compile = async (q: Req): Promise<Compiled> => {
      if (kindOf(q) === 'probe' || kindOf(q) === 'original') return ok(n, q)
      const lines = text(q).split('\n'), at = lines.findIndex(l => l.includes('\\footnote{') && l.includes('5, x')) + 1
      if (!at) return ok(n, q)
      // past the note's end mark and the brace that closes it (\\axtend{…}})
      const l = lines[at - 1] as string, k = l.indexOf('}}', l.indexOf('5, x')) + 2
      return { ok: false, pdf: null, log: `! Undefined control sequence.\nl.${at} ${l.slice(Math.max(0, k - 30), k)}\n  ${l.slice(k, k + 30)}\n`, ms: 1 }
    }
    const translate = async (texts: string[]) => texts.map(t => ({ text: t.replace(/(?<![@a-z])[A-Za-z]{2,}/g, T).replace(/\b5,/, '5, x_y z, w_v u,'), by: 'B' }))
    const r = await runLive(p, { lang: 'zh', compile, translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(notes.filter(([e]) => e === 'in source').map(([, d]) => d.units)).toEqual([[note]])
    expect([r.settled, r.inSource]).toEqual([true, 1])
    expect([(r.results.get(note) as { inSource?: boolean }).inSource, (r.results.get(para) as { inSource?: boolean }).inSource]).toEqual([true, undefined])
  })

  it('a copy with a passage in the source, opened again: the copy counts it, and a run of it that changes nothing counts it too', async () => {
    const p = paper(), n = p.units.length
    // the first visit: unit 3 breaks TeX, and is set in the source
    const r0 = await runLive(p, { lang: 'zh', compile: async q => (kindOf(q) === 'probe' || kindOf(q) === 'original' ? null : failAt(q, 3)) ?? ok(n, q), translate: numbered, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n) })
    expect([r0.settled, r0.inSource]).toEqual([true, 1])
    const hashes = await Promise.all(p.units.map(u => sourceHash(u)))
    const record = JSON.parse(JSON.stringify({ format: 'markers', units: unitsOf(p.units, keptFor(p, 'zh'), hashes, r0.results) }))
    // a visit again: the copy current (session.mjs's 'cache current' counts it so), or a run of it that changes nothing
    expect(passagesInSource(record.units)).toBe(1)
    const { seed } = await seedFrom(record, p.units)
    const calls: string[] = [], notes: string[] = []
    const r = await runLive(p, { lang: 'zh', compile: async q => { calls.push(kindOf(q)); return ok(n, q) }, translate: numbered, format: 'markers', marks: new Map([['0s', {}]]), identity: 'B', seed: reusable(seed, { identity: 'B', copyWire: true }), pipelineCurrent: true, readMarks: async () => MARKS(n), note: (e: string) => notes.push(e) })
    expect(notes).toContain('unchanged')
    expect(calls.filter(k => k !== 'probe')).toEqual([])
    expect([r.changed, r.inSource]).toEqual([false, 1])
  })

  it("an error TeX raised before it read the references it was given is not theirs: they are not left out for it (M-4)", async () => {
    const run = async (log: string) => {
      const t = translator(), n = paper().units.length, notes: [string, Record<string, unknown>][] = []
      const given = (q: Req) => /\\bibcite/.test(new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array()))
      // the previews after the original, given its references, fail where `log` says
      const compile = async (q: Req): Promise<Compiled> => {
        if (kindOf(q) === 'original') t.release()
        return kindOf(q) === 'preview' && given(q) ? { ok: false, pdf: null, log, ms: 1 } : ok(n, q)
      }
      const p = paper()
      await runLive(p, { lang: 'zh', compile, translate: t.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(n), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
      return notes.map(([e]) => e)
    }
    // a package's option clash in the preamble: the aux is read at \begin{document}, after it
    const preamble = await run('(./main.tex\nLaTeX2e <2025-06-01>\n(/usr/share/texlive/xcolor.sty)\n! LaTeX Error: Option clash for package xcolor.\nl.12 \\usepackage\n  {xcolor}\n')
    expect(preamble).not.toContain('without references')
    expect(preamble).toContain('next strategy')
    // the same past \begin{document}, the aux read: the references are left out once
    const body = await run('(./main.tex\nLaTeX2e <2025-06-01>\n(./main.aux)\n! Illegal parameter number in definition of \\B@my@dummy.\nl.40 \\cite\n  {a}\n')
    expect(body).toContain('without references')
  })

  it('a run whose finals all fail says whether the last preview it showed lacked any of the translation (M-2)', async () => {
    const t = translator(), n = paper().units.length
    // every final fails; the first preview has the first batch, the one after the original the whole translation
    const c = compiler(n, { on: k => { if (k === 'original') t.release() }, fail: k => k === 'final' })
    const whole = await run({ compiler: c, translate: t.translate })
    expect([whole.r.exhausted, whole.r.previews, (whole.r as { shownPartial?: boolean | null }).shownPartial]).toEqual([true, 2, false])
    // a preview of the whole translation fails as the finals do, in no unit: the one shown is the first batch's
    const t2 = translator(), c2 = compiler(n, { on: k => { if (k === 'original') t2.release() }, fail: (k, q) => k === 'final' || (k === 'preview' && text(q).includes(`${T} 11 ${T}`)) })
    const part = await run({ compiler: c2, translate: t2.translate })
    expect([part.r.exhausted, part.r.previews, (part.r as { shownPartial?: boolean | null }).shownPartial]).toEqual([true, 1, true])
  })
})
