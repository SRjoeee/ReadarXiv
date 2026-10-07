// PDF.js for the reader (the design, §11.2): the library and its worker bundled from npm, pinned; its character maps,
// standard fonts and WebAssembly decoders copied into the build as they are (wxt.config.ts pdfjsFiles) and read from
// there by address
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { browser } from 'wxt/browser'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
// the viewer components read the core library from this global, so they are loaded once it is set
;(globalThis as { pdfjsLib?: typeof pdfjsLib }).pdfjsLib = pdfjsLib
const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs')

// copied by the build, not a public file WXT knows: hence the untyped getURL
const base = (browser.runtime.getURL as (path: string) => string)('/pdf-reader/pdfjs/')
/** what getDocument needs to find PDF.js's data files */
export const ASSETS = { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` } as const
export { pdfjsLib }
export const { EventBus, LinkTarget, PDFLinkService, PDFViewer } = viewer
