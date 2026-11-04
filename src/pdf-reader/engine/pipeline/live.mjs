// The paper's pipeline before any compile (docs/PDF-READER.md §19.3): a paper's files opened into its units (openPaper), and
// the files the prepare compiles from them — the mark probe (probeFiles), the marked original (originalFiles, markedPreamble) —
// with the readings of a compile (ranThrough, stoppedShort, readingsOf, citationLines, listsMissing, notFound) and the units a
// target keeps (keptFor). The compiled translation that grew here (the translation set by TeX, its strategies, its typesetting
// rule and its copies' cache) was parked, then taken out (2026-11-04, the rules audit's F4): the layer draws the translation
// over our base page, and the web's rows hold it.
import { analyze } from '../source/paper-meta.mjs'
import { paperNames, theoremNames } from '../source/paper-names.mjs'
import { DVI_LAYOUT_TEX, inkSamples, LAYOUT_CLASSES, LAYOUT_TEX, layoutMarking, leadSamples, literalNames, markProbeTex, probeSamples, regionsTex } from '../layout/marks.mjs'
import { documentBounds, DVI_MARK_DEF, dviEngine, FONT_PROBE, inAuthorBlock, inMemory, jobName, lastTexLog, latin1, latin1Bytes, loadProject, MARK_DEF, markUnits, patch, texFilesOf, texText } from '../source/latex-front.mjs'
import { authorsTranslated } from '../translate/kept.mjs'
import { nameCells } from '../translate/mt.mjs'
import { completeLog, END_TEX, LINES_TEX } from './typeset/tex.mjs'
import { unbalancedUnits } from '../layout/guard.mjs'
/** Whether a compile's last TeX pass stopped short of the document's end: TeX's fatal errors — an emergency stop (a
 *  file that ended inside an argument, a line asked of no terminal, the job ended with no \\end), its capacity
 *  exceeded, a hundred errors, its own confusion. Whatever PDF it left is part of the paper: XeTeX ships the pages it set
 *  before the stop, and xdvipdfmx makes them a PDF (pdfTeX writes none). A compiler that answers with any PDF it made —
 *  the gates' native one, latexmk -f in nonstop mode — gave 2608.16117's Chinese final, three pages of forty, as set
 *  (its comment never ended: latex-front.mjs LINE_ENVS); the TeX page's BusyTeX halts on a TeX error, and gives none */
export const stoppedShort = log => /^(?:! Emergency stop\.|! TeX capacity exceeded, sorry|\(That makes 100 errors; please try again\.\)|! This can't happen|! I can't go on meeting you like this)/m.test(lastTexLog(log))
/**
 * Whether a compile ran through, the one test of a compile's success wherever a PDF or a log of it is taken (the marked
 * original and CM's passes, layout/paper.mjs): TeX ran (`ok`), and its last pass
 * neither stopped short (stoppedShort) nor ended before the document's end — every compile carries END_TEX, and only a
 * pass that set the last page logs it (completeLog). A pass halted at a TeX error writes no such line, whatever the
 * compiler made of it: a TeX page that took a halted pass's status for a success gave 2610.02069's final as the 18 pages
 * set before the halt, its bibliography empty, every citation "(?, ?)", and the run stored it as whole (2026-10-05); a
 * marked original taken on its PDF alone gave 2610.20713's layout from the 7 pages of 15 TL2025 set before its hundredth
 * error (2026-10-19). Whether it gave a PDF is the caller's to ask: a draft gives none
 */
export const ranThrough = c => !!c?.ok && !stoppedShort(c.log) && completeLog(c.log)
/** DRAFT's first line, graphicx's draft option alone: the final pass of the marked original (layout/paper.mjs markedOfPaper
 *  `base`) is its files with this line made NO_DRIVER_GROUP, one line, so that no line of them moves */
