// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { LITE_PDFJS, liteWorkerSource } from '@/pdf-reader/engine/layout/pdf-lite.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'

// PDF.js's worker without the images' pixels (layout/pdf-lite.mjs): the patch is pinned to the PDF.js it was made for, applies to a
// document that opts in and to no other, and leaves the operator list exactly as it was

const require = createRequire(import.meta.url)
const ANCHOR = 'imgData = await imageObj.createImageData(false, isOffscreenCanvasSupported);'
const TEXT_ANCHOR = '} else if (annotation.overlaysTextContent && isVisible) {'
const EXPORT_ANCHOR = 'export { WorkerMessageHandler };'

describe('liteWorkerSource', () => {

  it('is pinned: the installed worker is the version the patch was made for, holds the decode once, and the engine\'s PDFJS is it', () => {
    const version = (JSON.parse(readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8')) as { version: string }).version
    expect(version).toBe(LITE_PDFJS)
    expect(PDFJS).toBe(LITE_PDFJS)
    const worker = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
    expect(worker.split(ANCHOR).length - 1).toBe(1)
    expect(worker.split(TEXT_ANCHOR).length - 1).toBe(1)
    expect(worker.split(EXPORT_ANCHOR).length - 1).toBe(1)
    expect(worker.trimEnd().split('\n').filter(l => l.startsWith('export ')).at(-1)).toBe(EXPORT_ANCHOR)
    expect(liteWorkerSource(worker, { version })).toContain('image pixels not decoded')
  })
})

