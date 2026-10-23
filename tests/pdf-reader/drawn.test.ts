// A page's box as PDF.js lays it out (engine/view/drawn.mjs; docs/PDF-READER.md §11.8): the canvas a layer's copy is drawn on
import { describe, expect, it } from 'vitest'
import { pageBox } from '@/pdf-reader/engine/view/drawn.mjs'

describe('pageBox: a page\'s box as PDF.js lays it out', () => {
  it('the viewport\'s CSS px floored to the rounding across and down; a page turned a quarter takes its height\'s across', () => {
    expect(pageBox({ width: 711.9999999999999, height: 921.4117647058822, rotation: 0 })).toEqual({ width: 711, height: 921 })
    expect(pageBox({ width: 711.9999999999999, height: 921.4117647058822, rotation: 0 }, 2, 3)).toEqual({ width: 710, height: 921 })
    expect(pageBox({ width: 921.4117647058822, height: 711.9999999999999, rotation: 90 }, 2, 3)).toEqual({ width: 921, height: 710 })
  })
})
