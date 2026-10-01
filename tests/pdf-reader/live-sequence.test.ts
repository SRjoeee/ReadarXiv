import { describe, expect, it } from 'vitest'
import { type Compiled, openPaper, runLive } from '@/pdf-reader/engine/live.mjs'
import type { Marks } from '@/pdf-reader/engine/typeset/places.mjs'

// The reader's compiles with the typesetting rule (experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md,
// "The compile sequence"; the evaluation's rulings in the F2 brief): the font probe with its width probe; the first
// preview as today; the marked original in full, with its line probes, right after it; later previews planned on their
// snapshot; the last preview of the whole translation, complete, measures the final — else a draft one-pass of it does;
// no plan, today's setting. Over a compiler that answers each compile with the log and the PDF a real one would, read
// by the rule's own readers

const PARAS = 12
const SOURCE = `\\documentclass{article}\\begin{document}\n${Array.from({ length: PARAS }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')}\\end{document}\n`
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
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
