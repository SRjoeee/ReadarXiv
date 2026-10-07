// The translation as it comes in (#292): a paper's source → translated PDFs, each one more complete than the last,
// then the final one. Runs in Node and in the browser alike; the compiler and the translator are passed in.
//
// Order of work, all of it measured in REPORT's sixth and seventh addenda:
//  1. the preamble alone, compiled in the paper's own engine, says which font families the document sets (FONT_PROBE);
//  2. units are translated nearest the reader first (as the page shows them, not in source order: a float's units sit
//     where the float was written), the first batch small so that it comes back soon;
//  3. whenever the compiler is free and new units have come in, the document is compiled again — one pass, images as
//     frames, the labels and citations of the pass before — untranslated units still in the source language;
//  4. the original itself with unit marks, for exact places on arXiv's PDF — when the compiler would otherwise wait,
//     or after the final compile: the translation comes first;
//  5. when every unit is in, the final compile: every pass, the images themselves.
// With the typesetting rule (typeset/plan.mjs; experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md,
// "The compile sequence"), where the reader can read a PDF's marks (`readMarks`): the font probe measures the body face
// too (1); the original, in full with its line probes (4), since every plan is made from it — from the run's start in a
// compiler of its own where the reader gives one (`compileOriginal`), beside the probe and the first preview, else right
// after the first preview; each later preview is planned on its snapshot (3); the last preview of the whole translation,
// complete, measures the final — else a draft one-pass of it does — and the final is set from that measure (5). The
// first preview is set as today, and never waits for the original: nothing is known to plan it from yet. Where a plan
// cannot be made, the translation is set as today, and the reason noted
import { analyze } from './paper-meta.mjs'
import { inkSamples, LAYOUT_TEX, layoutMarking, markProbeTex, probeSamples } from './layout/marks.mjs'
import { BALANCE_DEF, documentBounds, EVEN_SPACES, FIT_DEF, FONT_PROBE, FORBIDDEN_TO_WARNING, inMemory, inputencOf, jobName, lastTexLog, latin1, latin1Bytes, loadProject, localizeNames, MARK_DEF, markUnits, NO_OVERFLOW, patch, readFontProbe, stripPdftexOption, unitLeadTex, lineBreaks, XETEX_SHIM, XETEX_SHIM_R1 } from './latex-front.mjs'
import { authorsTranslated, strategiesFor, typesetBy } from './scripts.mjs'
import { passagesInSource } from './cache.mjs'
import { texErrors, unitsAtErrors } from './tex-errors.mjs'
import { decideGroups, groupOf } from './groups.mjs'
import { nameCells, plainSource, textsShown, translateUnits } from './mt.mjs'
import { kOfSource, trPiecesOf } from './layer/pieces.mjs'
import { WIDTH_PROBE } from './typeset/density.mjs'
import { finalTypesetting, previewTypesetting } from './typeset/plan.mjs'
import { completeLog, END_TEX, LINES_TEX } from './typeset/tex.mjs'

/** The characters a compile could not set, as its log names them: a glyph a font lacks (TeX logs it and goes on) or a
 *  letter no encoding holds (LaTeX's error; pdfTeX goes on without it). By code point where the log gives one, so that
 *  either message about a character is the same loss, each with the number of times it was lost. Counted in the TeX
 *  log of the last pass alone (lastTexLog) */
export const lostIn = log => {
  const text = lastTexLog(log)
  const out = new Map()
  for (const m of text.matchAll(/^(?:Missing character: There is no (.+?) in font |! LaTeX Error: Unicode character (.+)$)/gm)) {
    const c = m[1] ?? m[2], at = c.match(/\(U\+([0-9A-F]+)\)/)?.[1] ?? c.trim()
    out.set(at, (out.get(at) ?? 0) + 1)
  }
  return out
}
/** A compile that gave a PDF but could not set some letter of the translation: the paper's pdfLaTeX meeting a letter no
 *  encoding it has loaded holds (Vietnamese's, under T1), or one a class's primitive \uppercase broke into bytes (amsart's
 *  titles, a French apostrophe); or a font whose metrics are nowhere (a size of a METAFONT-only font the file server does
 *  not have); or a character its font lacks, which leaves a gap in the PDF where it was (Devin and Codex on #294).
 *  `known` counts the characters the paper's own full compile could not set: the original lacks them too, and a
 *  translation that loses a character no more often is no worse; one more loss of it is a gap the translation added
 *  (Devin and Codex on #294). The chain moves on from it as from a compile with no PDF */
export const unsettable = (r, known = new Map()) => /^! Font .* not loadable/m.test(r.log ?? '') || [...lostIn(r.log)].some(([c, n]) => n > (known.get(c) ?? 0))
/** Whether a compile's last TeX pass stopped short of the document's end: TeX's fatal errors — an emergency stop (a
 *  file that ended inside an argument, a line asked of no terminal, the job ended with no \\end), its capacity
 *  exceeded, a hundred errors, its own confusion. Whatever PDF it left is part of the paper: XeTeX ships the pages it set
 *  before the stop, and xdvipdfmx makes them a PDF (pdfTeX writes none). A compiler that answers with any PDF it made —
 *  the gates' native one, latexmk -f in nonstop mode — gave 2608.16117's Chinese final, three pages of forty, as set
 *  (its comment never ended: latex-front.mjs LINE_ENVS); the TeX page's BusyTeX halts on a TeX error, and gives none */
export const stoppedShort = log => /^(?:! Emergency stop\.|! TeX capacity exceeded, sorry|\(That makes 100 errors; please try again\.\)|! This can't happen|! I can't go on meeting you like this)/m.test(lastTexLog(log))
/**
 * A compile that did not finish is one that failed, as the TeX page's is: its PDF not taken. One that stopped short
 * (stoppedShort), and one whose last pass never reached the document's end — every compile carries END_TEX, and only a
 * pass that set the last page logs it (completeLog). A pass halted at a TeX error writes no such line, whatever the
 * compiler made of it: a TeX page that took a halted pass's status for a success gave 2610.02069's final as the 18 pages
 * set before the halt, its bibliography empty, every citation "(?, ?)", and the run stored it as whole (2026-10-05)
 */
const finished = r => (r.ok && (stoppedShort(r.log) || !completeLog(r.log)) ? { ...r, ok: false, pdf: null } : r)
/** images as frames of their own size (graphicx's draft), each frame's corners marked — g<n>a and g<n>b at its left and
 *  right ends on its baseline, g<n>t at its top right, n counting \includegraphics in the order TeX runs them — so that
 *  the reader lays the left's figure over its frame (session.mjs leftFor). A transformed include (\rotatebox or
 *  \resizebox around it, angle=) turns or scales its frame and not the marks, whose rectangle then has the size of no
 *  figure on the left, and the reader leaves that frame as it is */
const DRAFT = [
  '\\PassOptionsToPackage{draft}{graphicx}',
  '\\makeatletter\\AddToHook{package/graphics/after}{\\newcount\\axt@g\\let\\axt@setfile\\Gin@setfile%',
  '\\def\\Gin@setfile#1#2#3{\\leavevmode\\global\\advance\\axt@g\\@ne\\axtmark{g\\the\\axt@g a}\\axt@setfile{#1}{#2}{#3}%',
  '\\axtmark{g\\the\\axt@g b}\\rlap{\\raise\\Gin@req@height\\hbox{\\axtmark{g\\the\\axt@g t}}}}}\\makeatother',
].join('\n') + '\n'
/** where the main file's \\begin{document} stands as TeX finds it (latex-front.mjs documentBounds: none in a comment, a
 *  definition or a filecontents), -1 where it has none: what goes before the document goes there */
const beginDocument = text => documentBounds(text).begin
/** a compile the TeX page failed, not TeX: BusyTeX's 180 s given up (the machine was slow), or the page's own failure
 *  (protocol 2's `error`, no log: an engine it could not bring up, a compile before an init that failed). It says
 *  nothing of the paper or of the strategy (the S3a review, I5 b) */
const pageFailed = r => !r.ok && !!r.error
/** BusyTeX's 180 s given up: the machine slow, neither the page down nor the paper. Not asked again but for the final,
 *  and the run goes on to its final, as before the page's protocol 2 (the F2 review's M5) */
const timedOut = r => pageFailed(r) && /Compilation timeout/.test(r.error)
/** why a compile gave no PDF: the first TeX error, or what the compiler said */
const whyFailed = r => (r.ok ? undefined : ((r.log ?? '').match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? r.error ?? (r.log ?? '').slice(-300)).slice(0, 300))
/** the lines of a compile's last TeX pass that the run and the rule read: each unit's lines, the forced breaks and the
 *  document's end (typeset/tex.mjs readLines, readForced, completeLog), the letters it could not set (lostIn) */
const READ_LINE = /^(?:AXT-|Missing character: |! LaTeX Error: Unicode character )/
/**
 * The marked original as the run and the rule read it: those lines of its log, its marks with every page's columns
 * (`marks`, readMarks'), its references — the aux's \bibcite and \newlabel lines — and the bibliography its BibTeX
 * or biber made (`bbl`, null where the paper ships its own or has none), which a draft with none of its own is given
 * (runLive's `refs`). The same whether made now or kept: a run given them compiles no original (`original`;
 * session.mjs keeps them for the visit and with the paper's records, cache.mjs originalRow)
 */
export const readingsOf = (o, marks) => ({ log: lastTexLog(o.log).split('\n').filter(l => READ_LINE.test(l)).join('\n'), marks, ...referencesOf(o) })
/** an aux's lines of one command, those whose braces close on the line: a line cut short would stop TeX reading the
 *  aux it is given */
const auxLines = (aux, command) => (aux ?? '').split('\n').filter(l => l.startsWith(`\\${command}{`) && closed(l)).join('\n')
const closed = line => { let depth = 0; for (const c of line.replace(/\\./g, '')) if (c === '{') depth++; else if (c === '}' && --depth < 0) return false; return depth === 0 }
/**
 * An aux's citation lines: every closed line whose first argument is a key the aux cites — a \citation's or a
 * \bibcite's (\nocite{*} cites keys no \citation names) —, in the aux's order, so that a later line overrides an earlier
 * one as in the paper's own passes; not \citation's own, which a draft writes, nor \newlabel's, which are the labels.
 * Not \bibcite's alone: apacite writes each entry twice, \bibcite then \APACbibcite, and with babel loaded after it
 * babel's \bibcite keeps the entry wrapped, which only the second line makes whole again — given the first alone, every
 * citation broke TeX (2610.02069: "Illegal parameter number in definition of \B@my@dummy"). harvard's \harvardcite,
 * backref's \backcite and any other package's line of the kind go with them; biblatex's name a refsection first, and
 * its drafts read the bibliography
 */
