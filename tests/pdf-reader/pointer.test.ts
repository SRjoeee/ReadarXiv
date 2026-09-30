import { describe, expect, it } from 'vitest'
import { type Box, measurePane, pointerPath, pointOn, type Viewport } from '@/pdf-reader/engine/pointer.mjs'

// The highlight's pointer path (pointer.mjs), without a browser: elements as the parts of them it reads, the frames and
// the timers as queues run by hand.

/** an element whose border box is drawn at (left, top) on the screen; its offsets, borders, scroll and offsetParent by `o` */
const box = (left: number, top: number, o: Partial<Box> = {}): Box => ({ getBoundingClientRect: () => ({ left, top }), clientLeft: 0, clientTop: 0, offsetLeft: 0, offsetTop: 0, offsetParent: null, scrollLeft: 0, scrollTop: 0, ...o })

describe('measurePane: where a pane and its pages are', () => {
  it('the pane\'s content box on the screen, and each page\'s content box in the stack, from the stack\'s top', () => {
    // a pane at (100, 44) with a 1 px border, scrolled 300 down; its stack 3 across and 4 down it, its pages 10 across
    // and 20 down the stack, 1000 apart, each with a 9 px border
    const stack = box(101 + 3, 45 + 4 - 300, { offsetLeft: 3, offsetTop: 4 })
    const pages = [0, 1000].map(y => ({ div: box(104 + 10, 49 - 300 + 20 + y, { clientLeft: 9, clientTop: 9 }) }))
    const at = measurePane(box(100, 44, { clientLeft: 1, clientTop: 1, offsetLeft: 100, offsetTop: 44 }), stack, pages)
    expect([at.left, at.top]).toEqual([101, 45])
    expect([...at.tops]).toEqual([33, 1033])
    expect([...at.lefts]).toEqual([22, 22])
  })
  it('a page stack moved by a transform (a follower on the compositor) leaves the pages\' places in it as they were', () => {
    const pane = box(0, 44, { offsetTop: 44 }), pages = (shift: number) => [0, 1000].map(y => ({ div: box(10, 44 + 20 + y - shift) }))
    const still = measurePane(pane, box(0, 44), pages(0)), moved = measurePane(pane, box(0, 44 - 57.5, { offsetTop: 0 }), pages(57.5))
    expect([...moved.tops]).toEqual([...still.tops])
  })
  // the reader's panes: the scroller absolute in its pane, the pane in the fixed document area (App.tsx, reader.css)
  const chain = (paneLeft: number, drawnAt: number) => {
    const doc = box(0, 0, { offsetLeft: 236, offsetTop: 44 }), pane = box(0, 0, { offsetLeft: paneLeft, offsetParent: doc })
    return box(drawnAt, 44, { offsetParent: pane })
  }
  it('a pane drawn sliding by a transform (the contents panel opening) is where its layout puts it, where the slide ends', () => {
    // the document area moved 236 across at once and drawn from its old place, translated back by 236
    const pages = [{ div: box(0, 0) }]
    expect(measurePane(chain(754, 754), box(0, 0), pages)).toMatchObject({ left: 990, top: 44 })
  })
  it('a pane not transformed keeps the fraction of a pixel its box has, which offsets round away', () => {
    expect(measurePane(chain(755, 990.5), box(0, 0), [])).toMatchObject({ left: 990.5, top: 44 })
  })
})

