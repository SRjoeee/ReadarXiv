// The engine's browser entries import where a browser's modules do (happy-dom here); the server's, the translation's and the
// rules' are imported in plain node by engine-contract.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// (the layer opens a canvas at import)
class StubCanvas { width = 8; height = 8; getContext() { return null } }
const g = globalThis as { OffscreenCanvas?: unknown }
let had: unknown
beforeEach(() => { had = g.OffscreenCanvas; g.OffscreenCanvas = StubCanvas })
afterEach(() => { g.OffscreenCanvas = had })

describe('the browser entries', () => {
  it('layer imports, and opens a layer', async () => {
    const layer = await import('@/pdf-reader/engine/layer.mjs')
    expect(typeof layer.openLayer).toBe('function')
    expect(typeof layer.readBundle).toBe('function')
    expect(layer.BUNDLE).toBe('1')
  })
  it('view imports, and holds what the reading view needs', async () => {
    const view = await import('@/pdf-reader/engine/view.mjs')
    for (const name of ['layoutOf', 'hitOf', 'blockOf', 'flowChain', 'keepOverlays', 'pointerPath', 'outlineOf']) expect(typeof (view as Record<string, unknown>)[name], name).toBe('function')
  })
})
