// A paper's layout marks in one call: what the layout maker (layout/make.mjs) reads from the marked original, made as the
// layer gate's fixtures were measured (before 2026-10-08 only the spikes did, spikes/layer-fixtures.mjs and
// spikes/layout-make.mjs, which now call this: one implementation, the server's and the extension's).
//
// The order, and why:
//   1. the mark probe (live.mjs probeFiles `marks`), compiled in one pass: its log holds the paper's own switch (TeX's
//      answers to the mark probe, readMarkProbe), the macros that set no ink (readInkProbe), the text the others set
//      (readInkTexts), whether each babel name's own text holds a lowercase letter (readNameProbe) and the paper's
//      \lineskip and \lineskiplimit (readSkipProbe). Read as runLive
//      reads the font probe, from its log alone: the probe has no body and so no pages,
//      and a compiler need not call that a success
//   2. the marked original (live.mjs originalFiles with `lines` and the layout marks of every class), marked with those
//      answers, compiled in full: its marks are where each marked piece stands, so it must be marked as the maker will
//      read it (the file carries the switch, MARKS_SCHEMA 2 or more). With `converge` (CM, converge then mark:
//      convergeThenMark below), the passes that only make the aux and its lists are those of the unmarked original, as
//      drafts, and the marked one is compiled once in their files, for as long as its own files differ from them
//   3. its PDF opened by the caller, and layoutMarksOf over that document and the compile's last pass's log, with the
//      paper's units and PDF.js's operator codes, so that each marked piece's own ink is read from its operator lists
// The compile and the opening are the caller's (a native TeX Live and PDF.js in Node, the TeX page and a worker in a
// browser), so that this imports neither PDF.js nor a `node:*` module.
import { jobName, lastTexLog, latin1 } from '../source/latex-front.mjs'
import { listsMissing, notFound, originalFiles, probeFiles, stoppedShort } from '../pipeline/live.mjs'
import { completeLog } from '../pipeline/typeset/tex.mjs'
import { encodeLayoutMarks, inkSamples, LAYOUT_CLASSES, layoutMarksOf, probeSamples, readInkProbe, readInkTexts, readMarkProbe, readNameProbe, readSkipProbe, withoutMarks } from './marks.mjs'

/**
 * A paper's layout marks (paper.d.mts): the marks file's bytes, with each stage's time, or the stage that failed with the
 * times of those that ran. Never throws: a compiler that throws, a PDF that does not open and a reading that refuses
 * are each their stage's refusal. `converge`: the marked original made by convergeThenMark, its passes in `cm`, within
 * `compileBudgetMs` where the host gives one
 */
export async function layoutMarksOfPaper(paper, { compile, open, OPS, converge = false, compileBudgetMs = null }) {
  const ms = {}
  /** a stage, timed; null where it fails or throws */
  const stage = async (name, run) => {
    const t0 = performance.now()
    try { return await run() } catch { return null } finally { ms[name] = Math.round(performance.now() - t0) }
  }
  const { main } = paper.project, engine = paper.meta.compiler
  // (CM: each compile's wall as the host counts it, its `ms`, else as long as it took here — what the host's compile
  // budget is spent by —, and the last one's)
  const wall = { spent: 0, last: 0 }
  const asked = converge ? async req => { const t0 = performance.now(), c = await compile(req); wall.last = c?.ms ?? performance.now() - t0; wall.spent += wall.last; return c } : compile
  const probe = await stage('probe', async () => {
    // (runLive's request for its font probe)
    const c = await asked({ main, engine, rerun: false, bibtex: false, overrides: probeFiles(paper, { marks: true }) })
    const log = lastTexLog(c?.log)
    if (!log) return null
    const ink = inkSamples(paper.units)
    return { switches: readMarkProbe(log, probeSamples(paper.units)), inkless: readInkProbe(log, ink), texts: readInkTexts(log, ink), names: readNameProbe(log), lineskip: readSkipProbe(log) }
  })
  if (!probe) return { refused: 'probe', ms }
  const { switches, inkless, texts, names, lineskip } = probe
  const cm = converge ? { drafts: 0, marked: 0, settled: false } : null
  /** the result, with CM's record where it ran */
  const result = r => (cm ? { ...r, cm } : r)
  const marked = await stage('compile', async () => {
    const files = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless })
    if (cm) return convergeThenMark(paper, asked, files, cm, { wall, budget: compileBudgetMs })
    // (runLive's request for the marked original)
    const c = await compile({ main, engine, rerun: true, bibtex: paper.meta.bbl ? false : null, overrides: files })
    return c?.ok && c.pdf?.length ? c : null
  })
  if (!marked) return result({ refused: 'compile', ms })
  const marks = await stage('marks', async () => {
    const opened = await open(marked.pdf)
    try {
      return new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(opened.doc, lastTexLog(marked.log), { engine, classes: LAYOUT_CLASSES, switches, inkless, texts, names, lineskip, units: paper.units, OPS })))
    } finally {
      // (a failing close loses nothing: the marks are read)
      try { await opened.close() } catch {}
    }
  })
  if (!marks) return result({ refused: 'marks', ms })
  return result({ marks, ms })
}

