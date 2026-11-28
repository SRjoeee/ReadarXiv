// A kept panel's own zoom and its percentage (preview/keep.ts; the approved prototype's eighth pass): a zoom gesture on a kept
// panel (Ctrl and the wheel, a trackpad's pinch in Chrome; WebKit's gesture events; two touch pointers) zooms its image about the
// pointer, never the browser's page, from the size it opened at to its most (preview/panel.ts), its image always whole; the
// bitmap scaled while the gesture runs, the crop drawn again at the settled scale; the keys +, - and 0; the percentage chip at the
// top-left: live while a zoom runs, then glass (ghost) for 1.2 s and while the size is not the opening one and the pointer is on
// the panel, awake within 28 px of it or on the keyboard's focus; a press returns the panel to its opening size. Where the
// opening size is already the most, a gesture does nothing and no chip shows. Over stand-ins, the clock run by hand.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKeep } from '../../src/preview/keep.ts'
import { KEEP_EDGE, KEEP_TOP, mostScale, PANEL_PAD, SETTLE_MS } from '../../src/preview/panel.ts'
import type { PreviewContent } from '../../src/preview/previews.ts'
import type { Clock } from '../../src/stack/clock.ts'
import { READER_CSS } from '../../src/styles.ts'

function testClock() {
  let now = 0,
    next = 1
  const due = new Map<number, { at: number; f: () => void }>()
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => {
      const id = next++
      due.set(id, { at: now + ms, f })
      return id
    },
    clear: (id) => void due.delete(id),
    frame: (f) => {
      const id = next++
      due.set(id, { at: now + 16, f })
      return id
    },
    cancel: (id) => void due.delete(id),
  }
  /** time passed in 16 ms frames, each due timer and frame run in its turn */
  const pass = async (ms: number) => {
    const end = now + ms
    for (;;) {
      for (let i = 0; i < 4; i++) await Promise.resolve()
      const first = [...due].sort((a, b) => a[1].at - b[1].at)[0]
      if (!first || first[1].at > end) break
      now = Math.max(now, first[1].at)
      due.delete(first[0])
      first[1].f()
    }
    now = end
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }
  return { clock, pass }
}

const words = {
  keep: (l: string) => `${l}: keep`,
  close: (l: string) => `Close ${l}`,
  reset: 'Reset size',
  go: 'Go to',
  search: 'S',
}
const AREA = { width: 1400, height: 900 }

/** a crop drawn at scale s: its image `w` x `h` CSS px at 100 % */
function cropAt(s: number, w: number, h: number) {
  const crop = document.createElement('div')
  crop.className = 'axt-pv-crop'
  crop.setAttribute('role', 'img')
  crop.dataset.scale = String(s)
  const seg = document.createElement('div')
  seg.className = 'axt-pv-seg'
  seg.style.width = `${Math.ceil(w * s - 1e-9)}px`
  seg.style.height = `${Math.ceil(h * s - 1e-9)}px`
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * s - 1e-9)
  canvas.height = Math.ceil(h * s - 1e-9)
  seg.append(canvas)
  crop.append(seg)
  return crop
}

