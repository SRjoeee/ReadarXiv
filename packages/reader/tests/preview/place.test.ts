// Where a preview stands (preview/place.ts; link previews' §3.8): under the link's line by default, above it where there is no
// room below, never over the reader's foot (54 px), inside the pane by 12 px, its text from the bracket's left, a superscript's
// line foot counted as the link's foot (the caller widens the anchor to it), a swap along a bracket keeping its side.
import { describe, expect, it } from 'vitest'
import { EDGE_PX, FOOT_PX, GAP_PX, placeOf } from '../../src/preview/place.ts'

const pane = { left: 0, top: 44, right: 800, bottom: 900 }
const anchor = (top: number, left = 300, h = 12) => ({ left, top, right: left + 40, bottom: top + h })
const size = { width: 416, height: 200 }

describe('placeOf', () => {
  it('under the line by default', () => {
    const p = placeOf({ anchor: anchor(200), pane, size, inset: 14 })
    expect(p.at).toBe('below')
    expect(p.top).toBe(212 + GAP_PX)
  })
  it('above where there is no room below', () => {
    const p = placeOf({ anchor: anchor(700), pane, size, inset: 14 })
    expect(p.at).toBe('above')
    expect(p.top + size.height).toBe(700 - GAP_PX)
  })
  it('never over the 54 px foot: its room below stops there', () => {
    const a = anchor(900 - FOOT_PX - GAP_PX - 12 - 199)
    expect(placeOf({ anchor: a, pane, size, inset: 14 }).at).toBe('above')
    const b = anchor(900 - FOOT_PX - GAP_PX - 12 - 200)
    const p = placeOf({ anchor: b, pane, size, inset: 14 })
    expect(p.at).toBe('below')
    expect(p.top + size.height).toBeLessThanOrEqual(pane.bottom - FOOT_PX)
  })
  it('inside the pane by 12 px', () => {
    expect(placeOf({ anchor: anchor(200, 5), pane, size, inset: 14 }).left).toBe(EDGE_PX)
    expect(placeOf({ anchor: anchor(200, 760), pane, size, inset: 14 }).left).toBe(800 - EDGE_PX - 416)
  })
  it("a superscript's line foot counts: the anchor's bottom is the line's foot, and the preview stands under it", () => {
    const sup = { left: 300, top: 200, right: 306, bottom: 206 }
    const withFoot = { ...sup, bottom: 214 }
    expect(placeOf({ anchor: withFoot, pane, size, inset: 14 }).top).toBe(214 + GAP_PX)
  })
  it("a card's text starts at the bracket's left: its left is the bracket's less its padding", () => {
    expect(placeOf({ anchor: anchor(200, 300), pane, size, inset: 14 }).left).toBe(286)
    expect(placeOf({ anchor: anchor(200, 300), pane, size, inset: 10 }).left).toBe(290)
  })
  it('a swap keeps its side where that side still has room, and leaves it only where the other has more', () => {
    // (room both ways: by default below; kept above)
    expect(placeOf({ anchor: anchor(450), pane, size, inset: 14, keep: 'above' }).at).toBe('above')
    // (kept below with no room below and more above: above)
    expect(placeOf({ anchor: anchor(780), pane, size, inset: 14, keep: 'below' }).at).toBe('above')
  })
  it('states the room on its side, which a card gives way to', () => {
    const p = placeOf({ anchor: anchor(600), pane, size: { width: 416, height: 900 }, inset: 14 })
    expect(p.at).toBe('above')
    expect(p.room).toBe(600 - pane.top - GAP_PX - EDGE_PX)
  })
})
