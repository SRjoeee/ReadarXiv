// lab/pdf/spikes/carries.mjs
// Which translations a fixture's record made under an earlier pipeline carries into a record of this one's cut, unit by unit
// (layer-fixtures.mjs seededRecord): the per-unit test the engine's stored copies were carried by (live.mjs PIPELINE_CARRIES,
// until the compiled translation and its copies were taken out of the engine on 2026-11-04, the rules audit's F4). A unit cut
// otherwise has a new hash and no seed (cache.mjs seedFrom), and is sent again. The pack's records were made under pipeline 18,
// so a remake carries their translations by 18's test. From 39 on no pipeline changed what is sent for a unit or how a reply is
// read back unit by unit (a change of the wire is TRANSLATE_VERSION's, docs/PDF-READER.md §18), and every one carried every
// unit: a record of 39 or later carries every unit whose source it holds (carriesOf). 30 to 38 carry nothing, as they did.
import { boundaryChanges, displayStop, displayStopChanges, formulaRuns, holdsStyle, holdsUnbalanced, utf8 } from '../../../src/pdf-reader/engine/translate/mt.mjs'

/**
 * The earlier pipelines whose translations carry over into this one, unit by unit,
 * each with the test a unit's translation must pass, given its pieces and, where the caller has it, the unit it is of:
 * DESIGN §5.5's rule for the HTML page's cache, here per unit — a version voids only what its change can reach. A unit
 * one pipeline cuts otherwise has a new hash and no seed, and is sent as the new text it is. One whose source pieces are
 * what they were (its hash) is judged by the test: what the pipeline makes of the answer, from the pieces a copy keeps
 * (it keeps no reply), and, where the wire changed for some units of the same pieces, whether the unit is one of them
 * (12's: whether it holds a run). A pipeline whose change no test can tell, unit by unit, carries nothing over: it has
 * no entry.
 * - 7: its reading back set a marker's `#` doubled or displaced as text, which this pipeline's takes with the marker
 *   (mt.mjs rehydrate); TeX's `#` is never the text's own (`\#` and a bare `#` are placeholders), so a translation whose
 *   text holds no `\#` was read back as this pipeline reads it, its sentences too. Units of 7 that fix 2 or 4 cut anew
 *   (a citation's notes, an accent in a word) have new hashes
 * - 8: what 9 and 10 change comes after the answer (a table's groups, decided again from the copy's translations) or
 *   changes what a unit is, not what is sent for one, and a translation of 8 is one 10 would make of the same pieces but
 *   where its reply set a marker's `#` as text, which 10 reads as the marker's (dropped): a translation whose text holds
 *   a `\#` is not carried, as 7's
 * - 9: likewise
 * - 10, 11: 11 changes where the patch inserts a lead or a mark (latex-front.mjs), and the units it cuts anew (a macro's
 *   call, a subscript) have new hashes. 12 sends a formula split across inline formulas as one marker (mt.mjs formulaRuns,
 *   TRANSLATE_VERSION 2), its unit's pieces and hash as they were: the test is whether the unit holds a run (formulaRuns
 *   over its pieces), whose translation was made of its parts sent apart and is sent again — the units whose wire 12
 *   changes, and no other. Only where no unit is passed, a translation that holds a formula whose delimiters do not
 *   balance on its own (mt.mjs holdsUnbalanced) is sent again: a few more units, whose wire is unchanged and which the
 *   per-text cache answers. 7, 8 and 9 take that test with their own. 10 is carried for the first time: under 11 a copy
 *   of 10 was sent again whole
 * - 12: 13 changes what a unit is (a heading wholly in \texorpdfstring is one, latex-front.mjs), not what is sent for one or
 *   how a reply is read back: a unit whose pieces are what they were (its hash) was sent and read back as 13 would, and every
 *   one is carried; the units 13 cuts anew (the headings, and those its new brace pairs renumber) have new hashes
 * - 13: 14 changes the left side alone (a turned item's tokens, anchors.mjs): every unit, its pieces and its wire are 13's, and
 *   every one is carried
 * - 14: 15 sends a pair inside a sentence and a placeholder that sets no ink on no wire, and reads a reply that lost
 *   every letter as none (mt.mjs planOf, TRANSLATE_VERSION 3; its units are 14's): a unit that holds neither a pair nor
 *   such a placeholder between two stretches of its text (mt.mjs holdsStyle; one at an edge cut no sentence) was sent as
 *   15 sends it, and is carried where its translation keeps a letter or a digit, its source having a letter. Every older pipeline's test
 *   takes this one with its own: what 15 changed, each of them sent the old way. Without the unit, a translation that
 *   holds no pair, no such placeholder between its texts, and a letter
 * - 15: 16 changes what a unit is (an environment the paper defines as code is none, latex-front.mjs codeEnvsOf), not what
 *   is sent for one or how a reply is read back: a unit whose pieces are what they were (its hash, or its source but for
 *   its pairs' numbers, seedFrom) was sent and read back as 16 would, and every one is carried. Older pipelines keep
 *   their own tests: 16 changes nothing they were sent
 * - 16: 17 changes what a unit is (a command and its arguments are one piece, arg-roles.mjs readArgs and latex-front.mjs
 *   commandArgs: 2212.06817's label key no unit), not what is sent for one or how a reply is read back: every unit whose
 *   source a copy holds is carried, and older pipelines keep their own tests
 * - 17: 18 changes which papers get a layout (a marked original that did not run through, or of fewer pages than arXiv's
 *   PDF, gives none: ranThrough, page-pass.mjs), not what a unit is, what is sent for one or how a reply is read back:
 *   every unit whose source a copy holds is carried, and older pipelines keep their own tests
 * - 18: 19 changes which marked original a paper's layout is read from (the layout guard, layout/guard.mjs: units left the
 *   paper's own, the name marks off, a page count compared) and records why a part has none, not what a unit is, what is
 *   sent for one or how a reply is read back: every unit whose source a copy holds is carried, and older pipelines keep
 *   their own tests
 * - 19: 20 changes what a unit is (none of what TeX reads as syntax, a declaration's digits its text: arg-roles.mjs
 *   readArgs and DELIMITED, latex-front.mjs), not what is sent for one or how a reply is read back (the wire keeps its own
 *   inkless list, mt.mjs INKLESS): every unit whose source a copy holds is carried, and older pipelines keep their own tests
 * - 20: 21 reads a source's line ends as TeX does (latex-front.mjs texText), which changes the units of a CR source alone,
 *   not what is sent for a unit or how a reply is read back: every unit whose source a copy holds is carried, matched by
 *   sourceHash, and one cut anew (a CRLF file's paragraphs, merged under 20) is asked again
 * - 21: 22 keeps a styled pair whose two ends stand where the wire is cut anyway (mt.mjs classOf's boundary rule,
 *   TRANSLATE_VERSION 4), and changes nothing else a unit is or how a reply is read back: a unit whose wire the rule leaves
 *   as it was (mt.mjs boundaryChanges, given the unit) was sent as 22 sends it, and is carried; without the unit, a
 *   translation that holds no pair. Over 137 papers' sources 126 of 36,136 units are asked again. Every older pipeline's
 *   test takes this one with its own (7 to 14 carry no unit that holds a pair already)
 * - 22: 23 writes a display's own stop after its marker and takes off what the reply set for it (mt.mjs serialize's and
 *   serializeTags' `own`, TRANSLATE_VERSION 5), and changes nothing else a unit is or how a reply is read back: a unit whose
 *   wire the rule leaves as it was (mt.mjs displayStopChanges, given the unit) was sent as 23 sends it, and is carried;
 *   without the unit, a translation that holds no display with a stop of its own. Over 180 papers' sources 4,215 of
 *   44,825 units are asked again. Every older pipeline's test takes this one with its own
 * - 23: 24 changes the left side alone (a unit's lines at a page break, anchors.mjs placeWith and inOrder): every unit, its
 *   pieces and its wire are 23's, and every one is carried; older pipelines keep their own tests
 * - 24: 25 guesses a package's toplevel sources where it has no 00README (source/paper-meta.mjs), which changes which
 *   papers get a layout and, among several toplevel files, which one is the main, not what is sent for a unit or how a reply
 *   is read back: every unit whose source a copy holds is carried, and older pipelines keep their own tests
 * - 28: 29 makes a bibliography's entries units of their own (latex-front.mjs bibliography), which a copy holds no source of,
 *   and changes no other unit's cutting or text: every unit whose source a copy holds is carried, as from 23 to 27
 * - 29: 30 makes an entry one unit (its names no unit apart), an author block's places units apart from its names, a class's own
 *   macro body no unit, and a paragraph end at \\bibliography: each unit it cuts otherwise has a source a copy of 29 holds none
 *   of (its hash is new, and it is asked again); no unit is read back otherwise: every unit whose source a copy holds is carried
 */