function setUp(
  o: {
    w?: number
    h?: number
    s0?: number
    left?: number
    top?: number
    reduced?: boolean
    /** the reader's window, which a test may resize (default AREA) */
    area?: { width: number; height: number }
  } = {},
) {
  const w = o.w ?? 200,
    h = o.h ?? 100,
    s0 = o.s0 ?? 1
  const area = o.area ?? AREA
  const { clock, pass } = testClock()
  const draw = vi.fn(async (s: number, _signal: AbortSignal) => cropAt(s, w, h))
  const pv = document.createElement('div')
  pv.className = 'axt-pv'
  pv.style.left = `${o.left ?? 100}px`
  pv.style.top = `${o.top ?? 200}px`
  const button = document.createElement('button')
  button.className = 'axt-pv-keep'
  const crop = cropAt(s0, w, h)
  button.append(crop)
  pv.append(button)
  document.body.append(pv)
  const content: PreviewContent = {
    el: button,
    kind: 'crop',
    label: 'Figure 1',
    described: crop,
    zoom: {
      scale: s0,
      extent: { width: w, height: h },
      segs: 1,
      size: (s) => ({ width: Math.ceil(w * s - 1e-9), height: Math.ceil(h * s - 1e-9) }),
      draw,
    },
  }
  const link = document.createElement('a')
  link.href = '#x'
  document.body.append(link)
  const k = createKeep({ clock, words: () => words, area: () => area, reduced: () => !!o.reduced })
  k.keep(pv, content, link, false)
  const kv = () => pv.querySelector<HTMLElement>('.axt-pv-kv')!
  const chip = () => pv.querySelector<HTMLButtonElement>('button.axt-pv-chip')!
  const size = () => ({ width: Number.parseFloat(kv().style.width), height: Number.parseFloat(kv().style.height) })
  const at = () => ({ left: Number.parseFloat(pv.style.left), top: Number.parseFloat(pv.style.top) })
  const wheel = (x: number, y: number, dy = -40, ctrl = true) => {
    const e = new WheelEvent('wheel', { deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true })
    // (happy-dom's WheelEvent has no ctrlKey, clientX or clientY of its own)
    for (const [k2, v] of [
      ['ctrlKey', ctrl],
      ['clientX', x],
      ['clientY', y],
    ] as const)
      Object.defineProperty(e, k2, { value: v })
    kv().dispatchEvent(e)
    return e
  }
  const key = (k2: string, on: Element = pv) =>
    on.dispatchEvent(new KeyboardEvent('keydown', { key: k2, bubbles: true, cancelable: true }))
  return { k, pv, kv, chip, size, at, wheel, key, pass, draw, link }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('a kept panel’s own zoom', () => {
  it('a Ctrl-wheel on it zooms its image about the pointer, its page kept from the browser, the chip live', async () => {
    const t = setUp()
    // (the image at 110, 210; the pointer 100 px into it across, 50 down)
    const e = t.wheel(210, 260)
    expect(e.defaultPrevented).toBe(true)
    await t.pass(16)
    const f = Math.exp(0.1)
    expect(t.size()).toEqual({ width: Math.ceil(200 * f), height: Math.ceil(100 * f) })
    const s = t.size()
    // (the place rounded to a whole pixel)
    expect(Math.abs(t.at().left - (210 - PANEL_PAD - 100 * (s.width / 200)))).toBeLessThanOrEqual(0.5)
    expect(Math.abs(t.at().top - (260 - PANEL_PAD - 50 * (s.height / 100)))).toBeLessThanOrEqual(0.5)
    expect(t.pv.dataset.axtChip).toBe('live')
    expect(t.chip().textContent).toBe('111%')
    // (the bitmap scaled while the gesture runs; nothing drawn yet)
    expect(t.pv.querySelector<HTMLElement>('.axt-pv-crop')!.style.transform).toMatch(/^scale\(1\.10/)
    expect(t.draw).not.toHaveBeenCalled()
  })
  it('settled (150 ms with no event), it is drawn again at the settled scale; the chip glass for 1.2 s, then gone', async () => {
    const t = setUp()
    t.wheel(210, 260)
    await t.pass(16)
    await t.pass(150)
    expect(t.draw).toHaveBeenCalledTimes(1)
    expect(t.draw.mock.calls[0]![0]).toBeCloseTo(Math.exp(0.1), 6)
    const crop = t.pv.querySelector<HTMLElement>('.axt-pv-crop')!
    expect(Number(crop.dataset.scale)).toBeCloseTo(Math.exp(0.1), 6)
    expect(crop.style.transform).toBe('')
    expect(t.pv.dataset.axtChip).toBe('ghost')
    await t.pass(1200)
    expect(t.pv.dataset.axtChip).toBe('none')
  })
  it('the drawing it replaced is let go (its canvases emptied)', async () => {
    const t = setUp()
    const old = t.pv.querySelector('canvas')!
    t.wheel(210, 260)
    await t.pass(200)
    expect(old.width).toBe(0)
    expect(t.pv.querySelectorAll('canvas')).toHaveLength(1)
  })
  it('from the size it opened at to 300 % (a large room): it stops at each end', async () => {
    const t = setUp({ w: 100, h: 50 })
    for (let i = 0; i < 80; i++) {
      t.wheel(200, 260)
      await t.pass(16)
    }
    expect(t.chip().textContent).toBe('300%')
    expect(t.size()).toEqual({ width: 300, height: 150 })
    for (let i = 0; i < 80; i++) {
      t.wheel(200, 260, 40)
      await t.pass(16)
    }
    expect(t.chip().textContent).toBe('100%')
    expect(t.size()).toEqual({ width: 100, height: 50 })
  })
  it('its most by the window: the panel whole inside the rule, from near each edge', async () => {
    for (const [left, top, x, y] of [
      [10, 60, 30, 80],
      [900, 60, 1300, 80],
      [10, 500, 30, 880],
      [900, 500, 1300, 880],
    ] as const) {
      const t = setUp({ w: 400, h: 300, left, top })
      for (let i = 0; i < 80; i++) {
        t.wheel(x, y)
        await t.pass(16)
      }
      const s = t.size(),
        p = t.at()
      expect(s.height).toBeLessThanOrEqual(AREA.height - KEEP_TOP - KEEP_EDGE - 2 * PANEL_PAD)
      expect(s.height).toBeGreaterThan(AREA.height - KEEP_TOP - KEEP_EDGE - 2 * PANEL_PAD - 3)
      expect(p.left).toBeGreaterThanOrEqual(KEEP_EDGE)
      expect(p.top).toBeGreaterThanOrEqual(KEEP_TOP)
      expect(p.left + s.width + 2 * PANEL_PAD).toBeLessThanOrEqual(AREA.width - KEEP_EDGE)
      expect(p.top + s.height + 2 * PANEL_PAD).toBeLessThanOrEqual(AREA.height - KEEP_EDGE)
      document.body.innerHTML = ''
    }
  })
  it('where the size it opened at is already the most, a gesture does nothing, is still kept from the page, and no chip shows', async () => {
    // (its image as wide as the room across: 1400 - 16 - 20, less a pixel)
    const t = setUp({ w: 1363, h: 100 })
    const before = t.size()
    const e = t.wheel(300, 260)
    await t.pass(400)
    expect(e.defaultPrevented).toBe(true)
    expect(t.size()).toEqual(before)
    expect(t.pv.dataset.axtChip).toBe('none')
    t.key('+')
    await t.pass(400)
    expect(t.size()).toEqual(before)
    expect(t.draw).not.toHaveBeenCalled()
  })
  it('a wheel without Ctrl is no zoom', async () => {
    const t = setUp()
    t.wheel(210, 260, -40, false)
    await t.pass(400)
    expect(t.size()).toEqual({ width: 200, height: 100 })
  })
  it('WebKit’s gesture events zoom it too, their default prevented', async () => {
    const t = setUp()
    const ev = (type: string, scale: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(e, { scale, clientX: 210, clientY: 260 })
      t.kv().dispatchEvent(e)
      return e
    }
    expect(ev('gesturestart', 1).defaultPrevented).toBe(true)
    expect(ev('gesturechange', 1.5).defaultPrevented).toBe(true)
    expect(t.pv.dataset.axtChip).toBe('live')
    expect(t.size().width).toBe(300)
    ev('gestureend', 1.5)
    await t.pass(16)
    expect(t.pv.dataset.axtChip).toBe('ghost')
    expect(t.draw).toHaveBeenCalledTimes(1)
  })
  it('two touch pointers zoom it, by their spread, about their midpoint', async () => {
    const t = setUp()
    const p = (type: string, id: number, x: number, y: number) =>
      t.kv().dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          bubbles: true,
          button: 0,
        }),
      )
    p('pointerdown', 1, 150, 250)
    p('pointerdown', 2, 250, 250)
    p('pointermove', 2, 300, 250)
    expect(t.size().width).toBe(300)
    expect(t.pv.dataset.axtChip).toBe('live')
    p('pointerup', 2, 300, 250)
    await t.pass(16)
    expect(t.pv.dataset.axtChip).toBe('ghost')
  })
})

