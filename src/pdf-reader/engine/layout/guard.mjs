// The layout guard (R1, 2026-10-19): the marked original must be the paper. A unit mark is TeX of ours inserted into the
// paper's own source, and the front end's reading of a construct it does not know (pgffor's `\foreach \i in {…}`, etoc's
// `\etocdepthtag.toc{…}`, a length argument) can make the marked original another document than arXiv's: a brace the
// writer doubled, a mark TeX writes into a file and reads back where no text is set, an error the paper's own source does
// not have. Then the whole paper lost its layout through a fault of ours (2610.21377, 2610.21288, 2610.21201: 343 rows of
// the 50-paper sweep). The checks here hold for any paper; layout/paper.mjs markedOfPaper applies them, before the marked
// compile (the braces) and after it (the compile ran through, its pages, the auxiliary files, the TeX errors), and leaves
// unmarked the units the evidence blames. A unit left unmarked is the paper's own source (latex-front.mjs patch
// `asSource`) and simply stays unlocated; the rest of the paper keeps its layout.
//
// An original module (no port statement). It imports the engine's own modules alone, by relative path, and no node:
// specifier: the TeX page's host runs it in a browser.
import { whyText } from '../layer-proto/format.mjs'
import { lastTexLog, latin1, latin1Bytes, texText } from '../source/latex-front.mjs'
import { texErrors, unitsAtErrors } from '../pipeline/tex-errors.mjs'
import { END_TEX } from '../pipeline/typeset/tex.mjs'

const isLetter = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 64
/** the environments TeX reads verbatim, whose braces are no group: their text is the paper's either way, skipped alike */
const VERBATIM = /^\\begin\s*\{((?:verbatim|Verbatim|BVerbatim|LVerbatim|SaveVerbatim|VerbatimOut|lstlisting|minted|comment|filecontents|verbatimwrite|boxedverbatim|tcblisting)\*?)\}/

/**
 * A text's brace balance outside comments and verbatim: its `{` less its `}`, a control symbol's (`\{`, `\}`, `\\`) taken
 * as a symbol, a `%` to its line's end, `\verb` to its delimiter and a verbatim environment to its \end skipped. TeX's own
 * category codes are not followed (a paper that makes `{` a letter): the same text gives the same count, and the guard
 * compares a text with itself as the marks left it
 */
export function braceBalance(text) {
  let d = 0
  const n = text.length
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i)
    if (c === 92) {
      if (i + 1 < n && isLetter(text.charCodeAt(i + 1))) {
        let j = i + 1
        while (j < n && isLetter(text.charCodeAt(j))) j++
        const name = text.slice(i + 1, j)
        if (name === 'verb') {
          let k = j
          if (text[k] === '*') k++
          const delim = text[k]
          if (delim && !/[\s{[A-Za-z]/.test(delim)) {
            const end = text.indexOf(delim, k + 1), eol = text.indexOf('\n', k + 1)
            i = end < 0 || (eol >= 0 && eol < end) ? (eol < 0 ? n : eol) : end
            continue
          }
        } else if (name === 'begin') {
          const m = VERBATIM.exec(text.slice(i, i + 80))
          if (m) {
            const end = text.indexOf(`\\end{${m[1]}}`, i + m[0].length)
            i = end < 0 ? n : end + m[1].length + 6
            continue
          }
        }
        i = j - 1
        continue
      }
      i++
      continue
    }
    if (c === 37) {
      const eol = text.indexOf('\n', i)
      i = eol < 0 ? n : eol
      continue
    }
    if (c === 123) d++
    else if (c === 125) d--
  }
  return d
}

/**
 * Before the marked compile: the units whose writing changes their file's brace balance, each unit's rendering in the
 * marked file (its range there, `lines`: live.mjs originalFiles' `spans.lines()`) against the paper's source of it (its
 * range in the file the project read), the innermost that does: a nested unit (a footnote's) by its own range, its outer
 * unit by what is left of its own once its nested units' are taken away. A file's balance is what its units add to it
 * and what our other edits add (the head, a babel name a style writes literally: layout/marks.mjs literalNames, each
 * balanced by construction): `other`, whether a file's balance moved by more than its units explain (`skip`, the main
 * file's head of ours, left out). Gives { units: Set of unit indices, other }
 */
