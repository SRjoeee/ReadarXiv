// Moved whole into the engine package (packages/engine/src/source/tex-kernel.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { INK_FREE_SYMBOLS, INK_FREE_WORDS, BREAK_HINTS, PREFIX_WORDS, prefixWord, INK_FREE_LEAD, inkFree, DECLARATION_WORDS, AUX_WORDS, PENALTY_WORDS, ROW_RULES, ARGUMENT_SELECTORS, selectsArgument, SPACE_SYMBOLS, SPACE_WORDS, SPACE_LENGTHS, NEGATIVE_SPACES, MATH_SPACE_SYMBOLS, spaceLead, spaceSource } from '@readarxiv/engine/today/source/tex-kernel.mjs'
