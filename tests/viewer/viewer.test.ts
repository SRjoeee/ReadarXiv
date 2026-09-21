// The figure viewer (DESIGN §15.7): a figure opened large in a dialog, from a control over it. happy-dom lays nothing
// out, so the rectangles a figure has on the page, and whether a node shows, are given to the elements here
import { VIEWED_ATTR, VIEWED_FRAME_ATTR } from '@/core/marks'
import { afterEach, describe, expect, it } from 'vitest'
import { installFigureViewer, SPOT_CLASS, type FigureViewer, VIEWER_CLASS } from '@/core/viewer'

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

function page(html: string): { root: ShadowRoot; control: HTMLButtonElement; dialog: HTMLDialogElement; host: HTMLElement; spot: HTMLElement } {
  document.body.innerHTML = `<article class="ltx_document">${html}</article>`
  viewer = installFigureViewer(document, { ...OPTIONS, strings: () => WORDS })
  const host = document.querySelector(`.${VIEWER_CLASS}`) as HTMLElement
  const root = host.shadowRoot!
  const stage = root.querySelector('.axt-viewer-stage') as HTMLElement
  Object.defineProperty(stage, 'clientWidth', { value: 1000, configurable: true })
  Object.defineProperty(stage, 'clientHeight', { value: 800, configurable: true })
  Object.defineProperty(stage, 'getBoundingClientRect', { value: () => rect(0, 0, 1000, 800), configurable: true })
  const spot = document.querySelector(`.${SPOT_CLASS}`) as HTMLElement
  return { root, host, spot, control: spot.shadowRoot!.querySelector('.axt-viewer-open') as HTMLButtonElement, dialog: root.querySelector('dialog') as HTMLDialogElement }
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
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    expect(control.getAttribute('aria-label')).toBe('View larger')
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
  })

  it('is bound to the figure by the browser, not placed by arithmetic: the figure is named as its anchor while it shows, and the control stands at its top right in the page\'s own layer', async () => {
    // It was a fixed box of ours above everything, placed from the figure's rectangle and kept inside the window: with
    // the figure's top under arXiv's sticky header it stood ON the header (reported 2026-09-21). An anchored box is
    // laid out with the figure — it scrolls with it, and whatever the site raises above its content covers both
    const { control, spot } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, -40, 400, 300))
    expect(svg.hasAttribute(VIEWED_ATTR)).toBe(false)
    over(svg)
    expect(svg.hasAttribute(VIEWED_ATTR)).toBe(true)
    const anchoring = document.adoptedStyleSheets.map(sheet => Array.from(sheet.cssRules, rule => rule.cssText).join(' ')).find(text => text.includes(VIEWED_ATTR))
    expect(anchoring).toMatch(/\[data-axt-viewed\] \{ anchor-name: --axt-viewed; \}/)
    const laid = spot.getAttribute('style') ?? ''
    expect(laid).toContain('position:absolute')
    expect(laid).toContain('position-anchor:--axt-viewed')
    expect(laid).toMatch(/top:calc\(anchor\(top,[^)]*\) \+ 8px\)/)
    expect(laid).toMatch(/right:calc\(max\(anchor\(right, 0px\), [^;]*\) \+ 8px\)/)
    // The page's content layer, where our overlays are: arXiv's header is at 2
    expect(laid).toContain('z-index:1')
    expect(laid).not.toContain('fixed')
    // Nothing of where it stands is written by us: a figure's top above the window is no case to handle
    expect(control.style.top).toBe('')
    expect(control.style.left).toBe('')
    // Gone from the figure, the name goes once the control has faded, and the sheet with it
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(svg.hasAttribute(VIEWED_ATTR)).toBe(false)
    expect(document.adoptedStyleSheets).toHaveLength(0)
  })

  it('a figure wider than the frame that clips it — side\'s half column scrolls such a one — keeps its control inside the frame: the frame is named too, and the nearer edge is the one', async () => {
    // Measured on 2312.17141 in side: the column ends at 708 px, a picture's right edge is at 881, and the control
    // stood at 843–873 — over the other column, on the translation's side of a figure of the original's
    // Of the frames that clip it, the one whose edge is furthest in is the one that shows on the screen: an equation's
    // table there scrolls too, and is itself wider than the column its figure clips it to (708 against 922, measured)
    page(`<figure class="ltx_figure" id="frame" style="overflow-x:auto"><table id="table" style="overflow-x:auto"><tr><td id="plain"><img class="ltx_graphics" id="wide" src="a.png"></td></tr></table></figure>`)
    const img = document.getElementById('wide')!
    const frame = document.getElementById('frame')!
    place(img, rect(282, 100, 599, 300))
    place(document.getElementById('table')!, rect(240, 100, 682, 300))
    place(frame, rect(240, 100, 468, 300))
    over(img)
    expect(frame.hasAttribute(VIEWED_FRAME_ATTR)).toBe(true)
    expect(document.getElementById('table')!.hasAttribute(VIEWED_FRAME_ATTR)).toBe(false)
    expect(document.getElementById('plain')!.hasAttribute(VIEWED_FRAME_ATTR)).toBe(false)
    const rules = document.adoptedStyleSheets.map(sheet => Array.from(sheet.cssRules, rule => rule.cssText).join(' ')).join(' ')
    expect(rules).toMatch(/\[data-axt-viewed-frame\] \{ anchor-name: --axt-viewed-frame; \}/)
    // The larger inset is the edge further in: the figure's, or the frame's where the figure runs past it
    expect(document.querySelector(`.${SPOT_CLASS}`)!.getAttribute('style')).toMatch(/right:calc\(max\(anchor\(right, 0px\), anchor\(--axt-viewed-frame right, 0px\)\) \+ 8px\)/)
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(frame.hasAttribute(VIEWED_FRAME_ATTR)).toBe(false)
  })

  it('one figure is named at a time, and a name a restore swept away is written again at the next move over the figure', () => {
    page(`${PICTURE}<figure class="ltx_figure"><img class="ltx_graphics" id="second" src="b.png"></figure>`)
    const svg = document.querySelector('svg')!
    const img = document.getElementById('second')!
    place(svg, rect(100, 100, 400, 300))
    place(img, rect(100, 500, 400, 300))
    over(svg)
    over(img)
    expect(svg.hasAttribute(VIEWED_ATTR)).toBe(false)
    expect(img.hasAttribute(VIEWED_ATTR)).toBe(true)
    img.removeAttribute(VIEWED_ATTR)
    over(img)
    expect(img.hasAttribute(VIEWED_ATTR)).toBe(true)
  })

  it('not over a small one — an icon in a table, a symbol in a line — nor over a picture drawn inside another', () => {
    const { control } = page(`<figure class="ltx_figure"><svg class="ltx_picture" id="outer"><svg class="ltx_picture" id="inner"></svg></svg></figure>
      <p><img class="ltx_graphics" id="icon" src="a.png"></p>`)
    place(document.getElementById('icon')!, rect(0, 0, 40, 20))
    over(document.getElementById('icon')!)
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
    place(document.getElementById('inner')!, rect(0, 0, 400, 300))
    over(document.getElementById('inner')!)
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
  })

  it('an overlay of ours lying on a figure stands for the figure, and a figure that takes no pointer — inert, as side makes a copy\'s — is found by where the pointer is', async () => {
    const { control } = page(`<figure class="ltx_figure" id="fig"><img class="ltx_graphics" id="img" src="a.png" inert><div class="axt-img"><span>label</span></div></figure>`)
    const img = document.getElementById('img')!
    place(img, rect(100, 100, 400, 300))
    over(document.querySelector('.axt-img span')!)
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
    // The pointer meets the figure's block, not the inert image: outside the image's box nothing, inside it the image
    over(document.getElementById('fig')!, 50, 50)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
    over(document.getElementById('fig')!, 300, 250)
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    // Off the image and still in its block, the caption say: no element is entered, and the move alone says so (Devin on #279)
    document.getElementById('fig')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 450 }))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
  })
})

