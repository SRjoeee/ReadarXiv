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
//   3. its PDF opened by the caller, and read once (marks.mjs readMarked) with the compile's last pass's log, the paper's
//      units and PDF.js's operator codes (markedOfPaper stops before it: the marked original and what reads it, for a host
//      that reads it elsewhere, the page pass a page at a time), so that each marked piece's own ink is read from its operator lists: the marks
//      in memory (the maker takes them as they are: no file is written and read back) and the unit marks the left is
//      anchored by (their words read from the same pages)
// The compile and the opening are the caller's (a native TeX Live and PDF.js in Node, the TeX page and a worker in a
// browser), so that this imports neither PDF.js nor a `node:*` module.
import { jobName, lastTexLog, latin1 } from '../source/latex-front.mjs'
import { listsMissing, notFound, originalFiles, probeFiles, ranThrough } from '../pipeline/live.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { auxUnits, engineUnknown, errorCount, errorUnits, firstError, limitOf, ownErrors, pagesOfLog, texLiveOf, texRan, unbalancedUnits, unmarkedFiles, whyText } from './guard.mjs'
import { inkSamples, LAYOUT_CLASSES, probeSamples, readInkProbe, readInkTexts, readMarked, readMarkProbe, readNameProbe, readSkipProbe, NAME_MARK_FILE, withoutNameMarks } from './marks.mjs'

/** the layout guard's compiles past the marked original's, at most, the unmarked original's among them */
const GUARD_EXTRA = 2

/**
 * A paper's marked original (paper.d.mts), the layout marks' stages 1 and 2 without the reading: the marked compile's PDF, its
 * last pass's log and the options readMarked reads it with (`engine`, `classes`, the probe's answers; the units and the
 * operator codes are the reader's), with each stage's time, or why there is none ({ refused, why }) with the times of the
 * stages that ran. For a host that reads the marked original elsewhere (the page pass's `marked`, layerOfPaper, a page at a
 * time). Never throws: a throw of the guard's own skips its brace check, or after the compile takes the marked original as
 * before the guard (one that ran through with a PDF, else the compile's refusal); a failed allocation goes on as itself.
 *
 * The marked original must be the paper (the layout guard, layout/guard.mjs; R1 of 2026-10-19). Before its compile, a unit
 * whose writing changes its file's brace balance outside comments and verbatim is left unmarked (unbalancedUnits; our other
 * edits unbalancing a file: the name marks off). After it, every check must hold: it ran through (live.mjs ranThrough); its
 * page count is arXiv's (`pages`, where the host gives it: a number, or a function asked once for it; with several toplevel
 * sources, `meta.toplevels`, at most arXiv's: the first file's pages are arXiv's first); no auxiliary file it wrote holds a
 * mark of ours where no text is set (auxUnits); its TeX errors are no more than the unmarked original's (an unmarked compile
 * only where it has any). A paper whose marked original passes costs no compile more. On a check that fails, the units the
 * evidence blames are left unmarked and the marked original compiled again, at most GUARD_EXTRA compiles in all, the
 * unmarked original's among them, none where `compileBudgetMs` (the host's budget across every compile of the paper, as
 * CM's: its wall less 1.2 times the longest compile so far) cannot hold one:
 *   - TeX that never ran (no engine banner) or a host's limit is no mark's fault: refused at once ('engine' where the host
 *     names the engine unknown, else 'compile': a host's own failure, its cap on a compile's result)
 *   - errors alone (it ran through to arXiv's pages, nothing out of place): the unmarked original compiled; errors no more
 *     than its are the paper's own and the marked original stands; else the units its other errors stand in unmarked
 *     (errorUnits less ownErrors), or, none, the name marks off
 *   - a mark out of place (strong evidence): those units, and those its errors stand in, unmarked (passing, the latter
 *     marked again where a compile is left: the smaller remedy, kept where it passes with no more errors); failing, the name
 *     marks off too
 *   - else (it did not run through, or its pages are not arXiv's): the units its errors stand in, and the units at the line
 *     TeX ignored all text after, unmarked with the name marks off; passing, the units marked again with the names off where
 *     a compile is left (the smaller remedy, kept where it passes with no more errors: 2610.21288's name marks alone); failing, the unmarked
 *     original compiled, whose failure is TeX's ('texlive' where the paper declares another TeX Live year than the box's,
 *     'engine', 'compile'), else ours ('marks')
 * An attempt that passes is the marked original; where none does, the best that ran through to arXiv's page count or more
 * (fewest checks failed, then errors; the earliest) stands, judged by the page pass and the carry as before; none that ran
 * through: refused, with why. `engines`, where the host gives the compilers it runs: a paper of another is refused before
 * any compile ('engine'). `guard` records what the guard did, where it did anything: { extra, unmarked, names, failed,
 * judged? }
 *
 * A refusal after the unmarked original was compiled names its verdict, `own` (ownVerdict): what the host's handover to
 * another TeX Live tree is decided by (handoverOf). `tried`, where the host gives it: the TeX Live years the paper's own
 * source was compiled on before this box's tree, in order; TeX's refusal names them before the box's ("on TeX Live 2023 or
 * 2025"), and is 'texlive' only where the paper declares a year none of them is (none given: the box's year alone, as before)
 */
