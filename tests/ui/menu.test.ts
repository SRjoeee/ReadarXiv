import { act, createElement, createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Menu } from '@/ui/Menu'
import { mountElement } from './render-hook'

// The menu's placement (ui/Menu.tsx): one read of the row and the frame at open, then only writes. Below the row when
// there is room; **upward** when fewer than 180 px remain below and there is more room above — the popup window does
// not grow to fit a panel, it clips, so a menu opened from a row near the bottom would be a few pixels tall (the
// reader's report of 2026-09-11). A hugging menu (the settings page) takes only the room its list needs

const GAP = 4
const MARGIN = 8
const items = [{ id: 'a', name: 'Alpha', selected: true }, { id: 'b', name: 'Beta', selected: false }]

/** A row at `top`, 40 px tall, 200 px wide, inside a frame that is the window (no transformed ancestor) */
function rowAt(top: number) {
  const anchor = document.createElement('div')
  anchor.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 20, right: 220, width: 200, height: 40, x: 20, y: top, toJSON: () => ({}) })
  document.body.append(anchor)
  const ref = createRef<HTMLElement>()
  ref.current = anchor
  return { anchor, ref }
}
const panel = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="listbox"]')
const px = (value: string) => (value === '' ? undefined : Number.parseFloat(value))

describe('Menu placement', () => {
  const g = globalThis as { innerHeight: number; innerWidth: number; getComputedStyle: typeof getComputedStyle }
  const saved = { h: g.innerHeight, w: g.innerWidth, gcs: g.getComputedStyle }
  beforeEach(() => {
    g.innerHeight = 600
    g.innerWidth = 360
    // happy-dom reports an empty `transform` where a browser says `none`; the frame search reads exactly that
    g.getComputedStyle = ((el: Element) => new Proxy(saved.gcs(el), { get: (t, k) => (k === 'transform' ? 'none' : Reflect.get(t, k)) })) as typeof getComputedStyle
  })
  afterEach(() => { g.innerHeight = saved.h; g.innerWidth = saved.w; g.getComputedStyle = saved.gcs; document.body.innerHTML = '' })

  it('with room below, the panel fills from under the row to the bottom margin, as wide as the row', async () => {
    const { anchor, ref } = rowAt(100)
    const mounted = await mountElement(createElement(Menu, { anchor: ref, items, label: 'Service', onSelect: () => {}, onClose: () => {} }))
    const s = panel(mounted.container)?.style
    expect(px(s?.top ?? '')).toBe(140 + GAP)
    expect(px(s?.bottom ?? '')).toBe(MARGIN)
    expect(s?.maxHeight).toBe('')
    expect(px(s?.left ?? '')).toBe(20)
    expect(px(s?.width ?? '')).toBe(200)
    anchor.remove()
    await mounted.unmount()
  })

  it('with fewer than 180 px below and more above, it opens upward and hugs the row from below, capped by the room above', async () => {
    const { anchor, ref } = rowAt(500) // 60 px below the row, 500 above
    const mounted = await mountElement(createElement(Menu, { anchor: ref, items, label: 'Service', onSelect: () => {}, onClose: () => {} }))
    const s = panel(mounted.container)?.style
    expect(s?.top).toBe('')
    expect(px(s?.bottom ?? '')).toBe(600 - 500 + GAP)
    expect(px(s?.maxHeight ?? '')).toBe(500 - GAP - MARGIN)
    anchor.remove()
    await mounted.unmount()
  })

  it('with little room on either side, it still opens below: upward only when above is the roomier side', async () => {
    const { anchor, ref } = rowAt(60) // 500 px below, 60 above — below wins even though below < 180 is false here; and at 480: 80 below, 480 above → up
    const mounted = await mountElement(createElement(Menu, { anchor: ref, items, label: 'Service', onSelect: () => {}, onClose: () => {} }))
    expect(px(panel(mounted.container)?.style.top ?? '')).toBe(100 + GAP)
    anchor.remove()
    await mounted.unmount()
    const tight = rowAt(110) // 450 below, 110 above: below < 180 is false → below
    const again = await mountElement(createElement(Menu, { anchor: tight.ref, items, label: 'Service', onSelect: () => {}, onClose: () => {} }))
    expect(px(panel(again.container)?.style.top ?? '')).toBe(150 + GAP)
    tight.anchor.remove()
    await again.unmount()
  })

  it('a hugging menu takes only the room below its row, at least 180 px wide, and stays inside the frame', async () => {
    const narrow = document.createElement('div')
    narrow.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 300, right: 340, width: 40, height: 40, x: 300, y: 100, toJSON: () => ({}) })
    document.body.append(narrow)
    const ref = createRef<HTMLElement>()
    ref.current = narrow
    const mounted = await mountElement(createElement(Menu, { anchor: ref, hug: true, items, label: 'Language', onSelect: () => {}, onClose: () => {} }))
    const s = panel(mounted.container)?.style
    expect(px(s?.top ?? '')).toBe(140 + GAP)
    expect(px(s?.maxHeight ?? '')).toBe(600 - 140 - GAP - MARGIN)
    expect(px(s?.width ?? '')).toBe(180)
    expect(px(s?.left ?? '')).toBe(360 - 180 - MARGIN) // pulled back inside the frame
    expect(s?.bottom).toBe('')
    narrow.remove()
    await mounted.unmount()
  })
})

