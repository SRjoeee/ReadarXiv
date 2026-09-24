// A bitmap from a PDF page → the call the extension's recogniser takes (src/shared/ocr.ts OcrCall), the HTML page's
// route: the background has it read by the one recogniser the package carries, and caches the result by the image's
// hash. The bitmap is encoded as PNG, the bytes hashed as the HTML page hashes an image's, and the bitmap closed
import { toBase64 } from '@/core/image/run'
import { sha256Hex } from '@/shared/digest'
import type { OcrCall } from '@/shared/ocr'

export async function ocrCall(bitmap: { width: number; height: number; close(): void }, paper: string): Promise<OcrCall> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')?.drawImage(bitmap as unknown as CanvasImageSource, 0, 0)
  bitmap.close()
  const bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
  return { imageHash: await sha256Hex(bytes), image: toBase64(bytes), mime: 'image/png', paper }
}