export async function markedOfPaper(paper, { compile, converge = false, compileBudgetMs = null, filesBound = null, pages = null, engines = null, tried = null }) {
  const ms = {}
  /** a stage, timed; null where it fails or throws, but a failed allocation, which goes on as itself (the run's, never the paper's) */
  const stage = async (name, run) => {
    const t0 = performance.now()
    try { return await run() } catch (e) { if (isMemoryError(e)) throw e; return null } finally { ms[name] = Math.round(performance.now() - t0) }
  }
  const { main } = paper.project, engine = paper.meta.compiler
  if (Array.isArray(engines) && !engines.includes(engine)) return { refused: 'engine', why: `the paper is compiled by ${engine ?? 'no named engine'}, which the host does not run`, ms }
  // (each compile's wall as the host counts it, its `ms`, else as long as it took here — what the host's compile budget is
  // spent by: CM's bets and the guard's compiles —, and the last one's)
  const wall = { spent: 0, last: 0, longest: 0 }
  const asked = async req => { const t0 = performance.now(), c = await compile(req); wall.last = c?.ms ?? performance.now() - t0; wall.spent += wall.last; wall.longest = Math.max(wall.longest, wall.last); return c }
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
  const job = jobName(main), count = paper.units.length, bibtex = paper.meta.bbl ? false : null
  /** the marked original's files, the units of `unmarked` as the paper's own and the babel names marked or not */
  const filesOf = (unmarked, named, spans) => originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless, ...(unmarked.size ? { unmarked } : {}), ...(named ? {} : { names: false }), spans })
  // (before the compile: each unit's writing against its source's braces; our other edits unbalancing a file, no names)
  const g = { extra: 0, unmarked: new Set(), names: true, failed: [] }
  // (a throw of the check's own skips it: the marked original as before; the files written in the compile's stage then, whose
  // throw is the compile's refusal as before the guard)
  let spans = {}, files = null
  try {
    const sp = {}, f = filesOf(g.unmarked, true, sp)
    const balance = unbalancedUnits(paper, f, sp.lines(), sp.skip)
    if (balance.units.size || balance.other) {
      g.failed.push('braces')
      g.unmarked = balance.units
      g.names = !balance.other
      files = filesOf(g.unmarked, g.names, spans)
    } else { spans = sp; files = f }
  } catch (e) {
    if (isMemoryError(e)) throw e
    g.failed = []
    g.unmarked = new Set()
    g.names = true
    spans = {}
    files = null
  }
  const marked = await stage('compile', async () => {
    files ??= filesOf(g.unmarked, g.names, spans)
    if (cm) return convergeThenMark(paper, asked, files, cm, { wall, budget: compileBudgetMs, bound: filesBound })
    // (runLive's request for the marked original, taken as runLive takes it: one that did not run through is no marked
    // original, whatever PDF it left — 2610.20713's, TL2025's 7 pages of 15 before its hundredth error)
    return asked({ main, engine, rerun: true, bibtex, overrides: files })
  })
  const options = { engine, classes: LAYOUT_CLASSES, switches, inkless, texts, names, lineskip }
  const record = () => ({ extra: g.extra, unmarked: [...g.unmarked].sort((a, b) => a - b), names: g.names, failed: g.failed, ...(g.judged ? { judged: g.judged } : {}) })
  const guarded = r => result(g.failed.length ? { ...r, guard: record() } : r)
  if (!marked) return guarded({ refused: 'compile', why: cm ? 'a marked pass did not run through, or the compile threw' : 'the compile threw', ms })
  /** the unmarked original's verdict, once it was compiled (ownVerdict): a refusal names it, as `own` */
  let verdict = null
  const owned = r => (verdict ? { ...r, own: verdict } : r)
  // (a throw of the guard's own after the compile: the last remedy that passed the checks stands, else the marked original as
  // before the guard, one that ran through with a PDF, else the compile's refusal)
  let standing = null
  try { return await checked() } catch (e) {
    if (isMemoryError(e)) throw e
    g.judged = whyText(`the layout guard failed: ${e?.message ?? e}`)
    if (standing) { g.unmarked = standing.unmarked; g.names = standing.named; return guarded({ pdf: standing.c.pdf, log: lastTexLog(standing.c.log), options, ms }) }
    return ranThrough(marked) && marked.pdf?.length ? guarded({ pdf: marked.pdf, log: lastTexLog(marked.log), options, ms }) : guarded(owned({ refused: 'compile', why: whyText(`the marked original did not run through; ${g.judged}`), ms }))
  }

  /** the checks after the compile, and the remedies */
  async function checked() {
    // arXiv's page count, asked once where the host gives it
    let N = null
    if (pages !== null && pages !== undefined) {
      // (any failure of the host's but a failed allocation leaves the page check out: N null)
      try { const n = typeof pages === 'function' ? await pages() : pages; if (Number.isInteger(n) && n > 0) N = n } catch (e) { if (isMemoryError(e)) throw e }
    }
    const several = (paper.meta.toplevels ?? 1) > 1
    /** what a compile shows of the checks: ran through, its pages against arXiv's (`short` fewer, where a paper of one toplevel
     *  source; `long` more), the units named by marks out of place, its TeX errors */
    const evidence = (c, f, sp) => {
      const ran = ranThrough(c) && !!c?.pdf?.length, M = c ? pagesOfLog(c.log) : null
      return { c, files: f, spans: sp, ran, pages: M, short: ran && N !== null && M !== null && M < N && !several, long: ran && N !== null && M !== null && M > N, aux: ran ? auxUnits(c, count, job) : new Set(), errors: c ? errorCount(c.log) : 0 }
    }
    /** whether it stands: ran through, arXiv's pages, nothing out of place, and no errors (or no more than the paper's own) */
    const fits = e => e.ran && !e.short && !e.long && e.aux.size === 0
    const clean = (e, own) => fits(e) && (e.errors === 0 || (own !== null && e.errors <= own.errors))
    const failedOf = e => [...(e.ran ? [] : ['ran']), ...(e.short || e.long ? ['pages'] : []), ...(e.aux.size ? ['aux'] : []), ...(e.errors ? ['errors'] : [])]
    const done = e => guarded({ pdf: e.c.pdf, log: lastTexLog(e.c.log), options, ms })
    // (a why without the log's control characters, within WHY_MAX)
    const refuse = r => guarded(owned({ ...r, ...(r.why === undefined ? {} : { why: whyText(r.why) }), ms }))
    const e0 = evidence(marked, files, spans)
    if (clean(e0, null)) return done(e0)
    g.failed.push(...failedOf(e0))
    const t0 = performance.now()
    const timed = r => { ms.guard = Math.round(performance.now() - t0); return r }
    // a compile TeX never ran, or one a host's limit stopped, is no mark's fault: no compile mends it
    if (!e0.ran) {
      const limit = limitOf(marked)
      if (limit) return refuse({ refused: 'compile', why: `the marked original was stopped by the host's ${limit} limit` })
      // (`engine` where the host names the engine unknown; any other answer TeX never ran in, a host's own failure or its cap on
      // a compile's result, the compile's)
      if (!texRan(marked.log)) return refuse({ refused: engineUnknown(marked) ? 'engine' : 'compile', why: `the ${engine} compile ran no TeX${firstLine(marked) ? `: ${firstLine(marked)}` : ''}` })
    }
    /** whether the host's budget holds one more compile, within GUARD_EXTRA */
    const afford = () => g.extra < GUARD_EXTRA && (compileBudgetMs === null || compileBudgetMs === undefined || compileBudgetMs - wall.spent >= 1.2 * wall.longest)
    /** the unmarked original's compile, once it ran through to arXiv's pages: what an attempt's errors are judged against */
    let own = null
    /** the marked original again, `unmarked` left the paper's own and the names marked or not: its evidence */
    const attempt = async (unmarked, named) => {
      g.extra++
      const sp = {}, f = filesOf(unmarked, named, sp)
      let c = null
      // (a failed allocation is the run's, never the paper's refusal)
      try { c = await asked({ main, engine, rerun: true, bibtex, overrides: f }) } catch (e) { if (isMemoryError(e)) throw e }
      const r = { ...evidence(c, f, sp), unmarked, named }
      // (one that passes the checks stands if a later step of the guard throws)
      if (clean(r, own)) standing = r
      return r
    }
    /** the unmarked original (unmarkedFiles), compiled as the marked one is: whether it ran through, its pages, its errors */
    const original = async () => {
      g.extra++
      let c = null
      try { c = await asked({ main, engine, rerun: true, bibtex, overrides: unmarkedFiles(paper) }) } catch (e) { if (isMemoryError(e)) throw e }
      const ran = ranThrough(c) && !!c?.pdf?.length, M = c ? pagesOfLog(c.log) : null
      const u = { c, ran, pages: M, short: ran && N !== null && M !== null && M < N && !several, errors: c ? errorCount(c.log) : 0, own: c ? ownErrors(c.log) : new Set() }
      if (u.ran && !u.short) own = u
      verdict = ownVerdict(u)
      return u
    }
    /** the attempt taken: its units and names the guard's record */
    const take = e => { if (e !== e0) { g.unmarked = e.unmarked; g.names = e.named } return timed(done(e)) }
    /** of attempts that ran through to arXiv's page count or more, the one that fails the fewest checks, then has the fewest
     *  errors (the earliest of equals): judged by the page pass and the carry as before */
    const best = list => { let b = null; for (const e of list) if (e.ran && !e.short && (!b || rank(e) < rank(b))) b = e; return b }
    const rank = e => (e.aux.size ? 2e9 : 0) + (e.long ? 1e9 : 0) + e.errors
    const union = (...sets) => { const out = new Set(); for (const s of sets) for (const x of s) out.add(x); return out }
    const blamedBy = (e, own = null) => (e.c && texRan(e.c.log) ? errorUnits(paper, e.c.log, e.files, e.spans.lines(), own) : new Set())
    /** TeX's own failure, as the unmarked original shows it: the category and why, every tree tried named (the host's
     *  `tried`, then the box's); 'texlive' where the paper declares a year none of them is */
    const texs = u => {
      if (!u.c) return { refused: 'compile', why: 'the paper\'s own source: the compile threw' }
      const limit = limitOf(u.c)
      if (limit) return { refused: 'compile', why: `the paper's own source was stopped by the host's ${limit} limit` }
      if (!texRan(u.c.log)) return { refused: engineUnknown(u.c) ? 'engine' : 'compile', why: `the ${engine} compile of the paper's own source ran no TeX${firstLine(u.c) ? `: ${firstLine(u.c)}` : ''}` }
      const what = !u.ran ? 'does not run through' : `has ${u.pages} pages, arXiv's PDF ${N}`, err = firstError(u.c.log), said = err ? `: ${err}` : ''
      const ours = texLiveOf(u.c.log), declared = paper.meta.tlVersion ?? null, cls = paper.meta.documentclass ? ` (${paper.meta.documentclass})` : ''
      const trees = treesOf(tried, ours), on = trees.join(' or ')
      if (declared && ours && !trees.includes(String(declared))) return { refused: 'texlive', why: `the paper${cls} declares TeX Live ${declared}; on TeX Live ${on} its own source ${what}${said}` }
      if (declared && trees.length > 1) return { refused: 'compile', why: `the paper${cls} declares TeX Live ${declared}; its own source ${what} on TeX Live ${on}${said}` }
      return { refused: 'compile', why: `the paper's own source${cls} ${what}${on ? ` on TeX Live ${on}` : ''}${said}` }
    }
    const whatOf = e => (!e.ran ? 'does not run through' : e.short ? `has ${e.pages} pages, arXiv's PDF ${N}` : 'is not the paper')
    /** the marked original refused as ours ('marks'), or, where nothing told whose fault it is (the unmarked original not
     *  compiled), as the compile's, as before the guard */
    const why = (e, more) => { const err = e.c ? firstError(e.c.log) : null; return `the marked original ${whatOf(e)}${err ? ` (${err})` : ''}, ${more}` }
    const ours = (e, more) => ({ refused: 'marks', why: why(e, more) })
    const untold = (e, more) => ({ refused: 'compile', why: why(e, `${more}; the paper's own source was not compiled`) })

    if (!afford()) {
      g.judged = 'no compile left'
      return e0.ran && !e0.short ? timed(done(e0)) : timed(refuse(untold(e0, 'and no compile was left to mend it')))
    }
    // errors alone: the paper's own, or the units they stand in
    if (fits(e0)) {
      const u = await original()
      if (!u.ran || u.short) { g.judged = 'the paper\'s own source does not make arXiv\'s pages here'; return take(e0) }
      if (e0.errors <= u.errors) { g.judged = 'its errors are the paper\'s own'; return take(e0) }
      if (!afford()) { g.judged = 'no compile left'; return take(e0) }
      const blamed = [...blamedBy(e0, u.own)].filter(i => !g.unmarked.has(i))
      const e1 = await attempt(union(g.unmarked, blamed), blamed.length ? g.names : false)
      if (clean(e1, u)) return take(e1)
      return take(best([e0, e1]))
    }
    const strong = [...e0.aux].filter(i => !g.unmarked.has(i)), weak = [...blamedBy(e0)].filter(i => !g.unmarked.has(i))
    /** an attempt that fits, its errors judged against the unmarked original's where it has any and a compile is left */
    const judged = async (e1, also) => {
      if (e1.errors === 0) return e1
      if (!afford()) { g.judged = 'no compile left'; return e1 }
      const u = await original()
      if (!u.ran || u.short || e1.errors <= u.errors) return e1
      return best([e0, e1, ...also])
    }
    if (strong.length) {
      // a mark of ours out of place: those units (and those the errors stand in) unmarked, then the names off too
      const e1 = await attempt(union(g.unmarked, strong, weak), g.names)
      if (fits(e1)) {
        if (weak.length && afford()) {
          // (the smaller remedy, where it holds, its errors no more than the first's: the units the errors' lines blamed marked
          // again, the marks out of place's not)
          const e2 = await attempt(union(g.unmarked, strong), g.names)
          if (fits(e2) && e2.errors <= e1.errors) return take(await judged(e2, [e1]))
        }
        return take(await judged(e1, []))
      }
      if (afford() && g.names) {
        const e2 = await attempt(e1.unmarked, false)
        if (fits(e2)) { if (e2.errors) g.judged = 'no compile left'; return take(e2) }
        const kept = best([e0, e1, e2])
        return kept ? take(kept) : timed(refuse(ours(e0, `nor with units ${[...e1.unmarked].join(', ')} unmarked and the name marks off`)))
      }
      const kept = best([e0, e1])
      return kept ? take(kept) : timed(refuse(ours(e0, `nor with units ${[...e1.unmarked].join(', ')} unmarked`)))
    }
    // it did not run through, or its pages are not arXiv's: the units its errors stand in and the name marks, both off (none
    // to take off: the unmarked original tells whose fault it is)
    const remedy = weak.length ? `units ${weak.join(', ')} unmarked and the name marks off` : 'the name marks off'
    let e1 = null
    if (weak.length || g.names) {
      e1 = await attempt(union(g.unmarked, weak), false)
      if (fits(e1)) {
        if (weak.length && afford()) {
          // (the smaller remedy, where it holds, its errors no more than the first's: the units marked again, the names off)
          const e2 = await attempt(g.unmarked, false)
          if (fits(e2) && e2.errors <= e1.errors) return take(await judged(e2, [e1]))
        }
        return take(await judged(e1, []))
      }
      const kept = best([e0, e1])
      if (kept) return take(kept)
      if (!afford()) return timed(refuse(untold(e0, `nor with ${remedy}`)))
    }
    const u = await original()
    if (!u.ran || u.short) return timed(refuse(texs(u)))
    return timed(refuse(ours(e0, `${e1 ? `nor with ${remedy}, ` : ''}where the paper's own source makes ${u.pages ?? 'its'} pages`)))
  }
}

