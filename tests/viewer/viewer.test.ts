// The figure viewer (DESIGN §15.7): a figure opened large in a dialog, from a control over it. happy-dom lays nothing
// out, so the rectangles a figure has on the page, and whether a node shows, are given to the elements here
import { afterEach, describe, expect, it } from 'vitest'
import { installFigureViewer, VIEWER_CLASS, type FigureViewer } from '@/core/viewer'

const OPTIONS = {
  figures: 'img.ltx_graphics, object.ltx_graphics, svg.ltx_picture',
  overlay: '.axt-img',
  around: '.ltx_figure',
  ours: '.axt-t',
}
const WORDS = { open: 'View larger', zoomIn: 'Zoom in', zoomOut: 'Zoom out', close: 'Close' }

const rect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) }) as DOMRect
/** Give an element the box it would have on the page */
const place = (el: Element, box: DOMRect): void => {
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => box, configurable: true })
}
/** Say an element does not show on the page (a style rule hides it) */
const hide = (el: Element): void => {
  Object.defineProperty(el, 'getClientRects', { value: () => [], configurable: true })
}
const over = (target: Element, x = 0, y = 0): void => {
  target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true, clientX: x, clientY: y }))
}

let viewer: FigureViewer | null = null
afterEach(() => {
  viewer?.remove()
  viewer = null
  document.body.innerHTML = ''
})

function page(html: string): { root: ShadowRoot; control: HTMLButtonElement; dialog: HTMLDialogElement; host: HTMLElement } {
  document.body.innerHTML = `<article class="ltx_document">${html}</article>`
  viewer = installFigureViewer(document, { ...OPTIONS, strings: () => WORDS })
  const host = document.querySelector(`.${VIEWER_CLASS}`) as HTMLElement
  const root = host.shadowRoot!
  const stage = root.querySelector('.stage') as HTMLElement
  Object.defineProperty(stage, 'clientWidth', { value: 1000, configurable: true })
  Object.defineProperty(stage, 'clientHeight', { value: 800, configurable: true })
  Object.defineProperty(stage, 'getBoundingClientRect', { value: () => rect(0, 0, 1000, 800), configurable: true })
  return { root, host, control: root.querySelector('.open') as HTMLButtonElement, dialog: root.querySelector('dialog') as HTMLDialogElement }
}

const PICTURE = `<figure class="ltx_figure" id="F1"><svg class="ltx_picture" id="F1.pic"><foreignObject><span class="ltx_foreignobject_container">
  <span class="ltx_foreignobject_content" id="L1" data-axt-id="L1" data-axt-state="translated">Shared Expert</span><span class="ltx_foreignobject_content axt-t" data-axt-for="L1">expert partage</span>
  </span></foreignObject></svg></figure>`

describe('the control over a figure', () => {
  it('shows over a figure under the pointer, named in the reader\'s words, and goes when the pointer leaves', async () => {
    const { control } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    expect(control.hasAttribute('data-shown')).toBe(true)
    expect(control.getAttribute('aria-label')).toBe('View larger')
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-shown')).toBe(false)
  })

  it('not over a small one — an icon in a table, a symbol in a line — nor over a picture drawn inside another', () => {
    const { control } = page(`<figure class="ltx_figure"><svg class="ltx_picture" id="outer"><svg class="ltx_picture" id="inner"></svg></svg></figure>
      <p><img class="ltx_graphics" id="icon" src="a.png"></p>`)
    place(document.getElementById('icon')!, rect(0, 0, 40, 20))
    over(document.getElementById('icon')!)
    expect(control.hasAttribute('data-shown')).toBe(false)
    place(document.getElementById('inner')!, rect(0, 0, 400, 300))
    over(document.getElementById('inner')!)
    expect(control.hasAttribute('data-shown')).toBe(false)
  })

  it('an overlay of ours lying on a figure stands for the figure, and a figure that takes no pointer — inert, as side makes a copy\'s — is found by where the pointer is', async () => {
    const { control } = page(`<figure class="ltx_figure" id="fig"><img class="ltx_graphics" id="img" src="a.png" inert><div class="axt-img"><span>label</span></div></figure>`)
    const img = document.getElementById('img')!
    place(img, rect(100, 100, 400, 300))
    over(document.querySelector('.axt-img span')!)
    expect(control.hasAttribute('data-shown')).toBe(true)
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-shown')).toBe(false)
    // The pointer meets the figure's block, not the inert image: outside the image's box nothing, inside it the image
    over(document.getElementById('fig')!, 50, 50)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-shown')).toBe(false)
    over(document.getElementById('fig')!, 300, 250)
    expect(control.hasAttribute('data-shown')).toBe(true)
    // Off the image and still in its block, the caption say: no element is entered, and the move alone says so (Devin on #279)
    document.getElementById('fig')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 450 }))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-shown')).toBe(false)
  })
})

