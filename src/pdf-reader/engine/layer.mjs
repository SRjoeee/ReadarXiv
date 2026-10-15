// The engine's layer entry (browser): the reader's door, the instant layer opened over a bundle, with the bundle's and the
// layout file's parsers and the rows' helpers it takes. Re-exports only: the directory is the contract (docs/PDF-READER.md,
// the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

export * from './layer-proto/reader.mjs'

// BUNDLE 4: the readers of a paper's objects, the keys and the bounds (the writers are the pipeline entry's; the catalog's, the Worker's too)
export { BUILD_END_WHYS, BUNDLE4, CATALOG_CAP, CATALOG_VALUES, CHUNKS_MAX, CONTENT_MAX, CTAG4, DEPTH_NONE, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, LEFT_CAP, LEFT_VALUES, PART_CAP, PART_VALUES, SPANNED_PER_TOKEN, TAIL_CAP, TOKENS_PAGE, TOKEN_LIMIT, TOKEN_SCALE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, VTAG4, catalogKey, isFinalEnd, keyOf, keyParts, KIND_NONE, RECORD_FLAG, indexOf, mergeParts, readCatalog, readHead, readLeftPart, readPart, readUnitsChunk, droppedOf, unitsOfChunks, writeCatalog } from './layer-proto/format.mjs'
export { isMemoryError } from './pipeline/memory.mjs'
