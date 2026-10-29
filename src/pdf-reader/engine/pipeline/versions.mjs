// The engine's versions a reader checks what it is given against, kept apart from the run (live.mjs, which re-exports
// PIPELINE_VERSION) so that a reader loads no part of it: the layer bundle (layer-proto/bundle.mjs) names them in its
// versions and its key. The layout file's (layout/file.mjs LAYOUT) stays beside its parser, which the readers load already.
// Imports the recogniser's version alone (core/ocr/version.ts: a string, no recogniser).
import { OCR_VERSION } from '../../../core/ocr/version.ts'

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
// 27: the source reader's text is what TeX sets (S1-S4 of 2026-10-24, latex-front.mjs): a paper macro whose body sets words of
//     its own is its expansion, one text piece whose source is the call (\newcommand{\nb}[1]{Notebook~#1}: 2610.21547 sent
//     "(4--6)"), never a pair around its argument; a file that is not UTF-8 has its text read in the input encoding its main
//     file declares (latin1, cp1252; latin1 where it declares none), not as UTF-8 (2610.20581's U+FFFDs); and a conditional TeX
//     closes with \fi gives the translator one branch where its own text decides it (\iftrue, \if 0), else, where both
//     branches hold words, neither (2610.21098's \ifdefined branches, one unit). Over 150 local sources 159 of 36,111 units
//     change, in 6 papers (S1 117 in three, S2 33 in one, S4 9 in two); every other unit is 26's, and so are the marked
//     original and the untranslated patch of every paper but the two whose units S1 or S4 changed. A copy of 26 carries every unit it holds the source of, matched by sourceHash (live.mjs PIPELINE_CARRIES), and a changed
//     unit, whose hash is new, is asked again
// 28: a command whose argument is a unit of its own takes what its definition takes, and a group after it is the text's
//     (latex-front.mjs argsOfForm, unitForm): a heading a star, a short title and one title, a caption, a footnote, a \thanks, a
//     \title and an author block an optional argument and their text, the paper's own definition's arity where it gives one;
//     \multicolumn, \multirow, \makecell and \shortstack the arguments the role table gives them. Read as `up to two groups`, the
//     stray `{` after 2610.31660v1's \subsection{Approaches to determining $H_0$}, closed 330 lines later, was the heading's
//     second argument, and §II.A to mid-§IV had no unit: 57 units, now 126. Over 167 local sources (157 papers, 40,182 units)
//     2 units' hashes change, in one paper (2607.24653v2: a \multirow[c]{3}{w}[-2pt]{…} of five arguments is now read whole,
//     and the pairs after it are numbered one on, their texts the same); every other unit is 27's. A copy of 27 carries
//     every unit it holds the source of, matched by sourceHash (live.mjs PIPELINE_CARRIES), and a changed unit is asked again
// 29: a bibliography's entries are units (latex-front.mjs bibliography; the content classes' stage 4, docs/route/orphan-text.md):
//     each \\bibitem's names, its first block, a unit of kind `refnames` (class names), and the rest one of kind `reference`
//     (class references), from the paper's thebibliography or the .bbl its package holds, which \\bibliography now reads; an
//     entry's numbers placeholders (keepNumbers), \\newblock and IEEEtran's spacing declarations no argument's takers; and a number
//     TeX reads ends where TeX ends it (rules/arg-roles.mjs's value reader: `\\penalty0` at a line's end took the next line's
//     digits, as natbib's bibliographies write it between a volume and its pages). No other unit of the classes gate's 32 papers changes its
//     cutting, kind or text (lab/pdf/records/classes-gate.md), but the ids of the units after a bibliography (an appendix's),
//     which move up past its entries; raised with TRANSLATE_VERSION 6 (the author block sent for every target)
//     And in the same unreleased 29 (PDF-READER §19.14): the structural names a paper's TeX prints that no package names in
//     every target are units of their own, after the source's in its bundle (source/paper-names.mjs, units.mjs bundleUnitsOf:
//     kind `name`, one text piece): its theorem-like environments' printed names, the reference names it gives cleveref,
//     thmtools and \autoref, and, where it calls cleveref or \autoref, the counter types' English names and the conjunctions'
//     words some target has no package word for (rules/tex-names.mjs NAME_GAPS, CONJUNCTION_GAPS). Translated with the
//     paper's units, the first batch's (rows.mjs batchesOf, runRows), cached by their text as any unit; the layer draws a
//     head's or a generated reference's name in that translation where no package gives the target one. Over 168 local
//     sources 923 name units in 85 papers (32 at most; 19 papers call cleveref or \autoref); they change no source unit.
//     And in the same unreleased 29 (the release sweep of 2026-10-25): a front matter command's optional arguments after its
//     text are the command's (latex-front.mjs frontArgs), as its class reads them by looking past the text: the Elsevier
//     classes' and ceurart's \author[1]{Name}[orcid=…], read short by 28's form, made the bracket a unit of its own, whose start
//     mark stood between the call and the option, so that the class set the option as text and 2610.21084v1's marked original
//     ran to 50 pages against arXiv's 49, refused whole (its names marks' fallback could not reach it: no mark of the names'
//     was at fault, nor any the errors blamed). Over 157 local sources two papers' units change (2610.21084v1's three
//     [orcid=…] and 2608.12096's two [email=…] gone), every other unit's hash kept; the marked compile of the gate pack's 7
//     papers and the 25 of lab/pdf/data/layout makes arXiv's pages on every one TeX compiles
// 30 (the content classes' coverage, shared, unreleased; the owner's rulings of 2026-10-28: the references and the author names
//     decoupled, each its own toggle's): a bibliography's entry is one unit of kind `reference`, whole, its names its own (no
//     `refnames` unit: latex-front.mjs bibliography); an author block's affiliations, institutions, addresses and e-mail line
//     are units of their own, kind `affiliation`, always translated, numbered after the source's other units and before the
//     entries (frontBlock, entriesLast; its names kind `author` keep the block's number); \\bibliography ends the unit before
//     it whether the .bbl is there or not, so that a paper's units are the same before BibTeX writes its .bbl and after
//     (layout/paper.mjs madeBibliography: the job's .bbl the prepare's first pass makes is a shipped one); and a macro's body
//     is no unit where a .sty or a .cls defines it (storedBodies: a class's own \\maketitle, jcappub's), an author block's
//     unit of a macro called once marked in its definition (2609.20976v1's \\affiliation[a]{\\CU}); 31 (the units a paper's
//     bundle holds after its source units are units too: its ink units and figure units, which the wrap cuts of our pages, their
//     number, kinds and pieces, are what a translation is stored for and found again by, the output identity naming PIPELINE and not
//     LAYOUT): LAYOUT 23 changed the ink units' pieces (their style groups) and LAYOUT 25 their cut (a list's entry one unit at
//     its leading, 2610.19274v1's 68 to 32; a formula's script its placeholder's; a head's or an entry's number in its own words
//     the unit's, a folio alone the page's own ink: 2010.11929v2's "ICLR 2021"), both under PIPELINE 30, so that a translation
//     stored for the old ink units could be given to the new ones; every paper is translated again. The unit-cut golden holds
//     the ink units' and the figure units' cut beside the source units' (tests/pdf-reader/unit-cut.test.ts); and in the same 31,
//     a letter command of the kernel's (\\L, \\o, \\ss, \\ae, \\aa…) is the letter itself in its word, the spaces TeX skips
//     after it, an empty group after it and a group around it alone none of the text (latex-front.mjs letterCommand): it went
//     out as a marker, and the same paper's `{\\L}ukasz Kaiser` came back as "Ł ukasz Kaiser"; an \\ifmmode in a paragraph's text
//     is its \\else, one letter there in its word (ifmmodeLetter: REVTeX's `Louren\\ifmmode~\\mbox{\\c{c}}\\else \\c{c}\\fi{}o`, read
//     as "Louren ç ç o"), its first branch no text; the pairs such a span held spend their ids as before (pairsOf). In the same release
//     the left side's marks gain the figure units' (pipeline/ink-pass.mjs figureAnchors: arXiv's tokens in a level label's band),
//     so that a figure's label lights its original on hover (the owner's report on 2010.11929v2 p9, the follow-up of #487).
//     And a change of what is sent in the same unreleased 31, which moves no constant: a TikZ picture's texts (the front end's
//     units of kind `figure`, latex-front.mjs tikzText), which own no glyph and no group and were never drawn, are asked for no
//     more, the figure ink units translating the picture's glyphs once (layer-proto/rows.mjs TIKZ_KIND, PDF-READER §19.12);
//     an ink unit that echoed one is translated itself. Every bundle is byte for byte as it was, every unit's cut and wire and
//     every request's shape too: only the plan, the units toTranslate and layerIds name, is smaller; 32 (the release sweep of
//     staging 4b3c4ae9, engine a30a53ba, 31 counted released): a .bib the bibliography's pass wrote itself is no .bib the paper
//     lacks (layout/paper.mjs bibMissing: REVTeX 4.x's <job>Notes.bib, named in \\bibdata before the paper's own), so a REVTeX
//     paper that ships its .bib and no .bbl has its entries units of kind `reference`, one an entry, where its bibliography was
//     text no unit owned (2610.20595v1's 56 entries, 2610.21770v1's 61); an ink unit's hanging line is measured from its
//     paragraph's first line only where the block begins on it (layout/ledger.mjs `opens`, layout/ink-units.mjs: a block from a
//     column's top had every next entry of an orphan bibliography joined to it, a column one unit, since #487's PARA_DY); and an
//     author block's row set in a \\centerline is its text (latex-front.mjs FRONT_BOXES: 2010.11929v2's block no unit before, its
//     names, notes and places one ink unit of orphan text), each unit it cuts numbered after the others, so that no unit before
//     the entries moves; every paper is translated again; 33 (the coverage lane of batch 2, the release sweep of staging
//     4b3c4ae9): a web address's `%` is a character where TeX reads it so (latex-front.mjs urlPercents: \url, \path, \nolinkurl,
//     \burl and \href's first argument outside another command's argument), so that the rest of its line is text again and a
//     .bbl's entries after such an address are entries of their own (2610.21770v1's 18, 2608.18626's 31); an inline \tikz call is
//     one placeholder to its path's `;` or its group (tikzCallEnd: 2010.11929v2's legend dots were \tikz, \fill and the path sent
//     as text); a paper's macro of no argument whose body ends a table's row ends the row in a cell (rowEndsOf: 2610.21924v1's
//     \tightrow, 30 cells); an author block's row ends inside a conditional are no rows (frontEnds); and a made .bbl is kept for an
//     entry that runs over another \bibitem, no longer for one of no words (layout/paper.mjs madeBibliography: 2608.25210v2's
//     four web pages kept its 64 entries no unit's): every paper is translated again
export const PIPELINE_VERSION = '33'
/** the PDF.js the engine reads arXiv's PDF with, and the readers draw it with: the repository's pinned pdfjs-dist (a
 *  test holds the two equal). A layer bundle's geometry is measured with it, so its key names it */