export function unbalancedUnits(paper, files, lines, skip = 0) {
  const { project } = paper
  const index = new Map(paper.units.map((u, i) => [u, i]))
  const sourceOf = u => (project.files.get(u.file) ?? '').slice(u.start, u.end)
  const texts = new Map()
  const textOf = path => { if (!texts.has(path)) { const b = files.get(path); texts.set(path, b ? latin1(b) : null) } return texts.get(path) }
  const delta = x => { const t = textOf(x.file); return t === null ? 0 : braceBalance(t.slice(x.from, x.to)) - braceBalance(sourceOf(x.unit)) }
  const out = new Set(), byFile = new Map()
  // (a nested unit's span carries what closes it in its outer unit, `post`; a top-level one's does not)
  const tops = lines.filter(x => x.from !== undefined && x.post === undefined), nested = lines.filter(x => x.from !== undefined && x.post !== undefined)
  const d = new Map(lines.filter(x => x.from !== undefined).map(x => [x, delta(x)]))
  for (const x of nested) if (d.get(x) !== 0) out.add(index.get(x.unit))
  for (const t of tops) {
    // (its nested units' own: those inside no other of its nested units)
    const mine = nested.filter(x => x.file === t.file && x.from >= t.from && x.to <= t.to)
    const direct = mine.filter(x => !mine.some(y => y !== x && y.from <= x.from && x.to <= y.to))
    const own = d.get(t) - direct.reduce((s, x) => s + d.get(x), 0)
    if (own !== 0) out.add(index.get(t.unit))
    byFile.set(t.file, (byFile.get(t.file) ?? 0) + d.get(t))
  }
  let other = false
  for (const [path, bytes] of files) {
    const own = paper.fsys.read(path)
    if (!own || !/\.(?:tex|ltx|sty|cls)$/i.test(path)) continue
    const written = latin1(bytes), from = path === project.main ? skip : 0
    // (the paper's own as the front end read it, its line ends TeX's: the file is written so, and braceBalance's comment
    // ends at an LF — read raw, a lone-CR file's first % took the rest of it, and its braces were others')
    if (braceBalance(written.slice(from)) - braceBalance(texText(own)) !== (byFile.get(path) ?? 0)) other = true
  }
  out.delete(undefined)
  return { units: out, other }
}

/** our marks that a file can hold: MARK_DEF's unit marks and LAYOUT_TEX's piece, heading and colour marks, each with its
 *  argument (a babel name's, \axtnma and \axtnmb, written through by design, is not one: NAME_MARK_FILE) */
const MARK_CS = new Set(['axtmark', 'axtend', 'axtlines', 'axtpma', 'axtpmm', 'axtpm', 'axthmark', 'axtcolour'])
/** where a list's or a label's text stands, which LaTeX writes a unit's text into by design, its marks with it, and sets
 *  as text (the lists with every mark off, \@starttoc's \axt@off): the second argument of \contentsline (the kernel's, every
 *  class's list entry: \contentsline{type}{text}{page}{anchor}), and the third group of \newlabel's second (nameref's
 *  title: \newlabel{key}{{number}{page}{title}{anchor}{}}) */
const inText = stack => stack.some((f, i) => (f.cs === 'contentsline' && f.arg === 2) || (f.cs === 'newlabel' && f.arg === 2 && stack[i + 1]?.cs === null && stack[i + 1]?.arg === 3))
/**
 * The marks of ours a file TeX wrote holds where no text is set: every mark (MARK_CS) but one inside a list entry's text or
 * a label's title (inText), by its argument as written (`216s`, `p69.1a`, `14`). The file is read as TeX's tokens are
 * written to it: a control word and the groups after it are its arguments in turn, a group after a group the next of the
 * same; a `%` to its line's end. 2610.21201: etoc's `\etocdepthtag.toc{main}` made a unit whose end mark TeX wrote into
 * the toc inside etoc's \csname, `\etoc@depthtag {main\axtend {2e}}`, and every reading of the contents raised "Missing
 * \endcsname inserted"; a caption's marks in the lists and in nameref's title stand in text
 */
export function marksOutOfPlace(text) {
  const out = [], stack = []
  let pending = null
  const n = text.length
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i)
    if (c === 92) {
      if (i + 1 < n && isLetter(text.charCodeAt(i + 1))) {
        let j = i + 1
        while (j < n && isLetter(text.charCodeAt(j))) j++
        const name = text.slice(i + 1, j)
        if (MARK_CS.has(name)) {
          let k = j
          while (k < n && text[k] === ' ') k++
          if (text[k] === '{') {
            const e = text.indexOf('}', k)
            if (e > k) {
              if (!inText(stack)) out.push(text.slice(k + 1, e))
              i = e
              pending = null
              continue
            }
          }
        }
        pending = { cs: name, arg: 1 }
        i = j - 1
        continue
      }
      i++
      pending = null
      continue
    }
    if (c === 37) { const eol = text.indexOf('\n', i); i = eol < 0 ? n : eol; continue }
    if (c === 123) { stack.push({ cs: pending?.cs ?? null, arg: pending?.arg ?? 1 }); pending = null; continue }
    if (c === 125) { const f = stack.pop(); pending = f ? { cs: f.cs, arg: f.arg + 1 } : null; continue }
    if (c === 32 || c === 10 || c === 13 || c === 9) continue
    pending = null
  }
  return out
}
/** a mark's unit, by the index its argument begins with: a unit's own (`216s`, `2e`, `14`), a cell's (`t…`), a heading's
 *  (`h…`), a placeholder's or a footnote call's (`p…`, `n…`), a colour piece's (`c…`); none for a frame's (`g…`) */
