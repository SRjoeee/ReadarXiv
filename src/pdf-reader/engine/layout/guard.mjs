// Moved whole into the engine package (packages/engine/src/compile/guard.ts); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { braceBalance, unbalancedUnits, marksOutOfPlace, preambleUnits, auxUnits, cutCopyUnits, tellsTwice, copiesOutOfPlace, errorCount, pagesOfLog, texLiveOf, texLiveOfPdf, compilerOfPdf, texRan, engineUnknown, whyText, limitOf, firstError, ownErrors, errorUnits, contextUnits, unmarkedFiles } from '@readarxiv/engine/today/compile/guard.ts'
