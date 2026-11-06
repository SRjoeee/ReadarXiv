// S.fill.target on synthetic pages: the body units' median, held within the band of the anchor (adaptiveFill's band 0.05).
import { describe, expect, it } from 'vitest'
import { fillTarget } from '../../src/shared/fill-target.ts'

const para = (fillLead: number | null, fitLines = 4, kind = 'para') => ({ kind, fillLead, fitLines })

describe('S.fill.target', () => {
  it('takes the begun body units’ median, held within the band of every body unit drawn on the page', () => {
    expect(fillTarget([para(1.1), para(1.2), para(1.3)], [], 0.05)).toEqual({
      target: 1.2,
      own: 1.2,
      anchor: 1.2,
      body: true,
    })
    expect(fillTarget([para(1.4)], [para(1.1), para(1.1)], 0.05)).toEqual({
      target: 1.15,
      own: 1.4,
      anchor: 1.1,
      body: true,
    })
  })
  it('reads other units where no body unit tells, and only the anchor where only a continuation tells', () => {
    expect(fillTarget([para(1.3, 3, 'caption')], [], 0.05)).toEqual({
      target: 1.3,
      own: 1.3,
      anchor: null,
      body: false,
    })
    expect(fillTarget([], [para(1.2)], 0.05)).toEqual({ target: null, own: null, anchor: 1.2, body: false })
    expect(fillTarget([para(null)], [], 0.05)).toBeNull()
  })
})