export const DRAFT_OPTION = '\\PassOptionsToPackage{draft}{graphicx}'
/** The final pass's first line, in DRAFT_OPTION's place: graphicx's drivers for pdfTeX and LuaTeX made to include a PDF as
 *  arXiv's do. pdftex.def 1.2d and luatex.def 1.2f (graphics-def 8d691483be, 2025-09-20; CTAN 2025-09-30) write a
 *  transparency group, /Group<</S/Transparency/K false/I false>>, on every PDF page they include; arXiv's TeX Live 2025 is the
 *  state of 2025-08-03 (info.arxiv.org, no tlmgr update since), whose pdftex.def 1.2c and luatex.def 1.2d write none, and the
 *  pinned tree's are the later ones. With the group every figure form of ours differs from arXiv's, so that the delta copies
 *  none of them (2610.30034v1 shipped its whole 5.46 MB base, 0.20 MB as a delta without it; 2610.30875v1 3.73 MB, 0.30 MB),
 *  and poppler draws the figures' lines heavier than arXiv's PDF. Each hook runs once its driver is read and, where the driver
 *  has the switch (\Gread@transgroupfalse defined), makes the include's \Gread@transgrouptrue its \Gread@transgroupfalse: the
 *  final pass is then the compile of the driver with no group, byte for byte. Where the driver has none (TeX Live 2023's) or
 *  is another (XeTeX's xetex.def, the DVI drivers under `latex`), nothing is defined and nothing changes. A name in \csname
 *  needs no \makeatletter, which this line runs before. The marked compile keeps the drivers as they are: its pages are read
 *  for their marks and never shipped, and a group sits in a figure's form, where it moves no mark */
export const NO_DRIVER_GROUP = ['pdftex.def', 'luatex.def'].map(def => `\\AddToHook{file/${def}/after}{\\ifcsname Gread@transgroupfalse\\endcsname\\expandafter\\let\\csname Gread@transgrouptrue\\expandafter\\endcsname\\csname Gread@transgroupfalse\\endcsname\\fi}`).join('')
/** images as frames of their own size (graphicx's draft), each frame's corners marked — g<n>a and g<n>b at its left and
 *  right ends on its baseline, g<n>t at its top right, n counting \includegraphics in the order TeX runs them — so that
 *  the reader lays the left's figure over its frame (session.mjs leftFor). A transformed include (\rotatebox or
 *  \resizebox around it, angle=) turns or scales its frame and not the marks, whose rectangle then has the size of no
 *  figure on the left, and the reader leaves that frame as it is */
const DRAFT = [
  DRAFT_OPTION,
  '\\makeatletter\\AddToHook{package/graphics/after}{\\newcount\\axt@g\\let\\axt@setfile\\Gin@setfile%',
  '\\def\\Gin@setfile#1#2#3{\\leavevmode\\global\\advance\\axt@g\\@ne\\axtmark{g\\the\\axt@g a}\\axt@setfile{#1}{#2}{#3}%',
  '\\axtmark{g\\the\\axt@g b}\\rlap{\\raise\\Gin@req@height\\hbox{\\axtmark{g\\the\\axt@g t}}}}}\\makeatother',
].join('\n') + '\n'
/** where the main file's \\begin{document} stands as TeX finds it (latex-front.mjs documentBounds: none in a comment, a
 *  definition or a filecontents), -1 where it has none: what goes before the document goes there */
const beginDocument = text => documentBounds(text).begin
/** the lines of a compile's last TeX pass that the readings keep: each unit's lines and the document's end (typeset/tex.mjs
 *  readLines, completeLog), the letters it could not set */
const READ_LINE = /^(?:AXT-|Missing character: |! LaTeX Error: Unicode character )/
/**
 * The marked original's readings: those lines of its log, its marks with every page's columns (`marks`, typeset/places.mjs
 * marksOf's), its references — the aux's \bibcite and \newlabel lines — and the bibliography its BibTeX or biber made
 * (`bbl`, null where the paper ships its own or has none). What the layout marks gate compares, byte for byte, between the
 * marked original and the layout-marked one (lab/pdf/spikes/layout-marks-gate.mjs)
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
/** whether a pass set a contents list from nothing: one its aux writes (listsOf) whose file the pass did not find
 *  (LaTeX's \@input: "No file <job>.<ext>."), as a pass does that was given no aux of its own (the F2 re-review's N2) —
 *  the list set empty, every unit after it early by its height. `main`, the project's main file (the job's name) */
export const listsMissing = (r, main) => { const log = unwrapped(lastTexLog(r.log)); return [...listsOf(r.aux).keys()].some(ext => log.includes(`No file ${jobName(main)}.${ext}.`)) }
/** the files a compile's last pass looked for and did not find, as LaTeX's \@input says it ("No file <name>.": a list,
 *  the bibliography, the index; biblatex's bibliography says so too) */
