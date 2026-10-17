// The layer's links as the reading view draws them (engine/view/links.mjs and its place in the layer side's commit; the links
// design's §4 and §9, 3b): the engine's records made into real links in reading order, named as text, sized by shares of the
// page at any zoom, followed inside the paper on the left's document and through the view's jump, out of it through the host
// alone, and gone with the drawing they belong to. Rows LV1-LV7 on links.mjs alone; LS1-LS7 on the layer side over the fake
// door (helpers/side-setup.ts); the real door's rows are in layer-side-door.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { LinkRecord } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { LINK_NAME_PLACEHOLDER, linkLayer, linkRecords } from '@/pdf-reader/engine/view/links.mjs'
import { internalsOf } from '@/pdf-reader/engine/view/reader-view.mjs'
import { clientOf, FakePDFViewer, type FakeDoc, flush, viewportOf } from './helpers/reader-fakes'
import { ALL, content, installSideFakes, layerOf, M, nearOn, places, rowOf, settle, setup } from './helpers/side-setup'

const rec = (o: Partial<LinkRecord> & Pick<LinkRecord, 'boxes'>): LinkRecord => ({ name: 'n', moved: true, order: 0, ...o }) as LinkRecord
const anchors = (el: Element | null) => [...(el?.querySelectorAll<HTMLAnchorElement>('a.axt-link') ?? [])]
/** a viewport of 612 × 792 PDF units shown a quarter turn round (PDF.js's for /Rotate 90): x across goes down, y up goes across */
const turned = (scale: number) => ({ width: 792 * scale, height: 612 * scale, convertToViewportPoint: (x: number, y: number) => [y * scale, x * scale] })
const noop = { follow: () => {}, open: () => {} }

describe('LV1: records made into anchors, named as text, in reading order', () => {
  it('one anchor a record, in `order`; each named by its record as text, whatever characters it holds', () => {
    const hostile = '<img src=x onerror=alert(1)>‮evil\u0007'
    const layer = linkLayer([
      rec({ boxes: [10, 10, 50, 20], dest: 'cite.b', name: 'second', order: 2 }),
      rec({ boxes: [10, 30, 50, 40], url: 'https://example.org/a', name: hostile, order: 0 }),
      rec({ boxes: [10, 50, 50, 60], dest: 'cite.c', name: 'third', order: 3 }),
      rec({ boxes: [10, 70, 50, 80], dest: 'cite.a', name: 'first', order: 1 }),
    ], { viewport: viewportOf(612, 792, 1), ...noop }) as HTMLDivElement
    const a = anchors(layer)
    expect(a.map(x => x.getAttribute('aria-label'))).toEqual([hostile, 'first', 'second', 'third'])
    // nothing of the name is markup: each anchor holds its boxes' spans alone, and no text
    for (const x of a) {
      expect([...x.children].every(c => c.tagName === 'SPAN' && c.className === 'axt-link-box')).toBe(true)
      expect(x.textContent).toBe('')
    }
    expect(layer.querySelector('img')).toBeNull()
    // real links, the keyboard's: an href each, no tabindex of ours (the document's order is the reading order)
    expect(a.every(x => x.getAttribute('href') && !x.hasAttribute('tabindex'))).toBe(true)
    expect(a[0]?.getAttribute('href')).toBe('https://example.org/a')
    expect(a[0]?.target).toBe('_blank')
    expect(a[0]?.rel).toBe('noopener noreferrer')
    expect(a[1]?.getAttribute('href')).toBe('#cite.a')
  })

  it('a record the view cannot carry is left out: no box of area, both or neither target, an address off the allow-list', () => {
    const list = linkRecords([
      rec({ boxes: [10, 10, 10, 20], dest: 'a' }),
      rec({ boxes: [10, 10, 20, Number.NaN], dest: 'a' }),
      rec({ boxes: [10, 10, 20], dest: 'a' }),
      rec({ boxes: [10, 10, 20, 20], dest: 'a', url: 'https://example.org' }),
      rec({ boxes: [10, 10, 20, 20] }),
      rec({ boxes: [10, 10, 20, 20], url: 'javascript:alert(1)' }),
      rec({ boxes: [10, 10, 20, 20], url: 'data:text/html,x' }),
      rec({ boxes: [10, 10, 20, 20], dest: '' }),
      rec({ boxes: [10, 10, 20, 20], dest: [] }),
      rec({ boxes: [10, 10, 20, 20], url: 'mailto:a@example.org', name: 'ok' }),
    ])
    expect(list.map(r => r.name)).toEqual(['ok'])
    expect(linkLayer([rec({ boxes: [1, 1, 1, 1], dest: 'x' })], { viewport: viewportOf(612, 792, 1), ...noop })).toBeNull()
    expect(linkLayer(null, { viewport: viewportOf(612, 792, 1), ...noop })).toBeNull()
  })

  it('the records are copies: a destination array changed after the drawing follows what was drawn', () => {
    const dest = [{ num: 7, gen: 0 }, { name: 'XYZ' }, 0, 700, null]
    const follow = vi.fn()
    const layer = linkLayer([rec({ boxes: [10, 10, 50, 20], dest })], { viewport: viewportOf(612, 792, 1), follow, open: () => {} }) as HTMLDivElement
    ;(dest[0] as { num: number }).num = 99
    anchors(layer)[0]?.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    expect(follow.mock.calls[0]?.[0]).toEqual([{ num: 7, gen: 0 }, { name: 'XYZ' }, 0, 700, null])
  })
})

