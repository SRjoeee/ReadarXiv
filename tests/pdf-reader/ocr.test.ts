import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES, toBase64 } from '@/core/image/run'
import { ocrCall } from '@/pdf-reader/ocr'
import { sha256Hex } from '@/shared/digest'

// the browser's own encoder, which every browser the reader runs on has (support.ts); Node 22 has not
type Native = { toBase64?: (this: Uint8Array) => string }
const proto = Uint8Array.prototype as Native
const own = proto.toBase64
const encoded = vi.fn(function (this: Uint8Array) {
  return Buffer.from(this).toString('base64')
})
beforeEach(() => {
  proto.toBase64 = encoded
  encoded.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  proto.toBase64 = own
})

/** an OffscreenCanvas whose PNG is `png`, the images drawn on it kept */
function stubCanvas(png: ArrayBuffer) {
  const drawn: unknown[] = []
  class FakeCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage: (image: unknown) => drawn.push(image) }
    }
    async convertToBlob(options: { type: string }) {
      expect(options.type).toBe('image/png')
      return new Blob([png])
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  return drawn
}

describe('ocrCall', () => {
  it("sends a page bitmap as PNG, hashed as the HTML page hashes an image, in the reader's scope, and closes the bitmap", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer
    const drawn = stubCanvas(png)
    const bitmap = { width: 40, height: 30, close: vi.fn() }
    const call = await ocrCall(bitmap, '2608.02163', 'axt-pdf-ocr-1')
    expect(drawn).toEqual([bitmap])
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(call).toEqual({ imageHash: await sha256Hex(png), image: toBase64(png), mime: 'image/png', paper: '2608.02163', scope: 'axt-pdf-ocr-1' })
  })

  it("encodes the PNG with the browser's own encoder: the script one held the page 133 ms for a 5.9 MB figure (final review)", async () => {
    stubCanvas(new Uint8Array([1, 2, 3]).buffer)
    await ocrCall({ width: 40, height: 30, close: vi.fn() }, '2608.02163', 'axt-pdf-ocr-1')
    expect(encoded).toHaveBeenCalledOnce()
  })

  it("sends nothing for a bitmap whose PNG is over the HTML page's limit (final review)", async () => {
    stubCanvas(new ArrayBuffer(MAX_IMAGE_BYTES + 1))
    const bitmap = { width: 4000, height: 3000, close: vi.fn() }
    expect(await ocrCall(bitmap, '2608.02163', 'axt-pdf-ocr-1')).toBeNull()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
