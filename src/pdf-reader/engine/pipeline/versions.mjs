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
//     are units of their own, kind `affiliation`, always translated (the names toggle's from 2026-10-30, no version: the
//     class is the reader's, of the kind), numbered after the source's other units and before the
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
//     4b3c4ae9): a web address's `%` in a .bbl's entries is a character, as TeX reads it (latex-front.mjs urlPercents: \url, \path,
//     \nolinkurl, \burl and \href's first argument at an entry's top level; the body's `%` a comment as before), so that the
//     entries after such an address are entries of their own (2610.21770v1's 18, 2608.18626's 31); an inline \tikz call is
//     one placeholder to its path's `;` or its group (tikzCallEnd: 2010.11929v2's legend dots were \tikz, \fill and the path sent
//     as text); a paper's macro of no argument whose body ends a table's row ends the row in a cell (rowEndsOf: 2610.21924v1's
//     \tightrow, 30 cells); an author block's row ends inside a conditional are no rows (frontEnds); and a made .bbl is kept for an
//     entry that runs over another \bibitem, no longer for one of no words (layout/paper.mjs madeBibliography: 2608.25210v2's
//     four web pages kept its 64 entries no unit's): every paper is translated again; 34 (batch 2's ink lane): a stop that
//     abuts the formula before it at a contents line's end is the entry's, no leader dot (layout/ink-units.mjs trimmed: a leader is a word a word's gap from the one
//     before it, 2610.19274v1's list of figures, "… strength $C_n^2$.", whose stop was left the original's beside the drawn entry),
//     and two words of an ink unit's line are joined by a space only where a word's gap stands between them (no "⟦C⟧ ." for a
//     formula's stop, no "⟦x⟧ -axis"): the ink units' texts move where either stands; 35 (the owner's case 2610.37668v1): under
//     backref's lists (hyperref's pagebackref), the unit that ends each entry's first paragraph ends in the list's placeholder
//     (latex-front.mjs BACKREF_LIST), so that the list TeX sets after the entry is that unit's ink: every such paper's entries are
//     translated again; 36 with TRANSLATE_VERSION 8 (a run-in label past a unit's head keeps its markers on the wire), so that no
//     stored copy of 7's is taken for one of 8's; 37 (the owner's case 2610.35877v1): a biblatex bibliography's entries are units,
//     kind `inkreferences`, one an entry, cut by the compile's points before each (marks.mjs POINTS_TEX `bi<n>`, layout/ledger.mjs
//     `entry`), the references' class, where they were orphan text in ink units of their own grouping, always translated, its
//     heading run into the first: every such paper's bibliography is translated again; 38 with TRANSLATE_VERSION 9 (a caption cut
//     into sentences on the tags wire), so that no stored copy of 8's is taken for one of 9's; 39 (the owner's ruling of
//     2026-10-30, the names toggle the whole author block, and his case 2610.35877v1): a unit cut inside an author block is the
//     block's, its names or its places as frontBlock cuts them, whatever environment TeX sets it in (latex-front.mjs blockKind): a
//     tabular's cells there (2610.35877v1's two names, 2608.06007v1's row of places, 2610.22214v1's block) are units of kind
//     author or affiliation, each at its number with its text, no table's cell and no table's kept name, where they were cells
//     of the tables' toggle; 3 of the 190 sources on disk, 8 units, every other unit and every kept name as it was; 40 (the
//     owner's report on 1810.04805v2, 2026-10-30: hovering lit nothing on Appendix C's page, nor §3.1's heading and "Task #1"):
//     the left changes, no unit. A unit without marks is searched between its marked neighbours in the order TeX sets the text
//     (latex-front.mjs entriesLast's `texOrder`, anchors.mjs orderOf), never the units' numbers' (the bibliography's entries
//     numbered after an appendix were its last paragraphs' next neighbour, pages before them: an empty window); and a marked
//     unit over a page break owns on each page its own lines alone (anchors.mjs rangeOnPages: a footnote over pages 3 and 4
//     owned page 4's column, and the headings matched there were the footnote's). Over 70 papers (the 63 cached layers' and the
//     gate pack's 7, the production pass on both engines): 17,804 units located on the left of 1,868 pages, 18,383 now, none
//     lost but two cells that moved to the page they are on (2010.11929v2's 296, 297, from page 13 to 22); the maker lays 34
//     more units on 7 papers (none in the pack, whose made files are byte for byte the same). Every unit, its pieces and its wire
//     are 39's: a copy of 39 carries every unit (live.mjs PIPELINE_CARRIES); 41 with BUNDLE 12 (the moved pages' line map, the
//     owner's ruling of 2026-10-30): the left part of every page the line check read and drew carries our lines that stand elsewhere
//     on arXiv's page (pipeline/moved-lines.mjs, layer-proto/format.mjs `lines`), so that the reader tells a moved page's blocks by
//     their boxes carried onto arXiv's page as it tells a page in place (view/shapes.mjs), and a page the check found in place by
//     its boxes whatever ink its tokens give; a page has a list only where 90 % of its lines found a partner (moved-lines.mjs
//     MAP_FOUND, #524's review). Over the same 70 papers (the production pass on both engines, 1 873 pages): the 21 pages moved
//     (1810.04805v2's 16 among them) light 541 of their 542 items on the left, 439 before; one-sided items on every
//     page 123 -> 7, each a display line whose word before the formula is lit and the blank between not; the units located on
//     the left and laid are 40's (18 383 located), every units chunk 40's but its version; the bundles +0.54 % gzipped. Every
//     unit, its pieces and its wire are 40's: a copy of 40 carries every unit (live.mjs PIPELINE_CARRIES); 42 (the owner's ruling of 2026-10-30, the text no
//     block owns lights as one block on both panes): the text no unit owns once the ink units have claimed theirs — a code
//     listing, an address or a URL alone in a note, a page number, a bibliography not cut into entries — is kept blocks, ink units
//     of the KEPT flag after the others (layout/ink-units.mjs rule 10, keptUnitsOf: a run of such lines in TeX's stream with
//     nothing a unit owns between them, in one column and one class), no pieces, never translated nor awaited (rows.mjs
//     toTranslate), on the left by their lines' tokens and in the layout by their lines' boxes alone; their glyphs in no group, so
//     that our wrapped page and its ledger are as they were. A figure unit's id moves past them (its translation found again by
//     its source, cache.mjs seedFrom). Over the 54 papers of the release sweep: 1,920 blocks of 5,871 lines on 49 papers, the
//     bundle 0.6 % larger (a paper's median 0.22 %, 2610.19159v1's agent logs 3.9 %); arXiv's lines no block lit 5,399 -> 1,357. Every other unit, its pieces and its wire
//     are 41's: a copy of 41 carries every unit (live.mjs PIPELINE_CARRIES); 43 (the marks at their source, 2026-10-31: every
//     compile the layout guard added on the new papers of 2026-10-27 to 30 came from our marks): a mark of ours a file TeX wrote
//     holds is judged by what TeX did with it (layout/guard.mjs copiesOutOfPlace: where the compile is otherwise the paper's and TeX
//     wrote the PDF itself, whose log names every destination set twice, it was set once where its unit's text is, twice and
//     dropped by the reading, or never), so that enotez's endnotes printed from the aux (2609.36054v2's 16 notes, English before),
//     jmlr's discarded \jmlr@author and elsarticle's \emailauthor (2610.21201v1, 2610.21084v1, 2610.20848v1) cost no compile
//     more; and the mark probe reads the main file's preamble as the marked original writes it (live.mjs markedPreamble), the
//     units TeX's errors stand at there left unmarked before the marked compile (guard.mjs preambleUnits: 2610.37668v1's myarxiv
//     \author, a name's initials through a \csname, two compiles more before); and a unit whose paragraphs TeX set in two
//     alignments tells none (marks.mjs readAlign: a copy's, or acmart's title and authors set again in its reference block,
//     2608.25210v2's and 2610.22065v1's flags, no line moved). Over 72 papers the other 65's guard, layout file and base page are
//     42's byte for byte, the gate pack's 7 among them. Raised so that the bundle of a paper whose marked original now stands at
//     once is made again under a new key (VTAG). Every unit, its pieces and its wire are 42's: a copy of 42 carries every unit
//     (live.mjs PIPELINE_CARRIES); 44 (the driver's group, 2026-10-31): the final pass begins with hooks that switch off the
//     transparency group graphics-def's pdftex.def 1.2d and luatex.def 1.2f (8d691483be, 2025-09-20) write on every included PDF,
//     which arXiv's TeX Live 2025, the state of 2025-08-03, predates (live.mjs NO_DRIVER_GROUP, layout/paper.mjs finalPass): our
//     figure forms are arXiv's again, which the delta copies (2610.30034v1's base a proved delta of 196,579 bytes, its 5.46 MB
//     shipped whole before; 2610.30875v1's 3.73 MB delta 0.30 MB) and poppler draws as arXiv's. The base's bytes change where a
//     TeX Live 2025 paper compiled by pdfLaTeX or LuaLaTeX includes a PDF, and nowhere else (TeX Live 2023, XeLaTeX, latex: byte
//     for byte); the marked compile and the source units do not. A unit cut moves with it: PDF.js gives a grouped form no box to
//     clip by, so layout/ink.mjs read a figure's text past its form's BBox, and the wrap cut figure units of that text, which no
//     page shows (the gate pack: 1512.03385v1's figures 181 -> 176 units, 2608.04322v1's 237 -> 218; the lane's six papers'
//     maker units byte for byte). A stored translation is found by an identity naming the pipeline, and its rows by their units'
//     ids, so a translation of the old cut must not be given to the new one (PDF-READER §18.3). Raised so; and so that a bundle
//     made over a base with the group is made again under a new key (VTAG). Every source unit, its pieces and its wire are 43's: a
//     copy of 43 carries every unit (live.mjs PIPELINE_CARRIES), a figure unit found again by its source (cache.mjs seedFrom); 45
//     (xy-pic's diagram, 2026-11-01): the front end keeps a `\begin{xy}…\end{xy}` as the paper has it, a drawing whose body
//     xy-pic reads with its own parser, as it keeps a TikZ or PSTricks picture (latex-front.mjs SKIP_ENVS). 2610.21884v1's four
//     table cells of xy-pic syntax were units, our marks in them 46 TeX errors, and the guard spent two compiles (the unmarked
//     original's, then the attempt) finding them the paper's own; its marked original now stands at once. Of 215 local sources
//     it is the one that begins an xy environment: the other 214's units are 44's hash for hash, and its own lose the four
//     cells, the 20 after them in its file the same but for their pairs' numbers. Raised so; and so that the bundle of a paper
//     whose marked original now stands at once is made again under a new key (VTAG). A copy of 44 carries every unit it holds
//     the source of (live.mjs PIPELINE_CARRIES), a unit renumbered by the cells' pairs found again (cache.mjs seedFrom);
// 46 (the release sweep of 6e0a8d1c, 2026-11-01): a glyph set turned is cut by the clip in force where its own ink passes it, as
//     a level glyph is (layout/ink.mjs turnedGlyph: its outline across its advance, its outline's bottom to its top, else its
//     font's band), not where a box of its whole size on both sides of its baseline would. Under 44 the form's box clips a
//     figure's text (PDF.js gives a form with no group its BBox), and the old box read every y-axis title, colour bar's title and
//     slanted tick label set at its figure's edge (matplotlib's tight box) as cut: 45 figure units of 9 papers of the sweep, 40 of
//     them translated before, were the original's again though arXiv's page shows them whole (2610.35877v1 p8, 2610.22065v1 p3,
//     2610.17108v1 p4), and the measure 44 named (the gate pack's 1512.03385v1 181 -> 176, 2608.04322v1 237 -> 218) was these
//     titles, not text past the box. Every unit 44 lost is a unit again; a glyph whose ink the box does cut stays the original's
//     (2610.21312v1 p12's "Spearman(lr_std, bulk1)", 2610.22065v1 p3's "Relative Accuracy Drop (%"). The figure units' cut
//     moves, so the rows' identities: raised so. Every source unit, its pieces and its wire are 45's: a copy of 45 carries every
//     unit (live.mjs PIPELINE_CARRIES), a figure unit found again by its source (cache.mjs seedFrom)
export const PIPELINE_VERSION = '46'
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
 * where a paper has such a pair; 14 (batch 2's ink lane, #117): a unit's text owns the rules TeX painted on its own lines, as it owns its glyphs (own.mjs MR 2b, lineRulesOf: thin across, on a baseline
 * of its glyphs, within their extent, no part of a frame), and an ink unit's lines take theirs too (ink-units.mjs claimInk): an
 * OT1 \_ is a rule, no glyph, and its three stood under 1512.03385v1's translated Table 1 caption (2610.19159v1's 95,
 * 2610.21924v1's 150 in its tables' cells), an \underline's line under its translation: the base's bytes change where a unit's
 * text has one; 15 (2610.37668v1's "Abstract", the owner's report on staging): a level figure unit on its column's edge, or
 * centred in it, is anchored there by the column's text lines (figure-text.mjs columnAnchorOf), no longer by the ink beside
 * it alone, which read a heading a class sets flush in a boxed panel `centre`: the parts' figure rows change where a unit's
 * anchor does, the base's bytes do not; 16 (the owner's case 2610.37668v1): backref's list after an entry is its list piece's own
 * ink (`u<id>.p`), between the marks LAYOUT_TEX's hook sets around it (marks.mjs BACKREF_TEX), where it was no one's: the base's
 * bytes change where a paper turns backref's lists on; 17 (the owner's case 2610.35877v1): a biblatex entry's ink its unit's
 * groups (an ink unit of kind `inkreferences`, ink-units.mjs claimInk), the point before each a rendering intent in our page
 * (marks.mjs POINTS_TEX `bi<n>`): the base's bytes change where a paper loads biblatex
 */
export const REMOVAL = '17'
