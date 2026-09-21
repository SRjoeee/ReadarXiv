// One figure's bytes to a result (DESIGN §15.3): the browser's decoders are faked; what is tested is the order of things
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFigure } from '@/core/ocr'

/** A browser whose decoders say the image is `width` × `height` and has `frames` frames */
function browser(frames: number, width = 640, height = 480): { closed: () => boolean } {
  let closed = false
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => { closed = true } }))
  vi.stubGlobal('ImageDecoder', class {
    static isTypeSupported = async () => true
    tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: frames } }
    close(): void {}
  })
  return { closed: () => closed }
}
const FIGURE = new Blob([new Uint8Array(8)], { type: 'image/gif' })

describe('readFigure', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('the frames cannot be counted — the decoder rejects the file — and the bitmap already decoded is given back, not left to the collector (Devin on #281)', async () => {
    const decoders = browser(1)
    vi.stubGlobal('ImageDecoder', class {
      static isTypeSupported = async () => true
      tracks = { ready: Promise.reject(new DOMException('truncated', 'EncodingError')), selectedTrack: null }
      close(): void {}
    })
    const start = vi.fn(async () => ({ recognise: vi.fn(async () => []) }))
    await expect(readFigure(FIGURE, start)).rejects.toThrow('truncated')
    expect(decoders.closed()).toBe(true)
    expect(start).not.toHaveBeenCalled()
  })

  it('an animation is not read, and the recogniser is not so much as started for it: 14 MB of WebAssembly and two models, held for a minute, for a figure that gets no overlay (Codex on #281)', async () => {
    const decoders = browser(12)
    const start = vi.fn(async () => ({ recognise: vi.fn(async () => []) }))
    await expect(readFigure(FIGURE, start)).resolves.toEqual({ width: 640, height: 480, frames: 12, lines: [] })
    expect(start).not.toHaveBeenCalled()
    expect(decoders.closed()).toBe(true)
  })

  it('a still figure starts it and is read; the bitmap is given back whatever comes of the reading', async () => {
    const decoders = browser(1)
    const lines = [{ text: 'Accuracy', conf: 0.98, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }]
    await expect(readFigure(FIGURE, async () => ({ recognise: async () => lines as never }))).resolves.toEqual({ width: 640, height: 480, frames: 1, lines })
    expect(decoders.closed()).toBe(true)
    const failing = browser(1)
    await expect(readFigure(FIGURE, async () => { throw new Error('no runtime') })).rejects.toThrow('no runtime')
    expect(failing.closed()).toBe(true)
  })
})
