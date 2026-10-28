// The translation rules' identity (the rules-as-data plan, §1 and §9.1). Apart from the extraction's (versions.mjs
// PIPELINE_VERSION) and the layout's (rules/layout.mjs RULES_SCHEMA and the set's version): a change of what is sent to a
// translator or of how its reply becomes a row is neither a new bundle nor a new drawing, and each kind names its own.
// Imports nothing: the web names it in its translation identity and the extension in its rows cache, from here.

/**
 * TRANSLATE_VERSION: raised with any change to what a language's translation holds, given the same units — what is sent
 * for a unit and how what comes back is read:
 * - the wire (mt.mjs `serialize`, `serializeTags`, `escape`, `texEscape`, the batch sizes and `batchOf`), and the
 *   reading back of a reply (`rehydrate`, strict and tolerant, `rehydrateTags`, `sentencesOf`) with the fallbacks of
 *   `translateUnits` (a unit that fails is sent again as runs);
 * - which units a language sends (keptFor, `authorsTranslated` in kept.mjs) and how a table's cells are decided after the
 *   answer (groups.mjs `decideGroups`, `NAMES_SHARE`), which batches are made (rows.mjs `batchesOf`), and the paper's
 *   context sent with every batch, which each reader builds (the extension's `paperContext`, session/translate.mjs; the web's
 *   own: it cuts the abstract as the HTML page does, which the engine does not hold).
 *
 * It enters the web's translation identity and the extension's rows cache, so that rows made under another are
 * translated again on open; it enters no bundle's key (bundle.mjs VTAG): a bundle holds the units, which none of this
 * reaches. The per-text cache holds the translator's raw answer to a text, which none of this changes either, so only
 * the texts that changed are asked of the translator again. A change that also changes a unit's cutting, kind or text
 * raises PIPELINE_VERSION too (a change that touches two kinds bumps both, §9.2).
 *
 * Until the rows cache replaces session.mjs's copies (Stage 5, Task 10) a copy is judged by PIPELINE_VERSION alone, so a
 * change here that must void copies raises PIPELINE_VERSION with it.
 */
// 2: a formula split across inline formulas goes out as one marker, read back as its own pieces in their order (mt.mjs
//    formulaRuns): 16 runs in 3 of the corpus's 124 papers, whose units' wires change; every other unit's is 1's
// 3: a sentence whose words change style goes out whole (mt.mjs planOf): a pair that sets a style and nothing else, inside
//    a sentence, takes no marker (its words translated with the sentence, its attribute lost: the endpoint gives no word
//    alignment); same-style neighbours are one span; a style pair that holds whole sentences, or a run-in label, keeps its
//    two markers, and so does every other pair (a link, a box, a cell, a macro of the paper's), as under 2; one around the
//    unit's whole content goes round the whole translation; a placeholder that sets no ink goes on no wire (beside one
//    with ink, in its marker), a fill or a skip stays a marker; a reply with no letter or digit is none (sent again as
//    runs), a kept pair come back empty takes back the words set just outside it to their sentence's end, and runs go
//    whole across a pair that went flat. 2610.19159: 55,261 markers -> 19,557, units whose wire cut a sentence at a
//    marker 640 -> 5; the corpus's 124 papers: 1,753 -> 222 (70
//    cuts at run-in labels, the rest at pairs that keep their markers as under 2). A unit with no pair and no such
//    placeholder is sent as under 2, byte for byte
// 4: a styled pair whose two ends both stand where the wire is cut anyway (a forced break, a display or an item beside it,
//    never an inline formula, which the translator moves as a word; a kept or enclosing pair's edge with white space alone
//    between; the unit's own end) keeps its two markers (mt.mjs classOf's boundary rule,
//    E1 of 2026-10-19): they cut nothing the endpoint does not cut already (2610.19159's `\textit{Floor (must clear):}
//    \textcolor{red}{...}`, whose colour went flat at a colon that starts no sentence). Over 137 papers' sources 126 of
//    36,136 units, in 29 papers, change their wire (mt.mjs boundaryChanges tells exactly those); every other unit's is 3's
//    byte for byte, its text answered by the per-text cache
// 5: a display's own punctuation (the stop, comma, semicolon or colon its sentence has inside it, before `\end{equation}`
//    or `\]`, past a label, a tag, `\nonumber`, `\qedhere`, a space of TeX's or an inner math environment's end:
//    mt.mjs displayStop) goes on the wire right after the display's marker or tag (`yields @a#. Prices`), unless the text
//    after the display begins with punctuation of its own; the reply's marks right after the marker are taken off on
//    reading back (the display's crop draws its own), one right before it is the reply's, and sentencesOf counts the stop
//    nowhere. 2610.10069's `yields @q# Prices` ran on into the next sentence, and "yields" came back as a noun; in
//    Microsoft's recorded Chinese answers no display of a sentence that ends at it had its sentence cut there (0 of 444),
//    where a marker before `. ` and a capital is cut every time (1,357 of 1,357), and no mark the wire set after a marker
//    came back moved before it (0 of 4,825). Over 180 papers' sources 4,215 of 44,825 units, in 153 papers, change their
//    wire (mt.mjs displayStopChanges tells exactly those); every other unit's is 4's byte for byte, and a reply that keeps
//    the stop is read back to 4's pieces
// 6: every content class is translated once, whatever the language (the owner, 2026-10-25; rules/content-classes.mjs): the
//    author block's names and places are sent for every target, not only where its script writes names its own way
//    (layer-proto/rows.mjs toTranslate, layerRows), and a bibliography entry's units (PIPELINE 29) with them; a reader's
//    toggles show or hide them. Every other unit's wire is 5's byte for byte
// (No version since 6: a reply holding a numeric entity past U+10FFFF, whose reading threw and stopped the run, is read with
// that entity as it stands, as the background's decoder reads it (mt.mjs decode); every reply read before is read the same,
// and none was read so before. A TikZ picture's texts no longer sent is the plan's, not the wire's: versions.mjs, PIPELINE 31)
export const TRANSLATE_VERSION = '6'