/** a compile's first line of what it said, where TeX said nothing: its error, else its log's */
const firstLine = c => String(c?.error ?? c?.log ?? '').split('\n').find(l => l.trim())?.trim().slice(0, 120) ?? ''

/** a TeX Live year as a refusal and the handover name it ('2023'), else null */
const yearOf = y => (y === null || y === undefined ? null : /^\d{4}$/.test(String(y)) ? String(y) : null)
/** the TeX Live years a refusal of TeX's names: the host's `tried`, in order, then the box's, each once */
const treesOf = (tried, ours) => [...new Set([...(Array.isArray(tried) ? tried : []), ours].map(yearOf).filter(y => y !== null))]
/** the unmarked original's verdict (paper.d.mts OwnVerdict), as a host's handover reads it (handoverOf): whether it ran
 *  through (live.mjs ranThrough, with a PDF), whether it did with fewer pages than arXiv's (`pages` given, one toplevel
 *  source), the host's limit it met (limitOf), and the TeX Live year its engine's banner names (null where TeX never ran or
 *  the compile threw) */
const ownVerdict = u => ({ ran: u.ran, short: u.short, limit: (u.c ? limitOf(u.c) : null) ?? null, tree: u.c && texRan(u.c.log) ? texLiveOf(u.c.log) : null })

