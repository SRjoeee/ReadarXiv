// The engine's versions a reader checks what it is given against, kept apart from the run (live.mjs, which re-exports
// PIPELINE_VERSION) so that a reader loads no part of it: the layer bundle (layer-proto/bundle.mjs) names them in its
// versions and its key. The layout file's (layout/file.mjs LAYOUT) stays beside its parser, which the readers load already.
// Imports nothing.

/**
 * PIPELINE_VERSION, the extraction's: raised with any change to what a unit is — the units' cutting, kinds and texts
 * (latex-front), the cells' places, the left side's marks. It enters a bundle's key (bundle.mjs VTAG) and the identity
 * of the rows made over its units. It is no longer the wire, its reading back or paperContext(): those are the
 * translation's, TRANSLATE_VERSION (translate/version.mjs), and a change that touches both raises both (the rules-as-data
 * plan, §9.2). Until the rows cache replaces session.mjs's copies (Stage 5, Task 10) a copy is judged by this alone,
 * so a change of the wire that must void copies raises it too.
 * A record of another version is translated again, its translations shown meanwhile (session.mjs
 * seedFrom), but for the units a version that carries over into this one leaves as they were (live.mjs PIPELINE_CARRIES); one
 * of this version gives its whole units by the identity that would answer now as they are (cache.mjs reusable).
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
// 11: nothing is inserted inside a macro's call or between a subscript and its operand (latex-front.mjs: a lead or a mark
//     goes before a whole call, after a complete argument or inside a group). 2106.10165v2's `\strangechapter{..}{Title}`
//     wrapper was split by the lead, and 2310.20360v3's `eqsplit` (`\equation\aligned`) and `_` operands took marks:
//     14 TeX errors a compile, both books now compile in three passes. The units change for 2106.10165, 2310.20360 and
//     2608.12096's tikzequation; 2212.06817, 2608.09189, 2608.14557, 2608.17060 and 2608.22687 lose marks only, and the
//     five made papers' units, probes and marked originals are byte-for-byte what they were
// 12: raised with TRANSLATE_VERSION 2 (a formula split across inline formulas sent as one marker, mt.mjs formulaRuns), so
//     that copies are judged again; the units are 11's, byte for byte. 2307.16209's `$\{\Phi_0$, $\Phi_1$, $\Phi_2\}$`
//     went out as three markers, Microsoft's Chinese moved the first one, its brace with it, and page 31 drew the set
//     broken apart. A copy of 10 or 11 carries every unit but one that holds a run (live.mjs PIPELINE_CARRIES, given the
//     unit; with none, every unit but one whose translation holds a formula that does not balance on its own)
// 13: \texorpdfstring's first argument is the heading's text (latex-front.mjs): a heading wholly in \texorpdfstring is a
//     unit. 2307.16209: 13 of its 14 headings, 452 -> 466 units; 6 of the corpus's 127 papers change, 41 headings new; a new
//     brace pair renumbers the later pairs of its file, so 60 units of 2307.16209 and 49 of 2608.18502 keep their text and
//     change their hash, found again by seedFrom. The wire, the translation and its reading back are 12's: a copy of 12
//     carries every unit it holds the source of (live.mjs PIPELINE_CARRIES)
// 14: the left side of a paper with text set at an angle (anchors.mjs tokenizeDocument): a turned item's tokens lie along its
//     baseline, no longer read along x, and the left parts that hold them change — arXiv's stamp up every first page's margin,
//     a landscape page's captions, a figure's turned labels: 130 of the corpus's 132 PDFs. The units, the wire, the
//     translation and the layout file are 13's byte for byte; the bundle's content is not, under the same key (VTAG), so a
//     bundle made before is never taken for one made now. A copy of 13 carries every unit (live.mjs PIPELINE_CARRIES)
// 15: raised with TRANSLATE_VERSION 3 (a sentence whose words change style goes out whole, mt.mjs planOf), so that copies
//     are judged again; the units, their pieces and the layout file are 14's, byte for byte. 2610.19159's lead terms and
//     word-by-word colour runs went out as a marker at every style boundary and came back as word salad, its "Before"
//     labels empty. A copy of 14 (and of each older pipeline, with its own test) carries every unit that holds no pair
//     and no inkless placeholder between its words and whose translation keeps a letter (live.mjs PIPELINE_CARRIES)
// 16: an environment the paper defines as code is no unit (latex-front.mjs codeEnvsOf): one a listing package's definer
//     makes, one whose begin code opens a code environment, one set as alltt sets its body (typewriter type, its lines
//     obeyed). 2610.19159's 720 transcripts were 832 of its 2,645 units, its command lines and terminal output sent to the
//     translator; 1,813 now. Its later pairs in that file renumbered, 451 units keep their text and change their hash,
//     found again by seedFrom. The 7 pack papers and the corpus's 124 keep their units byte for byte. The wire, its
//     reading back and the layout file are 15's: a copy of 15 carries every unit it holds the source of (live.mjs
//     PIPELINE_CARRIES)
// 17: a command and its arguments are one piece (arg-roles.mjs readArgs, latex-front.mjs commandArgs): TeX's number, dimension
//     or glue (`_d`) is never a group, a box's specification `to` or `spread` and a dimension, and a last argument TeX takes
//     as one token that is a command it sets takes that command's own arguments with it, its groups of text and content
//     walked as before (\raise2pt\hbox{…}). #407's review: \vbox{…}\begin{center} was marked
//     \begin{\leavevmode\axtmark{0s}center} and the marked compile stopped. Of the corpus's 132 sources one changes:
//     2212.06817's \hbox{\includegraphics…}\label{…} key is no unit (432 -> 431), every other unit of it keeping its
//     hash. Every other paper's units and marked original (so its layout file), the wire and its reading back are 16's byte
//     for byte, the pack's 32 outputs among them: a copy of 16 carries every unit it holds the source of, matched by
//     sourceHash (live.mjs PIPELINE_CARRIES)
// 18: a marked original that stopped at its error limit, never reached the document's end, or has fewer pages than arXiv's
//     PDF is a failed compile, no layout (live.mjs ranThrough, layout/paper.mjs, page-pass.mjs): 2610.20713 (TL2025, xelatex
//     and nicematrix, its hundredth error after 7 of 15 pages) and 2608.03994 (751 errors TeX went past, 14 of 17 pages) had
//     each a layout of the pages it set, 95 and 97 % of their lines carried. Such a paper's bundle is now one with no layout,
//     under a new key (VTAG). Of 141 compiles counted against arXiv's PDF the other 139 have its count: every other
//     paper's units, marked original, layout file, wire and reading back are 17's byte for byte, and a copy of 17 carries
//     every unit it holds the source of (live.mjs PIPELINE_CARRIES)
// 19: the marked original must be the paper (the layout guard: layout/guard.mjs, layout/paper.mjs markedOfPaper; R1 of
//     2026-10-19). Before its compile a unit whose writing changes its file's brace balance is written as the paper's own
//     (2610.21377's three pgffor loop headers, written back with their body's brace doubled); after it a compile that did not
//     run through, whose page count is not arXiv's (where the host gives it), with a mark of ours where no text is set in a
//     file it wrote (2610.21201's etoc depth tags inside a \csname of its contents) or with more TeX errors than the unmarked
//     original's is compiled again with the units the evidence blames left the paper's own, or the babel names' marks off
//     (2610.21288's \appendixname under revtex4-2 and the appendix package), two compiles more at most; a paper of several
//     toplevel sources has its marked original compared with arXiv's first pages (2610.20030, which 18's page rule refused
//     outright); each part with no layout says why (BUNDLE 6, `layout: { refused, why }`). A paper whose marked original
//     passes every check is compiled as before, its marked original and layout file 18's byte for byte (the gate pack's 32
//     outputs); the units, the wire and its reading back are 18's, and a copy of 18 carries every unit it holds the source
//     of (live.mjs PIPELINE_CARRIES). Raised so that the bundle of a paper the guard now mends, or now records the refusal
//     of, is made again under a new key (VTAG)
// 20: no unit, and no mark, inside an argument TeX reads as syntax (E2 of 2026-10-19): a TeX value never takes a command
//     that reads arguments of its own (arg-roles.mjs readArgs: 2610.21765's \hrule then \vspace{0.5mm}, its length a unit
//     marked inside), the delimited forms only a package defines (arg-roles.mjs DELIMITED: pgffor's \foreach header in
//     2610.21377, etoc's \etocdepthtag.toc tag in 2610.21201), a unit's range holding the opening brace it ends with
//     (Builder.open), no assignment after a declaration that takes no argument or a command the table knows takes no
//     parameter (`{\bfseries 100}`'s digits text again: 2610.19159, 2608.11884, 2608.25210; `\S4 in` its section number
//     and word: 2608.15334, 2608.10073, 2608.16190, 2608.04242, 2608.08876, 2608.29558), a package's delimited form only
//     where its groups are (a \foreach over a macro's list read as before), and the commands that set no ink textless
//     (\label with cleveref's type, \bibliographystyle, \sethlcolor, \-; LAYOUT 10). Of 185 sources the units of those
//     twelve papers change (54 cut anew, 5 gone, 48 the same but for their pairs' numbers, found again by seedFrom); every
//     other paper's units, the wire and its reading back are 19's, the pack's 32 outputs among them: a copy of 19 carries
//     every unit it holds the source of (live.mjs PIPELINE_CARRIES)
// 21: a source's line ends read as TeX reads them (latex-front.mjs texText: web2c's input_line ends a line at a CR or an
//     LF, the LF of a CRLF with its CR), wherever the front end turns a file into TeX text, the guard's brace balance and
//     the probe's main file. A CRLF source's blank lines were no paragraph's end: 2610.10069v1's introduction (ten
//     paragraphs) and a whole proof (sixteen) were one unit each, its p23 drawn on p22. Of 180 papers 12 have a CR in a
//     source, and the units of four change: 2610.10069 (110 -> 193), 2608.10322 (70 -> 88), 2608.12096 (297 -> 304),
//     2608.02991 (278 -> 285, sn-jnl.cls's CRLF hid its author macros); 2608.12502's marked original alone, written with
//     LF. Every other paper's units and marked original, the wire and its reading back are 20's, the pack's 32 outputs
//     among them: a copy of 20 carries every unit it holds the source of (live.mjs PIPELINE_CARRIES), and a unit cut
//     anew, a CRLF file's paragraphs, is asked again
// 22: raised with TRANSLATE_VERSION 4 (the boundary rule: a styled pair whose two ends stand where the wire is cut
//     anyway keeps its markers, mt.mjs classOf), so that copies made before it are not taken whole: a copy of 21, and of
//     every pipeline before it, carries each unit whose wire the rule leaves as it was (mt.mjs boundaryChanges; live.mjs
//     PIPELINE_CARRIES): over 137 papers' sources 126 of 36,136 units, in 29 papers, are asked again. The units, the
//     marked original and the layout file are 21's byte for byte
// 23: raised with TRANSLATE_VERSION 5 (a display's own stop on the wire right after its marker, mt.mjs serialize's and
//     serializeTags' `own`), so that copies made before it are not taken whole: a copy of 22, and of every pipeline before
//     it, carries each unit whose wire the rule leaves as it was (mt.mjs displayStopChanges; live.mjs PIPELINE_CARRIES):
//     over 180 papers' sources 4,215 of 44,825 units, in 153 papers, are asked again. The units, the marked
//     original and the layout file are 22's byte for byte
// 24 (23 is the display stop's, #421): a unit's lines at a page break read by its own words (anchors.mjs placeWith: a
//     paragraph and its footnote whose marked ranges cross each keep the lines their matched words are on; inOrder: a
//     formula's row of no word of the unit's is held between its lines, not the walk's end), which the layout file's lines
//     and the left side's places read (LAYOUT 11): over 57 papers 10 LOST rows found and none lost, 5 units' lines changed
//     in 4 papers and 5 of 1,637 pages' left parts. The units, the wire and its reading back are 23's, the gate pack's 32
//     outputs' layouts among them: a copy of 23 carries every unit it holds the source of (live.mjs PIPELINE_CARRIES)
// 25: a package with no 00README has its toplevel sources guessed (source/paper-meta.mjs): every \documentclass file no
//     other file includes, that begins a document and whose class is not standalone or subfiles, is one (a file whose path
//     or basename an inclusion names is none). arXiv's AutoTeX compiles each and joins them, in the order of their paths as
//     observed on one paper (1008.0072v1), so with several the main file is the first path (no longer a preferred name or
//     the longer body), and its marked original is compared with arXiv's first pages (page-pass.mjs, layout/paper.mjs:
//     2610.20030's rule); a wrong order ends in the carry's refusal, as the page rule's before. 1008.0072v1,
//     a revtex4 paper and its supplement joined in arXiv's PDF (5 + 3 of 8 pages), had no layout, refused for 5 pages of 8.
//     Of 283 packages scanned one has two such files and no 00README (1008.0072v1), its main file the same under both
//     orders: the units, the wire and its reading back are 24's, and a copy of 24 carries every unit it holds the source
//     of (live.mjs PIPELINE_CARRIES). Raised so that such a paper's bundle, now with a layout, is made again under a new
//     key (VTAG)
// 26: a package with no 00README, whose compiler is guessed from its files (source/paper-meta.mjs: a source with no figure is
//     taken for pdflatex), is compiled by the compiler arXiv's PDF says made it where the host reads one (layout/guard.mjs
//     compilerOfPdf, markedOfPaper's `compilerOf`): a figure-less paper arXiv built with latex, dvips and Ghostscript (1007.0072v1,
//     Letter) was compiled by pdfTeX (A4) and its base page refused for its page box; it is now a `latex` compile to arXiv's page
//     size. The units, the wire and its reading back are 25's: a copy of 25 carries every unit it holds the source of
//     (live.mjs PIPELINE_CARRIES). Raised so that such a paper's bundle, now with a layout, is made again under a new key (VTAG)
export const PIPELINE_VERSION = '26'
/** the PDF.js the engine reads arXiv's PDF with, and the readers draw it with: the repository's pinned pdfjs-dist (a
 *  test holds the two equal). A layer bundle's geometry is measured with it, so its key names it */
export const PDFJS = '6.3.289'
/**
 * REMOVAL, how our page's ink a drawn unit replaces is taken away (the head's `versions.removal`, in the key: VTAG): 1 to 7 the
 * text-removed PDF (an add-on of removed pages appended to the base, swapped in where a unit is drawn; 6 chained over the
 * parts, 7 over our base page); 8 our page's own streams wrapped by optional content, each unit's ink in its own groups, which
 * the reader hides where it draws the unit (layout/wrap.mjs, docs/route/ocg-erasure.md): no add-on, no tail
 */
export const REMOVAL = '8'