const unitOfMark = arg => { const m = /^(?:[pnht]?(\d+)|c(\d+)\.)/.exec(arg); return m ? Number(m[1] ?? m[2]) : null }
/** the files TeX writes of a pass and reads back, which a mark of ours may stand in: the aux, the lists, hyperref's outlines,
 *  the index's and the glossaries' entries, the slides' navigation, pdfx's metadata */
const AUX_FILE = /\.(?:aux|toc|lof|lot|loa|lol|lop|loe|thm|out|brf|nav|snm|vrb|idx|glo|acn|nlo|xmpdata)$/i
/**
 * The units named by marks of ours a compile wrote where no text is set (marksOutOfPlace), in the files it returned
 * (`files`, where the host gives them), else in its main aux (`aux`, which every host returns: LaTeX writes each list's
 * entries through it, \@writefile), ids below `count`
 */
export function auxUnits(c, count, job) {
  const out = new Set()
  const files = c?.files ? [...c.files] : c?.aux ? [[`${job}.aux`, latin1Bytes(c.aux)]] : []
  for (const [path, bytes] of files) {
    if (!AUX_FILE.test(path) || !bytes?.length) continue
    for (const arg of marksOutOfPlace(latin1(bytes))) { const u = unitOfMark(arg); if (u !== null && u < count) out.add(u) }
  }
  return out
}

/** a log as TeX wrote it, its lines of 79 characters joined again (live.mjs unwrapped) */
const unwrapped = log => log.replace(/^(.{79})\n/gm, '$1')
/** the TeX errors of a compile's last pass: its `! ` lines */
export const errorCount = log => (lastTexLog(log ?? '').match(/^! /gm) ?? []).length
/** the pages TeX says the last pass wrote ("Output written on main.pdf (36 pages, …)", the .xdv's under XeTeX), else null */
export const pagesOfLog = log => { const all = [...unwrapped(lastTexLog(log ?? '')).matchAll(/Output written on .*?\((\d+) pages?\b/g)]; return all.length ? Number(all.at(-1)[1]) : null }
/** the TeX Live year of a compile, from its engine's banner ("This is pdfTeX, … (TeX Live 2025) …"), else null */
export const texLiveOf = log => /\(TeX Live (\d{4})\)/.exec(log ?? '')?.[1] ?? null

const BANNER_KEY = '/PTEX.Fullbanner'
/** how much of a PDF's head and of its tail texLiveOfPdf reads: the Info dictionary arXiv writes sits in one of them */
const BANNER_WINDOW = 64 * 1024
const isPdfSpace = c => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32
/** the index of the `)` that closes each `(` of a text (-1 where none does), parentheses nested and a backslash taking the
 *  next character as its own (`\(`, `\)`, `\\`): one pass with a stack, so a text of any shape costs its length */
const closersOf = text => {
  const closer = new Int32Array(text.length).fill(-1), open = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 92) i++
    else if (c === 40) open.push(i)
    else if (c === 41 && open.length) closer[open.pop()] = i
  }
  return closer
}
/** the text of the last `/PTEX.Fullbanner (…)` in a window (a literal string that ends: a hex string, another value or a
 *  literal the window cuts is no banner), else null */
const lastBannerIn = text => {
  let at = text.lastIndexOf(BANNER_KEY)
  if (at < 0) return null
  const closer = closersOf(text)
  while (at >= 0) {
    let open = at + BANNER_KEY.length
    while (open < text.length && isPdfSpace(text.charCodeAt(open))) open++
    if (text.charCodeAt(open) === 40 && closer[open] > open) return text.slice(open + 1, closer[open])
    at = at > 0 ? text.lastIndexOf(BANNER_KEY, at - 1) : -1
  }
  return null
}
/** the TeX Live year of the build arXiv's PDF says (`/PTEX.Fullbanner (… (TeX Live 2023) …)` in its Info dictionary), else
 *  null: read from the PDF's first and last 64 KiB, the banner nearest the end of the file (the document's own, written last;
 *  the tail before the head) decides, and no other signal counts (never the Producer, never a version number); no throw */
