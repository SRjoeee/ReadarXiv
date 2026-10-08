// The engine's reading-view entry (browser): what is lit under the pointer, the floats and figures, the synchronised scrolling, the overlays kept through a zoom and the outline.
// Re-exports only: the directory is the contract (docs/PDF-READER.md, the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

export { blockOf, bySentence, clickOf, hitOf, layoutOf, pageGeometry, pageSentences, runsOf, sentenceOf, sentencesFit, shapePath } from './view/highlight.mjs'
export { captionFor, floatHitOf, floatOf, floatShapes, floatsAgree, floatsOn, pageFloats, pathsOf, wantsFloats } from './view/floats.mjs'
export { blockWire, figureLabels, figureRegions, splitBlock, vectorLines } from './view/figures.mjs'
export { measurePane, pointOn, pointerPath } from './view/pointer.mjs'
export { flowChain, knots, lineTable, makeMap, posAt } from './view/sync.mjs'
export { keepOverlays, pinned } from './view/overlay.mjs'
export { contentsOf, outlineOf } from './view/outline.ts'