export const citationLines = aux => {
  const all = (aux ?? '').split('\n').filter(closed), keys = new Set()
  for (const l of all) { const m = /^\\(?:citation|bibcite)\{([^}]*)\}/.exec(l); if (m) for (const k of m[1].split(',')) keys.add(k.trim()) }
  return all.filter(l => { const m = /^\\([A-Za-z@]+)\{([^{}]*)\}/.exec(l); return !!m && m[1] !== 'citation' && m[1] !== 'newlabel' && keys.has(m[2].trim()) }).join('\n')
}
/**
 * What names a translation's floats (the table-groups brief, Problem 2): at the document's end, each float's label as
 * the class defines it (\fnum@figure, \fnum@table, one level of it) and the meaning of its name (\figurename,
 * \tablename), written to the log for captionsOf. Whether the final labels a figure with the name babel gives the
 * target (scripts.mjs, \babelprovide{axttarget}; caption-names.mjs holds those names) is the paper's as much as the
 * target's: a class that writes its own word into the label (naaclhlt2019.sty's \fnum@figure, "Figure \thefigure"),
 * a paper that selects another language in its body (2307.16209's \selectlanguage{english}), polyglossia (babel not
 * loaded), and CJKutf8 (no babel) keep the paper's names. Read, never expanded: nothing in it can fail a compile
 */
export const CAPTIONS_PROBE = String.raw`\makeatletter\AtEndDocument{\typeout{AXT-CAPTIONS figure=\ifdefined\fnum@figure\detokenize\expandafter{\fnum@figure}\fi|\ifdefined\figurename\meaning\figurename\fi|table=\ifdefined\fnum@table\detokenize\expandafter{\fnum@table}\fi|\ifdefined\tablename\meaning\tablename\fi|}}\makeatother` + '\n'
/**
 * Whether a compile labelled its figures and its tables with the target's names (CAPTIONS_PROBE's line): `target` where
 * the name is babel's for the target (its meaning babel's for axttarget) and the label is made of the name — it names
 * \figurename, or writes no word of its own (a wrapper around the class's own definition) —, `source` otherwise; null
 * where the log has no such line (a compile before the probe, or one that did not reach the document's end)
 */
export function captionsOf(log) {
  const m = /^AXT-CAPTIONS figure=(.*?)\|(.*?)\|table=(.*?)\|(.*?)\|/m.exec(unwrapped(lastTexLog(log ?? '')))
  if (!m) return null
  const named = (fnum, meaning, name) => /axttarget/.test(meaning) && (fnum.includes(`\\${name}`) || !/(?<![\\A-Za-z@])[A-Za-z]{3,}/.test(fnum))
  return { figure: named(m[1], m[2], 'figurename') ? 'target' : 'source', table: named(m[3], m[4], 'tablename') ? 'target' : 'source' }
}
/** a compile's references as a draft is given them: its citation lines, its labels (\newlabel), its bibliography */
const referencesOf = o => ({ cites: citationLines(o.aux), labels: auxLines(o.aux, 'newlabel'), bbl: o.bbl ?? null })
/** the lists a pass writes at its end from an aux's \@writefile{<ext>}{<entry>} lines (LaTeX's \enddocument), by
 *  extension: \tableofcontents's toc, \listoffigures' lof, \listoftables' lot, any list a package keeps so (backref's
 *  brf) — each line's entry, in order */
const listsOf = aux => {
  const out = new Map()
  for (const [, ext, entry] of auxLines(aux, '@writefile').matchAll(/^\\@writefile\{(\w+)\}\{(.*)\}$/gm)) out.set(ext, `${out.get(ext) ?? ''}${entry}\n`)
  return out
}
/** TeX writes its log in lines of 79 characters at most, a warning about a long key over two: joined again (a line of
 *  79 of its own is joined to the next too, so what is looked for in it is not anchored to a line's start) */
const unwrapped = log => log.replace(/^(.{79})\n/gm, '$1')
/** why a compile that gave a PDF is not shown (unsettable): the font that would not load, or the letters it lost */
const whyUnset = r => (lastTexLog(r.log).match(/^! Font .* not loadable.*$/m)?.[0] ?? `a letter it could not set (${[...lostIn(r.log).keys()].slice(0, 5).join(', ')})`).slice(0, 300)

/**
 * The compiler a visit uses, opened when first needed (`open` → { compile, close }) and again after a failure to open.
 * **A compile the page failed throws it away**: BusyTeX gives up on waiting, not on the job, whose worker goes on
 * and whose output would answer the next compile — a draft taken for the final, the translation's PDF for the marked
 * original (Part 4's final review); and a page whose init failed answers every compile with "compile before init".
 * Closing the TeX page's frame ends its worker; the next compile gets a fresh one
 */
export function compilerKeeper(open) {
  let current = null
  const get = () => (current ??= open().catch(e => { current = null; throw e }))
  return {
    ready: () => get().then(() => undefined),
    /** the compiler closed, its frame and worker gone; a compile after it opens a fresh one */
    close() { const was = current; current = null; void was?.then(c => c.close(), () => {}) },
    async compile(req) {
      const mine = get()
      const r = await (await mine).compile(req)
      if (pageFailed(r) && current === mine) { current = null; (await mine).close() }
      return r
    },
  }
}

/** a paper's files (Map path → bytes) → what the pipeline works on */
export function openPaper(files) {
  const fsys = inMemory(files)
  const meta = analyze(fsys)
  if (!meta.main) throw new Error('no main file')
  const project = loadProject(fsys, meta.main, { tables: true })
  return { fsys, meta, project, units: project.units, kept: nameCells(project.units) }
}

/** the preamble alone, closed at once: its log names the document's font families; with `width`, also how wide the
 *  body face sets and at what sizes (typeset/density.mjs WIDTH_PROBE), which the typesetting rule measures text by;
 *  with `marks`, the layout marks' TeX (MARK_DEF, LAYOUT_TEX) first and, after the width probe, the mark probe
 *  (layout/marks.mjs markProbeTex: what the paper's own citation and footnote commands do with a mark and with what
 *  follows them), whose answers (readMarkProbe, over `probeSamples(paper.units)`) are the paper's own switch, and what
 *  each of its macros sets (readInkProbe, over `inkSamples(paper.units)`). Without it, the bytes as before */
export function probeFiles({ fsys, project }, { width = false, marks = false } = {}) {
  const text = latin1(fsys.read(project.main))
  const at = beginDocument(text)
  const head = marks ? MARK_DEF + LAYOUT_TEX : '', probe = marks ? markProbeTex(probeSamples(project.units), inkSamples(project.units)) : ''
  return new Map([[project.main, latin1Bytes(`${head}${END_TEX}${text.slice(0, at)}${FONT_PROBE}\\begin{document}${width ? WIDTH_PROBE : ''}${probe}\\end{document}\n`)]])
}

/** the original with unit marks, as its own engine sets it (images as frames change no place on the page); with
 *  `lines`, each unit's lines and the forced breaks in its log (typeset/tex.mjs LINES_TEX), which the typesetting rule
 *  takes the original's flow from. `spans`, an object, gets `lines()` as translationFiles' does: each unit's lines in
 *  the files as written, worked out when asked — where the paper's own errors stand (runLive's ownErrors). With
 *  `layout`, a list of classes (layout/marks.mjs), the layout marks too: the units marked by layoutMarking, each
 *  placeholder of those classes and each cell and heading, and LAYOUT_TEX after MARK_DEF; `spans` names the paper's own
 *  units; `switches`, the paper's own switch (layout/marks.mjs readMarkProbe: TeX's answers to the mark probe), the
 *  marks taken off where TeX said they change what follows, and where it gave no answer; without `switches`, the marks
 *  as before; `inkless`, the paper's macros TeX said set no ink (readInkProbe), given no mark. Without `layout`, the
 *  bytes as before */
export function originalFiles({ fsys, project }, { lines = false, spans = null, layout = null, switches = null, inkless = null } = {}) {
  const base = markUnits(project.units), index = new Map(project.units.map((u, i) => [u, i]))
  const raw = spans ? [] : null
  let out
  if (layout) {
    const marked = layoutMarking(project.units, layout, { lines, switches, inkless }), paperOf = new Map(marked.units.map((c, i) => [c, project.units[i]]))
    out = patch({ ...project, units: marked.units }, new Map(), { mark: marked.mark, spans: raw })
    for (const x of raw ?? []) { x.unit = paperOf.get(x.unit) ?? x.unit; if (x.outer) x.outer = paperOf.get(x.outer) ?? x.outer }
  } else out = patch(project, new Map(), { mark: lines ? u => { const m = base(u); return m && { ...m, before: `\\axtlines{${index.get(u)}}` } } : base, spans: raw })
  const patched = spans ? new Map(out) : null
  const head = DRAFT + MARK_DEF + (layout ? LAYOUT_TEX : '') + END_TEX + (lines ? LINES_TEX : '')
  out.set(project.main, latin1Bytes(head + latin1(out.get(project.main))))
  if (spans) { let found = null; spans.lines = () => (found ??= unitLines(raw, patched, out, project.main, head.length)) }
  return out
}

/** the translation so far, with unit marks, set by one of strategiesFor (scripts.mjs); a strategy's `leading` sets the
 *  translated units' own paragraphs, and those alone, at that factor of the paper's spacing (latex-front unitLeadTex).
 *  `typeset`, the typesetting rule's (typeset/plan.mjs previewTypesetting, finalTypesetting): the strategy it sets the
 *  type of, its TeX, each translated unit's macros — for the strategy it was made for: with another the translation is
 *  set as today, and `note('typeset refused', …)` says so. `evenSpaces` false leaves out EVEN_SPACES' microtype, which
 *  the run adds under an 8-bit engine and may break a paper's own TeX (runLive's remedies). `spans`, an object, gets
 *  `lines()`: each unit's lines and bytes in the files as written ({ file, unit, first, last, from, to }), worked out
 *  when asked — after a compile failed, which tex-errors.mjs locates by them —, so that a compile that sets pays nothing */
