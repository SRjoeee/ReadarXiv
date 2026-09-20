import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { createPlaceKeeper } from '@/core/renderer/place'

// The reader's place across a relayout (DESIGN §10). happy-dom lays nothing out, so the boxes are given by hand and
// the two things the browser does — the hit test, the moment after the next layout — are injected.

const VIEW = 800 // the viewport's height; the reader's line is a quarter of the way down: 200

type Box = { top: number; height: number }
const boxes = new Map<Element, Box>()
const place = (el: Element, top: number, height: number) => boxes.set(el, { top, height })

/** The element answers with the box `place` gave it, and with none — hidden — when it has none */
function boxed<T extends Element>(node: T): T {
  // Spied on as an Element: through the generic the method's name is not a key the spy's types can see
  vi.spyOn(node as Element, 'getBoundingClientRect').mockImplementation(() => {
    const box = boxes.get(node)
    return (box ? { top: box.top, bottom: box.top + box.height, height: box.height, left: 100, width: 600 } : { top: 0, bottom: 0, height: 0, left: 0, width: 0 }) as DOMRect
  })
  return node
}

function page() {
  document.body.innerHTML = '<article class="ltx_document"><section id="s"><p id="a">One.</p><p id="b">Two.</p><table id="f"><tbody><tr><td id="cell">x=1</td></tr></tbody></table></section></article>'
  const el = (id: string) => document.getElementById(id) as HTMLElement
  const root = document.querySelector('article') as HTMLElement
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) boxed(node)
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
    translation.innerHTML = '<span id="ours">translated</span>'
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

  it('under stacked the reader reads the translation, below its original: the place is measured on what was hit, the original only names it (Codex on #270)', () => {
    const { el } = page()
    const b = el('b')
    const translation = boxed(document.createElement('p'))
    translation.className = T_CLASS
    translation.innerHTML = '<span id="read">translated</span>'
    b.after(translation)
    // The original ends above the line (200); the line is a quarter of the way down the translation
    place(b, 0, 150)
    place(translation, 150, 200)
    const k = keeper([b], () => document.getElementById('read'))
    k.keep.keep()
    // Side by side: the translation is beside its original now, and taller
    place(b, 900, 300)
    place(translation, 900, 400)
    k.layout()
    // A quarter of the way down the translation is at 1000; measured on the original's bottom edge it would have been 1200
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 800, behavior: 'instant' })
  })

  it('and when what was hit is gone by then — a restore — the same part of the original is where the place is looked for', () => {
    const { el } = page()
    const b = el('b')
    const translation = boxed(document.createElement('p'))
    translation.className = T_CLASS
    b.after(translation)
    place(b, 0, 150)
    place(translation, 150, 200)
    const k = keeper([b], () => translation)
    k.keep.keep()
    translation.remove()
    place(b, 500, 200)
    k.layout()
    // A quarter of the way down the original: 550, from the 200 the reader was on
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 350, behavior: 'instant' })
  })

  it('a hit on an image\'s translated label is read as the image: the overlay is ours, takes the pointer, and is gone after a restore (Devin on #270)', () => {
    const { el } = page()
    const section = el('s')
    const figure = boxed(document.createElement('img'))
    figure.id = 'fig'
    section.append(figure)
    const overlay = document.createElement('div')
    overlay.className = IMG_CLASS
    overlay.innerHTML = '<span id="label">Energy</span>'
    figure.after(overlay)
    place(figure, 100, 400)
    const k = keeper([], () => document.getElementById('label'))
    k.keep.keep()
    // Restored: the overlay is swept away; the image is what the place is measured by
    overlay.remove()
    place(figure, 700, 400)
    k.layout()
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 600, behavior: 'instant' })
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

  it('inside a split figure that translation only hides whole, the copy beside the figure stands for it — nothing beside the caption shows (Codex on #270)', () => {
    const { el } = page()
    const figure = boxed(document.createElement('figure'))
    figure.innerHTML = '<img id="pic"><figcaption id="cap">Figure 1.</figcaption>'
    el('s').append(figure)
    const caption = boxed(document.getElementById('cap') as HTMLElement)
    const captionTranslation = boxed(document.createElement('figcaption'))
    captionTranslation.className = T_CLASS
    caption.after(captionTranslation)
    const copy = boxed(document.createElement('figure'))
    copy.className = `${T_CLASS} axt-split`
    figure.after(copy)
    place(figure, -100, 400)
    place(caption, 180, 40)
    const k = keeper([caption], () => caption)
    k.keep.keep()
    // Translation only: the figure is `display: none`, and with it the caption and the caption's translation
    boxes.delete(figure)
    boxes.delete(caption)
    place(copy, 500, 300)
    k.layout()
    // Half-way down the caption was the point; half-way down the copy is where it is looked for — the same figure, which is the aim
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + (500 + 0.5 * 300 - 200), behavior: 'instant' })
  })

  it('a container the line fell through is never the measure: when every try finds the section, nothing is kept (Codex on #270)', () => {
    const { el } = page()
    const k = keeper([el('b')], () => el('s'))
    k.keep.keep()
    expect(k.elementAt.mock.calls.map(call => call[1])).toEqual([200, 216, 232, 264, 328, 456])
    expect(k.afterLayout).not.toHaveBeenCalled()
    // And the next action starts clean
    place(el('b'), 150, 200)
    const again = keeper([el('b')], () => el('b'))
    again.keep.keep()
    expect(again.afterLayout).toHaveBeenCalledTimes(1)
  })

  it('a paragraph\'s little wrapper is a container too, however short: under translation only it loses the original inside it (measured: 103 px off)', () => {
    const { el } = page()
    const wrapper = boxed(document.createElement('div'))
    const original = boxed(document.createElement('p'))
    const translation = boxed(document.createElement('p'))
    translation.className = T_CLASS
    wrapper.append(original, translation)
    el('s').append(wrapper)
    place(wrapper, -30, 420)
    place(original, -30, 240)
    place(translation, 210, 180)
    // The point between the two hits the wrapper; sixteen pixels lower it hits the translation
    const k = keeper([original], y => (y < 210 ? wrapper : translation))
    k.keep.keep()
    expect(k.elementAt.mock.calls.map(call => call[1])).toEqual([200, 216])
    // Translation only: the original is hidden, the wrapper shrinks by its height; the translation is what was kept
    boxes.delete(original)
    place(wrapper, 500, 180)
    place(translation, 500, 180)
    k.layout()
    // 6 px down the translation then, at 216; the same part of it now is at 506
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000 + 290, behavior: 'instant' })
  })

  it('taller than the viewport is still the reader\'s place when it is one thing: a long translated paragraph, a tall image', () => {
    const { el } = page()
    // A paragraph of 1 200 px with children of its own, but a translation block: its parts keep their order
    el('b').innerHTML = 'Long <span>text</span>.'
    place(el('b'), -400, 1200)
    const long = keeper([el('b')], () => el('b'))
    long.keep.keep()
    expect(long.afterLayout).toHaveBeenCalledTimes(1)
    place(el('b'), -1000, 2400)
    long.layout()
    // Half-way down it then, half-way down it now: -1000 + 1200 = 200. It held
    expect(scrollTo).not.toHaveBeenCalled()

    const image = boxed(document.createElement('img'))
    el('s').append(image)
    place(image, -300, 1500)
    const tall = keeper([], () => image)
    tall.keep.keep()
    expect(tall.afterLayout).toHaveBeenCalledTimes(1)
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
    // A press on the viewport's scrollbar reaches the page as a pointerdown on the root, and nothing else does (Codex on #270)
    place(el('b'), 150, 200)
    k.keep.keep()
    window.dispatchEvent(new Event('pointerdown'))
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
