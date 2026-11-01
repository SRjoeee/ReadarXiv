// pipeline.mjs's types

// the paper, its marked original and the readings of a compile
export { DRAFT_OPTION, PIPELINE_VERSION, citationLines, keptFor, openPaper, originalFiles, probeFiles, readingsOf, stoppedShort } from './pipeline/live.mjs'
// the versions a reader checks a bundle against
export { PDFJS } from './pipeline/versions.mjs'
// the front end, without the compile path's TeX (translate has the units' plain text, mt.mjs unitText)
export { MARK_DEF, NO_ARG_COMMANDS, displayLetters, documentBounds, inMemory, inputencOf, jobName, lastTexLog, latin1, latin1Bytes, lineBreaks, loadProject, localizeNames, markUnits, normalizePath, patch, tableGrid } from './source/latex-front.mjs'
export { analyze } from './source/paper-meta.mjs'
export { gunzip, unpackSource, untar } from './source/tar.mjs'
// a directory as a project (Node only)
export { folder } from './source/node-files.mjs'
// the left geometry
export { anchorUnits, boundsFromMarks, floatMatches, inkEdges, lineRects, markWords, matchUnits, pageFrame, placeUnits, sentenceStarts, startRuns, startsAnchor, tokenAtMark, tokenizeDocument, tokens } from './pipeline/anchors.mjs'
export { leftSideOf } from './pipeline/left-side.mjs'
export { checkOurBase, layerOfPaper, layoutRecordOf } from './pipeline/page-pass.mjs'
export { leftOfPart, leftReach } from './pipeline/left-part.mjs'
export type { LeftSide } from './pipeline/left-side.mjs'
export { texErrors, unitsAtErrors } from './pipeline/tex-errors.mjs'
// the layout file
export { LABEL_KINDS, LAYOUT, LAYOUT_CAP, LAYOUT_DEPTH, LAYOUT_VALUES, LayoutRefusal, PAGE_TEXT_ALL, PAGE_TEXT_KINDS, PH_FLAG, PH_KINDS, TEXT_MAX, UNIT_FLAG, UNIT_KINDS, VERSION_MAX, checkLayout, encodeLayout, indexLayout, isPageText, isPaperId, parseLayout } from './layout/file.mjs'
export { COORD_MAX, PAGES_MAX, PIECES_MAX, STRING_MAX, boundedJson, checkKeys, checkPages, checkViews, countValues, inView, isInteger, isNumber, isObject, isVersionToken, told, utf8Strict } from './layout/json.mjs'
export { DISPLAY, FOLLOWERS, GLYPHS_PIECE, INK_MAX, INK_TEXT_MAX, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, MARKS_CAP, MARKS_DEPTH, MARKS_SCHEMA, MARKS_VALUES, MARK_CLASSES, MARK_NAME, OWNED_ALL, POINTS_TEX, PROBE_MAX, PROBE_SCHEMA, RULE, RULES_PIECE, TEXT_SYMBOLS, asSet, askedCommands, classOf, commandOf, encodeLayoutMarks, headEnd, inkSamples, inkSection, layoutMarking, layoutMarksOf, markProbeTex, marksFile, parseLayoutMarks, probeRow, probeSamples, probeTex, punctuationSection, readInkProbe, readInkTexts, readMarked, readMarkProbe, readProbe, switchedOf, symbolText } from './layout/marks.mjs'
export { DEFAULT_RULES, OPS_MS, WHOLE_RULES, fontName, makeLayout } from './layout/make.mjs'
export { GLYPHS_PAGE, OPS_CAP } from './layout/ink.mjs'
export { readArxivText } from './layout/arxiv.mjs'
export { handoverOf, layoutMarksOfPaper, markedOfPaper } from './layout/paper.mjs'
export type { FinalPass, OwnVerdict } from './layout/paper.mjs'
// the TeX Live year arXiv's PDF says it was built on (its pdfTeX banner), read before any compile
export { compilerOfPdf, texLiveOfPdf } from './layout/guard.mjs'
// our compile as the base page (BUNDLE 8): the checks the final pass and our pages pass, and arXiv's date the compiles take
export { BOX_TOL, DRIVER_OUTPUT_MARK, DRIVER_OUTPUT_TRUNCATED, MARK_TOL, boxesCheck, boxesOfPdf, prefixDoc, creationEpochOf, driverLostInk, driverOutputGiven, driverOutputTruncated, finalCheck, hasMarkText, markTextOf, marksOfPdf, pageTextOf, pdfDateEpoch, textOfPdf } from './layout/base.mjs'
export type { PdfLike } from './layout/base.mjs'
export { float32Outlines, LINK_TEXT_PIXELS, LITE_PDFJS, NO_IMAGE_PIXELS, liteWorkerSource } from './layout/pdf-lite.mjs'
export { REMOVAL } from './pipeline/versions.mjs'
// the rules near a table's cells, which a part carries (layer2.mjs cellBands)
export { checkBoxes, pageRules } from './layout/cell-rules.mjs'
export { BYTES_MAX, COST, DecodeLimit, HELD_MAX, LexLimit, WALK_MAX, alignOf, lex, openRemover } from './layout/remove.mjs'
export type { AlignFacts } from './layout/remove.mjs'
// our base as an incremental update over arXiv's PDF (the delta): built and proved in the maker child, its section read back, its why
export { DELTA_DECODED_MAX, DELTA_HELD_MAX, DELTA_WORK_MAX, deltaOf, proveDelta } from './layout/delta.mjs'
export { DELTA_OBJECTS_MAX, DELTA_WHYS, deltaSection, UNHIDDEN, WRAP_STATS, wrapWhy } from './layout/delta-wire.mjs'
// our final pass's pages wrapped by optional content, in the maker child before the delta (per-unit erasure)
export { GROUPS_DOC, GROUPS_PAGE, SEQUENCES_PAGE, WRAP_WHYS, wrapFinal } from './layout/wrap.mjs'
export type { Delta, DeltaRefusal, DeltaStats } from './layout/delta.mjs'
export type { BaseKind, DeltaWhy, PageRanges } from './layout/delta-wire.mjs'
// the bundle's writer (the reader's parsers are the layer entry's)
export { bundleUnitsOf, writeBundle } from './layer-proto/bundle.mjs'
// BUNDLE 4: the writers of a paper's objects, the keys and the bounds (the readers are the layer entry's), and the memory-class errors every catch lets through
export { BUILD_END_WHYS, BUNDLE5, CATALOG_CAP, CATALOG_VALUES, CHUNKS_MAX, CONTENT_MAX, CTAG5, DEPTH_NONE, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, LEFT_CAP, LEFT_VALUES, PART_CAP, PART_VALUES, SPANNED_PER_TOKEN, TOKENS_PAGE, TOKEN_FIELDS, TOKEN_LIMIT, TOKEN_SCALE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, VTAG5, catalogKey, isFinalEnd, keyOf, keyParts, KIND_NONE, RECORD_FLAG, partTarget, writeCatalog, writeHead, writeLeftPart, writePart, writeUnitChunks, isLayoutRefusal, LAYOUT_REFUSED, WHY_MAX, BASE_SOURCES, BASE_WHYS, BUNDLES_READ, baseKey, catalogBase, layerDraws, baseRefusalRetryable, RETRY_LIMITS, BASE_KINDS, DELTA_MAX_BYTES, DELTA_MAX_SHARE, REPLACED_MAX, replacedWhy, deltaKey, checkDelta } from './layer-proto/format.mjs'
export { BundleRefusal } from './layer-proto/bundle.mjs'
// the cut: a paper made whole, in BUNDLE 4's objects
export { cutBundle, needFrontier, partCutter, wholeCutter, wholeFrontier } from './layer-proto/cut.mjs'
export type { Cut, CutEntry, CutOptions, LeftPageInput, WholePaper } from './layer-proto/cut.mjs'
// E-C: a page's draw geometry (BUNDLE 5): the bounds, the check, the wire form of PDF.js's shapes, and the server's read of a page
export { DRAW_ARGS, DRAW_BYTES, DRAW_COORD, DRAW_DEST, DRAW_FALLBACK, DRAW_FONTS, DRAW_HELD_MAX, DRAW_ITEMS, DRAW_LINKS, DRAW_MAPPED, DRAW_MAPPED_CHAR, DRAW_NAME, DRAW_OVERLAID, DRAW_QUADS, DRAW_STRING, DRAW_STRINGS, DRAW_URL, DRAW_VALUES, DRAW_ZOOM, DrawRefusal, checkDraw, drawFontKey, drawInputsOf, wireOf } from './layer-proto/draw.mjs'
export { drawDataOf } from './pipeline/draw-data.mjs'
export type { Draw, DrawDest, DrawFont, DrawItem, DrawLink, DrawSource } from './layer-proto/draw.mjs'
export { isMemoryError } from './pipeline/memory.mjs'
// the faces' coverage and metrics
export { COVERAGE, COVERAGE_SOURCE, METRICS } from './rules/font-coverage.mjs'
