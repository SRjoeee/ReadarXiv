// Moved whole into the engine package (packages/engine/src/compile/pdf-lite.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { LITE_PDFJS, NO_IMAGE_PIXELS, LINK_TEXT_PIXELS, liteWorkerSource, float32Outlines } from '@readarxiv/engine/today/compile/pdf-lite.mjs'