export const notFound = log => new Set([...unwrapped(lastTexLog(log)).matchAll(/No file (\S+?)\.(?=\s|$)/g)].map(m => m[1]))

/** a paper's files (Map path → bytes) → what the pipeline works on: its units, and beside them which of them are written inside a
 *  float (`inFloat`, their indices, latex-front.mjs loadProject's) and the order TeX sets them in where it is not theirs
 *  (`texOrder`, their indices in that order, or null: an author block's later units and the bibliography's entries are numbered
 *  after the rest, latex-front.mjs entriesLast) */
export function openPaper(files) {
  const fsys = inMemory(files)
  const meta = analyze(fsys)
  if (!meta.main) throw new Error('no main file')
  const project = loadProject(fsys, meta.main, { tables: true })
  // (the structural names its TeX prints that no package names in every target: units of their own in the bundle, after its
  // source's, sent to the translator once: source/paper-names.mjs, bundleUnitsOf)
  const texts = texFilesOf(fsys, meta.main), names = paperNames(texts)
  // (the printed names of its theorem-like environments among them, the label forms of its heads: the wrap's `names`,
  // layout/own.mjs)
  return { fsys, meta, project, units: project.units, inFloat: project.inFloat, texOrder: project.texOrder ?? null, kept: nameCells(project.units), names, theoremNames: theoremNames(texts) }
}

/**
 * The definitions a paper's .bbl makes for itself (`<job>.bbl`, the one TeX reads: shipped or made, layout/paper.mjs
 * madeBibliography), in the lines before its first entry (`\\bibitem`, harvard's `\\harvarditem`), in their order, as the styles
 * write them: a `\\providecommand` (an elsarticle .bbl's `\\providecommand{\\DOIprefix}{doi:}`); a `\\newcommand`, set as a
 * `\\providecommand` (alpha's `\\etalchar`: where the paper defined it before, the .bbl's \\newcommand is an error and the paper's
 * stands); a conditional that defines what is undefined, whole, both its branches (natbib's
 * `\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi`, and its
 * `\\expandafter\\ifx\\csname urlstyle\\endcsname\\relax \\providecommand{\\doi}[1]{doi: #1}\\else \\providecommand{\\doi}{…\\Url}\\fi`,
 * whose two \\doi TeX tells apart by whether the paper loads url; Springer's `\\ifx \\bisbn \\undefined \\def \\bisbn #1{…}\\fi`);
 * `\\@ifundefined{X}{…}{…}`, whole; and a `\\def` or `\\let` of its own, set only where its name is undefined (MNRAS's `\\mn@doi`,
 * REVTeX's `\\let\\auto@bib@innerbib\\@empty`), so that no definition of the paper's is replaced before the body's samples. TeX
 * reads them where \\bibliography stands, so the mark probe, set right after \\begin{document}, knew none of the entries' own
 * macros: their calls an error there, no answer and no text (2010.11929v2's `\\doi{…}`, 2608.25210v2's `\\natexlab{a}`). Read as
 * TeX reads the .bbl: a comment (an unescaped `%` to its line's end) taken out with its line's end and the next line's leading
 * blanks, so that neither a commented-out definition nor a brace in a comment counts; and one read under `\\makeatletter` given
 * in it again, `@` a letter as it was there (the reviews of #486). Anything else of the head (a length, a \\renewcommand, which
 * would replace the paper's own, a group, whose definitions are its own) is passed over. '' where the paper has no .bbl, or none
 */
