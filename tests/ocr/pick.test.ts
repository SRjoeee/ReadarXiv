// Which way round a tall line is read (DESIGN §15.3)
import { describe, expect, it } from 'vitest'
import type { PixelQuad } from '@/core/ocr/geometry'
import { pick } from '@/core/ocr/recognise'

const quad: PixelQuad = [[0, 0], [1, 0], [1, 1], [0, 1]]

describe('pick', () => {
  it('keeps the more confident of a tall line\'s two readings: upside down reads as letters too, only worse', () => {
    expect(pick([{ quad, text: 'slaselep', conf: 0.71 }, { quad, text: 'datasets', conf: 0.98 }])?.text).toBe('datasets')
    expect(pick([{ quad, text: 'Accuracy', conf: 0.97 }, { quad, text: 'AoeJnooy', conf: 0.62 }])?.text).toBe('Accuracy')
  })

  it('of two equally confident readings the first, from the bottom up: a symmetric label such as "o o o" reads alike both ways', () => {
    const up = { quad, text: 'o o o', conf: 0.9 }
    expect(pick([up, { quad, text: 'o o o', conf: 0.9 }])).toBe(up)
  })

  it('a reading the recogniser left out is no candidate, and a line with none is no line', () => {
    expect(pick([{ quad }, { quad, text: 'Loss', conf: 0.55 }])?.text).toBe('Loss')
    expect(pick([{ quad }, { quad }])).toBeUndefined()
    expect(pick([{ quad, text: '', conf: 0.9 }])).toBeUndefined()
  })
})