export const PDFJS = '6.3.289'
/**
 * REMOVAL, how our page's ink a drawn unit replaces is taken away (the head's `versions.removal`, in the key: VTAG): 1 to 7 the
 * text-removed PDF (an add-on of removed pages appended to the base, swapped in where a unit is drawn; 6 chained over the
 * parts, 7 over our base page); 8 our page's own streams wrapped by optional content, each unit's ink in its own groups, which
 * the reader hides where it draws the unit (layout/wrap.mjs, docs/route/ocg-erasure.md): no add-on, no tail; 9 (the sweep of
 * 2026-10-24, its units left English though their ink could be owned): a soft mask's content no ink of the page's (remove.mjs
 * alignOf, ink.mjs indices), a title read back past its own placeholders' points, a mark's name read in lower case, a cell's
 * lead macro owned where it abuts the cell, the spell check blind to spacing accents and dotless letters, and the
 * erasure's reading of the placeholders (stream.mjs ownedOf `erasure`): the base's bytes change, the layouts do not; 10 (the
 * release sweep of 2026-10-24): a label's name followed by a letter and a number is a label (own.mjs LABEL_FORM: "Table S3:",
 * "Figure A1", which were left the original's ink, `labelKept`), and the delta's proof reads a direct value of the catalog by
 * its references' numbers (delta.mjs sameDirect: 2610.20030's direct /Names failed it, and its base of 8 pages of 12, which
 * only a delta holds, was refused): the base's bytes and the head's base change; and (its units newly English against
 * production, all `unhidden`) the text after a placeholder told where it runs exactly to its unit's next mark (a display's
 * \text, a URL's dots), a display that ends a footnote owned to its page's folio, an opening point TeX set inside another
 * unit's range owning nothing of it (a run-in heading), a title its class sets again (acmart) its first occurrence, the
 * closing punctuation a theorem's head sets after its note the note's (amsthm's "(Note)."), and the
 * spell check's letter symbols, a wrapper's own words and lines of their own no unit's (REVTeX's e-mail notes, a folio): the
 * base's bytes change, and the first two rules being the maker's reading too, the layout files of the units they reach
 * (LAYOUT 20); and a cell's lead owned by the text TeX sets for it, as the probe reads it (marks.mjs readInkTexts, MARKS_SCHEMA
 * 10: "1,024", "max_tokens", a formula's glyph spelled by no character one glyph: own.mjs MR 5b), and a front heading's ink
 * (ICML's \icmltitle), which the layout compile now marks (LAYOUT 20); 11 (the structural names, PDF-READER §19.11): a
 * theorem's head before its note, the bracket it opens the note with ("Definition 5.1 (", a unit the front end read in a head's
 * brackets), and the joint a head sets after the babel name that leads its unit (amsthm's "." after "Proof") are their units'
 * labels (own.mjs isLabelForm's `note`, JOINT), each in its unit's label group, where they were left the original's ink in no
 * group (`labelKept`), so that the layer draws them in the target's names: the base's bytes and the head's `labelKept` change,
 * the layout files and the units do not (over 25 local papers labelKept 298 → 96, 202 labels newly in their groups;
 * 2610.18513v1 100 → 23; every other wrap count, and every page of every group shown, as before: the ocg gate); and in the
 * same unreleased 11 (docs/route/orphan-text.md, stage 2) the ink units' glyphs, text no source unit owns made units of our
 * own glyphs (layout/ink-units.mjs), wrapped in groups of their own, `u<id>` and `u<id>.p` from the source units' count on:
 * the base's bytes change where a page holds such text; and in the same unreleased 11 (the content class `figures`,
 * stage 5, PDF-READER §19.12) each figure unit's ink (layout/figure-text.mjs) its own group, `f<k>`, its runs wrapped where they
 * are shown — in the page's stream, or in the stream of the form XObject an included PDF is, that form written again once with
 * /Properties of its own (layout/wrap.mjs wrapPage, proveForm) —, and a font with no Unicode a reader can trust leaving its figure
 * the original's (remove.mjs unicodeOf): the base's bytes change where a figure has text; 12 (2609.20976v1, shared with the
 * other owners of this release): a macro TeX said sets no ink (the marks file's `marking.inkless`, wrapFinal's `inkless`, as the
 * maker reads it) is no placeholder of ink in own.mjs, so that a unit that opens with one (a title in `\boldmath`) opens with its
 * text and its lead's lines of their own are released (JCAP's header line had left the title the original's, `spell`); and an
 * opening point alone at its unit's end, no display, owns its lines up to TeX's skip before another block, no further
 * (stream.mjs lineEnd, BLOCK_GAP of the page's line pitch: the last author's `\orcidlink` had owned the affiliations and the
 * e-mail below the names, to the abstract's label, which no ink unit then made a unit of; at a bibliography's leading a wrapped
 * `\Eprint` keeps every line it held): the base's bytes change where a paper has either; 13 (the coverage lane of batch 2): a
 * closed piece's first glyph is its text's where it is the punctuation mark the piece's command set before its own ink (stream.mjs
 * ownedOf, marks.mjs followsOf `moved`: cite.sty's superscripts set `\cite{x}.` as ".¹", now marked around the pair, MARKS_SCHEMA
 * 14), so that the piece's group holds the superscript alone and the mark is in its unit's text group: the base's bytes change
 * where a paper has such a pair
 */
export const REMOVAL = '13'
/**
 * OCR, the recogniser the bitmap figures' labels were read with (PDF-READER §19.15, the head's `versions.ocr`, in the key: VTAG's
 * `-o`): the extension's own version of it (core/ocr/version.ts OCR_VERSION: the model files, eSearch-OCR's version and anything
 * of the shared recognise.ts and geometry.ts that changes what a figure is read as), written as a version token (its other
 * characters points), so that a layer read by another recogniser is made again rather than found. Raised with OCR_VERSION alone
 */
export const OCR = OCR_VERSION.replace(/[^0-9A-Za-z.]/g, '.')