/** CM's bound: the TeX passes it runs at most, its drafts and marked passes together (latexmk's max_repeat) */
const PASSES = 5
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
/** whether a file a pass wrote is the copy it was given, layout marks aside (marks.mjs withoutMarks: every mark a pass can
 *  write into a file, a babel name's into a list or the aux and a unit's into text the paper writes itself) */
const sameFile = (a, b) => !!b && (sameBytes(a, b) || withoutMarks(latin1(a)) === withoutMarks(latin1(b)))
const byPath = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
/** what the bibliography step reads: every aux's \citation, \bibdata and \bibstyle lines (BibTeX's), every .bcf whole (biber's) */
const bibInput = files => [...files].filter(([p]) => /\.(?:aux|bcf)$/.test(p)).sort(byPath).map(([p, b]) => `${p}\n${p.endsWith('.bcf') ? latin1(b) : (latin1(b).match(/^\\(?:citation|bibdata|bibstyle)\{.*$/gm) ?? []).join('\n')}`).join('\n')
/** a pass that ran to the document's end: TeX ran (`ok`), did not stop short, and logged END_TEX's AXT-END */
const ranThrough = c => !!c?.ok && !stoppedShort(c.log) && completeLog(c.log)

/**
 * CM, converge then mark (paper.d.mts): the files the marked original's passes read, made by the unmarked original's
 * (live.mjs originalFiles with `lines`: MARK_DEF's unit marks and the line probes, which a caption writes into its list
 * and nameref into its names, as the marked one does) in draft passes, then the marked original (`marked`) compiled in
 * them, one pass at a time, until a pass writes the files it was given. `cm` counts the passes as they run, so that a
 * compile that throws (the stage's refusal) leaves them told
 *   - draft 1 asks BibTeX where the paper ships no bibliography; draft 2 runs only where draft 1 left the next pass
 *     something to read that it had not: a bibliography or an index (a tool's) of other bytes than the copy the pass
 *     was given, or, where it was given none, with text and one the pass looked for (live.mjs notFound: "No file
 *     <job>.bbl.") — BibTeX writes an empty thebibliography for an aux that cites with no \bibdata, which a paper with
 *     its bibliography inline never reads (1706.03762) —, or a contents list it set from nothing (live.mjs
 *     listsMissing). Every later pass asks for the bibliography step only where its input changed since the step last
 *     ran (bibInput)
 *   - each pass is given every file the passes before it returned (Compiled `files`: every file the host saw written,
 *     a rewrite of the same bytes too), the latest copy of each, in place of the paper's own file of that path; never in
 *     place of one of the pass's own (the original's files, marked or not: a file TeX rewrote there is the unmarked
 *     copy, which would take the marks away); a file not returned keeps its bytes
 *   - a marked pass whose every returned file has the bytes it was given at that path (sameFile: layout marks
 *     aside; a file it was given none of is new) is the fixed point latexmk would stop at: its PDF and log are the
 *     marks'. Else the next pass is a marked one again, to PASSES TeX passes in all, where the last one's PDF is kept,
 *     not settled
 *   - a bet — the second draft, a marked pass after the first — is not started where the host's compile budget
 *     (`budget`, ms of its wall across the probe and the passes) has less left than 1.2 times the longest pass so far:
 *     without draft 2 the marked passes go on; without the next marked pass the last one's PDF is kept, not settled
 *   - a draft that did not run through (not ok — a limit, the budget spent —, stopped short, no AXT-END: nonstop
 *     mode goes on after an error as latexmk -f does) falls back to today's compile (`fallback`), as does a pass that ran
 *     through and returned no files (a host that cannot, or files past its bound); a marked pass that did not run
 *     through, or gave no PDF, is the compile's refusal (null), with no fallback after it
 */