/**
 * The host's handover to another TeX Live tree (the TL2023 plan §2.3), over a refusal's `own` (markedOfPaper): the year of
 * the tree to compile the paper on next, or null. Where TeX failed on the paper's own source here (it did not run through,
 * or ran through with fewer pages than arXiv's) and no host's limit stopped it: another of the `served` trees (the paper's
 * `declared` year where it is one of them, else the first), unless this tree is the host's `last`. Never on no verdict (the
 * unmarked original not compiled), ours (it made the pages here), a host's limit, or a verdict with no year (TeX that never
 * ran, a compile that threw: the host's own failure, tried again on the same tree). The tree that makes a paper's layout is
 * then a function of the source and the served trees alone (TeX on a frozen tree is deterministic; no limit enters)
 */
export function handoverOf(own, { declared = null, served = [], last = false } = {}) {
  if (!own || last || own.limit || (own.ran && !own.short)) return null
  const here = yearOf(own.tree)
  if (here === null) return null
  const others = treesOf(served, null).filter(y => y !== here), want = yearOf(declared)
  if (!others.length) return null
  return want !== null && others.includes(want) ? want : others[0]
}

/**
 * A paper's layout marks (paper.d.mts): markedOfPaper's marked original, then read once (stage 3), with each stage's time, or
 * the stage that failed with the times of those that ran. Never throws: a compiler that throws, a PDF that does not open and
 * a reading that refuses are each their stage's refusal, but a failed allocation, which goes on as itself. `converge`: the marked original made by convergeThenMark, its passes
 * in `cm`, within `compileBudgetMs` and `filesBound` where the host gives them; `pages` and `engines` the guard's, and `tried`
 * TeX's why's, as markedOfPaper's
 */
