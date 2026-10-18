// The engine's versions a reader checks what it is given against, kept apart from the run (live.mjs, which re-exports
// PIPELINE_VERSION) so that a reader loads no part of it: the layer bundle (layer-proto/bundle.mjs) names them in its
// versions and its key. The layout file's (layout/file.mjs LAYOUT) and the remover's (layout/addon-manifest.mjs REMOVAL)
// stay beside their parsers, which the readers load already. Imports nothing.

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
export const PIPELINE_VERSION = '16'
/** the PDF.js the engine reads arXiv's PDF with, and the readers draw it with: the repository's pinned pdfjs-dist (a
 *  test holds the two equal). A layer bundle's geometry is measured with it, so its key names it */
export const PDFJS = '6.3.289'
