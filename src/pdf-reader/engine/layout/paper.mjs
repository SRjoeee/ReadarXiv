// The part of this module that stays in the old engine: what the moved front half never calls. The rest moved into the engine
// package (packages/engine/src/compile/paper.mjs); this path imports it back and re-exports its names through its transition path. The cut-over
// deletes this file.
import { isMemoryError } from '@readarxiv/engine'
import { whyText } from './guard.mjs'
import { finalCheck } from './base.mjs'
import { readMarked } from './marks.mjs'
import { markedOfPaper } from '@readarxiv/engine/today/compile/paper.mjs'
export { bibliographyKept, madeBibliography, markedOfPaper, handoverOf } from '@readarxiv/engine/today/compile/paper.mjs'

/**
 * A paper's layout marks (paper.d.mts): markedOfPaper's marked original, then read once (stage 3), with each stage's time, or
 * the stage that failed with the times of those that ran. With `final` (default on), the base page too (`base`: the final pass,
 * { pdf, log, check: { marks } } once its marks are the draft's, base.mjs finalCheck, else { refused: 'final', why }), its
 * PDF opened by `open` beside the draft's. Never throws: a compiler that throws, a PDF that does not open and
 * a reading that refuses are each their stage's refusal, but a failed allocation, which goes on as itself. `converge`: the marked original made by convergeThenMark, its passes
 * in `cm`, within `compileBudgetMs` and `filesBound` where the host gives them; `pages` and `engines` the guard's, and `tried`
 * TeX's why's, as markedOfPaper's
 */
export async function layoutMarksOfPaper(paper, { compile, open, OPS, converge = false, compileBudgetMs = null, filesBound = null, pages = null, engines = null, tried = null, final = true, sourceDate = null, textOf = null, compilerOf = null }) {
  const made = await markedOfPaper(paper, { compile, converge, compileBudgetMs, filesBound, pages, engines, tried, final, sourceDate, textOf, compilerOf })
  if (made.refused) return made
  const ms = { ...made.ms }
  /** the result, with CM's record and the guard's where they ran, and the base page where it was asked */
  let base = made.base
  const result = r => ({ ...r, ...(made.cm ? { cm: made.cm } : {}), ...(made.guard ? { guard: made.guard } : {}), ...(base ? { base } : {}) })
  const t0 = performance.now()
  let read = null
  try {
    const opened = await open(made.pdf)
    let failed = null
    // (read once, a page at a time: the marks in memory, handed to the maker as they are, and the unit marks the left is
    // anchored by, from the same pages)
    try { read = await readMarked(opened.doc, made.log, { ...made.options, units: paper.units, OPS }) } catch (e) { failed = e }
    // (the final pass's marks against the draft's, both open: base.mjs finalCheck; its failure, or a final pass that does not
    // open, no base page. Opened from a copy: the base page's bytes are the result's, and PDF.js takes the buffer it is given)
    if (!failed && base?.pdf) {
      try {
        const fin = await open(base.pdf.slice())
        try {
          const check = await finalCheck(opened.doc, fin.doc)
          base = check.ok ? { ...base, check: { marks: check.marks } } : { refused: 'final', why: whyText(`the final pass is not the draft's page: ${check.why}`) }
        } finally { await fin.close() }
      } catch (e) {
        if (isMemoryError(e)) failed = e
        else base = { refused: 'final', why: whyText(`the final pass could not be read: ${e?.message ?? e}`) }
      }
    }
    // (closed whatever the reading did; a failing close loses nothing, the marks are read, but a failed allocation)
    try { await opened.close() } catch (e) { if (isMemoryError(e)) failed = e }
    if (failed) throw failed
  } catch (e) { if (isMemoryError(e)) throw e; read = null } finally { ms.marks = Math.round(performance.now() - t0) }
  if (!read) return result({ refused: 'marks', ms })
  return result({ marks: read.marks, unitMarks: read.unitMarks, ms })
}