export async function layoutMarksOfPaper(paper, { compile, open, OPS, converge = false, compileBudgetMs = null, filesBound = null, pages = null, engines = null, tried = null }) {
  const made = await markedOfPaper(paper, { compile, converge, compileBudgetMs, filesBound, pages, engines, tried })
  if (made.refused) return made
  const ms = { ...made.ms }
  /** the result, with CM's record and the guard's where they ran */
  const result = r => ({ ...r, ...(made.cm ? { cm: made.cm } : {}), ...(made.guard ? { guard: made.guard } : {}) })
  const t0 = performance.now()
  let read = null
  try {
    const opened = await open(made.pdf)
    let failed = null
    // (read once, a page at a time: the marks in memory, handed to the maker as they are, and the unit marks the left is
    // anchored by, from the same pages)
    try { read = await readMarked(opened.doc, made.log, { ...made.options, units: paper.units, OPS }) } catch (e) { failed = e }
    // (closed whatever the reading did; a failing close loses nothing, the marks are read, but a failed allocation)
    try { await opened.close() } catch (e) { if (isMemoryError(e)) failed = e }
    if (failed) throw failed
  } catch (e) { if (isMemoryError(e)) throw e; read = null } finally { ms.marks = Math.round(performance.now() - t0) }
  if (!read) return result({ refused: 'marks', ms })
  return result({ marks: read.marks, unitMarks: read.unitMarks, ms })
}

