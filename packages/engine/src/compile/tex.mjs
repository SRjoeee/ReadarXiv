// The line probes the marked original reports each unit's lines with (LINES_TEX, read by readLines: layout/marks.mjs), and the
// mark every compile ends with (END_TEX, completeLog). The TeX of the typesetting rule that grew here (a unit set at a smaller
// size or face, a float held to its original's page, a typeset plan) went with the compiled translation (2026-11-04, the
// rules audit's F4).
import { lastTexLog, PARA_END_TEX } from '../../../../src/pdf-reader/engine/source/latex-front.mjs'

/** Once the last page is out, AXT-END in the log: the pass reached the document's end (completeLog). Every compile
 *  carries it (live.mjs: the probe and the marked original), and the line probes too (LINES_TEX), set
 *  once whichever comes first. A message alone: nothing typeset changes */
export const END_TEX = String.raw`\ifdefined\AddToHook\ifdefined\axtendhook\else\let\axtendhook\relax\AddToHook{enddocument/afterlastpage}{\message{^^JAXT-END^^J}}\fi\fi
`
/** a unit's line count, leading, size and \parskip at its paragraph's end (PARA_END_TEX), in the log: its \baselineskip and
 *  \parskip are TeX's normal paragraph separation there, which the next ink under a borrowed line keeps (the borrowing ruling
 *  of 2026-11-08, marks/channels.ts readSkips; readLines reads the rest). Through \message: \typeout
 *  reads \prevgraf as 0. A unit whose group closed with no paragraph gives none. No probe from restricted horizontal
 *  mode, where a caption is measured in an \hbox. And each column the output routine makes at a forced break
 *  (\outputpenalty -10000: \newpage, \clearpage's, \pagebreak; LaTeX's float passes run below it), as AXT-FORCED: where
 *  the text starts at a column's top whatever came before (the typesetting rule's reading; nothing reads it now, and it stays
 *  so that the marked compile's TeX, and every cache keyed by it, stays as it was). And once the last page is out, AXT-END
 *  (END_TEX): the readings are the whole paper's (completeLog) */
export const LINES_TEX = PARA_END_TEX + String.raw`\makeatletter
\def\axt@linescap#1{\expandafter\xdef\csname axt@lg@#1\endcsname{\the\prevgraf\space\the\baselineskip\space\f@size\space\the\parskip}}
\def\axt@linesmsg#1{\message{^^JAXT-LINES #1 \csname axt@lg@#1\endcsname^^J}}
\protected\def\axtlines#1{\ifhmode\ifinner\else\axt@lines{#1}\fi\else\axt@lines{#1}\fi}
\def\axt@lines#1{\ifdefined\AddToHookNext\axt@whenover{lines#1}{\axt@linescap{#1}}{}{\axt@linesmsg{#1}}\fi}
\AtBeginDocument{\let\axt@forcedcol\@makecol\def\@makecol{\ifnum\outputpenalty=-\@M\message{^^JAXT-FORCED^^J}\fi\axt@forcedcol}}
\makeatother
` + END_TEX
/** whether a compile's last pass reached the document's end (END_TEX's AXT-END): a compile that stopped short gives a
 *  PDF of what it set and line readings for part of the paper, which the prepare takes for a failure (live.mjs ranThrough) */
export const completeLog = log => /^AXT-END$/m.test(lastTexLog(log))
/** each unit's lines, leading (pt) and size (pt) at its paragraph's end (LINES_TEX), by unit index */
export const readLines = log => new Map([...lastTexLog(log).matchAll(/^AXT-LINES (\d+) (\d+) ([\d.]+)pt(?: ([\d.]+))?/gm)].map(m => [Number(m[1]), { lines: Number(m[2]), bs: Number(m[3]), ...(m[4] ? { size: Number(m[4]) } : {}) }]))