describe('LV2: sized by shares of the page, at any zoom and turn', () => {
  it('a box at its place on the page; several boxes one anchor at their union, each a span of it', () => {
    const records = [rec({ boxes: [61.2, 712.8, 122.4, 752.4], dest: 'a' }), rec({ boxes: [500, 100, 600, 112, 50, 88, 150, 100], url: 'https://example.org' })]
    const at = (scale: number) => anchors(linkLayer(records, { viewport: viewportOf(612, 792, scale), ...noop }))
    for (const scale of [1, 1.5, 3.2]) {
      const [one, two] = at(scale)
      // 61.2 / 612 = 10 %, (792 - 752.4) / 792 = 5 %
      expect([one?.style.left, one?.style.top, one?.style.width, one?.style.height]).toEqual(['10%', '5%', '10%', '5%'])
      expect(one?.children.length).toBe(1)
      // the union of the two lines' boxes: x 50..600, y 88..112
      expect(two?.style.left).toBe(`${Math.round((50 / 612) * 1e6) / 1e4}%`)
      expect(two?.style.width).toBe(`${Math.round((550 / 612) * 1e6) / 1e4}%`)
      const spans = [...(two?.children ?? [])] as HTMLElement[]
      expect(spans.length).toBe(2)
      // the first line's box at the union's top right, the second's at its bottom left
      expect([spans[0]?.style.top, spans[0]?.style.left]).toEqual(['0%', `${Math.round((450 / 550) * 1e6) / 1e4}%`])
      expect([spans[1]?.style.top, spans[1]?.style.left]).toEqual(['50%', '0%'])
    }
  })

  it('a page turned a quarter round: the boxes are placed by the place\'s viewport, as PDF.js places its own', () => {
    const [a] = anchors(linkLayer([rec({ boxes: [61.2, 79.2, 122.4, 158.4], dest: 'a' })], { viewport: turned(2), ...noop }))
    // x 61.2..122.4 of 612 goes down: top 10 %, height 10 %; y 79.2..158.4 of 792 goes across: left 10 %, width 10 %
    expect([a?.style.left, a?.style.top, a?.style.width, a?.style.height]).toEqual(['10%', '10%', '10%', '10%'])
  })

  it('a border where the record names one: its width, colour and style; none for a border of no width or colour', () => {
    const a = anchors(linkLayer([
      rec({ boxes: [1, 1, 9, 9], dest: 'a', border: { width: 1, rgb: [255, 0, 0], style: 'dashed' } }),
      rec({ boxes: [1, 1, 9, 9], dest: 'b', border: { width: 2, rgb: [0, 255, 255], style: 'underline' } }),
      rec({ boxes: [1, 1, 9, 9], dest: 'c', border: { width: 0, rgb: [0, 0, 0] } }),
      rec({ boxes: [1, 1, 9, 9], dest: 'd', border: { width: 1, rgb: [300, 0, 0] } as never }),
    ], { viewport: viewportOf(612, 792, 1), ...noop }))
    expect(a.map(x => x.dataset.axtBorder ?? null)).toEqual(['dashed', 'underline', null, null])
    expect(a[0]?.style.getPropertyValue('--axt-link-colour')).toBe('rgb(255 0 0)')
    expect(a[1]?.style.getPropertyValue('--axt-link-border')).toBe('2px')
  })
})