describe('the dialog', () => {
  it('opens on a copy of what showed on the page: the paper is not touched, and the copy carries no id and no mark of ours', () => {
    const { control, dialog, host } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    const before = document.querySelector('article')!.outerHTML
    over(svg)
    control.click()
    expect(dialog.open).toBe(true)
    const copy = host.querySelector('svg')!
    expect(copy).not.toBeNull()
    expect(copy.querySelector('[id]')).toBeNull()
    expect(Array.from(copy.querySelectorAll('*')).some(el => el.getAttributeNames().some(name => name.startsWith('data-axt-')))).toBe(false)
    expect(document.querySelector('article')!.outerHTML).toBe(before)
  })

  it('of a label and its translation, the copy keeps the one that showed: opened from the original it reads in the paper\'s words, from the translation\'s side in the reader\'s', () => {
    const { control, host, dialog } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    hide(document.querySelector('.axt-t')!)
    over(svg)
    control.click()
    expect(Array.from(host.querySelectorAll('.ltx_foreignobject_content'), el => el.textContent)).toEqual(['Shared Expert'])
    dialog.close()
    Object.defineProperty(document.querySelector('.axt-t')!, 'getClientRects', { value: () => [rect(0, 0, 1, 1)], configurable: true })
    hide(document.getElementById('L1')!)
    over(document.querySelector('article')!)
    over(svg)
    control.click()
    expect(Array.from(host.querySelectorAll('.ltx_foreignobject_content'), el => el.textContent)).toEqual(['expert partage'])
  })

  it('an image goes in as an image, with the overlay of ours on it only where the overlay showed', () => {
    const { control, host, dialog } = page(`<figure class="ltx_figure"><img class="ltx_graphics" id="img" src="https://arxiv.org/a.png"><div class="axt-img"><span>label</span></div></figure>`)
    const img = document.getElementById('img')!
    place(img, rect(100, 100, 400, 300))
    over(img)
    control.click()
    expect(host.querySelector('img')!.getAttribute('src')).toBe('https://arxiv.org/a.png')
    expect(host.querySelector('.axt-img span')?.textContent).toBe('label')
    dialog.close()
    hide(document.querySelector('.axt-img')!)
    over(document.querySelector('article')!)
    over(img)
    control.click()
    expect(host.querySelector('.axt-img')).toBeNull()
  })

  it('an external SVG figure is shown as an image of its file: inside an <object> the pointer would be its own document\'s', () => {
    const { control, host } = page(`<figure class="ltx_figure"><object class="ltx_graphics" id="obj" type="image/svg+xml" data="https://arxiv.org/x/plot.svg"></object></figure>`)
    const obj = document.getElementById('obj')!
    place(obj, rect(100, 100, 400, 300))
    over(obj)
    control.click()
    expect(host.querySelector('object')).toBeNull()
    expect(host.querySelector('img')!.getAttribute('src')).toBe('https://arxiv.org/x/plot.svg')
  })

  it('opens fitted to the dialog with a margin; a press zooms by 1.2 about the centre, within bounds; closing empties it', () => {
    const { control, dialog, host, root } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    const frame = host.firstElementChild as HTMLElement
    // The copy keeps the figure's size on the page and is zoomed as a whole (CSS zoom): what it is shown at is the two together
    expect([frame.style.width, frame.style.height]).toEqual(['400px', '300px'])
    const zoomOf = () => Number.parseFloat(frame.style.zoom)
    const size = (): [number, number] => [400 * zoomOf(), 300 * zoomOf()]
    const [w0, h0] = size()
    // Fitted: (1000 − 48) / 400 against (800 − 48) / 300 → the smaller, 2.38
    expect(w0).toBeCloseTo(400 * 2.38, 0)
    expect(h0).toBeCloseTo(300 * 2.38, 0)
    // The point of the figure under the dialog's centre, in the figure's own pixels. The translation is a zoomed length too
    const underCentre = (): [number, number] => {
      const [, tx, ty] = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(frame.style.transform)!.map(Number) as [number, number, number]
      return [(500 - tx * zoomOf()) / zoomOf(), (400 - ty * zoomOf()) / zoomOf()]
    }
    const [cx, cy] = underCentre()
    const zoomIn = root.querySelector('.bar button') as HTMLButtonElement
    zoomIn.click()
    expect(size()[0] / w0).toBeCloseTo(1.2, 5)
    // A press zooms about the dialog's centre: the point of the figure there stays there
    expect(underCentre()[0]).toBeCloseTo(cx, 5)
    expect(underCentre()[1]).toBeCloseTo(cy, 5)
    // And stops at twelve times the fit
    for (let i = 0; i < 40; i++) zoomIn.click()
    expect(size()[0] / w0).toBeCloseTo(12, 5)
    dialog.close()
    expect(host.children).toHaveLength(0)
  })

  it('a figure gone since its control appeared — side makes a copy afresh as translations arrive — opens nothing: the control goes (Devin on #279)', () => {
    const { control, dialog } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    expect(control.hasAttribute('data-shown')).toBe(true)
    document.getElementById('F1')!.remove()
    control.click()
    expect(dialog.open).toBe(false)
    expect(control.hasAttribute('data-shown')).toBe(false)
  })

  it('the page under the dialog stays where it is: the page keys do nothing, the arrows pan the figure, + and − zoom it (Codex on #279)', () => {
    const { control, dialog, host } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    const frame = host.firstElementChild as HTMLElement
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      dialog.dispatchEvent(event)
      return event.defaultPrevented
    }
    for (const key of ['PageDown', 'PageUp', 'End', 'Home']) expect([key, press(key)]).toEqual([key, true])
    const before = frame.style.transform
    expect(press('ArrowRight')).toBe(true)
    expect(frame.style.transform).not.toBe(before)
    const zoom = Number.parseFloat(frame.style.zoom)
    press('+')
    expect(Number.parseFloat(frame.style.zoom) / zoom).toBeCloseTo(1.2, 5)
    // A key the viewer has no use for, and a shortcut, are left to the browser
    expect(press('a')).toBe(false)
    const shortcut = new KeyboardEvent('keydown', { key: 'ArrowDown', metaKey: true, bubbles: true, cancelable: true })
    dialog.dispatchEvent(shortcut)
    expect(shortcut.defaultPrevented).toBe(false)
  })

  it('removed, it takes its host away and no longer answers the pointer', () => {
    const { control } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    viewer!.remove()
    viewer = null
    expect(document.querySelector(`.${VIEWER_CLASS}`)).toBeNull()
    over(svg)
    expect(control.hasAttribute('data-shown')).toBe(false)
  })
})
