// experiments/pdf-bilingual/spikes/lock.mjs
// The geometry lock (plans/2026-09-27-geometry-lock-visual-eval-design.md). TeX that records, in the original's compile,
// where every unit and every heading, theorem-like environment, list item and float starts — page, column and
// \pagetotal — and makes the translation start each of them there again; a unit's line count at its paragraph's end;
// leading local to translated units. And the measurements: marks read from a PDF, unit heights, the leading a unit
// that grew is set at, and how far a compile is from the original.
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { FORBIDDEN_TO_WARNING, latin1, latin1Bytes, MARK_DEF, markUnits, patch, stripPdftexOption, unitLeadTex as engineUnitLeadTex, XETEX_SHIM, XETEX_SHIM_R1 } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { typesetBy } from '../../../src/pdf-reader/engine/scripts.mjs'

/**
 * Sync points. \axtat logs page (shipouts so far), column and \pagetotal in outer vertical mode; \axtsync, given the
 * original's point as \axt@t@<name>, ends the column while behind it (at most three times, never while floats wait,
 * whose float page would overshoot) and then \vspace*s up to the same \pagetotal (a \vspace* is kept at a column's
 * top). Skipped while a run-in head, a list label or a heading's no-break is pending: \newpage there sets the head
 * alone. \axtsyncpoints{envs} puts a point before every sectioning command, the given environments, \item and float.
 * AXT-BREAK and AXT-GAP lines record what the lock did, for the evaluation's suspicious pages. Both macros read the
 * page after \axt@settle: a line past the column's foot moves on only at the next breakpoint, so after a box a zero
 * skip takes the place of the breakpoint \parskip would have given, and \penalty\@M, no breakpoint itself, runs the page
 * builder (\par cannot: a list's does nothing before its first \item); a second zero skip leaves \lastskip and
 * \lastpenalty as a box would. Never under \if@nobreak, where LaTeX wants no breakpoint.
 */
export const SYNC_TEX = String.raw`\makeatletter
\newcount\axt@pages \newcount\axt@rel \newcount\axt@h
\AddToHook{shipout/after}{\global\advance\axt@pages\@ne}
\def\axt@col{\if@twocolumn\if@firstcolumn1\else2\fi\else1\fi}
\def\axt@settle{\if@nobreak\else\ifnum\lastnodetype>0 \ifnum\lastnodetype<11 \vskip\z@\penalty\@M\vskip\z@\fi\fi\fi}
\protected\def\axtat#1{\ifvmode\ifinner\else\par\axt@settle\message{^^JAXT-AT #1 \the\axt@pages\space\axt@col\space\the\pagetotal^^J}\fi\fi}
\def\axt@cmp#1#2{\axt@rel=0 \ifnum\axt@pages<#1 \axt@rel=-1 \else\ifnum\axt@pages>#1 \axt@rel=1 \else\ifnum\axt@col<#2 \axt@rel=-1 \else\ifnum\axt@col>#2 \axt@rel=1 \fi\fi\fi\fi}
\def\axt@step#1#2{\ifnum\axt@rel<0 \ifx\@deferlist\@empty\message{^^JAXT-BREAK \the\axt@pages^^J}\newpage\axt@cmp{#1}{#2}\else\axt@rel=2 \fi\fi}
\def\axt@sync#1#2#3{\axt@cmp{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}%
\ifnum\axt@rel=0 \ifdim\pagetotal<\dimexpr#3-0.5pt\relax\message{^^JAXT-GAP \the\axt@pages\space\the\dimexpr#3-\pagetotal\relax^^J}\vspace*{\dimexpr#3-\pagetotal\relax}\fi\fi}
\protected\def\axtsync#1{\ifvmode\ifinner\else\if@noskipsec\else\if@inlabel\else\if@nobreak\else\ifcsname axt@t@#1\endcsname\par\axt@settle\expandafter\expandafter\expandafter\axt@sync\csname axt@t@#1\endcsname\fi\fi\fi\fi\fi\fi}
\def\axt@hook{\ifhmode\if@noskipsec\else\par\fi\fi\global\advance\axt@h\@ne\axtat{h\the\axt@h}\axtsync{h\the\axt@h}}
\protected\def\axtsyncpoints#1{\AtBeginDocument{\AddToHook{cmd/section/before}{\axt@hook}\AddToHook{cmd/subsection/before}{\axt@hook}\AddToHook{cmd/subsubsection/before}{\axt@hook}\AddToHook{cmd/paragraph/before}{\axt@hook}\AddToHook{cmd/subparagraph/before}{\axt@hook}\@for\axt@e:=#1\do{\AddToHook{env/\axt@e/before}{\axt@hook}}\AddToHook{cmd/item/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@float/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@dblfloat/before}{\ifvmode\axt@hook\fi}}}
\makeatother
`

