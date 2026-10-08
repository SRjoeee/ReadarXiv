// pipeline.mjs's types

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
export { anchorUnits, boundsFromMarks, inkEdges, lineRects, markWords, sentenceStarts, tokenAtMark, tokenizeDocument, tokens } from './pipeline/anchors.mjs'
export { texErrors, unitsAtErrors } from './pipeline/tex-errors.mjs'
// the layout file
export { LABEL_KINDS, LAYOUT, LAYOUT_CAP, LAYOUT_DEPTH, LAYOUT_VALUES, LayoutRefusal, PAGE_TEXT_ALL, PAGE_TEXT_KINDS, PH_FLAG, PH_KINDS, TEXT_MAX, UNIT_FLAG, UNIT_KINDS, VERSION_MAX, checkLayout, encodeLayout, indexLayout, isPageText, isPaperId, parseLayout } from './layout/file.mjs'
export { COORD_MAX, PAGES_MAX, PIECES_MAX, STRING_MAX, boundedJson, checkKeys, checkPages, checkViews, countValues, inView, isInteger, isNumber, isObject, isVersionToken, told, utf8Strict } from './layout/json.mjs'
export { DISPLAY, FOLLOWERS, GLYPHS_PIECE, INK_MAX, INK_TEXT_MAX, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, MARKS_CAP, MARKS_DEPTH, MARKS_SCHEMA, MARKS_VALUES, MARK_CLASSES, MARK_NAME, OWNED_ALL, POINTS_TEX, PROBE_MAX, PROBE_SCHEMA, RULE, RULES_PIECE, TEXT_SYMBOLS, asSet, askedCommands, classOf, commandOf, encodeLayoutMarks, headEnd, inkSamples, inkSection, layoutMarking, layoutMarksOf, markProbeTex, parseLayoutMarks, probeRow, probeSamples, probeTex, punctuationSection, readInkProbe, readInkTexts, readMarkProbe, readProbe, switchedOf, symbolText } from './layout/marks.mjs'
export { CARRY_MIN, OPS_MS, OPS_PAPER_MS, fontName, makeLayout } from './layout/make.mjs'
export { layoutMarksOfPaper } from './layout/paper.mjs'
export { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, REFUSED_MAX, REMOVAL, checkAddonManifest, checkBoxes, parseAddonManifest } from './layout/addon-manifest.mjs'
export { paperAddon } from './layout/addon.mjs'
export { BYTES_MAX, CHECK_SETS, COST, DecodeLimit, HELD_MAX, LexLimit, SETS, WALK_MAX, checkPage, lex, makeAddon, openRemover, removePaper } from './layout/remove.mjs'
// the bundle's writer (the reader's parsers are the layer entry's)
export { bundleUnitsOf, writeBundle } from './layer-proto/bundle.mjs'
// the faces' coverage and metrics
export { COVERAGE, COVERAGE_SOURCE, METRICS } from './rules/font-coverage.mjs'