describe('pointOn: a point of the screen on a page, in PDF units', () => {
  /** a page 600 × 800 units drawn at scale 2 */
  const viewport: Viewport = { width: 1200, height: 1600, scale: 2, convertToPdfPoint: (x, y) => [x / 2, 800 - y / 2] }
  const pages = [{ viewport }, { viewport }, { viewport }]
  // pages 10 px from the pane's left and 20 px apart, the pane's content box at (100, 50)
  const at = { left: 100, top: 50, tops: Float64Array.from([10, 1630, 3250]), lefts: Float64Array.from([10, 10, 10]) }
  it('finds the page under the point, and the point on it', () => {
    expect(pointOn(at, pages, 0, 0, 100 + 10 + 200, 50 + 10 + 100)).toEqual({ page: 1, x: 100, y: 750, scale: 2 })
    expect(pointOn(at, pages, 0, 0, 100 + 10 + 200, 50 + 3250 + 100)).toMatchObject({ page: 3, x: 100, y: 750 })
  })
  it('adds the pane\'s scroll', () => {
    expect(pointOn(at, pages, 0, 1620, 100 + 10 + 200, 50 + 10 + 100)).toMatchObject({ page: 2, x: 100, y: 750 })
  })
  it('is off the pages between them, beside them and above the first', () => {
    expect(pointOn(at, pages, 0, 0, 300, 50 + 1620)).toBeNull()
    expect(pointOn(at, pages, 0, 0, 100 + 5, 200)).toBeNull()
    expect(pointOn(at, pages, 0, 0, 100 + 10 + 1201, 200)).toBeNull()
    expect(pointOn(at, pages, 0, 0, 300, 50 + 5)).toBeNull()
    expect(pointOn(null, pages, 0, 0, 300, 300)).toBeNull()
  })
})

describe('pointerPath: the pointer\'s moves once a frame, a miss held', () => {
  function rig(under: (x: number) => number | null) {
    const frames: (() => void)[] = [], timers = new Map<number, { run: () => void; ms: number }>(), found: number[] = [], lights: (number | null)[] = []
    let lit: number | null = null, id = 0
    const path = pointerPath<string>({
      find: p => { found.push(p.x); return under(p.x) },
      light: v => { lit = v; lights.push(v) },
      lit: () => lit != null,
      hold: 120,
      frame: f => { frames.push(f); return frames.length },
      later: (run, ms) => { timers.set(++id, { run, ms }); return id },
      cancel: t => { timers.delete(t) },
    })
    const frame = () => { for (const f of frames.splice(0)) f() }
    const elapse = () => { for (const [t, { run }] of [...timers]) { timers.delete(t); run() } }
    return { path, frames, timers, found, lights, frame, elapse, get lit() { return lit } }
  }
  it('many moves in a frame are looked at once, at the last place', () => {
    const r = rig(() => 7)
    for (const x of [1, 2, 3]) r.path.moved('left', x, 0)
    expect(r.frames.length).toBe(1)
    r.frame()
    expect(r.found).toEqual([3])
    expect(r.lit).toBe(7)
    expect(r.path.hit).toBe(7)
  })
  it('a miss keeps what is lit for the hold, then lets go', () => {
    const r = rig(x => (x < 10 ? 7 : null))
    r.path.moved('left', 1, 0); r.frame()
    r.path.moved('left', 20, 0); r.frame()
    expect(r.lit).toBe(7)
    expect([...r.timers.values()].map(t => t.ms)).toEqual([120])
    r.elapse()
    expect(r.lit).toBeNull()
  })
  it('a hit again before the hold ends keeps the wash on without a blink, and one timer stands for a run of misses', () => {
    const r = rig(x => (x < 10 ? 7 : x < 30 ? null : 8))
    r.path.moved('left', 1, 0); r.frame()
    r.path.moved('left', 20, 0); r.frame()
    r.path.moved('left', 21, 0); r.frame()
    expect(r.timers.size).toBe(1)
    r.path.moved('left', 40, 0); r.frame()
    expect(r.timers.size).toBe(0)
    expect(r.lights).toEqual([7, 8])
  })
  it('leaving the pane is a miss, held; nothing lit, nothing held', () => {
    const r = rig(() => 7)
    r.path.left('left')
    expect(r.timers.size).toBe(0)
    r.path.moved('left', 1, 0); r.frame()
    r.path.left('left')
    r.frame()
    expect(r.found).toEqual([1])
    expect(r.timers.size).toBe(1)
  })
})