describe('LV3: a link followed, by click and by Enter; out of the paper through the host alone', () => {
  const two = () => {
    const follow = vi.fn(), open = vi.fn()
    const layer = linkLayer([rec({ boxes: [1, 1, 9, 9], dest: 'cite.a', order: 0 }), rec({ boxes: [1, 11, 9, 19], url: 'https://example.org/x', order: 1 })], { viewport: viewportOf(612, 792, 1), follow, open }) as HTMLDivElement
    document.body.append(layer)
    const [inside, outside] = anchors(layer) as [HTMLAnchorElement, HTMLAnchorElement]
    return { follow, open, inside, outside }
  }
  it('a click on a box: the browser\'s navigation prevented; inside the paper the view follows, out of it the host opens', () => {
    const { follow, open, inside, outside } = two()
    const c1 = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    inside.querySelector('span')?.dispatchEvent(c1)
    expect(c1.defaultPrevented).toBe(true)
    expect(follow).toHaveBeenCalledWith('cite.a', { keyboard: false })
    const c2 = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ctrlKey: true })
    outside.querySelector('span')?.dispatchEvent(c2)
    expect(c2.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.org/x')
  })
  it('Enter (a click the pointer did not make) follows with the keyboard\'s word; a middle click opens a link out, and follows none in', () => {
    const { follow, open, inside, outside } = two()
    inside.click()
    expect(follow).toHaveBeenCalledWith('cite.a', { keyboard: true })
    const m1 = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    outside.dispatchEvent(m1)
    expect(m1.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    const m2 = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    inside.dispatchEvent(m2)
    expect(m2.defaultPrevented).toBe(true)
    expect(follow).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe('LV4: a link with no glyph under it is named', () => {
  it('by the host\'s words where it gives them, else by the placeholder', () => {
    const records = [rec({ boxes: [1, 1, 9, 9], dest: 'x', name: '' }), rec({ boxes: [1, 1, 9, 9], url: 'https://example.org', name: '', order: 1 })]
    const vp = viewportOf(612, 792, 1)
    expect(anchors(linkLayer(records, { viewport: vp, ...noop })).map(a => a.getAttribute('aria-label'))).toEqual([LINK_NAME_PLACEHOLDER.internal, LINK_NAME_PLACEHOLDER.external])
    const linkName = (to: { url: string } | { internal: true }) => ('url' in to ? `out ${to.url}` : 'in')
    expect(anchors(linkLayer(records, { viewport: vp, ...noop, words: { linkName } })).map(a => a.getAttribute('aria-label'))).toEqual(['in', 'out https://example.org'])
  })
})

describe('the layer side: links with the laid page (the fake door)', () => {
  installSideFakes()
  /** page n's links: one inside the paper (named, or explicit to page 3 by its ref), one out of it, in reading order */
  const LINKS = (n: number): LinkRecord[] => [
    rec({ boxes: [100, 700, 160, 712], dest: n === 1 ? 'cite.k' : [{ num: 30, gen: 0 }, { name: 'XYZ' }, 0, 600, null], name: `[${n}]`, order: 0 }),
    rec({ boxes: [100, 600, 300, 612], url: `https://example.org/p${n}`, name: 'example.org', order: 1 }),
  ]
  const opened = async (links: (n: number, door: number) => LinkRecord[] = LINKS) => {
    const s = await setup({ links })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    return s
  }
  const doc = async (s: Awaited<ReturnType<typeof setup>>) => (await s.original?.promise) as FakeDoc

  it('LS1: a laid page\'s links go in with its drawing, over it, in reading order', async () => {
    const s = await opened()
    for (const n of [1, 2]) {
      const l = layerOf(s, n) as HTMLElement
      expect([...l.children].map(c => c.tagName.toLowerCase())).toEqual(['canvas', 'svg', 'div'])
      expect(anchors(l).map(a => a.getAttribute('aria-label'))).toEqual([`[${n}]`, 'example.org'])
    }
    // the pane's tab order is the pages' and, in a page, the reading order
    expect(anchors(s.panes.right).map(a => a.getAttribute('aria-label'))).toEqual(['[1]', 'example.org', '[2]', 'example.org'])
  })

  it('LS2: inside the paper, resolved on the left\'s document and jumped to on the right; the left follows only where the sync is on', async () => {
    const s = await opened()
    const d = await doc(s)
    d.getDestination = vi.fn(async (name: string) => (name === 'cite.k' ? [{ num: 40, gen: 0 }, { name: 'XYZ' }, 0, 792, null] : null))
    d.getPageIndex = vi.fn(async (ref: unknown) => ((ref as { num: number }).num === 40 ? 1 : (ref as { num: number }).num === 30 ? 2 : 0))
    const top = (n: number) => (places(s)[n - 1] as HTMLElement).offsetTop
    s.view.setSync(false)
    await flush()
    const left = s.panes.left.scrollTop
    anchors(layerOf(s, 1))[0]?.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    await flush(10)
    expect(d.getDestination).toHaveBeenCalledWith('cite.k')
    expect(d.getPageIndex).toHaveBeenCalledWith({ num: 40, gen: 0 })
    expect(s.panes.right.scrollTop).toBe(top(2))
    expect(s.panes.left.scrollTop).toBe(left)
    // an explicit destination: its page by its ref, on the left's document; the right pane leads, so the left follows
    s.view.setSync(true)
    await flush()
    anchors(layerOf(s, 2))[0]?.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    await flush(10)
    expect(d.getPageIndex).toHaveBeenLastCalledWith({ num: 30, gen: 0 })
    expect(s.panes.right.scrollTop).toBe(Math.round(top(3) + (792 - 600) * (FakePDFViewer.made[0] as FakePDFViewer).currentScale * 96 / 72))
    expect(s.view.probe().driver).toBe('right')
  })

  it('LS3: out of the paper, through the host alone', async () => {
    const s = await opened()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    anchors(layerOf(s, 2))[1]?.querySelector('span')?.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(s.opened).toEqual(['https://example.org/p2'])
  })

  it('LS4: a destination that resolves to nothing, or to no page of the paper, moves nothing', async () => {
    const s = await opened()
    const d = await doc(s)
    d.getDestination = vi.fn(async () => null)
    d.getPageIndex = vi.fn(async () => 99)
    const at = s.panes.right.scrollTop
    anchors(layerOf(s, 1))[0]?.click()
    anchors(layerOf(s, 2))[0]?.click()
    await flush(10)
    expect(s.panes.right.scrollTop).toBe(at)
  })

  it('LS5: no stale link: a page let go far from the view takes its links; after again() the old drawing\'s stay with it until the new one\'s replace them; dispose leaves none', async () => {
    const s = await opened((n, door) => [rec({ boxes: [100, 700, 160, 712], dest: 'cite.k', name: `door ${door} page ${n}` })])
    expect(anchors(layerOf(s, 1))[0]?.getAttribute('aria-label')).toBe('door 0 page 1')
    await nearOn(s, [2], false)
    expect(anchors(places(s)[1] as HTMLElement)).toEqual([])
    s.side.again()
    await settle(s, 30, false)
    expect(s.opens).toBe(2)
    // DR7: the drawing kept, its links with it, until the new door's page is ready
    expect(anchors(layerOf(s, 1)).map(a => a.getAttribute('aria-label'))).toEqual(['door 0 page 1'])
    await settle(s)
    expect(anchors(s.panes.right).map(a => a.getAttribute('aria-label'))).toEqual(['door 1 page 1'])
    s.side.dispose()
    await flush(10)
    expect(anchors(s.panes.right)).toEqual([])
    expect(content(s, 1)).toBe('original')
  })

  it('LS6: the focus kept: a link holding it when its page is drawn again gets it back by its rank; a keyboard\'s jump gives it to the place jumped to', async () => {
    const s = await opened((_n, door) => [rec({ boxes: [100, 700, 160, 712], dest: 'cite.k', name: `a${door}` }), rec({ boxes: [100, 600, 160, 612], url: 'https://example.org', name: `b${door}`, order: 1 })])
    const d = await doc(s)
    d.getDestination = vi.fn(async () => [{ num: 1, gen: 0 }, { name: 'XYZ' }, 0, 792, null])
    d.getPageIndex = vi.fn(async () => 1)
    anchors(layerOf(s, 1))[1]?.focus()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('b0')
    s.side.again()
    await settle(s)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('b1')
    anchors(layerOf(s, 1))[0]?.click()
    await flush(10)
    expect(document.activeElement).toBe(places(s)[1])
    expect(places(s)[1]?.getAttribute('tabindex')).toBe('-1')
  })

  it('LS6b: a keyboard\'s jump to a far page: the focus waits for its place to show the page, takes it then, and keeps it when the page left goes; the reader\'s own focus first gives it up', async () => {
    const s = await opened((_n, door) => [rec({ boxes: [100, 700, 160, 712], dest: 'refs', name: `a${door}` }), rec({ boxes: [100, 600, 160, 612], url: 'https://example.org', name: `b${door}`, order: 1 })])
    const d = await doc(s)
    d.getDestination = vi.fn(async () => [{ num: 4, gen: 0 }, { name: 'XYZ' }, 0, 792, null])
    d.getPageIndex = vi.fn(async () => 3)
    const link = anchors(layerOf(s, 1))[0] as HTMLAnchorElement
    link.focus()
    link.click()
    await flush(10)
    // page 4 is far: its place shows nothing yet, and the focus stays where it was
    expect(places(s)[3]?.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(link)
    // the jump's scroll brings it near: the focus goes to it, and stays there when the pages left go
    await nearOn(s, [4])
    expect(document.activeElement).toBe(places(s)[3])
    expect(places(s)[3]?.getAttribute('tabindex')).toBe('-1')
    await nearOn(s, [1, 2], false)
    await settle(s)
    expect(document.activeElement).toBe(places(s)[3])
    // the reader's own move before the place shows: the jump gives the focus up
    await nearOn(s, [1, 2])
    await nearOn(s, [4], false)
    await settle(s)
    const again = anchors(layerOf(s, 1))[0] as HTMLAnchorElement
    again.focus()
    again.click()
    await flush(10)
    const other = anchors(layerOf(s, 1))[1] as HTMLAnchorElement
    other.focus()
    await nearOn(s, [4])
    expect(document.activeElement).toBe(other)
  })

  it('LS6c: a laid page that holds the focus is not retired as it goes far, so the focus never falls to the document; it is retired once the focus has left it', async () => {
    const s = await opened()
    const link = anchors(layerOf(s, 1))[1] as HTMLAnchorElement
    link.focus()
    await nearOn(s, [1], false)
    await settle(s)
    expect(document.activeElement).toBe(link)
    expect(content(s, 1)).toBe('layer')
    // the focus moves on, to page 2's link: page 1, far, goes now
    ;(anchors(layerOf(s, 2))[0] as HTMLAnchorElement).focus()
    await settle(s)
    expect(content(s, 1)).toBe('none')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('[2]')
  })

  it('LS6d: a Tab inside a held far page keeps it: the focus leaves for <body> and its microtasks run before it arrives at the next link (Chromium\'s order), and the page is not let go meanwhile', async () => {
    const s = await opened()
    const [a, b] = anchors(layerOf(s, 1)) as HTMLAnchorElement[]
    a?.focus()
    await nearOn(s, [1], false)
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    // a native Tab: the focused element cleared, focusout (no related target, as Chromium tells it) and its microtasks,
    // then the focus on the next link, inside the same page
    a?.blur()
    expect(document.activeElement).toBe(document.body)
    await flush(10)
    b?.focus()
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    expect(document.activeElement).toBe(b)
    // a reopen: the drawing of an earlier door the focus holds is kept too, until the focus leaves it
    s.side.again()
    await flush(10)
    expect(document.activeElement?.closest('.axt-place')).toBe(places(s)[0])
  })

  it('LS7: a click on a link levels nothing (alignClick\'s guard), where the same click beside it does', async () => {
    const s = await opened()
    const box = anchors(layerOf(s, 1))[0]?.querySelector('span') as HTMLElement
    const at = clientOf(s.panes.right, 1, 130, 706)
    const press = (target: Element) => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: at.clientX, clientY: at.clientY }))
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: at.clientX, clientY: at.clientY }))
    }
    press(box)
    await flush()
    expect(s.view.probe().lastAlign).toBeNull()
    // control: the same click on the page beside the link levels the pair
    press(layerOf(s, 1)?.querySelector('svg') as Element)
    await flush()
    expect(s.view.probe().lastAlign).toBe('same point')
  })
})

describe('the layer side keeps the view\'s jump: the link\'s target on the left\'s document only', () => {
  installSideFakes()
  it('no document of the layer\'s is asked: the composed document\'s destinations are never read', async () => {
    const m = await M()
    const s = await setup({ links: () => [rec({ boxes: [1, 1, 50, 50], dest: 'cite.k' })] })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take([rowOf(m.index.units.length - 1)])
    await settle(s)
    const composed = (await s.composed[0]?.task.promise) as FakeDoc
    composed.getDestination = vi.fn(async () => null)
    const left = (await s.original?.promise) as FakeDoc
    left.getDestination = vi.fn(async () => null)
    anchors(layerOf(s, 1))[0]?.click()
    await flush(10)
    expect(left.getDestination).toHaveBeenCalledWith('cite.k')
    expect(composed.getDestination).not.toHaveBeenCalled()
    expect(internalsOf(s.view).places.contentOf(1)).toBe('layer')
  })
})
