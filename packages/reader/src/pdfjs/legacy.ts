// PDF.js's legacy build, for a host that serves browsers below the modern build's floor (builds.ts): handed to openReader as
// `pdfjs: LEGACY` (interfaces/host design-a §1.1: the build plugin's `legacy: true` serves its worker at
// `pdfjs/<version>/legacy/`). An entry of its own (`@readarxiv/reader/pdfjs-legacy`), so that a host that never runs it (the
// extension) bundles none of it: the package's entry names no legacy module. The data files and the viewer's sheet are the
// modern build's (the same bytes in pdfjs-dist 6.3.289).
import type { PdfBuild, PdfModules } from './kit.ts'

let modules: Promise<PdfModules> | null = null
/** the legacy build and its viewer, once a page (PDF.js's viewer module reads `globalThis.pdfjsLib` as it is evaluated); a load
 *  that fails is forgotten, so that the next asks again */
function loadLegacy(): Promise<PdfModules> {
  modules ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    ;(globalThis as { pdfjsLib?: unknown }).pdfjsLib = lib
    const viewer = await import('pdfjs-dist/legacy/web/pdf_viewer.mjs')
    return { lib, viewer } as unknown as PdfModules
  })().catch((e: unknown) => {
    modules = null
    throw e
  })
  return modules
}

export const LEGACY: PdfBuild = { load: loadLegacy, worker: 'legacy/pdf.worker.min.mjs' }
