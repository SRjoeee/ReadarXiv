// Moved whole into the engine package (packages/engine/src/own/own.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { UNHIDDEN, isLabelForm, labelFormOf, OWN_WORK, SPELL_LIST_MAX, RULE_EM, HEAD_PUNCT, HEAD_ABUT, TAIL_PUNCT, spellOf, ownOf, lineRulesOf } from '@readarxiv/engine/today/own/own.mjs'