async function convergeThenMark(paper, compile, marked, cm, { wall, budget }) {
  const { main } = paper.project, engine = paper.meta.compiler, shipped = !!paper.meta.bbl
  const unmarked = originalFiles(paper, { lines: true })
  const carried = new Map()
  let passes = 0, bibSeen = null, longest = 0
  /** whether the budget leaves room for one more pass as long as the longest so far */
  const affordable = () => budget === null || budget === undefined || budget - wall.spent >= 1.2 * longest
  /** the bytes a pass given `own` had at a path: its own file, else the latest carried, else the paper's */
  const givenAt = (own, p) => own.get(p) ?? carried.get(p) ?? paper.fsys.read(p)
  const pass = async (own, draft, bibtex) => {
    passes++
    if (draft) cm.drafts++
    else cm.marked++
    const c = await compile({ main, engine, rerun: false, bibtex, overrides: new Map([...carried, ...own]), draft, files: true })
    longest = Math.max(longest, wall.last)
    return c ?? null
  }
  /** a pass's files carried to the next, and the bibliography step's input where it ran */
  const take = (c, bibtex) => {
    for (const [p, b] of c.files) carried.set(p, b)
    if (bibtex) bibSeen = bibInput(carried)
  }
  const bibtexNext = () => !shipped && bibInput(carried) !== bibSeen
  const fallback = async why => {
    cm.fallback = why
    // (today's request for the marked original)
    const c = await compile({ main, engine, rerun: true, bibtex: shipped ? false : null, overrides: marked })
    return c?.ok && c.pdf?.length ? c : null
  }
  const first = await pass(unmarked, true, !shipped)
  if (!ranThrough(first)) return fallback('draft-failed')
  if (!first.files) return fallback('no-files')
  // (the aux from the files' bytes: the `aux` field may be a lossy decoding)
  const auxBytes = first.files.get(`${jobName(main)}.aux`), missed = notFound(first.log)
  const readNext = (p, b) => { const had = givenAt(unmarked, p); return had ? !sameFile(b, had) : missed.has(p) && /\S/.test(latin1(b)) }
  const more = [...first.files].some(([p, b]) => /\.(?:bbl|ind)$/.test(p) && readNext(p, b)) || listsMissing({ log: first.log, aux: auxBytes ? latin1(auxBytes) : null }, main)
  take(first, !shipped)
  if (more && affordable()) {
    const bibtex = bibtexNext()
    const second = await pass(unmarked, true, bibtex)
    if (!ranThrough(second)) return fallback('draft-failed')
    if (!second.files) return fallback('no-files')
    take(second, bibtex)
  }
  let last = null
  while (passes < PASSES && (!last || affordable())) {
    const bibtex = bibtexNext()
    const c = await pass(marked, false, bibtex)
    if (!ranThrough(c) || !c.pdf?.length) return null
    if (!c.files) return fallback('no-files')
    last = c
    cm.settled = [...c.files].every(([p, b]) => sameFile(b, givenAt(marked, p)))
    take(c, bibtex)
    if (cm.settled) break
  }
  return last
}