/** a unit's line count and leading at its paragraph's end, in the log. Through \message: \typeout reads \prevgraf as 0.
 *  The unit's own paragraph, found by the group level the unit began at: a paragraph ending deeper is either the
 *  unit's, ended inside an environment's group (\begin{itemize} right after it), or one inside the unit (a footnote's).
 *  Which, the level it comes back to tells (\aftergroup): still in horizontal mode, the unit goes on and the next
 *  paragraph end at its level is its own; in vertical mode, the one that ended was. A level below the unit's means its
 *  group closed with no paragraph. Inside a box the deeper paragraph is taken for one inside the unit and the hook
 *  waits for the next: an \\aftergroup there may close its group in an alignment or in math — a table's p-column cell,
 *  a display's box — and break the next \\midrule or \\end{align*} (2608.21180, 2608.09038, 2608.29867: the original
 *  with probes did not compile). No probe from restricted horizontal mode, where a caption is measured in an \\hbox. */
export const LINES_TEX = String.raw`\makeatletter
\def\axt@linesat#1#2{\ifnum\currentgrouplevel=#2 \message{^^JAXT-LINES #1 \the\prevgraf\space\the\baselineskip^^J}\else\ifnum\currentgrouplevel>#2 \ifinner\AddToHookNext{para/after}{\axt@linesat{#1}{#2}}\else\expandafter\xdef\csname axt@lg@#1\endcsname{\the\prevgraf\space\the\baselineskip}\expandafter\gdef\csname axt@lr@#1\endcsname{\axt@linesback{#1}{#2}}\expandafter\aftergroup\csname axt@lr@#1\endcsname\fi\fi\fi}
\def\axt@linesback#1#2{\ifnum\currentgrouplevel>#2 \expandafter\aftergroup\csname axt@lr@#1\endcsname\else\ifnum\currentgrouplevel=#2 \ifhmode\AddToHookNext{para/after}{\axt@linesat{#1}{#2}}\else\message{^^JAXT-LINES #1 \csname axt@lg@#1\endcsname^^J}\fi\fi\fi}
\protected\def\axtlines#1{\ifhmode\ifinner\else\axt@lines{#1}\fi\else\axt@lines{#1}\fi}
\def\axt@lines#1{\ifdefined\AddToHookNext\edef\axt@tmp{\noexpand\AddToHookNext{para/after}{\noexpand\axt@linesat{#1}{\the\currentgrouplevel}}}\axt@tmp\fi}
\makeatother
`

/** baselines `em` × the font size inside translated units alone (or \axtlead@<unit>'s factor), the paper's after:
 *  the engine's unit leading (latex-front.mjs) on the font size rather than on the paper's spacing */
export const unitLeadTex = em => engineUnitLeadTex(`${em}\\dimexpr\\f@size pt\\relax`)

/**
 * A unit set smaller: \\axtsize@<unit>, when defined, scales the font size (and so the unit's leading, which is × the
 * size) at the unit's start, the size before it back once the unit's own paragraph is over, found as \\axtlead finds
 * it (never an \\aftergroup inside a box; nothing from restricted horizontal mode). What service H does to a block too
 * long for its box, with a floor (shrinkSizes)
 */