const NO_MARKER_HASH = pieces => !pieces.some(p => p.t === 'text' && p.tr && p.s.includes('\\#'))
const NO_RUN = (pieces, unit = null) => (unit ? formulaRuns(unit.pieces).size === 0 : !holdsUnbalanced(pieces))
const NO_MARKER_HASH_OR_RUN = (pieces, unit = null) => NO_MARKER_HASH(pieces) && NO_RUN(pieces, unit)
const holding = re => pieces => pieces.some(p => p?.t === 'text' && typeof p.s === 'string' && re.test(p.tr ? p.s : utf8(p.s)))
const lettered = holding(/\p{L}/u), says = holding(/[\p{L}\p{N}]/u)
const NO_STYLE = (pieces, unit = null) => (unit ? !holdsStyle(unit.pieces) && (says(pieces) || !lettered(unit.pieces)) : Array.isArray(pieces) && !holdsStyle(pieces) && says(pieces))
const andStyle = test => (pieces, unit = null) => test(pieces, unit) && NO_STYLE(pieces, unit)
const EVERY = () => true
const NO_BOUNDARY = (pieces, unit = null) => (unit ? !boundaryChanges(unit) : Array.isArray(pieces) && !pieces.some(p => p?.t === 'open' || p?.t === 'close'))
const NO_DISPLAY_STOP = (pieces, unit = null) => (unit ? !displayStopChanges(unit) : Array.isArray(pieces) && !pieces.some(p => p?.t === 'ph' && displayStop(p.src)))
const andStop = test => (pieces, unit = null) => test(pieces, unit) && NO_DISPLAY_STOP(pieces, unit)
const BOUNDARY_AND_STOP = andStop(NO_BOUNDARY)
export const PIPELINE_CARRIES = { 7: andStop(andStyle(NO_MARKER_HASH_OR_RUN)), 8: andStop(andStyle(NO_MARKER_HASH_OR_RUN)), 9: andStop(andStyle(NO_MARKER_HASH_OR_RUN)), 10: andStop(andStyle(NO_RUN)), 11: andStop(andStyle(NO_RUN)), 12: andStop(NO_STYLE), 13: andStop(NO_STYLE), 14: andStop(NO_STYLE), 15: BOUNDARY_AND_STOP, 16: BOUNDARY_AND_STOP, 17: BOUNDARY_AND_STOP, 18: BOUNDARY_AND_STOP, 19: BOUNDARY_AND_STOP, 20: BOUNDARY_AND_STOP, 21: BOUNDARY_AND_STOP, 22: NO_DISPLAY_STOP, 23: EVERY, 24: EVERY, 25: EVERY, 26: EVERY, 27: EVERY, 28: EVERY, 29: EVERY }
/** the test a translation made under `pipeline` passes to be carried into this cut, or null where it carries nothing */
export const carriesOf = pipeline => PIPELINE_CARRIES[pipeline] ?? (Number(pipeline) >= 39 ? EVERY : null)
