// Moved whole into the engine package (packages/engine/src/marks/names.ts); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { NAME_KEYS, NAME_ENGLISH, counterAfter, counterBefore } from '@readarxiv/engine/today/marks/names.ts'
