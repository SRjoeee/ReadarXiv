// Moved whole into the engine package (packages/engine/src/fonts/script.ts); this path re-exports it from the package's
// entry of the served faces and patterns (`@readarxiv/engine/fonts`) for what still imports it here. The cut-over deletes
// the path.
export { scriptOf, CJK, cjkClassWith, CJK_LETTER, SPACELESS } from '@readarxiv/engine/fonts'