describe('the keys and the chip', () => {
  it('+ and - step it by the panes’ tenth in 120 ms, 0 returns it to the size it opened at', async () => {
    const t = setUp()
    t.key('+')
    await t.pass(200)
    expect(t.size().width).toBe(220)
    t.key('+')
    await t.pass(200)
    expect(t.size().width).toBe(242)
    t.key('-')
    await t.pass(200)
    expect(t.size().width).toBe(220)
    t.key('0')
    await t.pass(300)
    expect(t.size().width).toBe(200)
  })
  it('the chip: at the top-left, named to reset the size; a Tab stop only while the size is not the opening one', async () => {
    const t = setUp()
    expect(t.chip().getAttribute('aria-label')).toBe('Reset size')
    expect(t.chip().tabIndex).toBe(-1)
    expect(t.chip().getAttribute('aria-hidden')).toBe('true')
    // (before the close, in the panel's order: the chip at the top-left, the × at the top-right)
    const kids = [...t.pv.children]
    expect(kids.indexOf(t.chip())).toBeLessThan(kids.indexOf(t.pv.querySelector('.axt-pv-x')!))
    t.key('+')
    await t.pass(200)
    expect(t.chip().tabIndex).toBe(0)
    expect(t.chip().hasAttribute('aria-hidden')).toBe(false)
  })
  it('on the panel, zoomed: glass; within 28 px of the chip: awake; the pointer gone: none', async () => {
    const t = setUp()
    t.key('+')
    await t.pass(2000)
    expect(t.pv.dataset.axtChip).toBe('none')
    t.pv.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))
    expect(t.pv.dataset.axtChip).toBe('ghost')
    vi.spyOn(t.chip(), 'getBoundingClientRect').mockReturnValue({
      left: 106,
      top: 206,
      right: 152,
      bottom: 230,
      width: 46,
      height: 24,
      x: 106,
      y: 206,
      toJSON: () => ({}),
    } as DOMRect)
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 152 + 28, clientY: 218, pointerType: 'mouse' }))
    expect(t.pv.dataset.axtChip).toBe('awake')
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 152 + 29, clientY: 218, pointerType: 'mouse' }))
    expect(t.pv.dataset.axtChip).toBe('ghost')
    t.pv.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    expect(t.pv.dataset.axtChip).toBe('none')
  })
  it('a press on the chip returns it to the size it opened at in 240 ms, then no chip; drawn again at that size', async () => {
    const t = setUp()
    t.key('+')
    await t.pass(400)
    t.pv.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))
    t.draw.mockClear()
    t.chip().click()
    await t.pass(120)
    expect(t.size().width).toBeGreaterThan(200)
    expect(t.size().width).toBeLessThan(220)
    await t.pass(200)
    expect(t.size().width).toBe(200)
    expect(t.pv.dataset.axtChip).toBe('none')
    expect(t.draw).toHaveBeenCalledTimes(1)
    expect(t.draw.mock.calls[0]![0]).toBe(1)
  })
  it('under reduced motion the steps and the reset are at once', async () => {
    const t = setUp({ reduced: true })
    t.key('+')
    expect(t.size().width).toBe(220)
    t.key('0')
    expect(t.size().width).toBe(200)
  })
  it('the arrows and a drag move it through the same rule, by its own size', async () => {
    const t = setUp({ w: 400, h: 300, left: 900, top: 300 })
    for (let i = 0; i < 40; i++) t.key('ArrowRight')
    expect(t.at().left).toBe(AREA.width - KEEP_EDGE - 400 - 2 * PANEL_PAD)
  })
})

