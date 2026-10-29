// @vitest-environment node
// The recogniser's sessions (core/ocr/recognise.ts, DESIGN §15.3 and §15.4): created with the options the host gives — the web's
// box onnxruntime-node's CPU provider, one thread — and with the WebAssembly build's where it gives none (the extension's)
import { describe, expect, it } from 'vitest'
import { createRecogniser } from '@/core/ocr/recognise'

/** a runtime that records each session asked of it and refuses it (no model is read) */
function runtime() {
  const asked: unknown[] = []
  const ort = { InferenceSession: { create: async (_input: unknown, options: unknown) => { asked.push(options); throw new Error('no session in a test') } }, Tensor: class {} }
  return { ort: ort as never, asked }
}
/** a host's canvases that draw nothing (a server's, as the box gives @napi-rs/canvas's) */
const context = new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) })
const canvas = (width: number, height: number) => ({ width, height, getContext: () => context }) as never
const imageData = (data: Uint8ClampedArray, width: number, height: number) => ({ data, width, height }) as never
const assets = { detection: new Uint8Array(1), recognition: new Uint8Array(1), dictionary: 'a\nb', canvas, imageData }

describe('the recogniser\'s sessions', () => {
  it('takes the host\'s options: the box\'s CPU provider and one thread', async () => {
    const { ort, asked } = runtime()
    const session = { executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1 }
    await expect(createRecogniser({ ort, session, ...assets })).rejects.toThrow(/no session/)
    expect(asked.length).toBeGreaterThan(0)
    for (const o of asked) expect(o).toMatchObject(session)
  })
  it('is the WebAssembly build\'s where the host gives none (the extension\'s offscreen document)', async () => {
    const { ort, asked } = runtime()
    await expect(createRecogniser({ ort, ...assets })).rejects.toThrow(/no session/)
    for (const o of asked) expect(o).toMatchObject({ executionProviders: ['wasm'] })
  })
})