export const SIZE_TEX = String.raw`\makeatletter
\def\axt@sizeat#1#2#3{\ifnum\currentgrouplevel=#1 \fontsize{#2}{#3}\selectfont\else\ifnum\currentgrouplevel>#1 \AddToHookNext{para/after}{\axt@sizeat{#1}{#2}{#3}}\fi\fi}
\def\axt@size#1{\ifcsname axtsize@#1\endcsname\ifdefined\AddToHookNext\edef\axt@tmp{\noexpand\AddToHookNext{para/after}{\noexpand\axt@sizeat{\the\currentgrouplevel}{\f@size}{\f@baselineskip}}}\axt@tmp\fontsize{\fpeval{\csname axtsize@#1\endcsname*\f@size}}{\fpeval{\csname axtsize@#1\endcsname*\strip@pt\dimexpr\f@baselineskip\relax}pt}\selectfont\fi\fi}
\protected\def\axtsize#1{\ifhmode\ifinner\else\axt@size{#1}\fi\else\axt@size{#1}\fi}
\makeatother
`

/** the size factor each unit still taller than its original is set at next: the one it has times the square root of
 *  how much taller it is (a text set smaller takes fewer lines, each closer), down to `min`; the others keep theirs */
export function shrinkSizes(orig, tr, sizes, { min }) {
  const next = new Map(sizes)
  for (const [i, o] of orig) {
    const hh = pairOf(o, tr.get(i))
    if (hh && hh[1] > hh[0] + 1 && hh[1] > 0) next.set(i, Math.max(min, (sizes.get(i) ?? 1) * Math.sqrt(hh[0] / hh[1])))
  }
  return next
}

/** the theorem-like environments whose heads are run-in: the usual names and every \newtheorem of the paper */
export const theoremEnvs = files => [...new Set(['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example', 'proof', 'claim', 'conjecture', 'assumption', ...[...files].filter(([p]) => /\.(tex|sty|cls)$/i.test(p)).flatMap(([, b]) => [...latin1(b).matchAll(/\\newtheorem\*?\s*\{([^}]+)\}/g)].map(m => m[1].trim()))])]

/** the original with unit marks, line probes and sync probes: the lock's target */
export function originalProbeFiles({ project, units }, theorems) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units)
  const files = patch(project, new Map(), { mark: u => { const m = base(u); return m && { start: `\\axtat{${index.get(u)}}\\axtlines{${index.get(u)}}${m.start}`, end: m.end } } })
  files.set(project.main, latin1Bytes(MARK_DEF + LINES_TEX + SYNC_TEX + `\\axtsyncpoints{${theorems.join(',')}}\n` + latin1(files.get(project.main))))
  return files
}

/** the translation, locked: units at `em` × the font size rather than the strategy's factor on the paper's spacing,
 *  every unit synced */