/** CM's bound: the TeX passes it runs at most, its drafts and marked passes together (latexmk's max_repeat) */
const PASSES = 5
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
/** whether a file a pass wrote is the copy it was given, a babel name's marks aside in the aux and the lists (marks.mjs
 *  withoutNameMarks): a mark anywhere else is a difference */
const sameFile = (p, a, b) => !!b && (sameBytes(a, b) || (NAME_MARK_FILE.test(p) && withoutNameMarks(latin1(a)) === withoutNameMarks(latin1(b))))
const byPath = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
/** what the bibliography step reads: every aux's \citation, \bibdata and \bibstyle lines (BibTeX's), every .bcf whole (biber's) */
const bibInput = files => [...files].filter(([p]) => /\.(?:aux|bcf)$/.test(p)).sort(byPath).map(([p, b]) => `${p}\n${p.endsWith('.bcf') ? latin1(b) : (latin1(b).match(/^\\(?:citation|bibdata|bibstyle)\{.*$/gm) ?? []).join('\n')}`).join('\n')
/** whether a pass wrote a bibliography job beside the main one's (an aux of another name holding a \bibdata: chapterbib, multibib,
 *  bibunits), which latexmk runs BibTeX on and a one-pass request (the main job's bibliography step alone) never does */
const otherBibJobs = (files, main) => [...files].some(([p, b]) => /\.aux$/.test(p) && p !== `${jobName(main)}.aux` && /^\\bibdata\{/m.test(latin1(b)))
/** whether a bibliography the pass names has no .bib file in the project (a \bibdata name in an aux, a datasource of a .bcf): the
 *  bibliography step's tool would run, but latexmk -norc (bibtex_use 1) skips BibTeX and biber when any .bib is missing, and
 *  BibTeX writes an empty thebibliography none of L's passes has. Over-broad for a .bib of the TeX tree (IEEEabrv): only
 *  today's compile is asked then */
const bibMissing = (files, fsys) => {
  const names = []
  for (const [p, b] of files) {
    if (p.endsWith('.aux')) for (const m of latin1(b).matchAll(/^\\bibdata\{([^}]*)\}/gm)) names.push(...m[1].split(','))
    else if (p.endsWith('.bcf')) for (const m of latin1(b).matchAll(/<bcf:datasource\b[^>]*>([^<]*)</g)) names.push(m[1])
  }
  return names.map(n => n.trim()).filter(Boolean).some(n => !fsys.read(n.endsWith('.bib') ? n : `${n}.bib`))
}

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
 *   - a marked pass whose every returned file has the bytes it was given at that path (sameFile: a babel name's marks
 *     aside in the aux and the lists; a file it was given none of is new) is the fixed point latexmk would stop at: its PDF and log are the
 *     marks'. Else the next pass is a marked one again, to PASSES TeX passes in all, where the last one's PDF is kept,
 *     not settled
 *   - a bet — the second draft, a marked pass after the first — is not started where the host's compile budget
 *     (`budget`, ms of its wall across the probe and the passes) has less left than 1.2 times the longest pass so far:
 *     without draft 2 the marked passes go on; without the next marked pass the last one's PDF is kept, not settled
 *   - a draft that did not run through (not ok — a limit, the budget spent —, stopped short, no AXT-END: nonstop
 *     mode goes on after an error as latexmk -f does) falls back to today's compile (`fallback`), as does a pass that ran
 *     through and returned no files (a host that cannot, or files past its bound), or the first draft wrote a bibliography job
 *     beside the main one's (otherBibJobs: chapterbib, multibib, bibunits — no bibliography shipped), which latexmk runs
 *     and the one-pass request does not, or names a .bib the project lacks
 *     (bibMissing: latexmk skips the bibliography step then, BibTeX does not); or the files the next pass would be given (carried and
 *     returned, its own aside) are past the host's `filesBound` (a host holds one pass's files to it; `files-bound`); a marked pass that did not run
 *     through, or gave no PDF, is the compile's refusal (null), with no fallback after it
 */
