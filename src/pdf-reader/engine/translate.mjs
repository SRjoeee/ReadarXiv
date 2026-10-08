// The engine's translation entry (Node and browser): the wires a unit goes out as and the reading back of a reply, the groups of a table, the units a target keeps, and the rows a language's translation travels as. Loads with no DOM and no network.
// Re-exports only: the directory is the contract (docs/PDF-READER.md, the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

// the wires (the free engine's own client stays with the extension)
export { FIRST_BATCH, NEXT_BATCH, SPACING, TRANSLATE_VERSION, WIRE, batchOf, cutsOf, decode, displayEdges, escape, isName, nameCells, plainSource, plainTranslated, rehydrate, rehydrateTags, sentencesKept, sentencesOf, serialize, serializeTags, shown, texEscape, textsShown, translateUnits, unitText, utf8 } from './translate/mt.mjs'
export { NAMES_SHARE, decideGroups, groupOf, unchanged } from './translate/groups.mjs'
export { authorsTranslated } from './translate/kept.mjs'
export { MIXED } from './translate/mixed.mjs'
// the rows
export { batchesOf, layerRows, rowOf, runRows, toTranslate, unitOf } from './layer-proto/rows.mjs'
