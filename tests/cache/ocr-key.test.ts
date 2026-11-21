// The OCR result's store key (src/cache/ocr-key.ts, DESIGN §15.2)
import { describe, expect, it } from 'vitest'
import { ocrCacheKey } from '@/cache/ocr-key'

describe('ocrCacheKey (DESIGN §15.2)', () => {
  it("varies with the image bytes' hash, the type they were served as and the recogniser's version", async () => {
    const key = await ocrCacheKey('abc', 'image/png', '0.1.0')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(await ocrCacheKey('abc', 'image/png', '0.1.0')).toBe(key)
    expect(await ocrCacheKey('abd', 'image/png', '0.1.0')).not.toBe(key)
    expect(await ocrCacheKey('abc', 'image/png', '0.2.0')).not.toBe(key)
    // The frames are counted by a decoder chosen by the type: the same bytes served as another type may be read as
    // another number of frames, and an animation is not read at all (Devin on #281)
    expect(await ocrCacheKey('abc', 'image/gif', '0.1.0')).not.toBe(key)
  })
})