export const texLiveOfPdf = bytes => {
  if (typeof bytes?.subarray !== 'function' || !bytes.length) return null
  const banner = lastBannerIn(latin1(bytes.subarray(Math.max(0, bytes.length - BANNER_WINDOW)))) ??
    (bytes.length > BANNER_WINDOW ? lastBannerIn(latin1(bytes.subarray(0, BANNER_WINDOW))) : null)
  return /TeX Live (\d{4})/.exec(banner ?? '')?.[1] ?? null
}
/** whether TeX ran at all: its banner in the log (a host that refused the compiler, a jail that ran nothing, has none) */
export const texRan = log => /^This is \S*TeX\b/m.test(log ?? '')
/** whether the host says it does not run the compiler asked (the web runner's "unknown engine"): the one answer TeX never ran
 *  in that is the engine's, not the compile's (a host's own failure, its cap on a compile's result) */
export const engineUnknown = c => /\bunknown engine\b/i.test(`${c?.error ?? ''}\n${c?.log ?? ''}`)
/** a why as a refusal holds it (layer-proto/format.mjs whyText): no control character, within WHY_MAX */
export { whyText }
/** the host's limit a compile met, where it says one (the web's `limit`, the TeX page's timeout), else null */
export const limitOf = c => c?.limit ?? (/\b(?:timeout|time limit)\b/i.test(c?.error ?? '') ? 'time' : null)
/** the first TeX error of a compile's last pass, with the line it names, for a refusal's why */
export function firstError(log) {
  const lines = lastTexLog(log ?? '').split('\n')
  const k = lines.findIndex(l => l.startsWith('! '))
  if (k < 0) return null
  const at = lines.slice(k + 1, k + 12).find(l => /^l\.\d+/.test(l))
  return `${lines[k]}${at ? ` (${at.trim().slice(0, 60)})` : ''}`.slice(0, 160)
}

/** the marks of ours a log's context may show, taken out before an error is compared with the unmarked original's: each
 *  mark with its argument, and the \leavevmode a unit's start mark comes with */
const OUR_MARKS = /\\leavevmode\s*(?=\\axtmark\b)|\\(?:axtmark|axtend|axtlines|axtpma|axtpmm|axtpm|axthmark|axtcolour)\s*\{[^{}]*\}/g
const CONTEXT = 12
const skeleton = s => s.replace(OUR_MARKS, '').replace(/[^\x21-\x7e]/g, '')
/** an error's identity whatever marks stand around it: its message and the text right before and after its place */
const errorKey = e => `${e.message}|${skeleton(e.before).slice(-CONTEXT)}|${skeleton(e.after).slice(0, CONTEXT)}`
/** the errors of the unmarked original, by identity (errorKey), the paper's own */
export const ownErrors = log => new Set(texErrors(log ?? '').map(errorKey))

/**
 * The units the marked compile's errors stand in (tex-errors.mjs unitsAtErrors, as runLive's remedy places a translation's),
 * each of its errors with a line of input but a letter lost (the paper's own letters), and less those the unmarked
 * original has too where it was compiled (`own`, ownErrors); and the units holding the line TeX names where it ignored all
 * text after it ("Incomplete \iffalse; all text was ignored after line N": a conditional that never ended, which names no
 * line of input of its own), in whichever file has a unit there. `files` the bytes the compile was given, `lines` its
 * units' spans (live.mjs originalFiles' `spans.lines()`). Gives unit indices
 */
export function errorUnits(paper, log, files, lines, own = null) {
  const index = new Map(paper.units.map((u, i) => [u, i]))
  const errors = texErrors(log ?? '').filter(e => e.char === undefined && !own?.has(errorKey(e)))
  const out = new Set(unitsAtErrors(errors, files, lines).map(u => index.get(u)))
  for (const m of lastTexLog(log ?? '').matchAll(/^! Incomplete \\if\w*; all text was ignored after line (\d+)\./gm)) {
    const at = Number(m[1])
    const here = lines.filter(x => x.first <= at && at <= x.last)
    for (const file of new Set(here.map(x => x.file))) {
      const mine = here.filter(x => x.file === file)
      for (const x of mine) if (!mine.some(y => y !== x && y.from !== undefined && x.from !== undefined && x.from <= y.from && y.to <= x.to)) out.add(index.get(x.unit))
    }
  }
  out.delete(undefined)
  return out
}

/** the unmarked original: the paper's own files, its main one with graphicx's draft (the marked original's frames, which
 *  set no other place) and END_TEX (AXT-END, by which a compile ran through: live.mjs ranThrough) on one line before its
 *  first, nothing else of ours */
export const unmarkedFiles = paper => new Map([[paper.project.main, latin1Bytes(`\\PassOptionsToPackage{draft}{graphicx}${END_TEX}${latin1(paper.fsys.read(paper.project.main))}`)]])
