// The TeX of the rule chosen on 2026-10-01 (records/typesetting.md in experiments/pdf-bilingual): the line probes a
// compile reports each unit's lines with, a unit set at a smaller size or face, a float held to its original's page, and
// what a typeset plan adds to a compile of the translation (live.mjs translationFiles' `typeset`).
import { lastTexLog, PARA_END_TEX } from '../latex-front.mjs'

/** Once the last page is out, AXT-END in the log: the pass reached the document's end (completeLog). Every compile
 *  carries it (live.mjs: the probe, the marked original, the translation), and the line probes too (LINES_TEX), set
 *  once whichever comes first. A message alone: nothing typeset changes */
export const END_TEX = String.raw`\ifdefined\AddToHook\ifdefined\axtendhook\else\let\axtendhook\relax\AddToHook{enddocument/afterlastpage}{\message{^^JAXT-END^^J}}\fi\fi
`
/** a unit's line count and leading at its paragraph's end (PARA_END_TEX), in the log. Through \message: \typeout
 *  reads \prevgraf as 0. A unit whose group closed with no paragraph gives none. No probe from restricted horizontal
 *  mode, where a caption is measured in an \hbox. And each column the output routine makes at a forced break
 *  (\outputpenalty -10000: \newpage, \clearpage's, \pagebreak; LaTeX's float passes run below it), as AXT-FORCED:
 *  where the text starts at a column's top whatever came before (readForced). And once the last page is out, AXT-END
 *  (END_TEX): the readings are the whole paper's (completeLog) */
