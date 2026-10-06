// The instant layer's entry (Plan 8b, Task 11): what the reader (Plan 8d) imports, and nothing it does not need. Re-exports
// only. Everything it reaches is in the reader's bundle, so it reaches no module only the server runs (the compile, the
// marks, the layout maker, the pixel checker): tests/pdf-reader/layer-entry.test.ts walks its imports. An original module
// (no port statement), importing only relative modules.
export { indexLayout, LAYOUT, LAYOUT_CAP, LAYOUT_VALUES, LayoutRefusal, parseLayout } from '../layout/file.mjs'
export { layerRulesFor } from '../layer-rules.mjs'
export { FACES, familyOfFonts, rolesFor } from '../font-roles.mjs'
export { loadHyphenator } from './hyphen.mjs'
// LAYER_COLOURS: the closed colour table a run's `colour` indexes, so that the reader copies none
export { kOfSource, LAYER_COLOURS, trPiecesOf, trText } from './pieces.mjs'
export { layUnit } from './fit.mjs'
export { bodyUnits, evenOf } from './page.mjs'
export { checkPieces } from './net.mjs'
export { drawUnit, spansOf, unitAt } from './draw.mjs'
// the text-removed PDF's swap: where the removed page's pixels go in for each drawn unit
export { swapMasks } from './swap.mjs'
