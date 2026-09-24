// A bitmap from a PDF page → the call the extension's recogniser takes (src/shared/ocr.ts OcrCall), the HTML page's
// route: the background has it read by the one recogniser the package carries, and caches the result by the image's
// hash. The bitmap is encoded as PNG, the bytes hashed as the HTML page hashes an image's, and the bitmap closed. The
// HTML page's limits hold: no image over MAX_IMAGE_BYTES is sent, and the call carries the reader's scope, which the
// page withdraws when it goes (the background has no tab to watch for an extension page)
import { MAX_IMAGE_BYTES } from '@/core/image/run'
import { sha256Hex } from '@/shared/digest'
import type { OcrCall } from '@/shared/ocr'

export async function ocrCall(bitmap: { width: number; height: number; close(): void }, paper: string, scope: string): Promise<OcrCall | null> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')?.drawImage(bitmap as unknown as CanvasImageSource, 0, 0)
  bitmap.close()
  const bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
  if (bytes.byteLength > MAX_IMAGE_BYTES) return null
  // the browser's own encoder, which every browser the reader runs on has (support.ts): the script one (image/run.ts
  // toBase64) held the page's main thread 52 ms for a 2.6 MB PNG and 133 ms for 5.9 MB, this one 0.5 and 1.1 ms
  // (measured 2026-09-25, the final review of the reader's Part 1)
  const image = (new Uint8Array(bytes) as Uint8Array & { toBase64(): string }).toBase64()
  return { imageHash: await sha256Hex(bytes), image, mime: 'image/png', paper, scope }
}