export const LINES_TEX = PARA_END_TEX + String.raw`\makeatletter
\def\axt@linescap#1{\expandafter\xdef\csname axt@lg@#1\endcsname{\the\prevgraf\space\the\baselineskip\space\f@size}}
\def\axt@linesmsg#1{\message{^^JAXT-LINES #1 \csname axt@lg@#1\endcsname^^J}}
\protected\def\axtlines#1{\ifhmode\ifinner\else\axt@lines{#1}\fi\else\axt@lines{#1}\fi}
\def\axt@lines#1{\ifdefined\AddToHookNext\axt@whenover{lines#1}{\axt@linescap{#1}}{}{\axt@linesmsg{#1}}\fi}
\AtBeginDocument{\let\axt@forcedcol\@makecol\def\@makecol{\ifnum\outputpenalty=-\@M\message{^^JAXT-FORCED^^J}\fi\axt@forcedcol}}
\makeatother
` + END_TEX

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
 * the cell, the heading's — ends, and nothing in a PDF bookmark (records/typesetting.md in experiments/pdf-bilingual).
 * A unit set smaller: \\axtsize@<unit>, when defined, scales the font size (and so the unit's leading, which is × the
 * size) at the unit's start, the size before it back once the unit's own paragraph is over (PARA_END_TEX), at every
 * level between when that paragraph ended in a deeper group (a list opened right after the unit — else the list's own
 * units were set smaller from a size never put back, and each smaller again: 2608.02785 in German went down to 7 pt,
 * and in the fit's trial to 4), and with it the note of which unit's size is in force. The leading before the size
 * goes to the unit's leading (\axt@leadbefore, latex-front.mjs), whose own return comes after the size's. A unit is
 * set from the size in force, or from the one before the unit set smaller whose size and leading are still in force
 * (a unit begun inside it, that one's paragraph not yet over): a note's own size is another, and stays the base. By
 * the size alone, the paper's own 9 pt — a note, \small — after a unit set from 10 pt to 9 was taken for that unit's,
 * set at 9, and 10 pt after it (2608.05876 in Russian). Nothing from restricted horizontal mode
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

/** the units that follow a forced break (LINES_TEX's AXT-FORCED): after each, the next unit whose lines the log gives.
 *  Read in the last TeX pass (lastTexLog), as every reader of a compile's log here */
export const readForced = log => {
  const out = new Set()
  let broke = false
  for (const m of lastTexLog(log).matchAll(/^AXT-(?:FORCED|LINES (\d+))/gm)) if (!m[1]) broke = true; else if (broke) { out.add(Number(m[1])); broke = false }
  return out
}
/** whether a compile's last pass reached the document's end (END_TEX's AXT-END): a compile that stopped short gives a
 *  PDF of what it set and line readings for part of the paper, which the rule takes no plan from (plan.mjs) and the run
 *  takes for a failure (live.mjs finished) */
export const completeLog = log => /^AXT-END$/m.test(lastTexLog(log))
/** each unit's lines, leading (pt) and size (pt) at its paragraph's end (LINES_TEX), by unit index */
export const readLines = log => new Map([...lastTexLog(log).matchAll(/^AXT-LINES (\d+) (\d+) ([\d.]+)pt(?: ([\d.]+))?/gm)].map(m => [Number(m[1]), { lines: Number(m[2]), bs: Number(m[3]), ...(m[4] ? { size: Number(m[4]) } : {}) }]))

// the units with no mark that a size still reaches, as a declaration inside their own group: a table cell, a heading, a
// figure's text — after whatever opens it, a row's \toprule among them, which is \noalign and must follow the row's end
// (2608.06701), so that every role of the translation has one type
const ROLES = new Set(['cell', 'heading', 'figure'])
const def = (name, i, v) => `\\expandafter\\def\\csname ${name}${i}\\endcsname{${v}}`

/** a CJK type's scale on xeCJK's face (scripts.mjs cjkFont), multiplying each scale the face has of its own — Korean's
 *  Hangul at its size, its bold at the bold's — or the scale of all of it where it has none */
const scaleCJK = (pre, k) => pre.replace(/\\setCJKmainfont\[([^\n]*)\]\{/, (m, opts) => `\\setCJKmainfont[${/(?:^|,)Scale=/.test(opts) ? opts.replace(/Scale=(\d*\.?\d+)/g, (x, v) => `Scale=${(Number(v) * k).toFixed(4)}`) : `Scale=${k.toFixed(4)},${opts}`}]{`)

/**
 * What a typeset plan (plan.mjs) adds to a compile of the translation, for live.mjs translationFiles: the strategy it
 * sets the type of, the one it was solved for (CJK under xeCJK: the leading, the tracking as xeCJK's glue and the scale
 * on the CJK face; an alphabet, or CJK under CJKutf8: its leading, its size going on the units — type.mjs designFor),
 * the TeX before everything (the line probes, the sizes, the
 * floats held, each unit's factors, tables no taller than their original's), and each translated unit's macros before
 * its start mark: its float's page and column, its line probe, its size, its leading. Another strategy — the chain
 * moved on, its design another — gets nothing of the plan: `strategy(s)` gives it back as it is, and live.mjs
 * translationFiles sets the translation as today and notes the refusal; the plan is made again for it (plan.mjs
 * previewTypesetting). `plan`: { design, strategy (its name), type, leads: Map(unit index → leading × its size),
 * sizes: Map(unit index → size factor), floatsAt: Map(unit index → { page, col }), tableMin }.
 */
export function typesetting(units, plan) {
  const { design, type, leads, sizes, floatsAt, tableMin } = plan
  const index = new Map(units.map((u, i) => [u, i]))
  const strategy = s => {
    if (s.name !== plan.strategy) return s
    if (design.cjk) return { ...s, leading: type.lead, pre: (fonts, named) => scaleCJK(s.pre(fonts, named), type.scale) + (type.track > 0.0005 ? `\\xeCJKsetup{CJKglue={\\hskip ${type.track.toFixed(4)}em plus 0.08\\baselineskip}}\n` : '') }
    return { ...s, leading: type.lead }
  }
  /** with each unit's line probe (LINES_TEX) where a compile is read, the previews and the measures; without, the final,
   *  whose lines nothing reads (the F2 review's M7) */
  const of = lines => ({
    head: [
      lines ? LINES_TEX : '', sizes.size ? SIZE_TEX : '', floatsAt.size ? FLOAT_TEX : '',
      ...[...leads].map(([i, f]) => def('axtlead@', i, f.toFixed(4))),
      ...[...sizes].map(([i, f]) => def('axtsize@', i, f.toFixed(4))),
      ...[...floatsAt].map(([i, f]) => def('axt@fp@', i, `${f.page} ${f.col}`)),
      '\\axtfitheighttrue', def('axt@fitmin', '', tableMin), '',
    ].join('\n'),
    for: plan.strategy,
    strategy,
    mark: (base, translated) => u => {
      const m = base(u), i = index.get(u)
      if (m?.whole || !translated.has(u)) return m
      if (!m) return sizes.has(i) && ROLES.has(u.kind) && !u.front && !u.stored ? { start: `\\axtsizein{${i}}`, end: '' } : m
      return { ...m, before: `${floatsAt.has(i) ? `\\axtfloatat{${i}}` : ''}${lines ? `\\axtlines{${i}}` : ''}${sizes.has(i) ? `\\axtsize{${i}}` : ''}\\axtlead{${i}}` }
    },
  })
  return { ...of(true), final: of(false) }
}
