// translate.mjs's types

// the wires (the free engine's own client stays with the extension)
export { FIRST_BATCH, NEXT_BATCH, SPACING, TRANSLATE_VERSION, WIRE, batchOf, cutsOf, decode, displayEdges, escape, isName, nameCells, plainSource, plainTranslated, rehydrate, rehydrateTags, sentencesKept, sentencesOf, serialize, serializeTags, shown, texEscape, textsShown, translateUnits, unitText, utf8 } from './translate/mt.mjs'
export { NAMES_SHARE, decideGroups, groupOf, unchanged } from './translate/groups.mjs'
export { authorsTranslated } from './translate/kept.mjs'
export { MIXED } from './translate/mixed.mjs'
// the rows
export { batchesOf, layerRows, rowOf, runRows, toTranslate, unitOf } from './layer-proto/rows.mjs'