export function bblProvides(fsys, main) {
  const path = `${jobName(main)}.bbl`
  if (!fsys.list().includes(path)) return ''
  const text = uncommentedTex(texText(fsys.read(path))), end = text.search(/\\(?:bibitem|harvarditem)(?![A-Za-z@])/)
  const head = end < 0 ? text : text.slice(0, end), out = []
  /** `re` (sticky) matched at `i`, or null */
  const at = (re, i) => { re.lastIndex = i; return re.exec(head) }
  /** where `@` is a letter in the head: after a \\makeatletter, before the \\makeatother after it */
  const letters = i => { const a = head.lastIndexOf('\\makeatletter', i), o = head.lastIndexOf('\\makeatother', i); return a >= 0 && a > o }
  const put = (i, tex) => out.push(letters(i) ? `\\makeatletter${tex}\\makeatother ` : tex)
  /** the end past the balanced group that opens at `i` (white space before it passed over), or -1 where there is none or it
   *  runs off the head */
  const group = i => {
    i += at(BLANKS, i)[0].length
    if (head[i] !== '{') return -1
    for (let j = i, depth = 0; j < head.length; j++) {
      if (head[j] === '\\') j++
      else if (head[j] === '{') depth++
      else if (head[j] === '}' && --depth === 0) return j + 1
    }
    return -1
  }
  /** the end past the conditional that opens at `i`, at its matching \\fi (the primitive conditionals nested in it counted), or -1:
   *  also where a word that may be a conditional of a package's or a \\newif's (\\ifpdf, \\if@foo) stands in it before its end, whose
   *  \\fi no reading of the head alone tells from the guard's (the review of #492), the block then passed over head by head */
  const conditional = i => {
    for (let depth = 0, m; (m = at(IF_FI, i)); i = m.index + m[0].length) {
      if (m[1] === 'fi') { if (--depth === 0) return m.index + m[0].length } else if (m[1] !== undefined) depth++
      else if (m[2]?.startsWith('if')) return -1
    }
    return -1
  }
  for (let i = 0, m, e; i < head.length; i = e) {
    if ((m = at(COMMAND, i)) && (e = group(i + m[0].length)) > 0) put(i, `\\providecommand${m[1]}${head.slice(i + m[0].length - m[2].length, e)}`)
    else if (at(CONDITIONAL, i) && (e = conditional(i)) > 0) {
      // (one that defines nothing, or replaces a definition, passed over whole)
      const body = head.slice(i, e)
      if (DEFINES.test(body) && !RENEWS.test(body)) put(i, body)
    } else if ((m = at(IFUNDEFINED, i)) && (e = [0, 1, 2].reduce(j => (j > 0 ? group(j) : j), i + m[0].length)) > 0) put(i, head.slice(i, e))
    else if ((m = at(DEF, i)) && (e = group(i + m[0].length)) > 0) put(i, `\\ifx${m[1]}\\undefined${head.slice(i, e)}\\fi `)
    else if ((m = at(LET, i))) put(i, `\\ifx${m[1]}\\undefined${head.slice(i, (e = i + m[0].length))}\\fi `)
    // (anything else: a group passed over whole, a control sequence or a character one at a time)
    else if (head[i] === '{') e = (g => (g > 0 ? g : head.length))(group(i))
    else e = i + (at(TOKEN, i)?.[0].length ?? 1)
  }
  return out.join('')
}
const BLANKS = /\s*/y
const TOKEN = /\\(?:[A-Za-z@]+|.)/ys
/** a \\providecommand or \\newcommand up to its body: [1] its star, [2] its name, arity and default */
const COMMAND = /\\(?:provide|new)command(\*?)(\s*(?:\{\s*\\(?:[A-Za-z@]+|.)\s*\}|\\(?:[A-Za-z@]+|.))\s*(?:\[\s*\d\s*\]\s*)?(?:\[[^\]]*\]\s*)?)(?=\{)/ys
/** a conditional on whether a name is defined: natbib's \\expandafter\\ifx\\csname, `\\ifx\\X\\undefined`, amsplain's `\\ifx\\undefined\\X`, e-TeX's */
const CONDITIONAL = /\\expandafter\s*\\ifx\s*\\csname|\\ifx\s*\\(?:[A-Za-z@]+|.)\s*\\(?:undefined|relax|@undefined)(?![A-Za-z@])|\\ifx\s*\\(?:undefined|@undefined)\s*\\(?:[A-Za-z@]+|.)|\\if(?:defined|csname)(?![A-Za-z@])/y
/** the next primitive conditional ([1] `if…`) or \\fi ([1] `fi`), or any other control sequence passed over ([2] its word) */
const IF_FI = /[^\\]*\\(?:(if(?:x|cat|num|dim|odd|vmode|hmode|mmode|inner|void|hbox|vbox|eof|true|false|case|defined|csname|fontchar)?|fi)(?![A-Za-z@])|([A-Za-z@]+)|.)/ys
const DEFINES = /\\(?:providecommand|newcommand|[gex]?def|let)(?![A-Za-z@])/
const RENEWS = /\\renewcommand(?![A-Za-z@])/
const IFUNDEFINED = /\\@ifundefined(?![A-Za-z@])/y
/** a \\def (\\gdef, \\edef, \\xdef) up to its body: [1] its name (not a \\csname's, whose name is no token to test); the parameter text
 *  after it */
const DEF = /\\[gex]?def(?![A-Za-z@])\s*(\\(?!csname(?![A-Za-z@]))(?:[A-Za-z@]+|.))[^{}\\]*(?:\\(?:[A-Za-z@]+|.)[^{}\\]*)*?(?=\{)/ys
/** a \\let: [1] its name, then an optional `=` and the one token it is let to */
const LET = /\\let(?![A-Za-z@])\s*(\\(?!csname(?![A-Za-z@]))(?:[A-Za-z@]+|.))\s*=?\s*(?:\\(?:[A-Za-z@]+|.)|[^\s\\{}])/ys
/** a TeX source with its comments taken out as TeX reads them: from an unescaped `%` (an even number of backslashes before it) to
 *  its line's end, that line's end and the next line's leading blanks with it (TeX skips the blanks a line begins with) */
const uncommentedTex = t => t.replace(/(?<!\\)((?:\\\\)*)%[^\n]*(?:\n[ \t]*)?/g, '$1')
/** the preamble alone, closed at once: its log names the document's font families; with `marks`, the layout marks' TeX
 *  (MARK_DEF, LAYOUT_TEX) first and, after \begin{document}, the mark probe
 *  (layout/marks.mjs markProbeTex: what the paper's own citation and footnote commands do with a mark and with what
 *  follows them), whose answers (readMarkProbe, over `probeSamples(paper.units, paper.project.complete)`) are the paper's own switch, and what
 *  each of its macros sets (readInkProbe, over `inkSamples(paper.units)`; and its units' leads, last: leadSamples); under
 *  `latex` (latex-front.mjs dviEngine), each
 *  followed by its DVI marks (DVI_MARK_DEF, marks.mjs DVI_LAYOUT_TEX), so that the probe asks TeX about the marks the DVI
 *  compile sets. Without it, the bytes as before */
export function probeFiles({ fsys, project, meta }, { marks = false, preamble = null } = {}) {
  // (the main file as the front end reads it, its line ends TeX's: read raw, a lone-CR preamble's first comment hid its
  // \begin{document}, and the probe was the whole document and a second one)
  const text = texText(fsys.read(project.main))
  const at = beginDocument(text)
  const dvi = dviEngine(meta?.compiler)
  // (with the marked preamble, its line probes inert: \axtlines is LINES_TEX's, which the probe does not load, and the preamble
  // only stores the text it marks)
  const head = marks ? MARK_DEF + (dvi ? DVI_MARK_DEF : '') + LAYOUT_TEX + (dvi ? DVI_LAYOUT_TEX : '') + (preamble === null ? '' : PREAMBLE_LINES) : '', probe = marks ? `${bblProvides(fsys, project.main)}${markProbeTex(probeSamples(project.units, project.complete), inkSamples(project.units), leadSamples(project.units))}` : ''
  return new Map([[project.main, latin1Bytes(`${head}${END_TEX}${marks && preamble !== null ? preamble : text.slice(0, at)}${FONT_PROBE}\\begin{document}${probe}\\end{document}\n`)]])
}
/** \axtlines in the mark probe over the marked preamble: a protected macro, as LINES_TEX's is, that sets nothing. One line */
const PREAMBLE_LINES = '\\protected\\def\\axtlines#1{}'
/**
 * The paper's preamble as the marked original writes it, for the mark probe (probeFiles `preamble`): the main file's text up to its
 * \begin{document} with the layout marks and their line probes (originalFiles `layout`, `lines`), every class marked as no probe's
 * answer takes one off, `complete` as the marked original's, no babel name wrapped, a unit whose writing changes its file's brace
 * balance written as the paper's own (layout/guard.mjs unbalancedUnits) — so that TeX reads the units the preamble holds, marked,
 * where the marked compile will, before it: a class's command that reads its argument as data raises its errors at our marks
 * there (2610.37668v1's myarxiv `\author`, a name's initials taken through a `\csname`). With the line of the probe's main file it
 * begins on (`first`: the probe's head before it) and its last (`last`). Null where no unit of the main file stands in its preamble:
 * the probe is the paper's own preamble's, byte for byte as before
 */
export function markedPreamble(paper, { complete = null } = {}) {
  const { project, meta } = paper
  // (no unit of the main file before its \begin{document} as the front end read it: nothing to write)
  const own = project.files?.get(project.main)
  if (typeof own === 'string') { const end = beginDocument(own); if (!project.units.some(u => u.file === project.main && u.start < end)) return null }
  const write = unmarked => { const sp = {}; return { files: originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, complete, names: false, ...(unmarked?.size ? { unmarked } : {}), spans: sp }), sp } }
  let { files, sp } = write(null)
  const balance = unbalancedUnits(paper, files, sp.lines(), sp.skip)
  if (balance.units.size) ({ files, sp } = write(balance.units))
  const text = latin1(files.get(project.main)), body = text.slice(sp.skip), at = beginDocument(body)
  if (!sp.lines().some(x => x.file === project.main && x.from !== undefined && x.from - sp.skip < at)) return null
  const preamble = body.slice(0, at), dvi = dviEngine(meta?.compiler)
  const first = (MARK_DEF + (dvi ? DVI_MARK_DEF : '') + LAYOUT_TEX + (dvi ? DVI_LAYOUT_TEX : '') + PREAMBLE_LINES + END_TEX).split('\n').length
  return { text: preamble, first, last: first + preamble.replace(/\n$/, '').split('\n').length - 1 }
}

