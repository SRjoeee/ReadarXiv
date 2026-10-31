import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { float32Outlines, liteWorkerSource, NO_IMAGE_PIXELS } from '@/pdf-reader/engine/layout/pdf-lite.mjs'

// PDF.js's worker without the images' pixels (engine/layout/pdf-lite.mjs), installed for the tests that read the ink of a PDF: once
// per test file, before its first getDocument. A document is read without its pixels by passing LITE (`maxImageSize`) to
// getDocument; one opened without it decodes as ever

const require = createRequire(import.meta.url)
/** getDocument's option for a document read without its images' pixels */
export const LITE = { maxImageSize: NO_IMAGE_PIXELS } as const

let installed: Promise<void> | null = null
/** the lite worker made the process's PDF.js worker, its glyph outlines in Float32 on both sides as the container's (idempotent) */
export function installLiteWorker(): Promise<void> {
  installed ??= (async () => {
    const version = (JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')) as { version: string }).version
    const source = liteWorkerSource(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8'), { version })
    const worker = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
    float32Outlines(pdfjs, worker)
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  })()
  return installed
}