describe('the dialog', () => {
  it('opens on a copy of what showed on the page: nothing is put into the paper — the figure carries the one mark it is the control\'s anchor by, and nothing once the control has gone — and the copy carries no id and no mark of ours', async () => {
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
    // The anchor's mark least of all: a copy named as well would be an anchor nearer the control than the figure
    expect([copy, ...Array.from(copy.querySelectorAll('*'))].some(el => el.getAttributeNames().some(name => name.startsWith('data-axt-')))).toBe(false)
    const marked = svg.cloneNode(false) as Element
    expect(marked.getAttributeNames().filter(name => name.startsWith('data-axt-'))).toEqual([VIEWED_ATTR])
    svg.removeAttribute(VIEWED_ATTR)
    expect(document.querySelector('article')!.outerHTML).toBe(before)
    svg.setAttribute(VIEWED_ATTR, '')
    dialog.close()
    over(document.querySelector('article')!)
    await new Promise(resolve => setTimeout(resolve, 400))
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

  it('an external SVG figure looks in the dialog as it did on the page: what the page\'s sheet does to every <img> is not done to a figure that was none', () => {
    // arXiv's dark theme dims every <img> — `brightness(0.8) contrast(1.2)` — and leaves an <object> as it is: shown
    // as an image, the figure stood grey in the dialog, (219, 219, 219) where the page had it white (measured 2026-09-21)
    const sheet = document.createElement('style')
    sheet.textContent = 'img { filter: brightness(0.8) contrast(1.2); }'
    document.head.append(sheet)
    try {
      const { control, host, dialog } = page(`<figure class="ltx_figure"><object class="ltx_graphics" id="obj" type="image/svg+xml" data="a.svg"></object><img class="ltx_graphics" id="bitmap" src="b.png"></figure>`)
      const figure = document.getElementById('obj')!
      place(figure, rect(100, 100, 400, 300))
      over(figure)
      control.click()
      expect((host.querySelector('img') as HTMLElement).style.filter).toBe('none')
      dialog.close()
      // A bitmap was an <img> on the page too, and keeps what the page gave it
      const bitmap = document.getElementById('bitmap')!
      place(bitmap, rect(100, 500, 400, 300))
      over(document.querySelector('article')!)
      over(bitmap)
      control.click()
      expect((host.querySelector('img') as HTMLElement).style.filter).toBe('brightness(0.8) contrast(1.2)')
    } finally {
      sheet.remove()
    }
  })

  it('the overlay lies in the copy where it lay on the figure, and keeps what its style sheet lays it by', () => {
    // An SVG drawing fitted into a box of other proportions: the overlay is the drawing's rectangle, 50 px in from
    // either side (§15.5). Filling the frame, every label stood off its word in the dialog as it once did on the page
    const { control, host } = page(`<figure class="ltx_figure"><object class="ltx_graphics" id="obj" type="image/svg+xml" data="a.svg"></object><div class="axt-img" style="--axt-img-ratio:1.4731;--axt-img-mask:url(&quot;data:image/svg+xml,m&quot;)"><span>label</span></div></figure>`)
    const figure = document.getElementById('obj')!
    place(figure, rect(100, 100, 466, 250))
    place(document.querySelector('.axt-img')!, rect(150, 100, 366, 250))
    over(figure)
    control.click()
    const overlay = host.querySelector('.axt-img') as HTMLElement
    expect(overlay.style.left).toBe('10.7296%')
    expect(overlay.style.top).toBe('0%')
    expect(overlay.style.width).toBe('78.5408%')
    expect(overlay.style.height).toBe('100%')
    // The one blur is cut to the labels by the mask: lost, the style sheet blurs nothing (image.css)
    expect(overlay.style.getPropertyValue('--axt-img-mask')).toContain('data:image/svg+xml,m')
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
    const zoomIn = root.querySelector('.axt-viewer-bar button') as HTMLButtonElement
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
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    document.getElementById('F1')!.remove()
    control.click()
    expect(dialog.open).toBe(false)
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
  })

  it('the page under the dialog stays where it is: the document adopts a scroll lock while the dialog is open, and gives back only that (Codex on #279)', () => {
    const { control, dialog } = page(PICTURE)
    const theirs = new CSSStyleSheet()
    document.adoptedStyleSheets = [theirs]
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    // The control's own sheet may be adopted beside it (the figure's anchor name, while the control shows)
    const locks = () => document.adoptedStyleSheets.filter(sheet => /overflow: hidden/.test(sheet.cssRules[0]?.cssText ?? ''))
    const lock = locks()[0]
    expect(lock?.cssRules[0]?.cssText).toMatch(/^:root \{ overflow: hidden !important; scrollbar-gutter: stable !important; \}$/)
    dialog.close()
    expect(locks()).toEqual([])
    expect(document.adoptedStyleSheets).toContain(theirs)
    // Opened again, locked again: the lock is one sheet, adopted once an opening
    over(svg)
    control.click()
    expect(locks()).toEqual([lock])
    dialog.close()
    document.adoptedStyleSheets = []
  })

  it('the arrows pan the figure, + and − zoom it; a key it has no use for, or one with a modifier, is the browser\'s', () => {
    const { control, dialog, host } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    const frame = host.firstElementChild as HTMLElement
    // From wherever the focus is: a key event is composed, and crosses the shadow root on its way up
    const press = (key: string, init: KeyboardEventInit = {}, from: EventTarget = dialog) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init })
      from.dispatchEvent(event)
      return event.defaultPrevented
    }
    const before = frame.style.transform
    expect(press('ArrowRight')).toBe(true)
    expect(frame.style.transform).not.toBe(before)
    const zoom = Number.parseFloat(frame.style.zoom)
    press('+')
    expect(Number.parseFloat(frame.style.zoom) / zoom).toBeCloseTo(1.2, 5)
    expect(press('a')).toBe(false)
    expect(press('ArrowDown', { metaKey: true })).toBe(false)
    // A press on the figure takes the focus off the dialog's buttons — on Chrome 131 onto the body, where a listener
    // on the dialog never heard the keys again (measured; Codex on #279)
    const zoomed = Number.parseFloat(frame.style.zoom)
    expect(press('+', {}, document.body)).toBe(true)
    expect(Number.parseFloat(frame.style.zoom) / zoomed).toBeCloseTo(1.2, 5)
    // Closed, the keys are the page's again
    dialog.close()
    expect(press('ArrowDown', {}, document.body)).toBe(false)
  })

  it('the wheel zooms about the pointer in proportion to the distance scrolled — a trackpad\'s run of small deltas no faster than one long one — and a pinch keeps to the fingers', () => {
    const { control, host } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    const frame = host.firstElementChild as HTMLElement
    const stage = host.shadowRoot!.querySelector('.axt-viewer-stage')!
    const zoomOf = () => Number.parseFloat(frame.style.zoom)
    // happy-dom's WheelEvent is a UIEvent's: the pointer's position and the modifier keys are given to it here
    const wheel = (deltaY: number, ctrlKey = false) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
      Object.defineProperties(event, { ctrlKey: { value: ctrlKey }, clientX: { value: 500 }, clientY: { value: 400 } })
      stage.dispatchEvent(event)
    }
    const fit = zoomOf()
    // A trackpad gesture as Chromium delivers it: 28 events, 145 px in all
    for (const d of [2, 4, 6, 8, 10, 12, 12, 12, 10, 10, 8, 8, 6, 6, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1]) wheel(-d)
    expect(zoomOf() / fit).toBeCloseTo(2 ** (145 * 0.002), 5)
    const run = zoomOf()
    wheel(-145)
    expect(zoomOf() / run).toBeCloseTo(2 ** (145 * 0.002), 5)
    wheel(145)
    // Chrome's pinch to twice the size: one wheel with the control key, −100·ln 2
    const pinched = zoomOf()
    wheel(-100 * Math.log(2), true)
    expect(zoomOf() / pinched).toBeCloseTo(2, 5)
    expect(frame.style.transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\)$/)
  })

  it('out of the window straight from a figure the pointer enters nothing: the document\'s own leaving takes the control away, and an open dialog keeps it (Devin on #279)', async () => {
    const { control, dialog } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    const leave = () => document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))
    leave()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
    // Under the open dialog the control stays where it is: closing hands the focus back to it
    over(svg)
    control.click()
    leave()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
    dialog.close()
  })

  it('the dialog is named, as the control that opens it is: its buttons and the figure do not name it (Codex on #279)', () => {
    const { control, dialog } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    over(svg)
    control.click()
    expect(dialog.getAttribute('aria-label')).toBe('View larger')
  })

  it('a sweep of the document under the open dialog — restoring the page removes every translation, the copy\'s among them — closes it, rather than leave a picture with no labels (Codex on #279)', async () => {
    const { control, dialog, host } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    hide(document.getElementById('L1')!)
    over(svg)
    control.click()
    expect(Array.from(host.querySelectorAll('.ltx_foreignobject_content'), el => el.textContent)).toEqual(['expert partage'])
    for (const ours of Array.from(document.querySelectorAll('.axt-t'))) ours.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dialog.open).toBe(false)
    expect(host.children).toHaveLength(0)
    // Opened again it is whole, and stays open: the dialog's own emptying is not a sweep
    over(document.querySelector('article')!)
    over(svg)
    control.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dialog.open).toBe(true)
  })

  it('the page changes what it shows by its marks on <html> — another mode, figures no longer translated in it — and the dialog closes: the sheet\'s rules would hide the one label the copy kept (Codex on #279)', async () => {
    const { control, dialog } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    hide(document.getElementById('L1')!)
    over(svg)
    control.click()
    // Not any attribute of <html>: arXiv's own theme switch writes there too
    document.documentElement.setAttribute('data-theme', 'dark')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dialog.open).toBe(true)
    document.documentElement.setAttribute('data-axt-mode', 'only')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dialog.open).toBe(false)
    // Closed, it no longer watches: a later switch opens nothing and closes nothing
    over(document.querySelector('article')!)
    over(svg)
    control.click()
    expect(dialog.open).toBe(true)
    dialog.close()
    document.documentElement.removeAttribute('data-axt-mode')
    document.documentElement.removeAttribute('data-theme')
  })

  it('the copy is one for reading, as every clone of the paper\'s nodes is: no behaviour of the original\'s, no script URL — and the translation it kept stays (Devin on #279)', () => {
    const { control, host } = page(`<figure class="ltx_figure" id="F1"><svg class="ltx_picture" id="F1.pic" onclick="window.__ran = true"><a href="javascript:void(0)"><foreignObject><span class="ltx_foreignobject_container">
      <span class="ltx_foreignobject_content" id="L1" data-axt-id="L1">Shared Expert</span><span class="ltx_foreignobject_content axt-t" data-axt-for="L1">expert partage</span></span></foreignObject></a></svg></figure>`)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    hide(document.getElementById('L1')!)
    over(svg)
    control.click()
    const copy = host.querySelector('svg')!
    expect(copy.hasAttribute('onclick')).toBe(false)
    expect(copy.querySelector('a')!.hasAttribute('href')).toBe(false)
    expect(Array.from(host.querySelectorAll('.ltx_foreignobject_content'), el => el.textContent)).toEqual(['expert partage'])
    // The paper's own node keeps what it had
    expect(svg.getAttribute('onclick')).toBe('window.__ran = true')
  })

  it('a figure that takes no pointer is found in any copy side mode makes, a graphic\'s that stands in no figure included: its copy is a paragraph, not a figure (2609.20818v1)', async () => {
    document.body.innerHTML = '<article class="ltx_document"><div class="ltx_para" id="p2"><img class="ltx_graphics" id="g"></div><div class="ltx_para axt-t axt-split"><img class="ltx_graphics" inert></div></article>'
    viewer = installFigureViewer(document, { ...OPTIONS, around: '.ltx_figure, .axt-split', strings: () => WORDS })
    const control = document.querySelector(`.${SPOT_CLASS}`)!.shadowRoot!.querySelector('.axt-viewer-open') as HTMLButtonElement
    const copy = document.querySelector('.axt-split')!
    place(copy.querySelector('img')!, rect(800, 100, 400, 300))
    // The pointer is over the copy's block — its image is inert and is never the target
    copy.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true, clientX: 900, clientY: 200 }))
    expect(control.hasAttribute('data-axt-shown')).toBe(true)
  })

  it('removed, it takes its host away and no longer answers the pointer', () => {
    const { control } = page(PICTURE)
    const svg = document.querySelector('svg')!
    place(svg, rect(100, 100, 400, 300))
    viewer!.remove()
    viewer = null
    expect(document.querySelector(`.${VIEWER_CLASS}`)).toBeNull()
    over(svg)
    expect(control.hasAttribute('data-axt-shown')).toBe(false)
  })
})
