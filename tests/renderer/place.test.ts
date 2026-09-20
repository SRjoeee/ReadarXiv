import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { T_CLASS } from '@/core/marks'
import { createPlaceKeeper } from '@/core/renderer/place'

// The reader's place across a relayout (DESIGN §10). happy-dom lays nothing out, so the boxes are given by hand and
// the two things the browser does — the hit test, the moment after the next layout — are injected.

const VIEW = 800 // the viewport's height; the reader's line is a quarter of the way down: 200

type Box = { top: number; height: number }
const boxes = new Map<Element, Box>()
const place = (el: Element, top: number, height: number) => boxes.set(el, { top, height })

function page() {
  document.body.innerHTML = '<article class="ltx_document"><section id="s"><p id="a">One.</p><p id="b">Two.</p><table id="f"><tbody><tr><td id="cell">x=1</td></tr></tbody></table></section></article>'
  const el = (id: string) => document.getElementById(id) as HTMLElement
  const root = document.querySelector('article') as HTMLElement
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    vi.spyOn(node, 'getBoundingClientRect').mockImplementation(() => {
      const box = boxes.get(node)
      return (box ? { top: box.top, bottom: box.top + box.height, height: box.height, left: 100, width: 600 } : { top: 0, bottom: 0, height: 0, left: 0, width: 0 }) as DOMRect
    })
  }
  place(root, -5000, 20000)
  place(el('s'), -5000, 20000)
  return { root, el }
}

function keeper(blocks: Element[], hit: (y: number) => Element | null) {
  let run: (() => void) | null = null
  const stop = vi.fn()
  const afterLayout = vi.fn((_root: Element, fn: () => void) => { run = fn; return stop })
  const elementAt = vi.fn((_x: number, y: number) => hit(y))
  const keep = createPlaceKeeper(document, blocks.map(el => ({ el })), { afterLayout, elementAt })
  return { keep, afterLayout, elementAt, stop, layout: () => { const fn = run; run = null; fn?.() } }
}

describe('createPlaceKeeper', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>
  const scrolledTo = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true })

  beforeEach(() => {
    boxes.clear()
    Object.defineProperty(window, 'innerHeight', { value: VIEW, configurable: true })
    scrolledTo(3000)
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('puts what was on the reader\'s line back where it stood, at the same part of it, in one instant scroll after the next layout', () => {
    const { el } = page()
    // The line (200) falls a quarter of the way down the paragraph
    place(el('b'), 150, 200)
    const k = keeper([el('a'), el('b')], () => el('b'))
    k.keep.keep()
    expect(scrollTo).not.toHaveBeenCalled()
    // Side by side: the paragraph is twice as tall now and has been pushed far down the page
    place(el('b'), 3650, 400)
    k.layout()
    // A quarter of the way down it is at 3750, and belongs on 200
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 3550, behavior: 'instant' })
    expect(k.stop).toHaveBeenCalledTimes(1)
    // One shot: a later notification is nobody's
    k.layout()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('does nothing at the top of the page: no hit test, no observer', () => {
    const { el } = page()
    scrolledTo(0)
    const k = keeper([el('a')], () => el('a'))
    k.keep.keep()
    expect(k.elementAt).not.toHaveBeenCalled()
    expect(k.afterLayout).not.toHaveBeenCalled()
  })

  it('keeps what the reader is on even when it is no translation block: a row of a formula stays the measure, not a block a thousand pixels away', () => {
    const { el } = page()
    place(el('f'), 100, 300)
    place(el('cell'), 180, 60)
    place(el('b'), 1300, 100)
    const k = keeper([el('a'), el('b')], () => el('cell'))
    k.keep.keep()
    place(el('cell'), 980, 60)
    place(el('b'), 5000, 100)
    k.layout()
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 800, behavior: 'instant' })
  })

  it('inside a translated block the unit is the block, and under translation only — the original hidden — its translation stands for it', () => {
    const { el } = page()
    const b = el('b')
    b.innerHTML = 'Two <span id="word">words</span>.'
    const translation = document.createElement('p')
    translation.className = T_CLASS
    b.after(translation)
    vi.spyOn(translation, 'getBoundingClientRect').mockImplementation(() => ({ top: 900, bottom: 1000, height: 100, left: 100, width: 600 }) as DOMRect)
    place(b, 150, 200)
    const k = keeper([el('a'), b], () => document.getElementById('word'))
    k.keep.keep()
    // Translation only: the original has no box; the translation beside it is a hundred pixels tall, at 900
    boxes.delete(b)
    k.layout()
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + (900 + 0.25 * 100 - 200), behavior: 'instant' })
  })

  it('a hit on one of ours — a translation in the right column — is read as the original it stands beside', () => {
    const { el } = page()
    const b = el('b')
    const translation = document.createElement('p')
    translation.className = T_CLASS
    translation.innerHTML = '<span id="ours">译</span>'
    b.after(translation)
    place(b, 150, 200)
    const k = keeper([b], () => document.getElementById('ours'))
    k.keep.keep()
    // Restored: ours is gone from the page, the original is where the keeper looks
    translation.remove()
    place(b, 450, 200)
    k.layout()
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 300, behavior: 'instant' })
  })

  it('between two paragraphs the hit test finds their section, which measures nothing: the line is tried a little lower', () => {
    const { el } = page()
    place(el('b'), 210, 120)
    const k = keeper([el('b')], y => (y < 210 ? el('s') : el('b')))
    k.keep.keep()
    expect(k.elementAt.mock.calls.map(call => call[1])).toEqual([200, 216])
    place(el('b'), 710, 120)
    k.layout()
    // The point kept is the paragraph's, 6 px down it, where it stood: 216
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 500, behavior: 'instant' })
  })

  it('the reader scrolling by their own hand before the layout wins: nothing is corrected', () => {
    const { el } = page()
    place(el('b'), 150, 200)
    const k = keeper([el('b')], () => el('b'))
    k.keep.keep()
    window.dispatchEvent(new Event('wheel'))
    place(el('b'), 3650, 400)
    k.layout()
    expect(scrollTo).not.toHaveBeenCalled()
    // And the listeners are gone with the one shot: the next keep starts clean
    place(el('b'), 150, 200)
    k.keep.keep()
    place(el('b'), 650, 200)
    k.layout()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('armed once: a second call before the layout reads nothing again — the layout is dirty by then — and one correction follows', () => {
    const { el } = page()
    place(el('b'), 150, 200)
    const k = keeper([el('b')], () => el('b'))
    k.keep.keep()
    k.keep.keep()
    expect(k.elementAt).toHaveBeenCalledTimes(1)
    expect(k.afterLayout).toHaveBeenCalledTimes(1)
    place(el('b'), 650, 200)
    k.layout()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the place held to within a few pixels: the aim is the paragraph', () => {
    const { el } = page()
    place(el('b'), 150, 200)
    const k = keeper([el('b')], () => el('b'))
    k.keep.keep()
    place(el('b'), 152, 200)
    k.layout()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
