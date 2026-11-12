// Moved whole into the engine package (packages/engine/src/instrument/layer1.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { median, blocksOf, CITE, NUM, DISPLAY, MACROS, SUP, texToText, phClass, norm, wordsOf, lcsPairs, lcsMatched, kinsokuOf } from '@readarxiv/engine/today/instrument/layer1.mjs'
