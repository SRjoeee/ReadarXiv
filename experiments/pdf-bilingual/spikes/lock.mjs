// experiments/pdf-bilingual/spikes/lock.mjs
// The geometry lock (plans/2026-09-27-geometry-lock-visual-eval-design.md). TeX that records, in the original's compile,
// where every unit and every heading, theorem-like environment, list item and float starts — page, column and
// \pagetotal — and makes the translation start each of them there again; a unit's line count at its paragraph's end;
// leading local to translated units. And the measurements: marks read from a PDF, unit heights, the leading a unit
// that grew is set at, and how far a compile is from the original.
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { BALANCE_DEF, EVEN_SPACES, FIT_DEF, FORBIDDEN_TO_WARNING, latin1, latin1Bytes, localizeNames, MARK_DEF, markUnits, NO_OVERFLOW, PARA_END_TEX, patch, stripPdftexOption, unitLeadTex as engineUnitLeadTex, lineBreaks, XETEX_SHIM, XETEX_SHIM_R1 } from '../../../src/pdf-reader/engine/latex-front.mjs'
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
 * Service H's rules (\ifaxt@h: each block stays in its original's box, the page around it as it was). The break the
 * sync offers before a unit costs 9999: the original set this unit on this page, and the page builder, finding the
 * translation's first lines a little taller, broke before it and moved it whole to the next — the page left short, and a
 * \flushbottom class spread the shortfall into every gap above (RT-1's page 6: three paragraphs 40 pt low, the fourth a
 * page late). A column the translation ends early is filled to the height its original had at its break (AXT-COL,
 * \axt@c@<page>@<column>) and then broken, where \newpage's \vfil took the stretch the original's gaps had: the page's
 * glue then stretches as the original's did, and every unit on it stands where the original's did. And each float keeps
 * its original's height (AXT-FLOAT, \axt@fh@<n>, floats counted in order): a taller one is set smaller as a whole, a
 * shorter one ends in blank below, where service H leaves a block's unused room. Its height moves everything on the
 * page: RT-1's figure 2, its Chinese caption spaced wider, set the rest of page 5 13 pt low. The padding before a
 * unit is glue unless the column is still empty: when the unit does not fit where its original stood and moves on,
 * the padding meant for this column goes at the break instead of standing at the top of the next (RT-1's unit 93, two
 * Chinese lines where two English ones had room, went to page 9 under 14 pt of page 8's padding).
 */
export const SYNC_TEX = String.raw`\makeatletter
\newcount\axt@pages \newcount\axt@rel \newcount\axt@h
\AddToHook{shipout/after}{\global\advance\axt@pages\@ne}
\def\axt@col{\if@twocolumn\if@firstcolumn1\else2\fi\else1\fi}
\def\axt@settle{\if@nobreak\else\ifnum\lastnodetype>0 \ifnum\lastnodetype<11 \vskip\z@\penalty\@M\vskip\z@\fi\fi\fi}
\protected\def\axtat#1{\ifvmode\ifinner\else\par\axt@settle\message{^^JAXT-AT #1 \the\axt@pages\space\axt@col\space\the\pagetotal^^J}\fi\fi}
\def\axt@cmp#1#2{\axt@rel=0 \ifnum\axt@pages<#1 \axt@rel=-1 \else\ifnum\axt@pages>#1 \axt@rel=1 \else\ifnum\axt@col<#2 \axt@rel=-1 \else\ifnum\axt@col>#2 \axt@rel=1 \fi\fi\fi\fi}
\newif\ifaxt@h \newdimen\axt@fill \newbox\axt@colbox
\AtBeginDocument{\let\axt@makecol\@makecol\def\@makecol{\setbox\axt@colbox\vbox{\unvcopy\@cclv}\message{^^JAXT-COL \the\axt@pages\space\axt@col\space\the\ht\axt@colbox^^J}\axt@makecol}}
\def\axt@break{\ifaxt@h\ifcsname axt@c@\the\axt@pages @\axt@col\endcsname\axt@fillcol\else\newpage\fi\else\newpage\fi}
\def\axt@fillcol{\axt@fill=\dimexpr\csname axt@c@\the\axt@pages @\axt@col\endcsname-\pagetotal\relax\ifdim\axt@fill>\z@\vskip\axt@fill\fi\penalty-\@M}
\def\axt@step#1#2{\ifnum\axt@rel<0 \ifx\@deferlist\@empty\message{^^JAXT-BREAK \the\axt@pages^^J}\axt@break\axt@cmp{#1}{#2}\else\axt@rel=2 \fi\fi}
\def\axt@sync#1#2#3{\axt@cmp{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}%
\ifnum\axt@rel=0 \ifdim\pagetotal<\dimexpr#3-0.5pt\relax\message{^^JAXT-GAP \the\axt@pages\space\the\dimexpr#3-\pagetotal\relax^^J}\axt@pad{\dimexpr#3-\pagetotal\relax}\fi\fi}
\def\axt@pad#1{\ifaxt@h\ifdim\pagegoal=\maxdimen\vspace*{#1}\else\vskip#1\relax\fi\else\vspace*{#1}\fi}
\newcount\axt@fl \newdimen\axt@fh
\AddToHook{begindocument/end}{\let\axt@lfc\@largefloatcheck\def\@largefloatcheck{\global\advance\axt@fl\@ne\message{^^JAXT-FLOAT \the\axt@fl\space\the\dimexpr\ht\@currbox+\dp\@currbox\relax^^J}\ifaxt@h\axt@floatbox\fi\axt@lfc}}
\def\axt@floatbox{\ifcsname axt@fh@\the\axt@fl\endcsname\axt@fh=\csname axt@fh@\the\axt@fl\endcsname\relax
  \ifdim\dimexpr\ht\@currbox+\dp\@currbox\relax>\axt@fh\ifdefined\resizebox\global\setbox\@currbox\vbox{\hbox to\wd\@currbox{\hss\resizebox*{!}{\axt@fh}{\box\@currbox}\hss}}\fi
  \else\global\setbox\@currbox\vbox to\axt@fh{\unvbox\@currbox\vss}\fi
  \ifdim\dimexpr\ht\@currbox+\dp\@currbox\relax>\axt@fh\global\ht\@currbox\dimexpr\axt@fh-\dp\@currbox\relax\fi\fi}
\def\axt@hsettle{\if@nobreak\else\ifnum\lastnodetype>0 \ifnum\lastnodetype<11 \penalty9999 \vskip\z@\fi\fi\fi}
\protected\def\axtsync#1{\ifvmode\ifinner\else\if@noskipsec\else\if@inlabel\else\if@nobreak\else\ifcsname axt@t@#1\endcsname\par\ifaxt@h\axt@hsettle\else\axt@settle\fi\expandafter\expandafter\expandafter\axt@sync\csname axt@t@#1\endcsname\fi\fi\fi\fi\fi\fi}
\def\axt@hook{\ifhmode\if@noskipsec\else\par\fi\fi\global\advance\axt@h\@ne\axtat{h\the\axt@h}\axtsync{h\the\axt@h}}
\protected\def\axtsyncpoints#1{\AtBeginDocument{\AddToHook{cmd/section/before}{\axt@hook}\AddToHook{cmd/subsection/before}{\axt@hook}\AddToHook{cmd/subsubsection/before}{\axt@hook}\AddToHook{cmd/paragraph/before}{\axt@hook}\AddToHook{cmd/subparagraph/before}{\axt@hook}\@for\axt@e:=#1\do{\AddToHook{env/\axt@e/before}{\axt@hook}}\AddToHook{cmd/item/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@float/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@dblfloat/before}{\ifvmode\axt@hook\fi}}}
\makeatother
`

/** a unit's line count and leading at its paragraph's end (PARA_END_TEX), in the log. Through \message: \typeout
 *  reads \prevgraf as 0. A unit whose group closed with no paragraph gives none. No probe from restricted horizontal
 *  mode, where a caption is measured in an \hbox. And each column the output routine makes at a forced break
 *  (\outputpenalty -10000: \newpage, \clearpage's, \pagebreak; LaTeX's float passes run below it), as AXT-FORCED:
 *  where the text starts at a column's top whatever came before (readForced) */
export const LINES_TEX = PARA_END_TEX + String.raw`\makeatletter
\def\axt@linescap#1{\expandafter\xdef\csname axt@lg@#1\endcsname{\the\prevgraf\space\the\baselineskip\space\f@size}}
\def\axt@linesmsg#1{\message{^^JAXT-LINES #1 \csname axt@lg@#1\endcsname^^J}}
\protected\def\axtlines#1{\ifhmode\ifinner\else\axt@lines{#1}\fi\else\axt@lines{#1}\fi}
\def\axt@lines#1{\ifdefined\AddToHookNext\axt@whenover{lines#1}{\axt@linescap{#1}}{}{\axt@linesmsg{#1}}\fi}
\AtBeginDocument{\let\axt@forcedcol\@makecol\def\@makecol{\ifnum\outputpenalty=-\@M\message{^^JAXT-FORCED^^J}\fi\axt@forcedcol}}
\makeatother
`

/** baselines `em` × the font size inside translated units alone (or \axtlead@<unit>'s factor), the paper's after:
 *  the engine's unit leading (latex-front.mjs) on the font size rather than on the paper's spacing */
export const unitLeadTex = em => engineUnitLeadTex(`${em}\\dimexpr\\f@size pt\\relax`)

/**
 * Each float waits for the page and column its original was set on (the owner, 2026-09-30: figures on the pages they
 * are on in the original, as far as LaTeX's own rules allow). \axtfloatat{unit}, in a caption (the caption unit's mark),
 * notes for the float being set — its box, \@currbox — the page and column \axt@fp@<unit> gives ({page} {column},
 * 1-based and 0-based, the original's). Wherever LaTeX places a float — in the column it was met in, at the top of the
 * next, on a page of floats, a double float at a page's top — it asks \@testwrongwidth first; a float not yet at its
 * page and column is reported as not fitting, and LaTeX keeps it deferred, and every later float of its kind behind
 * it, as it keeps their order. Not at a forced break (\newpage's -10000, \FloatBarrier's), not while \clearpage sends
 * every float out, and never more than two pages: a translation that far ahead would pile floats up. Taken only inside
 * a float, where \@xfloat has \@currbox defined for the float's group: a \captionof outside one has none. Not through
 * \@floatboxreset, which IEEEtran defines anew inside every float (2608.06701's tables went a page early). A box a later
 * float reuses keeps its note harmlessly: it was freed once its float was placed, at or after the page noted
 */
export const FLOAT_TEX = String.raw`\makeatletter
\newif\ifaxt@early\newcount\axt@pg
\protected\def\axtfloatat#1{\ifdefined\@currbox\ifdefined\@captype\ifcsname axt@fp@#1\endcsname\expandafter\xdef\csname axt@fb@\number\@currbox\endcsname{\csname axt@fp@#1\endcsname}\fi\fi\fi}
\def\axt@early#1{\global\axt@earlyfalse\ifnum\outputpenalty=-\@M\else\ifcsname axt@fb@\number#1\endcsname\expandafter\expandafter\expandafter\axt@earlyat\csname axt@fb@\number#1\endcsname\relax\fi\fi}
\def\axt@earlyat#1 #2\relax{\axt@pg=\ReadonlyShipoutCounter\advance\axt@pg\@ne
  \ifnum#1>\axt@pg\relax\ifnum#1>\numexpr\axt@pg+2\relax\else\global\axt@earlytrue\fi
  \else\ifnum#1=\axt@pg\relax\if@twocolumn\if@firstcolumn\ifnum#2>\z@\global\axt@earlytrue\fi\fi\fi\fi\fi}
\def\axt@notearly#1{\global\axt@earlyfalse}
\AtBeginDocument{\let\axt@testwrongwidth\@testwrongwidth\def\@testwrongwidth#1{\axt@testwrongwidth#1\if@test\else\axt@early#1\ifaxt@early\global\@testtrue\fi\fi}%
  \let\axt@doclearpage\@doclearpage\def\@doclearpage{\let\axt@early\axt@notearly\axt@doclearpage}%
}
\makeatother
`

/**
 * \\axtsizein{<unit>}: a translated table cell, heading or figure text at the same factor, a declaration that its own group —
 * the cell, the heading's — ends, and nothing in a PDF bookmark (plans/2026-09-30-generic-type.md, step 3).
 * A unit set smaller: \\axtsize@<unit>, when defined, scales the font size (and so the unit's leading, which is × the
 * size) at the unit's start, the size before it back once the unit's own paragraph is over (PARA_END_TEX), at every
 * level between when that paragraph ended in a deeper group (a list opened right after the unit — else the list's own
 * units were set smaller from a size never put back, and each smaller again: 2608.02785 in German went down to 7 pt,
 * and in the fit's trial to 4), and with it the note of which unit's size is in force. The leading before the size
 * goes to the unit's leading (\axt@leadbefore, latex-front.mjs), whose own return comes after the size's. A unit is
 * set from the size in force, or from the one before the unit set smaller whose size and leading are still in force
 * (a unit begun inside it, that one's paragraph not yet over): a note's own size is another, and stays the base. By
 * the size alone, the paper's own 9 pt — a note, \small — after a unit set from 10 pt to 9 was taken for that unit's,
 * set at 9, and 10 pt after it (2608.05876 in Russian). Nothing from restricted horizontal mode. What service H does
 * to a block too long for its box, with a floor (shrinkSizes)
 */
export const SIZE_TEX = PARA_END_TEX + String.raw`\makeatletter
\let\axt@szset\@empty\let\axt@szbase\@empty
\def\axt@szback{\noexpand\fontsize{\f@size}{\f@baselineskip}\noexpand\selectfont\noexpand\def\noexpand\axt@szset{\axt@szset}\noexpand\def\noexpand\axt@szbase{\axt@szbase}}
\def\axt@size#1{\ifcsname axtsize@#1\endcsname\ifdefined\AddToHookNext\edef\axt@tmp{\noexpand\axt@whenover{size#1}{\axt@szback}{\axt@szback}{\axt@szback}}\axt@tmp
  \edef\axt@szcur{\f@size/\f@baselineskip}\ifx\axt@szcur\axt@szset\else\edef\axt@szbase{{\f@size}{\f@baselineskip}}\fi
  \edef\axt@leadbefore{\the\baselineskip}\expandafter\axt@szto\axt@szbase{\csname axtsize@#1\endcsname}\edef\axt@szset{\f@size/\f@baselineskip}\fi\fi}
\def\axt@szto#1#2#3{\fontsize{\fpeval{#3*#1}}{\fpeval{#3*\strip@pt\dimexpr#2\relax}pt}\selectfont}
\protected\def\axtsize#1{\ifhmode\ifinner\else\axt@size{#1}\fi\else\axt@size{#1}\fi}
\protected\def\axtsizein#1{\ifcsname axtsize@#1\endcsname\fontsize{\fpeval{\csname axtsize@#1\endcsname*\f@size}}{\fpeval{\csname axtsize@#1\endcsname*\strip@pt\dimexpr\f@baselineskip\relax}pt}\selectfont\fi}
\AtBeginDocument{\ifdefined\pdfstringdefDisableCommands\pdfstringdefDisableCommands{\def\axtsizein#1{}}\fi}
\makeatother
`

/** the size factor each unit still taller than its original is set at next: the one it has times the square root of
 *  how much taller it is (a text set smaller takes fewer lines, each closer), down to `min`; the others keep theirs */
export function shrinkSizes(orig, tr, sizes, { min, margin = 0 }) {
  const next = new Map(sizes)
  for (const [i, o] of orig) {
    const hh = pairOf(o, tr.get(i))
    if (hh && hh[1] > hh[0] + 1 && hh[1] > 0) next.set(i, Math.max(min, (sizes.get(i) ?? 1) * Math.sqrt(hh[0] / hh[1]) * (1 - margin)))
  }
  return next
}

/**
 * The fit (the owner's proposal, 2026-09-28): no sync point, and no unit set apart from its neighbours — the
 * translation's units at one leading for the whole paper, each nudged within `band` of it, so that each takes about
 * the room its original took and the page follows. `tr` the units' heights at the leading a trial compile set, `lines`
 * its line probes (each unit's leading and size). G, the original's height over the translation's summed over the
 * units both measure, held within [lo, hi]; a unit's leading, × its size for \\axtlead@<unit>, is its trial leading
 * × G × its own ratio over G held within 1 ± band. Leading moves no line break, so one compile after the trial does
 */
export function fitLeads(orig, tr, lines, { lo, hi, band }) {
  let so = 0, st = 0
  const pairs = new Map()
  for (const [i, o] of orig) { const hh = pairOf(o, tr.get(i)); if (hh && hh[0] > 0 && hh[1] > 0) { pairs.set(i, hh); so += hh[0]; st += hh[1] } }
  const g = Math.min(hi, Math.max(lo, st ? so / st : 1))
  const leads = new Map()
  for (const [i, l] of lines) {
    if (!l.size || !l.bs) continue
    const hh = pairs.get(i)
    const own = hh ? Math.min(1 + band, Math.max(1 - band, hh[0] / hh[1] / g)) : 1
    leads.set(i, (l.bs * g * own) / l.size)
  }
  return { g: st ? so / st : 1, held: g, leads }
}

/**
 * The fit for CJK (the owner, 2026-09-28): one set of type for the whole translation, no unit set apart from another —
 * the leading, the space between CJK characters and the CJK face's scale — each within the range natural to Chinese
 * body text, shared out in proportion so that the translation takes the original's room. `a` the original's height
 * over the translation's at `base`; each knob moves, in log terms, an equal share of what is needed, a knob at the end
 * of its range handing the rest to the others, and what no knob can give is left (the page ends a little early or
 * late: better than type out of its range). Leading × the paper's spacing; tracking in em; scale × the size
 */
export const CJK_RANGES = { lead: [1.2, 1.45], track: [0, 0.05], scale: [0.92, 1] }
export function cjkType(a, base, ranges = CJK_RANGES) {
  const knobs = [
    { key: 'lead', at: base.lead, lo: ranges.lead[0], hi: ranges.lead[1], factor: v => v / base.lead },
    { key: 'track', at: base.track, lo: ranges.track[0], hi: ranges.track[1], factor: v => (1 + v) / (1 + base.track) },
    { key: 'scale', at: base.scale, lo: ranges.scale[0], hi: ranges.scale[1], factor: v => v / base.scale },
  ]
  // each knob's room in the direction needed, as a log factor it can still give
  const room = k => Math.log(k.factor(a > 1 ? k.hi : k.lo))
  const want = Math.log(a)
  const share = new Map(knobs.map(k => [k.key, 0]))
  let left = want, open = knobs.filter(k => (a > 1 ? room(k) > 1e-9 : room(k) < -1e-9))
  while (open.length && Math.abs(left) > 1e-9) {
    const each = left / open.length
    const next = []
    for (const k of open) {
      const can = room(k) - share.get(k.key)
      const take = a > 1 ? Math.min(each, can) : Math.max(each, can)
      share.set(k.key, share.get(k.key) + take); left -= take
      if (Math.abs(take - each) < 1e-12) next.push(k)
    }
    if (next.length === open.length) break
    open = next
  }
  const value = k => (k.key === 'track' ? (1 + base.track) * Math.exp(share.get(k.key)) - 1 : k.at * Math.exp(share.get(k.key)))
  return { lead: value(knobs[0]), track: value(knobs[1]), scale: value(knobs[2]), reached: Math.exp(want - left) }
}
/** a CJK strategy with the type cjkType gives: the leading its factor, the tracking as xeCJK's glue, the scale on the
 *  CJK face (the Latin text keeps the paper's size) */
export const withCjkType = (strategy, t) => ({
  ...strategy, leading: t.lead,
  pre: fonts => strategy.pre(fonts).replace('\\setCJKmainfont[', `\\setCJKmainfont[Scale=${t.scale.toFixed(4)},`)
    + (t.track > 0.0005 ? `\\xeCJKsetup{CJKglue={\\hskip ${t.track.toFixed(4)}em plus 0.08\\baselineskip}}\n` : ''),
})

/** the theorem-like environments whose heads are run-in: the usual names and every \newtheorem of the paper */
export const theoremEnvs = files => [...new Set(['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example', 'proof', 'claim', 'conjecture', 'assumption', ...[...files].filter(([p]) => /\.(tex|sty|cls)$/i.test(p)).flatMap(([, b]) => [...latin1(b).matchAll(/\\newtheorem\*?\s*\{([^}]+)\}/g)].map(m => m[1].trim()))])]

