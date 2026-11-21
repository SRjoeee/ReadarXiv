// Moved whole into the engine package (packages/engine/src/source/paper-meta.ts); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { analyze } from '@readarxiv/engine/today/source/paper-meta.ts'
