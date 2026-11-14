// Moved whole into the engine package (packages/engine/src/compile/tex-errors.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { texErrors, unitsAtErrors } from '@readarxiv/engine/today/compile/tex-errors.ts'
