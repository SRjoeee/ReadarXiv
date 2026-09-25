import { describe, expect, it } from 'vitest'
import { wheelStep } from '@/pdf-reader/ui/pinch'

describe('a pinch (the reader\'s design, §6.8)', () => {
  it('zooms continuously on a trackpad\'s small deltas, a tenth for a mouse notch', () => {
    expect(wheelStep(-3)).toBeCloseTo(-0.03)
    expect(wheelStep(100)).toBe(0.1)
    expect(wheelStep(-120)).toBe(-0.1)
  })
})