export function translationFiles({ fsys, project, meta }, translated, { strategy, fonts, draft, aux, bbl, typeset = null, evenSpaces = true, spans = null, note = () => {} }) {
  if (typeset && typeset.for !== strategy.name) { note('typeset refused', { plan: typeset.for, strategy: strategy.name }); typeset = null }
  if (typeset) strategy = typeset.strategy(strategy)
  const xe = strategy.xe
  translated = new Map([...typesetBy(translated, strategy)].map(([u, pieces]) => [u, lineBreaks(u, pieces)]))
  const base = markUnits(project.units, translated)
  const index = new Map(project.units.map((u, i) => [u, i]))
  const mark = typeset ? typeset.mark(base, translated) : strategy.leading ? u => { const m = base(u); return m && !m.whole && translated.has(u) ? { ...m, before: `\\axtlead{${index.get(u)}}` } : m } : base
  const raw = spans ? [] : null
  const out = patch(project, translated, { mark, spans: raw })
  // the files as patch wrote them, each unit's bytes in them, before this function's own edits
  const patched = spans ? new Map(out) : null
  let main = latin1(out.get(project.main))
  const at = beginDocument(main)
  main = localizeNames(main.slice(0, at)) + FORBIDDEN_TO_WARNING + strategy.pre(fonts) + NO_OVERFLOW + (xe || !evenSpaces ? '' : EVEN_SPACES) + main.slice(at)
  // the translation is UTF-8, and a Latin-1 source was transcoded to UTF-8 on the way out: say so
  // (the \\usepackage TeX acts on, inputencOf: a commented one said utf8 and the source stayed Latin-1)
  const inputenc = project.inputenc && inputencOf(main)
  if (inputenc) main = main.slice(0, inputenc.start) + main.slice(inputenc.start, inputenc.end).replace(/\[([^\]]*)\]/, (m, opts) => `[${opts.split(',').map(o => (o.trim() === project.inputenc ? 'utf8' : o)).join(',')}]`) + main.slice(inputenc.end)
  const shim = xe && strategy.engine !== meta.compiler ? XETEX_SHIM + XETEX_SHIM_R1 : ''
  // what the strategy puts before \documentclass (scripts.mjs: a paper's own CJK packages kept from loading under xeCJK)
  const head = (strategy.front ?? '') + (draft ? DRAFT : '') + MARK_DEF + END_TEX + CAPTIONS_PROBE + FIT_DEF + BALANCE_DEF + (strategy.leading ? unitLeadTex(`${strategy.leading}\\baselineskip`) : '') + (typeset?.head ?? '') + shim
  main = head + (shim ? stripPdftexOption(main) : main)
  out.set(project.main, latin1Bytes(main))
  if (xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(out.get(f) ?? fsys.read(f)), u = stripPdftexOption(t); if (u !== t) out.set(f, latin1Bytes(u)) }
  for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(out.get(f) ?? fsys.read(f)), u = localizeNames(t); if (u !== t) out.set(f, latin1Bytes(u)) }
  // where TeX reads them, in the root under the job's name (2608.12333's latex/arxiv.tex: arxiv.aux, not
  // latex/arxiv.aux, where no preview had the run's references or bibliography)
  const job = jobName(project.main)
  if (aux) out.set(`${job}.aux`, new TextEncoder().encode(aux))
  if (bbl && !meta.bbl) out.set(`${job}.bbl`, new TextEncoder().encode(bbl))
  // a draft's one pass sets its contents lists from the files a pass writes them to at its end, from its aux's
  // \@writefile lines: written from the aux it is given, else every list was set empty and every unit after it measured
  // early by its height (the F2 re-review's N2: zh 2608.02459, its contents before 550 of its 555 units, 0.939 of a
  // page's start drift, 0.098 with them). The final's passes write their own, as the original's do
  if (draft && aux) for (const [ext, entries] of listsOf(aux)) if (!out.has(`${job}.${ext}`)) out.set(`${job}.${ext}`, new TextEncoder().encode(entries))
  if (spans) { let lines = null; spans.lines = () => (lines ??= unitLines(raw, patched, out, project.main, head.length)) }
  return out
}

/**
 * Each unit's range as patch wrote it, found again in the file as written — this function's edits (the preamble's
 * additions, the engine's shims, localizeNames) come after patch, and leave the units' bytes as they are —, in order
 * from the last one's end, as the lines it stands on (1-based) and its bytes: { file, unit, first, last, from, to }; a
 * nested unit where it stands in the unit it is written in (`outer`, found before it). The main file is searched past
 * the TeX put before the paper (`skip` bytes); a unit not found again is left out
 */
function unitLines(raw, patched, out, main, skip) {
  const byFile = new Map()
  for (const x of raw) (byFile.get(x.file) ?? byFile.set(x.file, []).get(x.file)).push(x)
  const found = []
  for (const [file, list] of byFile) {
    const was = latin1(patched.get(file)), now = latin1(out.get(file) ?? patched.get(file))
    let cursor = file === main ? skip : 0, line = 1, counted = 0
    const lineAt = k => { for (; counted < k; counted++) if (now.charCodeAt(counted) === 10) line++; return line }
    const breaks = (from, to) => { let n = 0; for (let i = from; i < to; i++) if (now.charCodeAt(i) === 10) n++; return n }
    const outers = new Map()
    for (const x of list) {
      if (x.outer) {
        const o = outers.get(x.outer)
        if (!o) continue
        const from = o.from + (x.from - o.was), to = from + (x.to - x.from), first = o.first + breaks(o.from, from)
        found.push({ file, unit: x.unit, first, last: first + breaks(from, to - 1), from, to, post: x.post ?? 0 })
        continue
      }
      const bytes = was.slice(x.from, x.to), k = now.indexOf(bytes, cursor)
      if (k < 0 || !bytes) continue
      cursor = k + bytes.length
      const at = { file, unit: x.unit, first: lineAt(k), last: lineAt(cursor - 1), from: k, to: cursor }
      outers.set(x.unit, { from: k, was: x.from, first: at.first })
      found.push(at)
    }
  }
  return found
}

/** the units a translation into `lang` leaves as they are: the names a table holds (nameCells), and the author block's
 *  names and places where the target writes them as the paper does (scripts.mjs authorsTranslated) */
export const keptFor = (paper, lang) => (authorsTranslated(lang) ? paper.kept : new Set([...paper.kept, ...paper.units.filter(u => u.kind === 'author')]))

/**
 * The reader's versions (REPORT, eighteenth addendum), apart since 2026-10-02 so that a change to the typesetting never
 * asks the service again (the evaluation's ruling 4):
 * - PIPELINE_VERSION, the translation's: raised with any change to what a unit is or what is sent for it and made of
 *   the answer — the units' cutting, kinds and texts (latex-front), the wire and its reading back (mt), paperContext(),
 *   the left side's marks. A record of another version is translated again, its translations shown meanwhile (session.mjs
 *   seedFrom), but for the units a version that carries over into this one leaves as they were (PIPELINE_CARRIES); one
 *   of this version gives its whole units by the identity that would answer now as they are (cache.mjs reusable).
 * - TYPESETTING_VERSION: raised with any change to how a compile sets a translation it is given — latex-front's TeX,
 *   the scripts' strategies, the fonts, the typesetting rule (typeset/), the TeX tree. A record of another version is
 *   compiled again from its translation; a paper none of the ways could set is tried again.
 */
// 2: the front matter's notes are units (latex-front.mjs FRONT_MATTER)
// 3, 4: two branches each raised it twice, and their 3s and 4s are other pipelines —
//   the highlight's (exp/pdf-highlight): 3, a translation's invisible characters dropped before TeX (mt.mjs texEscape) —
//   a mark "cannot typeset" they caused goes; 4, a file \input under another spelling (./sections/a.tex) gets its
//   translation (latex-front.mjs loadProject) — the copies that set it in English go;
//   the typesetting rule's (exp/flow-integration): 3, CJK leading inside translated units alone, their displays at the
//   paper's, and English hyphenation under a CJK target (scripts.mjs, latex-front.mjs unitLeadTex); the paper's own
//   macros, argument-less declarations and the author block's names and places cut into units (latex-front.mjs); the
//   wire spaced after a period (mt.mjs); 4, IEEEtran's blocks of names and of places each a unit; a translated line of
//   names in a box that does not wrap set as a paragraph of the line's width (\\axtwide); a table narrower than its
//   original kept at the original's width, and a tabular* measured at its columns' width before it is fitted
//   (latex-front.mjs FIT_DEF, AUTHOR_WIDE); an e-mail address, and a list of names in braces before its domain, a
//   placeholder (keepAddresses); a name kept whole in a line of names (lineBreaks)
// 5, on each branch again: the highlight's, a file named through import.sty (\import, \subimport) or subfiles is walked,
//    found as TeX finds it (latex-front.mjs loadProject), and a package's names are TeX's (tar.mjs untar) — such a
//    paper's units are new; the merge's, the two branches' 3s and 4s together, and the wire's spaces beside a digit
//    taken back (mt.mjs rehydrate)
// 6: the two 5s together
// 7: a tabularray table whose cells are math is math, no unit (latex-front.mjs TBLR_MATH) — 2608.29181's two tables
//    were units, their formulas sent to the service
// 8: a citation is one placeholder with every argument it takes, apacite's prenote in angle brackets and biblatex's
//    multicite notes among them (latex-front.mjs citationArgs) — 2610.02069's unit 99 sent its citation's notes and
//    key as prose, and the translated key stopped TeX —; a marker's `#` doubled or displaced in a reply read back with
//    the marker (mt.mjs rehydrate) — "El Ni ñ#", "Figure 10#" in its Chinese, a copy's pieces holding the `#` as
//    text —; and an accent inside a word its letter in the word's text, the accent as written wherever the source is
//    set (latex-front.mjs accentLetter) — El Ni{\~n}o went out as `El Ni @d#@e#@f# o`; 267 units in 40 of the
//    corpus's 124 papers hold such a word. A copy of 7 carries its other units over (PIPELINE_CARRIES)
// 9: a table's cells are decided by their group after translation, translated whole or kept whole (groups.mjs, the
//    table-groups brief of 2026-10-07): a column of names kept in the source whole, its cells `kept` in the record with
//    their translation, every cell with its group — the units' kept and translated states change. A copy of 8 carries
//    every unit over: the cuts, the wire and its reading back are 8's, and its groups are decided again from its
//    translations
// 10: every piece of typeset body text a unit, as TeX reads the source (the front end's round of 2026-10-06/07): the
//     document's bounds as TeX finds them (latex-front.mjs documentBounds — ResNet's appendix C, 2608.11084's and
//     2608.23517's bodies — and an \end{document} TeX surely reaches), the title TeX keeps, the preamble's front matter
//     (frontMatter), arguments read by the role table (arg-roles.mjs: the group no command takes walked, a command's text
//     and a box's content walked, what LaTeXML reads in code not known, a token register's group its value), theorems'
//     titles, a macro's prose body (storedBodies), \twocolumn[…]'s content and \footnotetext's text, a web address a
//     placeholder, a running head kept as it is, a blank line after a comment a paragraph's end. Of the 25,139 units of
//     the corpus's 117 papers 22,446 keep their hash, 1,222 are new or cut anew, and 1,471 are the same but for their
//     pairs' numbers, whose copy's translation seedFrom finds again (cache.mjs). Nothing is sent or read back otherwise:
//     a copy of 8 or 9 carries over every unit it holds the source of (PIPELINE_CARRIES), but one whose translation
//     holds a `#`: a `#` the reply set outside its markers is a marker's, the source's text holding none, and is no
//     longer set as text, a pair of brackets that held only it with it (mt.mjs rehydrate: Microsoft's `@f#(#)`, which
//     drew "[10](#)" in 1706.03762's Japanese)
export const PIPELINE_VERSION = '10'
/**
 * The earlier pipelines whose copies carry their translations over into this one, unit by unit (cache.mjs copyReuse),
 * each with the test a unit's translation, its pieces, must pass: DESIGN §5.5's rule for the HTML page's cache, here per
 * unit — a version voids only what its change can reach. A unit whose source pieces are what they were (its hash) is
 * sent the same wire and cuts as before; one a pipeline cuts otherwise has a new hash and no seed, and is sent as the new
 * text it is. What is left to judge is what the pipeline makes of the answer, from the pieces a copy keeps (it keeps no
 * reply). A pipeline that changes the wire for the same pieces, or what an answer is read as in a way its pieces do not
 * show, carries nothing over: it has no entry.
 * - 7: its reading back set a marker's `#` doubled or displaced as text, which this pipeline's takes with the marker
 *   (mt.mjs rehydrate); TeX's `#` is never the text's own (`\#` and a bare `#` are placeholders), so a translation whose
 *   text holds no `\#` was read back as this pipeline reads it, its sentences too. Units of 7 that fix 2 or 4 cut anew
 *   (a citation's notes, an accent in a word) have new hashes
 * - 8: what 9 and 10 change comes after the answer (a table's groups, decided again from the copy's translations) or
 *   changes what a unit is, not what is sent for one, and a translation of 8 is one 10 would make of the same pieces but
 *   where its reply set a marker's `#` as text, which 10 reads as the marker's (dropped): a translation whose text holds
 *   a `\#` is not carried, as 7's
 * - 9: likewise
 */
