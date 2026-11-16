// Moved whole into the engine package (packages/engine/src/fonts/font-coverage.ts); this path re-exports it from the package's
// entry of the served faces and patterns (`@readarxiv/engine/fonts`) for what still imports it here. The cut-over deletes
// the path.
export { COVERAGE, METRICS, COVERAGE_SOURCE } from '@readarxiv/engine/fonts'
