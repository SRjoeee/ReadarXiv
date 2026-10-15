// layer.mjs's types

export * from './layer-proto/reader.mjs'

// BUNDLE 4: the readers of a paper's objects, the keys and the bounds (the writers are the pipeline entry's; the catalog's, the Worker's too)
export { BUILD_END_WHYS, BUNDLE4, CATALOG_CAP, CATALOG_VALUES, CHUNKS_MAX, CONTENT_MAX, CTAG4, DEPTH_NONE, DROPPED_MAX, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, LEFT_CAP, LEFT_VALUES, PART_CAP, PART_VALUES, SPANNED_PER_TOKEN, TAIL_CAP, TOKENS_PAGE, TOKEN_LIMIT, TOKEN_SCALE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, UNIT_ID_MAX, VTAG4, catalogKey, isFinalEnd, keyOf, keyParts, KIND_NONE, RECORD_FLAG, indexOf, mergeParts, readCatalog, readHead, readLeftPart, readPart, readUnitsChunk, droppedOf, unitsOfChunks, writeCatalog } from './layer-proto/format.mjs'
export { isMemoryError } from './pipeline/memory.mjs'
export type { Caps, EndWhy, HeadVersions, LayerIndex, PartChain, ReadCatalog, ReadHead, ReadLeftPart, ReadPart, ReadUnits, ReadUnitsChunk, ReadUnitsChunkLight, ReadUnitsLight, Ref, UnitRecords, TokenWire, Written } from './layer-proto/format.mjs'