/** the original with unit marks, as its own engine sets it (images as frames change no place on the page); with
 *  `lines`, each unit's lines in its log (typeset/tex.mjs LINES_TEX), which the layout marks read. `spans`, an object, gets
 *  `lines()`: each unit's lines and bytes in the files as written ({ file, unit, first, last, from, to }), worked out when
 *  asked — where the paper's own errors stand (layout/guard.mjs). With
 *  `layout`, a list of classes (layout/marks.mjs), the layout marks too: the units marked by layoutMarking, each
 *  placeholder of those classes and each cell and heading, and LAYOUT_TEX after MARK_DEF; `spans` names the paper's own
 *  units; `switches`, the paper's own switch (layout/marks.mjs readMarkProbe: TeX's answers to the mark probe), the
 *  marks taken off where TeX said they change what follows, and where it gave no answer; without `switches`, the marks
 *  as before; `inkless`, the paper's macros TeX said set no ink (readInkProbe), given no mark; `complete`, the paper's macros
 *  that read nothing past their arguments (layout/marks.mjs completeCalled), and `apart`, those whose box TeX began with no
 *  character (readInkApart), as layoutMarking takes them; and a babel name a style
 *  writes literally wrapped as the macro's text is (layout/marks.mjs literalNames). Without `layout`, the bytes as
 *  before. With `layout`, the layout guard's two remedies (layout/guard.mjs): `unmarked`, unit indices each written as
 *  the paper's own bytes (patch `asSource`: no mark, no layout mark, no span), and `names` false, no babel name marked
 *  (none wrapped literally, LAYOUT_TEX's \axt@nmall made \relax on LAYOUT_TEX's own line: NAMES_OFF).
 *  Neither given: the bytes as before. Under `latex` (latex-front.mjs dviEngine: arXiv's DVI compiler), MARK_DEF and
 *  LAYOUT_TEX each followed by its DVI marks (DVI_MARK_DEF, marks.mjs DVI_LAYOUT_TEX: xdvipdfmx's specials where pdfTeX
 *  writes no PDF), on the lines they follow: no line of the paper moves; every other engine's bytes as before. `pastBegin`
 *  (on with `layout`: the layout compile, our base page): a unit's line probe after an environment's \\begin goes past the
 *  spaces \\begin skips (latex-front.mjs patch), which it would set; off, the bytes as before. `transcode`
 *  (off with `layout`: the layout compile and CM's drafts, our base page): a file of a declared Latin-1 family encoding
 *  that is not UTF-8 (project.transcode) is written as the paper's own bytes, under the paper's own \\usepackage[…]{inputenc},
 *  as every other file is. On, patch writes it as UTF-8, which only a translation of the source could have (this switches no
 *  inputenc option): 2610.20581's latin1 source, transcoded under its own inputenc, set each é as Ã© and each no-break
 *  space in math as a \\^ error, 74 errors and a page more than arXiv's. On by default without `layout`, as the bytes were
 *  before (CM's unlayered drafts pass it off: layout/paper.mjs convergeThenMark) */
