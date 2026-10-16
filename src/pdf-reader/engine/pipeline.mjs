// The engine's server entry (Node): a paper's source to its units, the original compiled with the marks, the layout file, the
// add-on and the bundle that carries them. What the web's server imports, and no module of the extension.
// The compile path's names (runLive, translationFiles, the strategies, the typesetting, the cache) are not exported, but live.mjs
// still imports cache.mjs, scripts.mjs and typeset/* for them, so that this entry's closure loads them: Stage 5's PR 5 splits
// live.mjs into the paper's pipeline and the compile run before the compile path is parked.
// Re-exports only: the directory is the contract (docs/PDF-READER.md, the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

// the paper, its marked original and the readings of a compile
export { PIPELINE_VERSION, citationLines, keptFor, openPaper, originalFiles, probeFiles, readingsOf, stoppedShort } from './pipeline/live.mjs'
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
export { layerOfPaper } from './pipeline/page-pass.mjs'
export { leftOfPart, leftReach } from './pipeline/left-part.mjs'
export { texErrors, unitsAtErrors } from './pipeline/tex-errors.mjs'
// the layout file
export { LABEL_KINDS, LAYOUT, LAYOUT_CAP, LAYOUT_DEPTH, LAYOUT_VALUES, LayoutRefusal, PAGE_TEXT_ALL, PAGE_TEXT_KINDS, PH_FLAG, PH_KINDS, TEXT_MAX, UNIT_FLAG, UNIT_KINDS, VERSION_MAX, checkLayout, encodeLayout, indexLayout, isPageText, isPaperId, parseLayout } from './layout/file.mjs'
export { COORD_MAX, PAGES_MAX, PIECES_MAX, STRING_MAX, boundedJson, checkKeys, checkPages, checkViews, countValues, inView, isInteger, isNumber, isObject, isVersionToken, told, utf8Strict } from './layout/json.mjs'
export { DISPLAY, FOLLOWERS, GLYPHS_PIECE, INK_MAX, INK_TEXT_MAX, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, MARKS_CAP, MARKS_DEPTH, MARKS_SCHEMA, MARKS_VALUES, MARK_CLASSES, MARK_NAME, OWNED_ALL, POINTS_TEX, PROBE_MAX, PROBE_SCHEMA, RULE, RULES_PIECE, TEXT_SYMBOLS, asSet, askedCommands, classOf, commandOf, encodeLayoutMarks, headEnd, inkSamples, inkSection, layoutMarking, layoutMarksOf, markProbeTex, marksFile, parseLayoutMarks, probeRow, probeSamples, probeTex, punctuationSection, readInkProbe, readInkTexts, readMarked, readMarkProbe, readProbe, switchedOf, symbolText } from './layout/marks.mjs'
export { CARRY_MIN, OPS_MS, fontName, makeLayout } from './layout/make.mjs'
export { GLYPHS_PAGE, OPS_CAP } from './layout/ink.mjs'
export { readArxivText } from './layout/arxiv.mjs'
export { layoutMarksOfPaper } from './layout/paper.mjs'
export { LITE_PDFJS, NO_IMAGE_PIXELS, liteWorkerSource } from './layout/pdf-lite.mjs'
export { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, REFUSED_MAX, REMOVAL, checkAddonManifest, checkBoxes, parseAddonManifest } from './layout/addon-manifest.mjs'
export { pagePlanOf, pagePlansOf, paperAddon } from './layout/addon.mjs'
export { BYTES_MAX, CHECK_SETS, COST, DecodeLimit, HELD_MAX, LexLimit, SETS, WALK_MAX, alignOf, checkPage, lex, makeAddon, openRemover, removePaper, removerOf } from './layout/remove.mjs'
// the remover exchange (E3): the ask and the answer's entries, their bounds, and a part's add-on chained after the parts before it
export { ANSWER_CAP, ASK_CAP, ASK_VALUES, ENTRIES_CAP, ENTRIES_VALUES, REMOVER_WHYS, encodeAsk, encodeEntries, readAsk, readEntries } from './layout/chain-wire.mjs'
export { chainedAddon } from './layout/chain.mjs'
// the bundle's writer (the reader's parsers are the layer entry's)
export { bundleUnitsOf, writeBundle } from './layer-proto/bundle.mjs'
// BUNDLE 4: the writers of a paper's objects, the keys and the bounds (the readers are the layer entry's), and the memory-class errors every catch lets through
export { BUILD_END_WHYS, BUNDLE5, CATALOG_CAP, CATALOG_VALUES, CHUNKS_MAX, CONTENT_MAX, CTAG5, DEPTH_NONE, END_WHYS, FINAL_END_WHYS, HEAD_CAP, HEAD_VALUES, LEFT_CAP, LEFT_VALUES, PART_CAP, PART_VALUES, SPANNED_PER_TOKEN, TAIL_CAP, TOKENS_PAGE, TOKEN_FIELDS, TOKEN_LIMIT, TOKEN_SCALE, UNITS_CAP, UNITS_FORMAT, UNITS_TOTAL_BYTES, UNITS_TOTAL_VALUES, UNITS_VALUES, VTAG5, catalogKey, isFinalEnd, keyOf, keyParts, KIND_NONE, RECORD_FLAG, partTarget, writeCatalog, writeHead, writeLeftPart, writePart, writeUnitChunks } from './layer-proto/format.mjs'
export { BundleRefusal } from './layer-proto/bundle.mjs'
// the cut: a paper made whole, in BUNDLE 4's objects
export { cutBundle, needFrontier, partCutter, wholeCutter, wholeFrontier } from './layer-proto/cut.mjs'
// E-C: a page's draw geometry (BUNDLE 5): the bounds, the check, the wire form of PDF.js's shapes, and the server's read of a page
export { DRAW_ARGS, DRAW_BYTES, DRAW_COORD, DRAW_DEST, DRAW_FALLBACK, DRAW_FONTS, DRAW_HELD_MAX, DRAW_ITEMS, DRAW_LINKS, DRAW_MAPPED, DRAW_MAPPED_CHAR, DRAW_NAME, DRAW_OVERLAID, DRAW_QUADS, DRAW_STRING, DRAW_STRINGS, DRAW_URL, DRAW_VALUES, DRAW_ZOOM, DrawRefusal, checkDraw, drawFontKey, drawInputsOf, wireOf } from './layer-proto/draw.mjs'
export { drawDataOf } from './pipeline/draw-data.mjs'
export { isMemoryError } from './pipeline/memory.mjs'
// the faces' coverage and metrics
export { COVERAGE, COVERAGE_SOURCE, METRICS } from './rules/font-coverage.mjs'