export function lockedFiles({ fsys, meta, project, units }, translated, { strategy, fonts, em, leads = new Map(), sizes = new Map(), targets = new Map(), theorems }) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units)
  const mark = u => { const m = base(u); if (!m) return m; const i = index.get(u); return { start: `\\axtsync{${i}}\\axtlines{${i}}${sizes.has(i) ? `\\axtsize{${i}}` : ''}\\axtlead{${i}}${m.start}`, end: m.end } }
  const files = patch(project, typesetBy(translated, strategy), { mark })
  let main = latin1(files.get(project.main))
  const at = main.search(/\\begin\s*\{document\}/)
  const pre = strategy.pre(fonts)
  main = main.slice(0, at) + FORBIDDEN_TO_WARNING + pre + main.slice(at)
  if (strategy.xe && strategy.engine !== meta.compiler) main = XETEX_SHIM + XETEX_SHIM_R1 + stripPdftexOption(main)
  const table = [
    ...[...targets].map(([i, t]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${t.page}}{${t.col}}{${t.total}pt}}`),
    ...[...leads].map(([i, f]) => `\\expandafter\\def\\csname axtlead@${i}\\endcsname{${f.toFixed(4)}}`),
    ...[...sizes].map(([i, f]) => `\\expandafter\\def\\csname axtsize@${i}\\endcsname{${f.toFixed(4)}}`),
  ].join('\n')
  main = MARK_DEF + LINES_TEX + SYNC_TEX + unitLeadTex(em) + (sizes.size ? SIZE_TEX : '') + `\\axtsyncpoints{${theorems.join(',')}}\n` + table + '\n' + main
  files.set(project.main, latin1Bytes(main))
  if (strategy.xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(files.get(f) ?? fsys.read(f)), s = stripPdftexOption(t); if (s !== t) files.set(f, latin1Bytes(s)) }
  return files
}

export const readTargets = log => new Map([...log.matchAll(/^AXT-AT (h?\d+) (\d+) (\d+) ([\d.]+)pt/gm)].map(m => [m[1], { page: Number(m[2]), col: Number(m[3]), total: Number(m[4]) }]))
export const readLines = log => new Map([...log.matchAll(/^AXT-LINES (\d+) (\d+) ([\d.]+)pt/gm)].map(m => [Number(m[1]), { lines: Number(m[2]), bs: Number(m[3]) }]))
export const readLockEvents = log => ({
  breaks: [...log.matchAll(/^AXT-BREAK (\d+)/gm)].map(m => ({ page: Number(m[1]) + 1 })),
  gaps: [...log.matchAll(/^AXT-GAP (\d+) (-?[\d.]+)pt/gm)].map(m => ({ page: Number(m[1]) + 1, pt: Number(m[2]) })),
})

/** every axt-<n>s / axt-<n>e destination (page 0-based, PDF points), the page width, and whether units start in two columns */
export async function marksOf(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }), pdf = await task.promise
  const dests = await pdf.getDestinations()
  const marks = new Map()
  for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests)) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: await pdf.getPageIndex(d[0]), x: d[2], y: d[3] })
  const [x0, , x1] = (await pdf.getPage(1)).view
  const width = x1 - x0, pages = pdf.numPages
  await task.destroy()
  const starts = [...marks].filter(([k]) => k.endsWith('s'))
  return { pages, width, twoColumn: starts.length > 0 && starts.filter(([, s]) => s.x >= width / 2).length >= 0.2 * starts.length, marks }
}

const DISPLAY = /^(\$\$|\\\[|\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat|dmath))/
const hasDisplay = u => u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src))
/** unit index → its start and its height: first to last baseline where both marks are on one page and in one column
 *  (hy), else its line count times its leading (hl) for a unit without display math, which \prevgraf counts as three lines */
export function heights(units, m, lines = new Map()) {
  const col = x => (m.twoColumn && x >= m.width / 2 ? 1 : 0)
  const out = new Map()
  for (let i = 0; i < units.length; i++) {
    const s = m.marks.get(`${i}s`), e = m.marks.get(`${i}e`)
    if (!s || !e) continue
    const simple = s.page === e.page && col(s.x) === col(e.x) && s.y >= e.y - 0.5
    const l = lines.get(i)
    const hl = l && l.lines >= 1 && !hasDisplay(units[i]) ? ((l.lines - 1) * l.bs * 72) / 72.27 : null
    out.set(i, { page: s.page, x: s.x, y: s.y, hy: simple ? s.y - e.y : null, hl })
  }
  return out
}
/** one unit's heights in two compiles, measured the same way in both */
export const pairOf = (o, t) => (o?.hy != null && t?.hy != null ? [o.hy, t.hy] : o?.hl != null && t?.hl != null ? [o.hl, t.hl] : null)

/** the leading (× font size) a unit the translation made taller is set at next: baselines drawn closer in proportion,
 *  down to `min`; its lines break where they did, since leading moves no line break */
export function tightenedLeads(orig, tr, { em, min }) {
  const leads = new Map()
  for (const [i, o] of orig) {
    const hh = pairOf(o, tr.get(i))
    if (hh && hh[1] > hh[0] + 0.01 && hh[1] > 0) leads.set(i, Math.max(min, (em * hh[0]) / hh[1]))
  }
  return leads
}

/** how far a compile is from the original: each marked unit's start on the same page, within 10 pt; captions apart */
export function compare(units, orig, tm) {
  const tr = heights(units, tm)
  const rows = []
  for (const [i, o] of orig) {
    const t = tr.get(i)
    if (t) rows.push({ i, kind: units[i].kind, page: t.page, origPage: o.page, samePage: o.page === t.page, dy: o.page === t.page ? Math.abs(o.y - t.y) : null })
  }
  const caps = rows.filter(r => r.kind === 'caption')
  return {
    pages: tm.pages, units: rows.length, samePage: rows.filter(r => r.samePage).length, within10pt: rows.filter(r => r.samePage && r.dy <= 10).length,
    captions: caps.length, captionsSamePage: caps.filter(r => r.samePage).length,
    offPage: rows.filter(r => !r.samePage).map(({ i, page, origPage }) => ({ i, page, origPage })),
  }
}