describe('a kept panel when the reader’s window is resized (the one rule applied again: the drag guide’s re-clamp)', () => {
  const resize = () => window.dispatchEvent(new Event('resize'))
  /** whether the panel at (left, top) with its image `s` stands whole inside the rule in `area` */
  const whole = (p: { left: number; top: number }, s: { width: number; height: number }, area: typeof AREA) =>
    p.left >= KEEP_EDGE &&
    p.top >= KEEP_TOP &&
    p.left + s.width + 2 * PANEL_PAD <= area.width - KEEP_EDGE &&
    p.top + s.height + 2 * PANEL_PAD <= area.height - KEEP_EDGE

  it('the window shrunk: the panel back inside the rule at once, at its size where that still fits', async () => {
    const area = { ...AREA }
    // (its box 220 x 120 at 1,100, 600: whole in 1,400 x 900, past the right and the foot of 1,000 x 700)
    const t = setUp({ area, left: 1100, top: 600 })
    expect(t.at()).toEqual({ left: 1100, top: 600 })
    area.width = 1000
    area.height = 700
    resize()
    expect(t.at()).toEqual({ left: 1000 - KEEP_EDGE - 220, top: 700 - KEEP_EDGE - 120 })
    expect(t.size()).toEqual({ width: 200, height: 100 })
    expect(t.draw).not.toHaveBeenCalled()
  })
  it('zoomed past the smaller window’s most: brought down to it at once (its percentage too), drawn again at it once the window stands, the drawing it replaced let go; a gesture then stops there', async () => {
    const area = { ...AREA }
    const t = setUp({ area })
    for (let i = 0; i < 40; i++) {
      t.wheel(210, 260)
      await t.pass(16)
    }
    await t.pass(400)
    expect(t.size()).toEqual({ width: 600, height: 300 })
    const was = t.kv().querySelector('canvas')!
    expect(was.width).toBeGreaterThan(0)
    t.draw.mockClear()
    // (two steps of a window's drag, 50 ms apart: placed at each, drawn once, SETTLE_MS after the last)
    area.width = 700
    area.height = 600
    resize()
    await t.pass(50)
    area.width = 500
    area.height = 400
    resize()
    const most = mostScale({ s0: 1, extent: { width: 200, height: 100 }, segs: 1, area })
    expect(most).toBeLessThan(3)
    const s = { width: Math.ceil(200 * most - 1e-9), height: Math.ceil(100 * most - 1e-9) }
    expect(t.size()).toEqual(s)
    expect(whole(t.at(), s, area)).toBe(true)
    expect(t.chip().textContent).toBe(`${Math.round(most * 100)}%`)
    await t.pass(SETTLE_MS - 20)
    expect(t.draw).not.toHaveBeenCalled()
    await t.pass(60)
    expect(t.draw).toHaveBeenCalledTimes(1)
    expect(t.draw.mock.calls[0]![0]).toBe(most)
    expect(was.width).toBe(0)
    // (its most is the new window's: a gesture past it stops there)
    t.wheel(210, 260)
    await t.pass(400)
    expect(t.size()).toEqual(s)
  })
  it('the window grown back: nothing moves and nothing grows', async () => {
    const area = { ...AREA }
    const t = setUp({ area, left: 1100, top: 600 })
    area.width = 1000
    area.height = 700
    resize()
    const p = t.at(),
      s = t.size()
    area.width = 1400
    area.height = 900
    resize()
    await t.pass(400)
    expect(t.at()).toEqual(p)
    expect(t.size()).toEqual(s)
    expect(t.draw).not.toHaveBeenCalled()
  })
  it('closed, it hears no resize: its listener goes with it', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const t = setUp()
    const call = add.mock.calls.find((c) => c[0] === 'resize')
    const signal = (call?.[2] as AddEventListenerOptions | undefined)?.signal
    expect(signal?.aborted).toBe(false)
    expect(t.k.esc()).toBe(true)
    expect(signal?.aborted).toBe(true)
  })
})

