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
// 3: a sentence whose words change style goes out whole (mt.mjs planOf): a pair inside a sentence takes no marker (its
//    words translated with the sentence, its attribute lost: the endpoint gives no word alignment), same-style neighbours
//    are one span, a pair that holds whole sentences keeps its two markers, one around the unit's whole content goes
//    round the whole translation, a placeholder that sets no ink goes on no wire; a reply that lost every letter is
//    none (sent again as runs), a kept pair come back empty takes back the text set just outside it, and runs go whole
//    across a pair that went flat. 2610.19159: 55,261 markers -> 19,688, units whose wire cut a sentence at a style
//    marker 640 -> 0; the corpus's 124 papers: 1,753 -> 27, each at a link, kept a pair on purpose. A unit with no pair
//    and no such placeholder is sent as under 2, byte for byte
export const TRANSLATE_VERSION = '3'
