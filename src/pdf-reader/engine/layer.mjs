// The engine's layer entry (browser): the reader's door, the instant layer opened over a bundle, with the bundle's and the
// layout file's parsers and the rows' helpers it takes. Re-exports only: the directory is the contract (docs/PDF-READER.md,
// the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

export * from './layer-proto/reader.mjs'

// BUNDLE 4: the readers of a paper's objects, the keys and the bounds (the writers are the pipeline entry's; the catalog's, the Worker's too)
export { BUILD_END_WHYS, BUNDLE5, CATALOG_CAP, CATALOG_VALUES, CHUNKS_MAX, CONTENT_MAX, CTAG5, DEPTH_NONE, DROPPED_MAX, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, LEFT_CAP, LEFT_VALUES, PART_CAP, PART_VALUES, SPANNED_PER_TOKEN, TOKENS_PAGE, TOKEN_LIMIT, TOKEN_SCALE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, UNIT_ID_MAX, VTAG5, catalogKey, isFinalEnd, keyOf, keyParts, KIND_NONE, RECORD_FLAG, indexOf, mergeParts, readCatalog, readHead, readLeftPart, readPart, readUnitsChunk, droppedOf, unitsOfChunks, writeCatalog, indexWithLate, LATE_MAX, isLayoutRefusal, LAYOUT_REFUSED, WHY_MAX, BASE_SOURCES, BASE_WHYS, BUNDLES_READ, baseKey, catalogBase, layerDraws, baseRefusalRetryable, RETRY_LIMITS, BASE_KINDS, DELTA_MAX_BYTES, DELTA_MAX_SHARE, REPLACED_MAX, replacedWhy, deltaKey, checkDelta, deltaSection } from './layer-proto/format.mjs'
// E-C: a left part's draw geometry (BUNDLE 5): the reader's check, the layer's own inputs decoded of it, and the fonts' key
export { DrawRefusal, checkDraw, drawFontKey, drawInputsOf } from './layer-proto/draw.mjs'
export { isMemoryError } from './pipeline/memory.mjs'