/** the original with unit marks, line probes and sync probes: the lock's target */
export function originalProbeFiles({ project, units }, theorems) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units)
  const files = patch(project, new Map(), { mark: u => { const m = base(u); return m && { ...m, before: `\\axtat{${index.get(u)}}\\axtlines{${index.get(u)}}` } } })
  files.set(project.main, latin1Bytes(MARK_DEF + LINES_TEX + SYNC_TEX + `\\axtsyncpoints{${theorems.join(',')}}\n` + latin1(files.get(project.main))))
  return files
}

/** the translation, locked: units at `em` × the font size rather than the strategy's factor on the paper's spacing,
 *  every unit synced. `sync: false` and `lead` (TeX for the units' leading) give the fit instead: no sync point, each
 *  unit at the leading `leads` gives it, × its size (fitLeads). `h`: service H's rules (SYNC_TEX), with `columns` the
 *  original's column heights (readColumns) and float heights (readFloats), and tables held to their original's height
 *  too (FIT_DEF) */
export function lockedFiles({ fsys, meta, project, units }, translated, { strategy, fonts, em, leads = new Map(), sizes = new Map(), targets = new Map(), theorems, sync = true, lead = null, h = false, columns = new Map(), floats = new Map(), fitHeight = false, fitMin = 0, floatsAt = new Map() }) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units, translated)
  // a unit with no mark — a table cell, a heading, a figure's text — takes its size, when it has one, as a declaration
  // before its first word, inside its own group (\\axtsizein): after whatever opens it, a row's \\toprule among them,
  // which is \\noalign and must follow the row's end (2608.06701), so that every role of the translation has one type
  const ROLES = new Set(['cell', 'heading', 'figure'])
  // (a line of names fitted to its box, AUTHOR_WIDE, carries nothing else: the author block keeps the class's type)
  // a caption's float waits for its original's page and column (FLOAT_TEX), when `floatsAt` gives them
  const mark = u => { const m = base(u), i = index.get(u); if (m?.whole) return m; if (!m) return sizes.has(i) && ROLES.has(u.kind) && !u.front ? { start: `\\axtsizein{${i}}`, end: '' } : m; return { ...m, before: `${sync ? `\\axtsync{${i}}` : ''}${floatsAt.has(i) ? `\\axtfloatat{${i}}` : ''}\\axtlines{${i}}${sizes.has(i) ? `\\axtsize{${i}}` : ''}\\axtlead{${i}}` } }
  const files = patch(project, new Map([...typesetBy(translated, strategy)].map(([u, pieces]) => [u, lineBreaks(u, pieces)])), { mark })
  let main = latin1(files.get(project.main))
  const at = main.search(/\\begin\s*\{document\}/)
  const pre = strategy.pre(fonts)
  main = localizeNames(main.slice(0, at)) + FORBIDDEN_TO_WARNING + pre + NO_OVERFLOW + (strategy.xe ? '' : EVEN_SPACES) + main.slice(at)
  if (strategy.xe && strategy.engine !== meta.compiler) main = XETEX_SHIM + XETEX_SHIM_R1 + stripPdftexOption(main)
  const table = [
    ...[...targets].map(([i, t]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${t.page}}{${t.col}}{${t.total}pt}}`),
    ...[...leads].map(([i, f]) => `\\expandafter\\def\\csname axtlead@${i}\\endcsname{${f.toFixed(4)}}`),
    ...[...sizes].map(([i, f]) => `\\expandafter\\def\\csname axtsize@${i}\\endcsname{${f.toFixed(4)}}`),
    ...[...floatsAt].map(([i, f]) => `\\expandafter\\def\\csname axt@fp@${i}\\endcsname{${f.page} ${f.col}}`),
    // a table no taller than its original, never below fitMin of its width (FIT_DEF): the generic type's rule for tables
    ...(fitHeight && !h ? ['\\axtfitheighttrue', `\\expandafter\\def\\csname axt@fitmin\\endcsname{${fitMin}}`] : []),
    ...(h ? ['\\csname axt@htrue\\endcsname\\axtfitheighttrue\\axtfirstpapertrue', ...[...columns].map(([k, v]) => `\\expandafter\\def\\csname axt@c@${k}\\endcsname{${v}pt}`), ...[...floats].map(([k, v]) => `\\expandafter\\def\\csname axt@fh@${k}\\endcsname{${v}pt}`)] : []),
  ].join('\n')
  main = MARK_DEF + FIT_DEF + BALANCE_DEF + LINES_TEX + (sync ? SYNC_TEX : '') + (lead ? engineUnitLeadTex(lead) : unitLeadTex(em)) + (sizes.size ? SIZE_TEX : '') + (floatsAt.size ? FLOAT_TEX : '') + (sync ? `\\axtsyncpoints{${theorems.join(',')}}\n` : '') + table + '\n' + main
  files.set(project.main, latin1Bytes(main))
  if (strategy.xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(files.get(f) ?? fsys.read(f)), s = stripPdftexOption(t); if (s !== t) files.set(f, latin1Bytes(s)) }
  for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(files.get(f) ?? fsys.read(f)), u = localizeNames(t); if (u !== t) files.set(f, latin1Bytes(u)) }
  return files
}

/** each float's height (and depth) as LaTeX set it, by its place in the order floats come, in a log with SYNC_TEX */
export const readFloats = log => new Map([...log.matchAll(/^AXT-FLOAT (\d+) ([\d.]+)pt/gm)].map(m => [m[1], m[2]]))
/** each column's natural height at its break in a log with SYNC_TEX, keyed <page>@<column> as \axt@c@ reads it */
export const readColumns = log => new Map([...log.matchAll(/^AXT-COL (\d+) (\d+) ([\d.]+)pt/gm)].map(m => [`${m[1]}@${m[2]}`, m[3]]))
/** each sync point's place in the original (AXT-AT), where it lands: a point logged at or past its column's natural
 *  height at the break (AXT-COL) did not stay on that column — the probe logs before the page builder knows whether
 *  what follows fits, and the unit or heading moved on whole — so it is the top of the next column. Taken as logged,
 *  the lock padded down to the foot of the column the original had left: RT-1's unit 37, logged at 397.76 pt of a
 *  column 395.6 pt high and set at the top of the next page, went to that page under its 40 pt of padding, and every
 *  unit after it on the page stood 40 pt low, the last pushed on to the page after */
export const readTargets = log => {
  const cols = [...readColumns(log)].map(([k, v]) => { const [p, c] = k.split('@').map(Number); return { p, c, h: Number(v) } }).sort((a, b) => a.p - b.p || a.c - b.c)
  return new Map([...log.matchAll(/^AXT-AT (h?\d+) (\d+) (\d+) ([\d.]+)pt/gm)].map(m => {
    const at = { page: Number(m[2]), col: Number(m[3]), total: Number(m[4]) }
    const own = cols.find(x => x.p === at.page && x.c === at.col), next = cols.find(x => x.p > at.page || (x.p === at.page && x.c > at.col))
    return [m[1], own && next && at.total >= own.h - 0.01 ? { page: next.p, col: next.c, total: 0 } : at]
  }))
}
/** the units that follow a forced break (LINES_TEX's AXT-FORCED): after each, the next unit whose lines the log gives */
export const readForced = log => {
  const out = new Set()
  let broke = false
  for (const m of log.matchAll(/^AXT-(?:FORCED|LINES (\d+))/gm)) if (!m[1]) broke = true; else if (broke) { out.add(Number(m[1])); broke = false }
  return out
}
export const readLines = log => new Map([...log.matchAll(/^AXT-LINES (\d+) (\d+) ([\d.]+)pt(?: ([\d.]+))?/gm)].map(m => [Number(m[1]), { lines: Number(m[2]), bs: Number(m[3]), ...(m[4] ? { size: Number(m[4]) } : {}) }]))
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
  const [x0, y0, x1, y1] = (await pdf.getPage(1)).view
  const width = x1 - x0, height = y1 - y0, pages = pdf.numPages
  await task.destroy()
  const starts = [...marks].filter(([k]) => k.endsWith('s'))
  return { pages, width, height, twoColumn: starts.length > 0 && starts.filter(([, s]) => s.x >= width / 2).length >= 0.2 * starts.length, marks }
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