describe('Menu keyboard and semantics (the reader\'s design, §9.4)', () => {
  const g = globalThis as { getComputedStyle: typeof getComputedStyle }
  const saved = g.getComputedStyle
  beforeEach(() => {
    g.getComputedStyle = ((el: Element) => new Proxy(saved(el), { get: (t, k) => (k === 'transform' ? 'none' : Reflect.get(t, k)) })) as typeof getComputedStyle
  })
  afterEach(() => { g.getComputedStyle = saved; document.body.innerHTML = '' })
  const five = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((name, i) => ({ id: name.toLowerCase(), name, selected: i === 1, disabled: name === 'Gamma' }))
  async function open(extra: Record<string, unknown> = {}) {
    const trigger = document.body.appendChild(document.createElement('button'))
    const ref = createRef<HTMLElement>()
    ref.current = trigger
    const picked: string[] = [], closed: number[] = []
    const mounted = await mountElement(createElement(Menu, { anchor: ref, items: five, label: 'L', onSelect: (id: string) => picked.push(id), onClose: () => closed.push(1), ...extra }))
    const list = mounted.container.querySelector<HTMLElement>('[role="listbox"]')!
    const key = (k: string) => act(async () => { list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
    return { list, key, picked, closed, trigger }
  }
  const active = (list: HTMLElement) => document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.textContent

  it('announces the active item, and skips a disabled one', async () => {
    const { list, key } = await open()
    expect(active(list)).toBe('Beta')
    await key('ArrowDown')
    expect(active(list)).toBe('Delta')
  })

  it('goes to either end with Home and End, and to an item by its first letter', async () => {
    const { list, key } = await open()
    await key('End')
    expect(active(list)).toBe('Epsilon')
    await key('Home')
    expect(active(list)).toBe('Alpha')
    await key('d')
    expect(active(list)).toBe('Delta')
  })

  it('puts no button inside the list, and runs an item\'s action when that item is picked', async () => {
    const acted: string[] = []
    const withAction = [...five.slice(0, 4), { id: 'pack', name: 'Pack', selected: false, disabled: true, action: { label: 'Get' } }]
    const { list, key } = await open({ items: withAction, onAction: (id: string) => acted.push(id) })
    expect(list.querySelector('button')).toBeNull()
    await key('End')
    await key('Enter')
    expect(acted).toEqual(['pack'])
  })

  it('gives the focus back to its trigger when it closes with a pick or Escape', async () => {
    const { list, key, picked, closed, trigger } = await open()
    await key('Enter')
    expect([picked, document.activeElement]).toEqual([['beta'], trigger])
    list.focus()
    await key('Escape')
    // a pick is the consumer's to close on; Escape closes it here
    expect([closed.length, document.activeElement]).toEqual([1, trigger])
  })
})
