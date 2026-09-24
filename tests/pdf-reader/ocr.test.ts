import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from '@/core/image/run'
import { ocrCall } from '@/pdf-reader/ocr'
import { sha256Hex } from '@/shared/digest'

afterEach(() => vi.unstubAllGlobals())

describe('ocrCall', () => {
  it('sends a page bitmap as PNG, hashed as the HTML page hashes an image, and closes the bitmap', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer
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
    const bitmap = { width: 40, height: 30, close: vi.fn() }
    const call = await ocrCall(bitmap, '2608.02163')
    expect(drawn).toEqual([bitmap])
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(call).toEqual({ imageHash: await sha256Hex(png), image: toBase64(png), mime: 'image/png', paper: '2608.02163' })
  })
})