const NO_MARKER_HASH = pieces => !pieces.some(p => p.t === 'text' && p.tr && p.s.includes('\\#'))
export const PIPELINE_CARRIES = { 7: NO_MARKER_HASH, 8: NO_MARKER_HASH, 9: NO_MARKER_HASH }
// 1: the typesetting rule wired (typeset/plan.mjs, F2 of 2026-10-02); the versions apart; under xeCJK a paper's own CJK
//    packages kept from loading and xeCJK's microtype slot set right (scripts.mjs)
// 2: the original's readings carry its labels and its bibliography, which a draft with none of its own is given — a
//    re-set's measure (every unit taken, no preview) had neither, and set 2608.08872 two pages long where its first
//    visit set one —, and a compile that read no bibliography is no measure under biblatex either (runLive's `refs`,
//    `referencesWhole`); readings kept under 1 have neither
// 3: a draft sets its contents lists from the aux it is given (translationFiles), and a measure that set one from
//    nothing is measured again with its own (runLive's `listsMissing`) — every draft had set them empty and measured
//    every unit after them early by their height (zh 2608.02459: 0.939 of a page's start drift, 0.098 now)
// 4: a measure that could not set a letter moves the chain before the final, which is set from a plan measured under its
//    own strategy (runLive's finalTypeset) — under 3 such a final was set from the next strategy's plan uncorrected and
//    stored as current (zh 2608.02459's re-set, xeCJK without σ); set again from their translation, nothing sent
// 5: nothing of ours after the \\begin or \\end of an environment TeX reads by lines (latex-front.mjs LINE_ENVS), and no
//    such environment in a fitted table — a copy of 4 could be a PDF of the pages before a comment that never ended
//    (2608.16117: three of forty) —; and a compile that stopped short of the document's end is no translation
//    (stoppedShort), where a compiler gives the PDF of what it set
// 6: a compile that fails is tried again before the chain moves on — without the rule's TeX, EVEN_SPACES' microtype or
//    the references the run gives it, then with the units its log places the failure in set in the source (runLive's
//    remedy, tex-errors.mjs) —, and a draft is given every citation line of the original's aux (citationLines): a
//    reading of the original kept under 5 has its \bibcite lines alone, which broke every citation of 2610.02069 under
//    apacite and babel on a revisit, and that paper's record, which none of the ways could set, is tried again. With
//    them the tables fitted since 5 (2a346741: what stands in a TeX comment; 9cc9cd2d: a starred environment read by
//    lines), whose \axtfit decisions changed under it
export const TYPESETTING_VERSION = '6'

/**
 * Runs the whole of it. `compile({ main, engine, rerun, bibtex, overrides })` → { ok, pdf, aux, bbl, log, ms };
 * `translate(texts, cuts)` → translations of wire texts in `format` (mt.mjs WIRE: the chain's renderPath; `cuts` each text's
 * sentence cuts on the tags path, mt.mjs translateUnits); `rank(i)` → how
 * far unit i is from the reader's place (lower comes first);
 * `onUpdate({ pdf,
 * texts, translated, final })` gets each compiled translation; `onOriginal({ pdf, log })` the marked original, with its
 * last TeX pass's log (lastTexLog); `onBatch({ seeded, units })` each batch's translated units, once their results are set
 * and before the next batch is asked — and once, before the first batch, the seeds taken as they are (`seeded`) —, as
 * the layer takes them (layer/pieces.mjs: each piece by its source index), which changes nothing the run does;
 * `note(event, data)` every step, for the timeline. `previews` false compiles no preview: the original first, where
 * the run compiles it, the measure and the final after the whole translation, the final the one update; a function of
 * the original (`{ pdf, log }`, null where the run compiles none or it did not set) says which, once, as soon as it is in
 * and before any compile of the translation; true, the default, is the run as before the flag. A translation made again
 * from a cached copy (REPORT, eighteenth addendum): `seed`, index → the old translation { pieces, by, tried, state,
 * current }, fills the run at the start, and one `current` (cache.mjs reusable) is not sent again; `marks`, the left
 * side's marks when known, skips the marked original (but where the typesetting rule needs its readings); `original`,
 * the original's readings (readingsOf) as a run before gave them, taken with `marks` known: no original is compiled,
 * and every preview is planned from the first;
 * `identity` is what each unit is tried under; `pipelineCurrent`, whether the copy's compile is this reader's (its
 * pipeline and its typesetting): a seeded run that changes nothing then compiles nothing. Resolves when the final compile is in, with `results` (index → { pieces,
 * state, by, tried, sentences? }), `changed` (anything typeset changed), `settled` (a final that set every letter), `exhausted`
 * (every strategy failed to set the final, none for want of time: the paper cannot be had this way) and, with it,
 * `originalOk` (the paper's own source set here, or before: only then is it the translation that cannot be set, rather
 * than the compiler or its files that were down). `readMarks(pdf)` → a PDF's marks and page columns (typeset/places.mjs
 * marksOf on a PDF.js document of the bytes, which it must not take: the reader shows them too): with it the
 * translation is set by the typesetting rule, without as today.
 */