export function originalFiles({ fsys, project: read, meta }, { lines = false, spans = null, layout = null, switches = null, inkless = null, complete = null, apart = null, unmarked = null, names = true, pastBegin = !!layout, transcode = !layout } = {}) {
  // (the paper's own bytes: patch transcodes no file)
  const project = !transcode && read.transcode?.size ? { ...read, transcode: new Set() } : read
  const base = markUnits(project.units), index = new Map(project.units.map((u, i) => [u, i]))
  const raw = spans ? [] : null
  let out, patched = null
  if (layout) {
    const marked = layoutMarking(project.units, layout, { lines, switches, inkless, complete, apart }), paperOf = new Map(marked.units.map((c, i) => [c, project.units[i]]))
    const asSource = unmarked ? new Set([...unmarked].map(i => marked.units[i]).filter(Boolean)) : null
    out = patch({ ...project, units: marked.units }, new Map(), { mark: marked.mark, spans: raw, asSource, pastBegin })
    for (const x of raw ?? []) { x.unit = paperOf.get(x.unit) ?? x.unit; if (x.outer) x.outer = paperOf.get(x.outer) ?? x.outer }
    // (the files as patch wrote them, the units' bytes in them, before the names' wraps below move what follows a wrap)
    patched = spans ? new Map(out) : null
    // a babel name a style writes literally in the construct its macro names (marks.mjs literalNames), in any of the
    // package's style, class and source files (the main file's preamble), wrapped as the macro's own text is: no line
    // of any file gains or loses a line
    if (names) for (const path of fsys.list()) {
      if (!/\.(?:sty|cls|tex|ltx)$/i.test(path)) continue
      const bytes = out.get(path) ?? fsys.read(path)
      if (!bytes) continue
      const text = latin1(bytes), at = path === project.main ? beginDocument(text) : text.length
      const wrapped = literalNames(text.slice(0, at))
      if (wrapped !== text.slice(0, at)) out.set(path, latin1Bytes(wrapped + text.slice(at)))
    }
  } else {
    out = patch(project, new Map(), { mark: lines ? u => { const m = base(u); return m && { ...m, before: `\\axtlines{${index.get(u)}}` } } : base, spans: raw, pastBegin })
    patched = spans ? new Map(out) : null
  }
  const dvi = dviEngine(meta?.compiler)
  const head = DRAFT + MARK_DEF + (dvi ? DVI_MARK_DEF : '') + (layout ? LAYOUT_TEX + (dvi ? DVI_LAYOUT_TEX : '') + (names ? '' : NAMES_OFF) + regionsTex(project.codeEnvs, project.codeBodies) : '') + END_TEX + (lines ? LINES_TEX : '')
  out.set(project.main, latin1Bytes(head + latin1(out.get(project.main))))
  // (`skip`: the main file's head of ours, before the paper's first byte)
  if (spans) { let found = null; spans.skip = head.length; spans.lines = () => (found ??= unitLines(raw, patched, out, project.main, head.length)) }
  return out
}
/** the babel names' marks off (originalFiles `names` false): NAMES_TEX's wrapper (\axt@nmall, which begindocument/end and
 *  babel's afterextras call) made \relax, so that no name macro is wrapped. On LAYOUT_TEX's line: no line of the paper moves */
const NAMES_OFF = '\\makeatletter\\let\\axt@nmall\\relax\\makeatother'

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
 *  names and places where the target writes them as the paper does (translate/kept.mjs authorsTranslated) */
export const keptFor = (paper, lang) => (authorsTranslated(lang) ? paper.kept : new Set([...paper.kept, ...paper.units.filter(inAuthorBlock)]))

/** PIPELINE_VERSION, what the units are (docs/PDF-READER.md §18): defined in versions.mjs, which the readers load without this
 *  module, and re-exported here for the server's callers */
export { PIPELINE_VERSION } from './versions.mjs'