async function convergeThenMark(paper, compile, marked, cm, { wall, budget, bound }) {
  const { main } = paper.project, engine = paper.meta.compiler, shipped = !!paper.meta.bbl
  const unmarked = originalFiles(paper, { lines: true })
  const carried = new Map()
  let passes = 0, bibSeen = null
  /** whether the budget leaves room for one more pass as long as the longest compile so far, the probe's included */
  const affordable = () => budget === null || budget === undefined || budget - wall.spent >= 1.2 * wall.longest
  /** the bytes a pass given `own` had at a path: its own file, else the latest carried, else the paper's */
  const givenAt = (own, p) => own.get(p) ?? carried.get(p) ?? paper.fsys.read(p)
  const pass = async (own, draft, bibtex) => {
    passes++
    if (draft) cm.drafts++
    else cm.marked++
    const c = await compile({ main, engine, rerun: false, bibtex, overrides: new Map([...carried, ...own]), draft, files: true })
    return c ?? null
  }
  /** a pass's files carried to the next, and the bibliography step's input where it ran */
  const take = (c, bibtex) => {
    for (const [p, b] of c.files) carried.set(p, b)
    if (bibtex) bibSeen = bibInput(carried)
  }
  /** whether the files the next pass would be given on top of its own (carried + the pass's returned, at paths other than
   *  `own`'s) are within the host's bound (`bound` { count, bytes }, absent: unlimited): a host holds one pass's files to it,
   *  and a set that grew past it across the passes is a frame outside the protocol */
  const fits = (c, own) => {
    if (!bound) return true
    const held = new Map(carried)
    for (const [p, b] of c.files) held.set(p, b)
    let count = 0, bytes = 0
    for (const [p, b] of held) if (!own.has(p)) { count++; bytes += b.length }
    return count <= bound.count && bytes <= bound.bytes
  }
  const bibtexNext = () => !shipped && bibInput(carried) !== bibSeen
  const fallback = async why => {
    cm.fallback = why
    // (today's request for the marked original, judged as today's: ran through, a PDF)
    const c = await compile({ main, engine, rerun: true, bibtex: shipped ? false : null, overrides: marked })
    return ranThrough(c) && c.pdf?.length ? c : null
  }
  const first = await pass(unmarked, true, !shipped)
  if (!ranThrough(first)) return fallback('draft-failed')
  if (!first.files) return fallback('no-files')
  if (!shipped && otherBibJobs(first.files, main)) return fallback('aux-jobs')
  if (!shipped && bibMissing(first.files, paper.fsys)) return fallback('bib-missing')
  // (the aux from the files' bytes: the `aux` field may be a lossy decoding)
  const auxBytes = first.files.get(`${jobName(main)}.aux`), missed = notFound(first.log)
  const readNext = (p, b) => { const had = givenAt(unmarked, p); return had ? !sameFile(p, b, had) : missed.has(p) && /\S/.test(latin1(b)) }
  const more = [...first.files].some(([p, b]) => /\.(?:bbl|ind)$/.test(p) && readNext(p, b)) || listsMissing({ log: first.log, aux: auxBytes ? latin1(auxBytes) : null }, main)
  const second = more && affordable()
  if (!fits(first, second ? unmarked : marked)) return fallback('files-bound')
  take(first, !shipped)
  if (second) {
    const bibtex = bibtexNext()
    const again = await pass(unmarked, true, bibtex)
    if (!ranThrough(again)) return fallback('draft-failed')
    if (!again.files) return fallback('no-files')
    if (!fits(again, marked)) return fallback('files-bound')
    take(again, bibtex)
  }
  let last = null
  while (passes < PASSES && (!last || affordable())) {
    const bibtex = bibtexNext()
    const c = await pass(marked, false, bibtex)
    if (!ranThrough(c) || !c.pdf?.length) return null
    if (!c.files) return fallback('no-files')
    last = c
    cm.settled = [...c.files].every(([p, b]) => sameFile(p, b, givenAt(marked, p)))
    if (cm.settled) { take(c, bibtex); break }
    if (passes < PASSES && affordable() && !fits(c, marked)) return fallback('files-bound')
    take(c, bibtex)
  }
  return last
}
