// Where a kept panel may be and how large it may grow (preview/panel.ts; the approved prototype's eighth pass, `placeKept`,
// `maxScale`, `softTarget`, `panelApply`): one rule for its place, whoever moves it (a drag, the arrows, a zoom): whole inside the
// reader's window, 8 px from its sides and foot, under the toolbar (52 px); its size from the one it opened at to the smaller of
// 300 % and the size at which it fits that rule's room; a gesture slowed over the last stretch before a bound and stopped there
// (plainly stopped under reduced motion); a zoom about the pointer: the pointer's place in the image stays under the pointer.
import { describe, expect, it } from 'vitest'
import {
  ease,
  KEEP_EDGE,
  KEEP_TOP,
  KEPT_MOST,
  mostScale,
  PANEL_PAD,
  placeKept,
  softScale,
  zoomAbout,
} from '../../src/preview/panel.ts'

const area = { width: 1400, height: 900 }

describe('the one rule for where a kept panel may be', () => {
  it('whole inside the window: 8 px from its sides and foot, under the toolbar’s 52 px', () => {
    const box = { width: 300, height: 200 }
    expect(placeKept({ ...box, left: 400, top: 300 }, area)).toEqual({ left: 400, top: 300 })
    expect(placeKept({ ...box, left: -50, top: 10 }, area)).toEqual({ left: KEEP_EDGE, top: KEEP_TOP })
    expect(placeKept({ ...box, left: 1300, top: 800 }, area)).toEqual({
      left: 1400 - 300 - KEEP_EDGE,
      top: 900 - 200 - KEEP_EDGE,
    })
  })
})

describe('how large a kept panel may grow', () => {
  it('the most is where it meets the window less the rule’s margins and its padding, under 300 %', () => {
    // (its image 400 x 300 at 100 %: room 1400 - 16 - 20 across, 900 - 52 - 8 - 20 down, a pixel a segment for rounding)
    expect(mostScale({ s0: 1, extent: { width: 400, height: 300 }, segs: 1, area })).toBeCloseTo(819 / 300, 6)
    expect(PANEL_PAD).toBe(10)
  })
  it('300 % binds where the window has more room (a large window, a small note)', () => {
    expect(mostScale({ s0: 1, extent: { width: 200, height: 60 }, segs: 1, area: { width: 2560, height: 1440 } })).toBe(
      KEPT_MOST,
    )
    expect(KEPT_MOST).toBe(3)
  })
  it('never less than the size it opened at (there the gesture does nothing)', () => {
    expect(mostScale({ s0: 1.2, extent: { width: 1200, height: 700 }, segs: 2, area })).toBe(1.2)
  })
})

describe('a gesture’s soft stop', () => {
  it('away from both bounds a gesture’s factor is taken whole', () => {
    expect(softScale({ s: 1, f: 1.1, lo: 0.8, hi: 3, reduced: false })).toBeCloseTo(1.1, 9)
  })
  it('over the last 15 % before a bound it slows, to a quarter at the bound, and stops there', () => {
    const near = softScale({ s: 2.9, f: 1.1, lo: 1, hi: 3, reduced: false })
    expect(near).toBeGreaterThan(2.9)
    expect(near).toBeLessThan(2.9 * 1.1 ** 0.5)
    expect(softScale({ s: 3, f: 1.5, lo: 1, hi: 3, reduced: false })).toBe(3)
    expect(softScale({ s: 1.02, f: 0.5, lo: 1, hi: 3, reduced: false })).toBe(1)
  })
  it('under reduced motion it simply stops at the bound', () => {
    expect(softScale({ s: 2.9, f: 1.1, lo: 1, hi: 3, reduced: true })).toBe(3)
    expect(softScale({ s: 2, f: 1.1, lo: 1, hi: 3, reduced: true })).toBeCloseTo(2.2, 9)
  })
})

describe('a zoom about the pointer', () => {
  it('the pointer’s place in the image stays under the pointer', () => {
    // (a panel at 100, 100: its image at 110, 110; the pointer 100 px into it across, 50 down; the image doubled)
    const at = zoomAbout({
      left: 100,
      top: 100,
      pointer: { x: 210, y: 160 },
      from: { width: 200, height: 100 },
      to: { width: 400, height: 200 },
    })
    expect(at).toEqual({ left: 0, top: 50 })
  })
  it('the layer’s curve: cubic-bezier(0.2, 0, 0, 1), from 0 to 1, rising', () => {
    expect(ease(0)).toBeCloseTo(0, 6)
    expect(ease(1)).toBeCloseTo(1, 6)
    let last = 0
    for (let x = 0.05; x <= 1; x += 0.05) {
      expect(ease(x)).toBeGreaterThanOrEqual(last)
      last = ease(x)
    }
    expect(ease(0.5)).toBeGreaterThan(0.8)
  })
})