export async function runLive(paper, { lang, compile, compileOriginal = null, translate, format = 'markers', rank = i => i, onUpdate, onOriginal, onBatch = null, note = () => {}, seed = null, marks = null, original: knownReadings = null, identity = null, pipelineCurrent = false, readMarks = null, previews: previewsOption = true }) {
  const { units, meta, project } = paper
  const kept = keptFor(paper, lang)
  // the chain: a compile that gives no PDF moves on to the next strategy, which is tried at once
  const strategies = strategiesFor(meta, lang)
  let s = 0
  const strategy = () => strategies[s]
  const translated = new Map()
  // index → { pieces, state, by, tried, sentences? }: what the run made of each unit, for the record (cache.mjs unitsOf)
  const results = new Map()
  // each translation's sentences (mt.mjs sentencesOf), by its pieces: a compile's texts carry those of the pieces it
  // typeset, not of a translation come in while it compiled
  const sentencesBy = new WeakMap()
  const keep = (pieces, sentences) => { if (sentences) sentencesBy.set(pieces, sentences) }
  // a seed's translation as the run keeps it: with its sentences, and its mark that the copy's final set it in the source
  // (cache.mjs inSourceOf), which goes with it until a final sets the unit again (Devin and Codex on #309)
  const seeded = old => (old ? { pieces: old.pieces, by: old.by, ...(old.sentences ? { sentences: old.sentences } : {}), ...(old.inSource ? { inSource: true } : {}) } : {})
  if (seed) for (const [i, s] of seed) { translated.set(units[i], s.pieces); keep(s.pieces, s.sentences) }
  // a seed taken as it is (cache.mjs reusable: whole, by this identity, of the wire sent now) is not sent again: a change
  // to the typesetting alone asks the service for nothing (the evaluation's ruling 4)
  const taken = new Set([...(seed ?? [])].filter(([, s]) => s.current).map(([i]) => i))
  for (const i of taken) results.set(i, { ...seeded(seed.get(i)), state: 'whole', tried: identity })
  let changed = false
  // why the run stopped short: the service's failure (engine.mjs's kinds), after which nothing more is sent (§10.3)
  let stopped = null
  // every unit to translate has a translation, seeded or new: a seeded run shows no preview before, or a paragraph the
  // copy had translated would be shown in the source (REPORT, eighteenth addendum)
  const complete = () => units.every(u => kept.has(u) || translated.has(u))
  let dirty = false, mtDone = false, wake = null
  const signal = () => { const w = wake; wake = null; w?.() }
  const sleep = () => new Promise(r => { wake = r })

  // a compile whose files did not all arrive (protocol 2's `network`: the TeX page asked each twice), or that the page
  // itself failed (an `error` and no log: an engine it could not bring up), is not the paper's: asked once more as it
  // was — in a fresh frame after the page's failure (compilerKeeper) — and the second time the run stops, as for a
  // network that is down or with no compiler: no strategy changed, no aux or bbl taken from it, nothing remembered of it
  // (the S3a report, "what the reader must do", and its fix round's duties a–d). One BusyTeX gave up on (timedOut) is
  // given back as it is, its frame gone all the same: what each compile does with it is its own
  // (one that stopped short of the document's end failed: finished)
  const askOf = fn => async req => {
    let r = finished(await fn(req))
    if (timedOut(r) || (!r.network?.length && !pageFailed(r))) return r
    note('compile again', { network: r.network?.slice(0, 5), error: r.error?.slice(0, 200) })
    r = finished(await fn(req))
    if (!r.network?.length && !pageFailed(r)) return r
    throw Object.assign(new Error(r.network?.length ? `the TeX page could not fetch ${r.network.slice(0, 3).join(', ')}` : `the TeX page failed: ${String(r.error).slice(0, 200)}`), { compilerDown: r.network?.length ? 'network' : 'page' })
  }
  const ask = askOf(compile)
  // 1. the document's fonts, while the first batch is out; with the rule, how wide its body face sets and at what sizes
  const fontsP = ask({ main: project.main, engine: meta.compiler, rerun: false, bibtex: false, overrides: probeFiles(paper, { width: !!readMarks }) }).then(r => { const fonts = readFontProbe(r.log ?? ''); note('fonts', { fonts, ms: r.ms }); return { fonts, log: r.log ?? '' } })

  // 2. translation nearest the reader first, asked afresh for every batch: the reader may have moved
  const todo = new Set(units.map((u, i) => i).filter(i => !kept.has(units[i]) && !taken.has(i)))
  if (taken.size) note('translated', { units: 0, taken: taken.size, total: translated.size })
  /** units nearest the reader first, as `rank` has them now */
  const nearest = ids => ids.map(i => [i, rank(i)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([i]) => i)
  /**
   * A unit as the run's results have it, for the layer (onBatch): its pieces as the layer takes them (layer/pieces.mjs
   * trPiecesOf, each non-text piece by its source index — a run's pieces are the unit's own objects, a seed's are found
   * by their equals), none where it has none (none, lost; also where a piece has no source, which no run makes), its
   * sentences, state and engine. Copies: the report reads the run, never changes it
   */
  const reported = i => {
    const r = results.get(i), s = r?.sentences, group = groupOf(units[i])
    return { id: i, pieces: (r?.pieces && trPiecesOf(r.pieces, kOfSource(units[i].pieces))) || [], sentences: Array.isArray(s?.src) && Array.isArray(s?.tr) ? { src: [...s.src], tr: [...s.tr] } : null, state: r?.state ?? 'none', by: r?.by ?? null, ...(group ? { group } : {}) }
  }
  /** the table cells held in the source as the translation stands (groups.mjs decideGroups, as a compile decides them):
   *  those of a group kept whole and of one waiting on a cell, by index — the layer draws none of them */
  const indexOfUnit = new Map(units.map((u, i) => [u, i]))
  const held = () => { const d = decideGroups(units, u => { const r = results.get(indexOfUnit.get(u)); return r && { state: r.state, pieces: translated.get(u) } }, kept); return [...d.keep, ...d.wait].map(u => indexOfUnit.get(u)).sort((a, b) => a - b) }
  const nextBatch = maxChars => {
    const order = nearest([...todo])
    const batch = []
    let chars = 0
    for (const i of order) { const n = plainSource(units[i]).length; if (batch.length && chars + n > maxChars) break; batch.push(i); chars += n }
    return batch
  }
  const mt = (async () => {
    try {
    // the seeds taken as they are, once, before the first batch is asked
    if (onBatch && taken.size) onBatch({ seeded: true, units: nearest([...taken]).map(reported), held: held() })
    for (let first = true; todo.size && !stopped; first = false) {
      const batch = nextBatch(first ? 2500 : 12000)
      batch.forEach(i => todo.delete(i))
      const t0 = Date.now()
      let got, how
      try { ({ results: got, how } = await translateUnits(batch.map(i => units[i]), translate, format)) } catch (e) {
        // a refusal for good (engine.mjs: a key missing or refused) stops the run, as a failure of the service does
        if (!e?.kind) throw e
        stopped = e.kind
        for (const i of batch) todo.add(i)
        break
      }
      // whether this batch changed what is typeset: a batch that gives back its seeds asks for no preview (Devin on #298)
      let fresh = false
      for (const i of batch) {
        const r = got.get(units[i]), old = seed?.get(i)
        if (!r) continue
        // a new result replaces a seed only when whole; with no seed, anything is better than the source
        if (r.state === 'whole' || (!old && r.pieces)) {
          const same = !!old && JSON.stringify(old.pieces) === JSON.stringify(r.pieces)
          if (!same) changed = fresh = true
          translated.set(units[i], r.pieces)
          keep(r.pieces, r.sentences)
          // the seed's pieces again are typeset as they were: its mark that a final set them in the source stays
          results.set(i, { pieces: r.pieces, state: r.state, by: r.by, tried: identity, ...(r.sentences ? { sentences: r.sentences } : {}), ...(same && old.inSource ? { inSource: true } : {}) })
        } else results.set(i, { ...seeded(old), state: r.state, tried: identity })
      }
      // the batch's units, in its order, before the next batch is asked
      if (onBatch) onBatch({ seeded: false, units: batch.filter(i => results.has(i)).map(reported), held: held() })
      note('translated', { units: batch.length, how, ms: Date.now() - t0, total: translated.size })
      // a failure of the service, not of these texts (engine.mjs EngineError's lost): the batches after it would fail
      // the same way, each after the background's retries (the reader's design, §10.3)
      if (how.error) stopped = how.error
      if (fresh) { dirty = true; signal() }
    }
    // stopped short: what was not sent is lost to the service, a seed's translation kept on screen
    if (stopped) {
      for (const i of todo) results.set(i, { ...seeded(seed?.get(i)), state: 'lost', tried: identity })
      note('stopped', { kind: stopped, untried: todo.size })
      todo.clear()
    }
    } finally { mtDone = true; signal() }
  })()
  // awaited after the compiles: handled from now, so that an error inside is no unhandled rejection meanwhile
  mt.catch(() => {})
  /** the units left in the source language for the service's failure: lost, with no seed's translation to show */
  const missing = () => [...results.values()].filter(r => r.state === 'lost' && !r.pieces).length

  let previews = 0
  /** the original as the rule reads it (readingsOf): its log's lines (each unit's lines, the forced breaks, the
   *  document's end), its marks with every page's columns, its citations; null until it is in, and where it could not
   *  be read. Known from a run before only with the left side's marks, which only a compile of it gives otherwise */
  const known = marks && knownReadings
  let readings = known ?? null
  // whether previews are compiled and shown (the flag, `previews`): null until a function of the original says, once
  let showing = typeof previewsOption === 'function' ? null : previewsOption !== false
  // whether the run compiles the marked original: not where it is known; without the rule, only for the left side's marks
  const compilesOriginal = !known && (!!readMarks || !marks)
  // a passing failure kept the rule from the final — a PDF's marks that could not be read —: the final is not this
  // typesetting's, and the record says so, so that the next visit sets it again (the F2 review's M3)
  let passing = false
  const compiles = async () => {
    // 3–5. compiles
    // each unit's text as that compile has it: translated if the strategy set it from the snapshot, the source's otherwise
    // — the author block under one that sets it as the paper has it (scripts.mjs typesetBy; the F2 review's M2) —; with
    // where its placeholders stood, its displays beyond its marks and the sentences of the translation typeset, for the
    // anchors
    const texts = done => textsShown(units, typesetBy(done, strategy()), pieces => sentencesBy.get(pieces))
    // the references the last draft made: its aux, and the bibliography BibTeX or biber made after it, if one ran
    let aux = null, bbl = null
    // known, the original is what it was: nothing compiled
    let originalP = known ? Promise.resolve({ ok: true, log: known.log, aux: known.cites }) : null
    /**
     * A draft's references (the F2 re-review's N1): its own where a draft before made them, else the original's — its
     * labels and citations, and its bibliography —, and the original's citations where its own have none. A translation
     * keeps every label and citation and leaves the bibliography as it is: the original's are the ones its own passes
     * write, and its biber's bibliography sets the translation's citations as the final's own does (2608.08872, 29181,
     * 2607.24653 under xeCJK: the same entries in the same order, the same 92, 74 and 360 numbered citations; only the
     * citation counts biblatex ignores differ). Without them a draft sets every citation as "?" or its key, and none of
     * the bibliography: a first preview's aux has no citation, since its BibTeX ran after its one pass, and a re-set — a
     * typesetting change, every unit taken — compiles no preview at all, so its measure had neither, and set 2608.08872
     * two pages long where the full run set it one
     */
    let originalRefs = known ? { cites: known.cites, labels: known.labels, bbl: known.bbl } : { cites: '', labels: '', bbl: null }
    const refs = a => (a ? (!originalRefs.cites || citationLines(a) ? a : `${a}\n${originalRefs.cites}`) : [originalRefs.labels, originalRefs.cites].filter(Boolean).join('\n') || null)
    const bblAt = () => bbl ?? originalRefs.bbl
    // the marked original, compiled once: the left side's anchors, the characters the paper's own compile could not set,
    // and with the rule every plan's base — so in full, every pass: one pass sets references, citations and the pages they
    // move unsettled, and its readings are another paper's (the review of 2026-10-01, M3)
    // its files and its units' lines in them, and the compile once it is in: where the paper's own errors stand (ownErrors)
    let originalAt = null, originalIn = null
    const original = () => (originalP ??= (() => {
      const spans = {}, overrides = originalFiles(paper, { lines: !!readMarks, spans })
      originalAt = { files: overrides, lines: spans.lines }
      return askOf(compileOriginal ?? compile)({ main: project.main, engine: meta.compiler, rerun: true, bibtex: meta.bbl ? false : null, overrides })
    })().then(async o => {
      originalIn = o
      note('original', { ok: o.ok, ms: o.ms, error: whyFailed(o) })
      if (o.ok) {
        onOriginal?.({ pdf: o.pdf, log: lastTexLog(o.log) })
        originalRefs = referencesOf(o)
        if (readMarks) readings = await readMarks(o.pdf).then(m => readingsOf(o, m), e => { passing = true; note('typeset', { missing: `the original's marks (${String(e?.message ?? e).slice(0, 120)})` }); return null })
      } else if (timedOut(o)) passing = true
      return o
    }))
    /**
     * Whether a compile set the translation (unsettable). A character its font lacks counts only if the paper's own
     * compile set it, which only the original's full compile tells: the font probe has no body (probeFiles). So the
     * original is asked for ahead of its turn, and only when a translation leaves a character out at all (Devin and
     * Codex on #294)
     */
    const settled = async r => r.ok && !unsettable(r, lostIn(r.log).size ? lostIn((await original()).log) : undefined)
    // with a compiler of its own, the original from the start, beside the probe and the first preview (the F2 review's
    // I2): off the final's path when the translation comes quickly. Its failure is met where it is awaited
    if (readMarks && compileOriginal) original().catch(() => {})
    const { fonts, log: fontLog } = await fontsP
    // the preview flag (the instant layer's spec, §4.10 row 10): previews off, or not yet known, the original comes first
    // where the run compiles it — the compiler is free while the translation comes in, and nothing else is compiled
    // before it is whole —, and with the rule a draft of the whole translation measures the final (finalTypeset), as a
    // re-set's does. A function of the original says, once
    if (showing !== true) {
      const o = compilesOriginal ? await original() : null
      if (showing === null) showing = !!(await previewsOption(o?.ok ? { pdf: o.pdf, log: lastTexLog(o.log) } : null))
      note('previews', { shown: showing })
    }
    // the rule's plans, one per compile, made for the strategy the compile sets: none until the original is read, and
    // none where an input is missing or partial (plan.mjs previewTypesetting) — the translation is set as today then,
    // and the reason noted once
    let toldMissing = null
    // the strategies a compile with the rule failed under, TeX's failure: each tried again as today, the rule left out,
    // before the chain moves on — the rule's TeX is one more thing that can fail, the strategy may well set the paper
    // (the evaluation's ruling 6, 2026-10-01); and set as today from then on, unless that did not set the paper either
    // (remedy: the rule back, ruling 6 refined)
    const ruleFailed = new Set()
    const withoutRule = r => { ruleFailed.add(strategy().name); note('typeset failed', { strategy: strategy().name, error: whyFailed(r) }) }
    /**
     * What the run itself adds to the paper beyond its translation, which a compile may fail on and the strategy does not
     * need (plans/2026-10-04-compile-resilience.md, Task 1 and its rulings): EVEN_SPACES' microtype under an 8-bit engine
     * (`spacing`: only the spacing is lost), and the references a draft or the final is given — the original's or a
     * draft's aux and bibliography (`references`: a draft's citations and bibliography; the final's passes make their
     * own). 2610.02069's apacite under babel broke every citation given the original's \bibcite lines alone. Per
     * addition, the strategies it is left out of from then on
     */
    const without = { spacing: new Set(), references: new Set() }
    const off = how => without[how].has(strategy().name)
    /** what a compile of the translation is given beside it */
    const given = () => (off('references') ? { aux: null, bbl: null } : { aux: refs(aux), bbl: bblAt() })
    /** whether a compile under the strategy now has the addition, to leave out */
    const adds = { spacing: () => !strategy().xe && !off('spacing'), references: () => !off('references') && (!!refs(aux) || (!!bblAt() && !meta.bbl)) }
    /** whether a compile's first TeX error came before TeX read the aux it was given — at \begin{document}, the
     *  bibliography after it —, the log showing TeX at the main file, and not yet at the aux, where it stopped: an error
     *  the references cannot be the cause of, whose compile is not tried again without them (the review of 2026-10-04,
     *  M-4: a class's conflict in the preamble paid that compile). A log that shows neither says nothing; one where TeX
     *  looked for the aux and found none ("No file <job>.aux.", a compile given a bibliography alone) is past it (the
     *  re-review's N-3) */
    const esc = name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const opened = name => new RegExp(`\\((?:[^()\\s]*/)?${esc(name)}\\b`)
    const job = jobName(project.main), mainOpened = opened(project.main.split('/').at(-1)), auxOpened = opened(`${job}.aux`), auxMissing = new RegExp(`^No file ${esc(job)}\\.aux\\.`, 'm')
    const beforeReferences = r => { const log = unwrapped(lastTexLog(r.log)), at = log.search(/^! /m), head = log.slice(0, Math.max(0, at)); return at >= 0 && mainOpened.test(head) && !auxOpened.test(head) && !auxMissing.test(head) }
    // the units a compile under this strategy could not set translated (the safety net, Task 2): set in the source until
    // the chain moves on — another strategy may set them —, and so in the record (`inSource`). Each with every unit
    // nested in it, which its source holds as written (a footnote, an author's note)
    const inSource = new Set(), indexOf = new Map(units.map((u, i) => [u, i]))
    const withNested = u => [u, ...u.pieces.filter(p => p.t === 'nested').flatMap(p => withNested(p.unit))]
    /**
     * A snapshot's table groups decided (groups.mjs, the table-groups brief): each cell's result as the run has it and
     * its pieces as the snapshot does. `keep`, the cells of the groups kept whole in the source — a column of names, or
     * one with a cell the translator could not take —, `wait` those of the groups with a cell not yet in, or lost to the
     * service. Decided once per snapshot, so that every reading of one compile — its files, its plan, its anchors' texts
     * — sets the same
     */
    const decidedFor = new WeakMap()
    const decided = snapshot => {
      let d = decidedFor.get(snapshot)
      if (!d) { d = decideGroups(units, u => { const r = results.get(indexOf.get(u)); return r && { state: r.state, pieces: snapshot.get(u) } }, kept); decidedFor.set(snapshot, d) }
      return d
    }
    /** a snapshot as a compile sets it: the units set in the source left out, and the table groups not translated whole */
    const setting = snapshot => {
      const { keep, wait } = decided(snapshot)
      if (!inSource.size && !keep.size && !wait.size) return snapshot
      const m = new Map(snapshot)
      for (const set of [inSource, keep, wait]) for (const u of set) m.delete(u)
      return m
    }
    /** whether a compile of the snapshot shows every unit translated: the names kept and the groups kept whole are */
    const shownWhole = snapshot => { const set = setting(snapshot), { keep } = decided(snapshot); return units.every(u => kept.has(u) || keep.has(u) || set.has(u)) }
    /** the run's results with the table groups kept whole marked so (`kept`, their translation with them: the next run's
     *  seed, which decides them again), for the record (cache.mjs unitsOf) */
    const markKept = snapshot => { for (const u of decided(snapshot).keep) { const i = indexOf.get(u), r = results.get(i); if (r?.pieces) { const { inSource: _, sentences: __, ...rest } = r; results.set(i, { ...rest, state: 'kept' }) } } }
    // the last compile of the translation: the files it was given, its units' lines in them (worked out when asked) and
    // the units it set translated — what the safety net places a failure by
    let last = null
    /** the compile's files: the translation's, as the strategy and the remedies kept have them */
    const filesFor = (snapshot, { draft, typeset }) => {
      const spans = {}, set = setting(snapshot)
      const files = translationFiles(paper, set, { strategy: strategy(), fonts, draft, ...given(), evenSpaces: !off('spacing'), typeset, spans, note })
      // the units it sets translated: not the author block under a strategy that sets its names as the paper has them
      last = { files, lines: spans.lines, snapshot: typesetBy(set, strategy()) }
      return files
    }
    /**
     * The failure being recovered from (`episode`): the remedies tried, the one the next compile tries and the failure it
     * was tried for; null once a compile under the strategy sets the translation, and when the chain moves on — a remedy
     * tried is not tried again meanwhile, whichever compile comes next (a preview, the measure, the final). `spent`: the
     * compiles remedies have cost the run, a diagnosis included, at most SPENT_MAX — past it the chain moves on as before.
     * The units set in the source: at most ROUNDS rounds and IN_SOURCE_MAX units per strategy — a failure placed in more
     * units than that is the paper's or the strategy's, not a unit's (2610.02069's fault A stood in about ten of its 103
     * units, its fault B in one)
     */
    let episode = null, spent = 0, rounds = 0, placed = 0
    const SPENT_MAX = 8, ROUNDS = 3, IN_SOURCE_MAX = Math.max(3, Math.ceil(units.length * 0.02))
    /**
     * Letters a strategy's fonts lack are the strategy's, not a unit's: another strategy may set them (2608.02459's σ,
     * which xeCJK's faces lack there and CJKutf8 sets). So the chain moves on from them first, as before the safety net,
     * and only once no strategy is left that sets them are the units holding them set in the source — under the first
     * strategy that lost them, the best in the chain's order (`lettersAt`: its compile, kept for it), the run going back
     * to it once (`lettersBack`) and the chain ending there (the review of 2026-10-04, I-2). A TeX error in a unit is the
     * unit's under any strategy, which is set in the source at once
     */
    let lettersAt = null, lettersBack = false
    /** whether a strategy after this one is left to try: none once the run went back to one for its letters */
    const ahead = () => s + 1 < strategies.length && !lettersBack
    /** what a compile's failure is, to tell whether a remedy changed it: its first TeX error and the unit it stands in
     *  (or its context), else what the compile said */
    const failureOf = r => {
      const e = texErrors(r.log)[0]
      if (!e) return r.ok ? whyUnset(r) : whyFailed(r)
      const u = last ? unitsAtErrors([e], last.files, last.lines())[0] : undefined
      return `${e.message}@${u ? indexOf.get(u) : `${e.before}|${e.after}`}`
    }
    /**
     * The paper's own TeX errors in its units, which no translation of them is the cause of: its marked original's, each
     * as its message and the unit it stands in there — the text around an error is the source's in the original's log
     * and the translation's in a translation's, and never the same (the review of 2026-10-04, M-1). Read once the
     * original is in, and never waited for: a failure is placed, and the chain moves on, as soon as the compile ends
     * (I-4: xeCJK's failure in its preamble had the next strategy's first preview wait the whole original in the
     * browser, 1509 ms against 45 in a probe). A run given the original's readings has their lines alone, no errors
     */
    let ownRead = null
    const ownErrors = () => {
      if (!originalIn?.log || !originalAt) return new Set()
      if (ownRead?.of !== originalIn) ownRead = { of: originalIn, keys: new Set(texErrors(originalIn.log).flatMap(e => unitsAtErrors([e], originalAt.files, originalAt.lines()).map(u => `${e.message}@${indexOf.get(u)}`))) }
      return ownRead.keys
    }
    /** a letter's key as lostIn counts it: its code point where the message gives one */
    const lostKey = message => { const c = /^Missing character: There is no (.+?) in font /.exec(message)?.[1]; return c && (c.match(/\(U\+([0-9A-F]+)\)/)?.[1] ?? c.trim()) }
    /** the letters of a unit's own translation in a snapshot, not its nested units' */
    const ownLetters = (u, snapshot) => snapshot.get(u)?.filter(p => p.t === 'text' && p.tr).map(p => p.s).join('') ?? ''
    /**
     * The passages setting `found` in the source under the strategy `at.s` sets there, each with every unit nested in
     * it, once, none in `out` already: those translated, and those still to come — a unit with no answer in yet, which
     * the source would hold all the same once it came —; not a unit left as it is (kept), lost to the service, or one the
     * strategy sets as the paper has it (the author block under one that cannot take its names). The passages the bounds
     * count (Codex's first medium, both rounds: a paragraph's five footnotes are six passages, which the bound of three
     * had counted as one — and as one again while the five were still being translated)
     */
    const reverting = (found, out, at) => [...new Set(found.flatMap(withNested))].filter(u => !out.has(u) && !kept.has(u) && !(strategies[at.s].authors === false && u.kind === 'author') && (translated.has(u) || !results.has(indexOf.get(u))))
    /** whether the letters a compile (`at`) lost beyond the original's, where the log names them by code point, stand in
     *  the translation of a unit or a few — no more passages than `room`, what the strategy may still set in the source
     *  besides `out`: lost in more, they are the strategy's font's, and in none, not a unit's (a caption babel sets).
     *  The units holding them by their own text, a footnote apart from its paragraph, each counted with what it would
     *  take to the source (Codex's fourth medium, second round: a letter in one of a paragraph's five notes was counted
     *  as the six, and never diagnosed); what the diagnosis places is counted again, exactly (fits) */
    const lostInFew = (at, known, out, room) => {
      const codes = [...lostIn(at.r.log)].filter(([c, n]) => n > (known.get(c) ?? 0)).map(([c]) => (/^[0-9A-F]+$/.test(c) ? String.fromCodePoint(parseInt(c, 16)) : null))
      if (codes.some(c => c === null)) return true
      const holding = [...at.snapshot.keys()].filter(u => codes.some(c => ownLetters(u, at.snapshot).includes(c)))
      const n = reverting(holding, out, at).length
      return n > 0 && n <= room
    }
    /** the units a compile's errors stand in (`at`: the compile — its files, its units' lines in them, the units it set
     *  translated), translated in it and not in `out`, the paper's own errors left out (ownErrors, read only once an
     *  error stands in a unit at all) */
    const placedIn = (errors, at, out) => {
      const found = new Set()
      let mine = null
      for (const e of errors) for (const u of unitsAtErrors([e], at.files, at.lines())) {
        if (out.has(u) || !withNested(u).some(x => at.snapshot.has(x))) continue
        if (!(mine ??= ownErrors()).has(`${e.message}@${indexOf.get(u)}`)) found.add(u)
      }
      return [...found]
    }
    /** whether a compile lost letters: an error that is one (LaTeX's "Unicode character … not set up"), or a PDF with
     *  letters left out (unsettable) */
    const lettersLost = r => texErrors(r.log).some(e => e.char !== undefined) || (r.ok && lostIn(r.log).size > 0)
    /**
     * The units holding the letters a compile (`at`) lost, not in `out`: its errors that are letters; else — a PDF with
     * letters lost and no error to place them, standing in a few units (lostInFew, at most `room`) — the compile asked
     * once more as one pass with \tracinglostchars=3, which makes each lost letter an error at its place (TeX Live 2021
     * on), the letters the original loses left out; before the main file's first line, so that every line keeps its
     * number
     */
    const letterUnits = async (at, out, room) => {
      const errors = texErrors(at.r.log).filter(e => e.char !== undefined)
      if (errors.length || !at.r.ok) return placedIn(errors, at, out)
      const known = lostIn((await original()).log)
      if (spent + 1 >= SPENT_MAX || !lostInFew(at, known, out, room)) return []
      spent++
      note('lost letters', { strategy: strategies[at.s].name, letters: [...lostIn(at.r.log).keys()].slice(0, 5) })
      const overrides = new Map(at.req.overrides)
      overrides.set(project.main, latin1Bytes(`\\AtBeginDocument{\\tracinglostchars=3\\relax}${latin1(at.req.overrides.get(project.main))}`))
      const d = await ask({ ...at.req, rerun: false, bibtex: false, overrides })
      return placedIn(texErrors(d.log).filter(e => /^Missing character/.test(e.message) && !known.has(lostKey(e.message))), at, out)
    }
    /** a remedy taken for the next compile: the episode's, and one of the run's budget — but the rule's, ruling 6's from
     *  before the budget, which nothing else may spend (the review of 2026-10-04, M-5) */
    const take = how => { episode.tried.add(how); episode.trying = how; if (how !== 'rule') spent++; return how }
    /** whether units found in a compile (`at`) may be set in the source under the strategy: a passage or more, within
     *  its bounds and the run's */
    const fits = (found, at) => { const n = reverting(found, inSource, at).length; return n > 0 && placed + n <= IN_SOURCE_MAX && spent < SPENT_MAX }
    /** units found in a compile (`at`) set in the source with every unit nested in each, as one round of the strategy's,
     *  each passage they set there counted; said */
    const place = (found, at) => {
      rounds++
      placed += reverting(found, inSource, at).length
      for (const u of found.flatMap(withNested)) inSource.add(u)
      note('in source', { strategy: strategy().name, units: found.map(u => indexOf.get(u)), error: whyFailed(at.r) ?? whyUnset(at.r) })
    }
    /**
     * After a compile that did not set the translation (TeX's failure, or a letter lost; BusyTeX's timeout is not one):
     * the next remedy, the least lost first, one a compile — where TeX failed, the rule's TeX where the compile had a plan
     * (ruling 6), microtype, the references; then the units the log places a TeX error in, set in the source, and units
     * holding letters lost only once no strategy after this one is left (lettersAt). A remedy after which the same
     * failure came again was not its cause, and is taken back first, the rule too: one unit's fault no longer costs the
     * rest of the run its rule (ruling 6, refined, 2026-10-04); one after which the compile failed otherwise mended what
     * it was tried for, and is kept (2610.02069: without its references, its apacite citation's key stood out). Units set
     * in the source stay there. Each remedy is noted (`typeset failed`, `without …`, `in source`, `lost letters`,
     * `… back`, `kept`, `recovered`, `back to strategy`), for a corpus run to measure. `req`: the compile's request.
     * Gives the remedy taken, or null: none left
     */
    const remedy = async (r, ruled, req) => {
      const name = strategy().name, now = failureOf(r)
      episode ??= { tried: new Set(), trying: null, failure: null }
      if (episode.trying) {
        if (now !== episode.failure) {
          note('kept', { strategy: name, by: episode.trying })
          // another failure, which the last one hid: the remedies taken back for that one are untried for this one — the
          // references' fault before the rule's in the final, a unit's before the rule's once the unit is in the source
          // (Codex's third medium, second round) —; those in effect stay so, and the budget is the run's
          episode.tried = new Set([...episode.tried].filter(how => how === 'units' || (how === 'rule' ? ruleFailed.has(name) : without[how].has(name))))
        } else if (episode.trying === 'rule') { ruleFailed.delete(name); note('typeset back', { strategy: name }) }
        else if (episode.trying !== 'units') { without[episode.trying].delete(name); note(`${episode.trying} back`, { strategy: name }) }
        // units set in the source stay there
      }
      episode.trying = null
      episode.failure = now
      if (!r.ok && ruled && !episode.tried.has('rule')) { withoutRule(r); return take('rule') }
      if (spent >= SPENT_MAX) return null
      if (!r.ok) for (const how of ['spacing', 'references']) if (!episode.tried.has(how) && adds[how]() && !(how === 'references' && beforeReferences(r))) { without[how].add(name); note(`without ${how}`, { strategy: name, error: whyFailed(r) }); return take(how) }
      if (rounds >= ROUNDS) return null
      const at = { ...last, r, req, s }
      // a TeX error in a unit: its text breaks TeX under any strategy
      let found = placedIn(texErrors(r.log).filter(e => e.char === undefined), at, inSource)
      if (!found.length) {
        if (!lettersLost(r)) return null
        lettersAt ??= at
        // letters lost: a strategy after this one first, and none left, the first that lost them (backToLetters)
        if (!lettersBack && (ahead() || lettersAt.s !== s)) return null
        found = await letterUnits(at, inSource, IN_SOURCE_MAX - placed)
      }
      if (!fits(found, at)) return null
      place(found, at)
      return take('units')
    }
    /** a compile under the strategy set the translation: the remedy it tried is kept, and said */
    const recovered = () => { if (episode?.trying) note('recovered', { strategy: strategy().name, by: episode.trying }); episode = null }
    /** the chain moves on: the next strategy, its own remedies and units, no references of the last */
    const nextStrategy = (why = {}) => { s++; aux = null; episode = null; inSource.clear(); rounds = placed = 0; note('next strategy', { strategy: strategy().name, ...why }) }
    /**
     * The chain spent with letters lost under an earlier strategy than this one, which no later one set (lettersAt): back
     * to that strategy, once a run, with the units holding them set in the source there, placed from its own compile and
     * within its own bounds, afresh. Whether it went back
     */
    const backToLetters = async () => {
      const at = lettersAt
      if (!at || at.s >= s || lettersBack || spent >= SPENT_MAX) return false
      lettersAt = null
      const found = await letterUnits(at, new Set(), IN_SOURCE_MAX)
      const n = reverting(found, new Set(), at).length
      if (!n || n > IN_SOURCE_MAX || spent >= SPENT_MAX) return false
      lettersBack = true
      s = at.s; aux = null; inSource.clear(); rounds = placed = 0
      note('back to strategy', { strategy: strategy().name })
      episode = { tried: new Set(), trying: null, failure: null }
      place(found, at)
      take('units')
      return true
    }
    // the passages the safety net set in the source in the last compile shown (S-P-60 counts them: ruling 6 of
    // 2026-10-04): the units it set there that the compile's snapshot had translated — a unit the service lost is
    // counted as lost, once (`missing`; the review's M-7) —, the author block's left out, as a copy's count leaves it
    // (cache.mjs passagesInSource), so that a visit again says what the visit that made the copy said
    let shownInSource = 0
    // whether the last compile this run showed lacked any of the translation — a unit not yet in, or set in the source —,
    // null where it showed none: a run whose finals all fail says it shows the translation in part only then (cache.mjs
    // endOf; the review of 2026-10-04, M-2: a whole preview on screen is no part)
    let shownPartial = null
    /** what names the floats of the translation last shown (captionsOf): the layer labels them so too */
    let captions = null
    const passagesShown = snapshot => [...inSource].filter(u => snapshot.has(u) && u.kind !== 'author').length
    const planFor = snapshot => {
      if (!readings || ruleFailed.has(strategy().name)) return null
      const plan = previewTypesetting({ paper, translated: setting(snapshot), lang, strategy: strategy(), fonts, fontLog, original: readings })
      if (!plan.typeset && toldMissing !== plan.missing) { toldMissing = plan.missing; note('typeset', { missing: plan.missing }) }
      return plan.typeset ? plan : null
    }
    /** every unit to translate in a snapshot: the whole translation, which alone can measure the final */
    const whole = snapshot => units.every(u => kept.has(u) || snapshot.has(u))
    /** a compile's references as complete as the original's: a bibliography read, every citation defined, and as many
     *  entries in it (a pass set from an earlier pass's references may lack some, and a bibliography of another length
     *  moves every page after it), and every contents list it reads (listsMissing). biblatex writes no \bibcite, and its
     *  warnings are the kernel's, its keys in plain quotes; a one-pass draft under it always asks for biber again and
     *  says there were undefined references, which says nothing */
    const bibcites = text => (text ?? '').match(/^\\bibcite\{/gm)?.length ?? 0, noFile = ext => `No file ${jobName(project.main)}.${ext}.`
    const referencesWhole = r => { const log = unwrapped(lastTexLog(r.log)); return !log.includes(noFile('bbl')) && !/(?:LaTeX|Package natbib) Warning: Citation [`'].*undefined/.test(log) && bibcites(r.aux) === bibcites(readings?.cites) && !listsMissing(r) }
    /** whether a draft set a contents list from nothing: one its aux writes (listsOf) whose file its pass did not find
     *  (LaTeX's \@input: "No file <job>.<ext>."), as a draft does that was given no aux of this translation (the F2
     *  re-review's N2) — the list set empty, every unit after it early by its height */
    const listsMissing = r => { const log = unwrapped(lastTexLog(r.log)); return [...listsOf(r.aux).keys()].some(ext => log.includes(noFile(ext))) }
    /** the preview that can measure the final: the last of the whole translation, planned, shown */
    let measuring = null
    // a preview of part of the translation held once for the last batch (below), as long as the last preview took
    let held = false, previewMs = 0
    /**
     * A draft runs BibTeX or biber after its one pass where it was given no bibliography — for the drafts after it —,
     * but the first preview not where the rule is on: its citations are undefined either way, and the original, compiled
     * by then or right after it, gives the compiles after it its bibliography. biber's first run in a profile beside the
     * original's own made 2608.29181's first preview 15.5 s, against 6.4 s without (the F2 re-review); and BusyTeX keeps
     * no log of the pass before a biber run, which every compile here reads
     */
    const bibtexFor = () => !meta.bbl && !bblAt() && !(readMarks && !previews) && !off('references')
    while (true) {
      // no previews: a batch in asks for none
      if (!showing) dirty = false
      // with the rule, the original right after the first preview: every plan after it is made from it
      if (readMarks && previews && !originalP) { await original(); continue }
      // a seeded run shows a preview only once no unit it would show in the source is left
      if (dirty && seed && !complete()) dirty = false
      // the whole translation after the first preview waits for the original under way in its own compiler: planned, its
      // preview measures the final, which a draft would have to otherwise (V1', the F2 review's measured proposal)
      if (dirty && readMarks && compileOriginal && previews && !readings && whole(translated)) await original().catch(() => {})
      // every unit sent and the last batch still out: a preview of part of the translation waits for it, once and as long
      // as the last preview took — the whole translation's preview would replace it within that time, and only the whole
      // one measures the final; begun, it held the whole one back by up to a preview (zh 2608.02163 on the protocol-2
      // page: the last batch came 0.13 s after a preview of 200 of its 337 units began, the final 2.1 s later for it)
      if (dirty && previews && !held && !todo.size && !mtDone && !whole(translated)) { held = true; await Promise.race([sleep(), new Promise(r => setTimeout(r, previewMs))]); continue }
      if (dirty) {
        dirty = false
        const snapshot = new Map(translated), t0 = Date.now(), plan = planFor(snapshot)
        const req = { main: project.main, engine: strategy().engine, rerun: false, bibtex: bibtexFor(), overrides: filesFor(snapshot, { draft: true, typeset: plan?.typeset ?? null }) }
        const r = await ask(req)
        // a compile that failed may have written half an aux (a run cut short): the last good one's are kept
        if (r.ok && r.aux) aux = r.aux
        if (r.ok && r.bbl) bbl = r.bbl
        held = false
        previewMs = r.ms ?? 0
        // shown only when it set every letter: a translation with letters missing is not one (Devin on #294); the note says
        // ok for what is shown, and with no strategy left the reader keeps what it has
        const shown = await settled(r)
        note('preview', { ok: shown, units: snapshot.size, ms: r.ms, roundTrip: Date.now() - t0, strategy: strategy().name, typeset: !!plan, error: shown ? undefined : whyFailed(r) ?? whyUnset(r) })
        if (shown) {
          recovered()
          previews++
          measuring = plan && whole(snapshot) ? { plan, strategy: strategy().name, r } : null
          shownInSource = passagesShown(snapshot)
          shownPartial = !shownWhole(snapshot)
          captions = captionsOf(r.log) ?? captions
          onUpdate?.({ pdf: r.pdf, texts: texts(setting(snapshot)), translated: snapshot.size, final: false, captions })
        } else if (timedOut(r)) {
          // the machine slow: nothing changed, the next batch or the final goes on
        } else if (await remedy(r, !!plan, req)) dirty = true
        else if (ahead()) { nextStrategy(); dirty = true }
        else if (await backToLetters()) dirty = true
        // (under the last strategy the episode stays: a remedy that did not set this paper is not tried again until a
        // compile sets it)
        continue
      }
      if (mtDone) break
      // nothing new to compile yet: the original, if it is still to do, else wait for the next batch
      if (!marks && !originalP && previews) { await original(); continue }
      await sleep()
    }
    await mt
    // nothing to show: nothing compiled, not even the marked original; the reader says why (the reader's design, §10.3)
    if (stopped && !translated.size) return { previews, translated: 0, units: units.length, results, changed: false, settled: false, exhausted: false, stopped, missing: missing(), original: readings, passing }
    // a seeded run that changed nothing typeset, on the same pipeline: nothing to compile but the marked original, for a
    // copy that has no marks — else they would never come (Devin on #298)
    if (seed && !changed && pipelineCurrent) {
      if (!marks) await original()
      note('unchanged')
      // the copy's PDF stays, and the passages it holds in the original with it (cache.mjs passagesInSource: the seeds
      // carry their mark)
      const inSourceKept = passagesInSource([...results].map(([i, r]) => ({ kind: units[i].kind, inSource: r.inSource })))
      // the copy's PDF sets the groups its run kept whole, decided again from the same translations
      markKept(new Map(translated))
      return { previews, translated: translated.size, units: units.length, results, changed: false, settled: false, exhausted: false, stopped, missing: missing(), inSource: inSourceKept, original: readings, passing }
    }
    const all = new Map(translated), t0 = Date.now()
    /**
     * The final's typesetting (plan.mjs finalTypesetting): measured by the last preview where it was of the whole
     * translation, under this strategy, and complete; else by a draft one-pass of the whole translation, planned — the
     * evaluation's rulings of 2026-10-01: no measuring compile of its own in full, the last preview measures. null where
     * no plan can be made: the final is set as today
     */
    const finalTypeset = async () => {
      if (!readMarks) return null
      await original()
      const read = async r => { try { return await readMarks(r.pdf) } catch (e) { passing = true; note('typeset', { missing: `a preview's marks (${String(e?.message ?? e).slice(0, 120)})` }); return null } }
      let m = measuring?.strategy === strategy().name && referencesWhole(measuring.r) ? measuring : null
      let fin = m && finalTypesetting(m.plan.state, { log: m.r.log, marks: await read(m.r) }, setting(all))
      if (!fin?.typeset || fin.missing === 'a plan of the whole translation') {
        let req
        const measure = async plan => {
          const t1 = Date.now()
          req = { main: project.main, engine: strategy().engine, rerun: false, bibtex: !meta.bbl && !bblAt() && !off('references'), overrides: filesFor(all, { draft: true, typeset: plan?.typeset ?? null }) }
          const r = await ask(req)
          note('measure', { ok: r.ok, ms: r.ms, roundTrip: Date.now() - t1, strategy: strategy().name, typeset: !!plan, error: whyFailed(r) })
          return r
        }
        // `bare`: the rule's remedy on trial — the measure's draft without the plan, which says whether the paper sets
        // without the rule; the final, a full compile, is not the trial (the re-review's N-1: a unit's fault on a re-set
        // cost two failing finals and the measured plan). The same failure without it takes the rule back, and the ladder
        // goes on in the measure, the plan measuring again; another keeps it off, and its drafts go on without it
        let plan, r, unset, bare = false
        for (;;) {
          plan = bare ? null : planFor(all)
          if (!plan && !bare) return null
          r = await measure(plan)
          unset = r.ok && !(await settled(r))
          // one that set a contents list from nothing — a re-set's: every unit taken, no draft of this translation before
          // it — is measured once more, given its own lists (the F2 re-review's N2). Not the original's lists instead: as
          // tall as the translation's only where its entries are, and the thesis 2307.16209's figures' long captions made
          // its re-set three pages short (-5 pages / 2.787 against -2 / 1.493 with its own). Not one that lost a letter
          if (plan && !unset && r.ok && listsMissing(r)) {
            aux = r.aux
            if (r.bbl) bbl = r.bbl
            r = await measure(plan)
            // judged as the first: a list may be set in a face without a letter its heading's face has (Devin on #309)
            unset = r.ok && !(await settled(r))
          }
          // one that could not set a letter is no measure, as a preview that cannot is not shown: the chain moves on before
          // the final, as from that preview, and the next strategy is measured — so that the final is set from a plan
          // measured under the strategy it is compiled with, not from the next one's plan uncorrected once this one's
          // final failed (the F2 re-review's N2: zh 2608.02459's re-set, measured under xeCJK, which has no σ there).
          // Under the last strategy the final is set as before, and cannot set it either. A TeX failure goes through the
          // run's remedies in their order, the rule's first — the plan's own TeX stands in each unit's lines, and a unit
          // it broke would otherwise be set in the source for it (the review of 2026-10-04, I-1) —, tried in the measure
          const how = unset || (!r.ok && !timedOut(r)) ? await remedy(r, !!plan, req) : null
          bare = how === 'rule' || (bare && ruleFailed.has(strategy().name))
          if (how) continue
          if (unset && ahead()) { bare = false; nextStrategy({ measure: whyUnset(r) }); continue }
          if (unset && await backToLetters()) { bare = false; continue }
          break
        }
        // BusyTeX gave up: the final from the plan uncorrected, which every input but the measure was there for
        if (timedOut(r)) { passing = true; return plan?.typeset ?? null }
        // TeX's failure and no remedy left: the final as today where the rule is off (ruling 6), else from the plan
        // uncorrected — the rule tried and taken back is not the cause
        if (!r.ok) { if (!episode?.tried.has('rule')) withoutRule(r); return ruleFailed.has(strategy().name) ? null : plan?.typeset ?? null }
        if (!unset) recovered()
        // set without the rule: the rule was the cause, and the final is set as today (ruling 6)
        if (!plan) return null
        if (r.aux) aux = r.aux
        if (r.bbl) bbl = r.bbl
        m = { plan, r }
        fin = finalTypesetting(plan.state, { log: r.log, marks: await read(r) }, setting(all))
      }
      note('typeset', { final: true, missing: fin.missing, faces: fin.faces.size, measured: m.r === measuring?.r ? 'preview' : 'draft' })
      return fin.typeset ?? m.plan.typeset
    }
    let typeset = await finalTypeset()
    // the final's plan while the remedy of leaving the rule out is tried: back if that did not set the paper
    let planAside = null
    let r, ok, exhausted = false, finalAgain = false
    for (;;) {
      // the final's lines are read by nothing: its TeX without the line probes (tex.mjs typesetting's `final`)
      const req = { main: project.main, engine: strategy().engine, rerun: true, bibtex: meta.bbl ? false : null, overrides: filesFor(all, { draft: false, typeset: typeset?.final ?? typeset }) }
      r = await ask(req)
      ok = await settled(r)
      note('final', { ok, ms: r.ms, roundTrip: Date.now() - t0, previews, strategy: strategy().name, typeset: !!typeset, undefinedCitations: [...new Set([...unwrapped(lastTexLog(r.log)).matchAll(/(?:LaTeX|Package natbib) Warning: Citation [`']([^']+)' .*undefined/g)].map(m => m[1]))].slice(0, 8), error: ok ? undefined : whyFailed(r) ?? whyUnset(r) })
      if (ok) { recovered(); break }
      // (a compile the page did not answer, or failed, was asked once more by `ask`, and a second failure stops the run:
      // a slow machine or the page's own failure is no reason to change how the paper is set — Part 3's checks: a
      // timed-out preview moved 2608.02163 to a strategy its class refuses.) One BusyTeX gave up on: once more as it
      // was, then what is shown stays
      if (timedOut(r)) { if (finalAgain) break; finalAgain = true; note('final again', { strategy: strategy().name }); continue }
      // the run's remedies before the chain moves on (remedy). The rule left out by the remedy just tried comes back only
      // where the remedy took it back — with the final's plan, or, left out since a preview or the measure, the plan for
      // this strategy, uncorrected (the handoff, 6); kept off — the failure changed —, the final stays without it, and the
      // next remedy is tried with the rule still off (the reviews of 2026-10-04: I-3, and Codex's second high)
      const back = episode?.trying === 'rule'
      const how = await remedy(r, !!typeset, req)
      if (back) {
        if (!ruleFailed.has(strategy().name)) typeset = planAside ?? planFor(all)?.typeset ?? null
        planAside = null
      }
      if (how === 'rule') { planAside = typeset; typeset = null; continue }
      if (how) continue
      if (ahead()) nextStrategy()
      else if (!(await backToLetters())) { exhausted = true; break }
      // a plan is made for one strategy: the new one's — or the one gone back to's —, uncorrected, since what the
      // preview measured was set by another (the handoff, 6)
      planAside = null
      typeset = planFor(all)?.typeset ?? null
    }
    if (ok) {
      shownInSource = passagesShown(all)
      shownPartial = !shownWhole(all)
      captions = captionsOf(r.log) ?? captions
      onUpdate?.({ pdf: r.pdf, texts: texts(setting(all)), translated: all.size, final: true, captions })
      // the units the final set in the source though translated, for the record: their translation stays the next run's.
      // Said anew for every unit it set, a seed's mark included: it set them all again — those the safety net set in the
      // source among them, and a table group waiting on a cell lost to the service. A group kept whole is kept (markKept)
      const set = typesetBy(setting(all), strategy()), { keep } = decided(all)
      units.forEach((u, i) => {
        const r = results.get(i)
        if (!r || !all.has(u) || keep.has(u)) return
        const { inSource, ...rest } = r
        results.set(i, set.has(u) ? rest : { ...rest, inSource: true })
      })
      markKept(all)
    }
    // marks known come only from a compile of the paper's own source that set (onOriginal)
    const own = marks && !originalP ? null : await original()
    return { previews, translated: translated.size, units: units.length, results, changed: true, settled: !!ok, exhausted, originalOk: !own || own.ok, stopped, missing: missing(), inSource: shownInSource, shownPartial, captions, original: readings, passing }
  }
  try { return await compiles() } catch (e) {
    if (!e?.compilerDown) throw e
    // the TeX page down, by the network or by itself: no compile more, what is shown kept, and the reader told why
    // (`compiler`), with the retry; the translation goes on to its end, the run's for the next to go on from — a seed
    // whole and current is never sent again (cache.mjs reusable), so the retry asks the service for nothing more
    note('compiler down', { why: e.compilerDown, error: e.message })
    await mt
    return { previews, translated: translated.size, units: units.length, results, changed: true, settled: false, exhausted: false, stopped, compiler: { down: e.compilerDown, error: e.message }, missing: missing(), original: readings, passing }
  }
}
