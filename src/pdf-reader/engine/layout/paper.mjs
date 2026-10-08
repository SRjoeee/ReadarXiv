// A paper's layout marks in one call: what the layout maker (layout/make.mjs) reads from the marked original, made as the
// layer gate's fixtures were measured (before 2026-10-08 only the spikes did, spikes/layer-fixtures.mjs and
// spikes/layout-make.mjs, which now call this: one implementation, the server's and the extension's).
//
// The order, and why:
//   1. the mark probe (live.mjs probeFiles `marks`), compiled in one pass: its log holds the paper's own switch (TeX's
//      answers to the mark probe, readMarkProbe), the macros that set no ink (readInkProbe), the text the others set
//      (readInkTexts) and whether each babel name's own text holds a lowercase letter (readNameProbe). Read as runLive
//      reads the font probe, from its log alone: the probe has no body and so no pages,
//      and a compiler need not call that a success
//   2. the marked original (live.mjs originalFiles with `lines` and the layout marks of every class), marked with those
//      answers, compiled in full: its marks are where each marked piece stands, so it must be marked as the maker will
//      read it (the file carries the switch, MARKS_SCHEMA 2 or more)
//   3. its PDF opened by the caller, and layoutMarksOf over that document and the compile's last pass's log, with the
//      paper's units and PDF.js's operator codes, so that each marked piece's own ink is read from its operator lists
// The compile and the opening are the caller's (a native TeX Live and PDF.js in Node, the TeX page and a worker in a
// browser), so that this imports neither PDF.js nor a `node:*` module.
import { lastTexLog } from '../source/latex-front.mjs'
import { originalFiles, probeFiles } from '../pipeline/live.mjs'
import { encodeLayoutMarks, inkSamples, LAYOUT_CLASSES, layoutMarksOf, probeSamples, readInkProbe, readInkTexts, readMarkProbe, readNameProbe } from './marks.mjs'

/**
 * A paper's layout marks (paper.d.mts): the marks file's bytes, with each stage's time, or the stage that failed with the
 * times of those that ran. Never throws: a compiler that throws, a PDF that does not open and a reading that refuses
 * are each their stage's refusal
 */
export async function layoutMarksOfPaper(paper, { compile, open, OPS }) {
  const ms = {}
  /** a stage, timed; null where it fails or throws */
  const stage = async (name, run) => {
    const t0 = performance.now()
    try { return await run() } catch { return null } finally { ms[name] = Math.round(performance.now() - t0) }
  }
  const { main } = paper.project, engine = paper.meta.compiler
  const probe = await stage('probe', async () => {
    // (runLive's request for its font probe)
    const c = await compile({ main, engine, rerun: false, bibtex: false, overrides: probeFiles(paper, { marks: true }) })
    const log = lastTexLog(c?.log)
    if (!log) return null
    const ink = inkSamples(paper.units)
    return { switches: readMarkProbe(log, probeSamples(paper.units)), inkless: readInkProbe(log, ink), texts: readInkTexts(log, ink), names: readNameProbe(log) }
  })
  if (!probe) return { refused: 'probe', ms }
  const { switches, inkless, texts, names } = probe
  const marked = await stage('compile', async () => {
    // (runLive's request for the marked original)
    const c = await compile({ main, engine, rerun: true, bibtex: paper.meta.bbl ? false : null, overrides: originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless }) })
    return c?.ok && c.pdf?.length ? c : null
  })
  if (!marked) return { refused: 'compile', ms }
  const marks = await stage('marks', async () => {
    const opened = await open(marked.pdf)
    try {
      return new TextEncoder().encode(encodeLayoutMarks(await layoutMarksOf(opened.doc, lastTexLog(marked.log), { engine, classes: LAYOUT_CLASSES, switches, inkless, texts, names, units: paper.units, OPS })))
    } finally {
      // (a failing close loses nothing: the marks are read)
      try { await opened.close() } catch {}
    }
  })
  if (!marks) return { refused: 'marks', ms }
  return { marks, ms }
}
