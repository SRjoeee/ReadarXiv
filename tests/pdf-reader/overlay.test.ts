import { describe, expect, it } from 'vitest'
import { pinned } from '@/pdf-reader/engine/overlay.mjs'

describe('pinned: an overlay that scales with its page (the reader\'s design, §10.1)', () => {
  const box = { left: 12, top: 30.5, width: 100, height: 20 }

  it('keeps the box in the pixels it was drawn at', () => {
    expect(pinned(box, 1.5)).toMatchObject({ left: '12px', top: '30.5px', width: '100px', height: '20px' })
  })

  it('scales about the page\'s origin, by the page\'s scale over the one it was drawn at', () => {
    expect(pinned(box, 1.5)).toMatchObject({ transformOrigin: '-12px -30.5px', scale: 'calc(var(--total-scale-factor) / 1.5)' })
  })
})
