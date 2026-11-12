// Moved whole into the engine package (packages/engine/src/source/paper-meta.mjs); this path re-exports it, through the
// package's transition entry, for what still imports it here, until the cut-over deletes the path.
export { analyze } from '@readarxiv/engine/today'