describe('the chip’s dress (the prototype’s values, as tokens)', () => {
  it('glass: the surface at 40 % over a 0.5 px blur, digits at 70 % of the ink; awake: the close’s own dress', () => {
    expect(READER_CSS).toMatch(/--axt-pv-glass: 40%;/)
    expect(READER_CSS).toMatch(/--axt-pv-glass-blur: 0\.5px;/)
    expect(READER_CSS).toMatch(/--axt-pv-ghost-ink: 70%;/)
    expect(READER_CSS).toMatch(/--axt-pv-wake: 120ms;/)
    expect(READER_CSS).toMatch(/\.axt-pv-chip \{[^}]*top: 6px; inset-inline-start: 6px;/)
    expect(READER_CSS).toMatch(/\[data-axt-chip="awake"\] \.axt-pv-chip \{[^}]*background: var\(--axt-pv-surface\)/)
    expect(READER_CSS).toMatch(/prefers-reduced-motion: reduce\)[^@]*--axt-pv-wake: 0ms/)
  })
  it('the close is not restyled', () => {
    expect(READER_CSS).toContain(
      '.axt-reader .axt-pv-x { position: absolute; top: 6px; inset-inline-end: 6px; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: var(--axt-pv-surface); box-shadow: var(--axt-pv-shadow); color: var(--axt-pv-ink-2); opacity: 0; transition: opacity 120ms ease-out, color 120ms ease-out; cursor: pointer; }',
    )
  })
})
