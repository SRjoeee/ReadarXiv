// Moved whole into the engine package (packages/engine/src/source/tex-names.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { GENERATED_COMMANDS, NAME_GAPS, CONJUNCTION_GAPS, nameAnswered, headName, refName, refInTarget, headInTarget } from '@readarxiv/engine/today/source/tex-names.mjs'
