import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DockPlacement, type FloatingEntryOptions, type FloatingEntryStrings, mountFloatingEntry } from '@/core/pdf/floating'

// The floating button on arXiv's PDF page (issue #169, UI.md S-I-06): Read Frog's, ported. Layout and motion are the
// real browser's business (tests/e2e/pdf-entry.mjs); here, the state each interaction leaves behind

const STRINGS: FloatingEntryStrings = {
  open: 'Bilingual version (Read arXiv)',
  options: 'Floating button options',
  lock: 'Lock position',
  unlock: 'Unlock position',
  settings: 'Settings',
  feedback: 'Send feedback',
  hideForNow: 'Hide for now',
  hideAlways: "Don't show again",
}
const HREF = 'https://arxiv.org/html/2501.07202v1#axt-translate'

function mount(overrides: Partial<FloatingEntryOptions> = {}) {
  const host = document.createElement('div')
  host.className = 'axt-pdf-entry'
  document.body.append(host)
  const onPlacement = vi.fn<(placement: DockPlacement) => void>()
  const onSettings = vi.fn<() => void>()
  const onHide = vi.fn<(scope: 'now' | 'always') => void>()
  const entry = mountFloatingEntry(document, host, {
    href: HREF,
    newTab: true,
    iconUrl: 'chrome-extension://id/icon/mark.svg',
    feedbackUrl: 'https://github.com/SRjoeee/ReadarXiv/issues/new',
    placement: { side: 'right', position: 0.66, locked: false },
    strings: STRINGS,
    onPlacement,
    onSettings,
    onHide,
    ...overrides,
  })
  const root = host.shadowRoot!
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector(selector) as T
  const dock = q('.dock')
  const main = q<HTMLAnchorElement>('a.main')
  return { host, entry, root, q, dock, main, onPlacement, onSettings, onHide }
}

/** The main button where Read Frog's sits by default in a 1024 × 768 window: 40 px tall, flush with the right edge */
function box(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => ({}),
  } as DOMRect)
}
function placeBoxes(m: ReturnType<typeof mount>) {
  // The dock's top at 0.66 of 768; the button above the main one is 34 px plus the 8 px gap
  box(m.dock, { left: 956, top: 507, width: 68, height: 170 })
  box(m.main, { left: 980, top: 549, width: 44, height: 40 })
}
const pointer = (type: string, x: number, y: number, extra: Partial<PointerEventInit> = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...extra })
/** happy-dom has no Fullscreen API: the property the entry reads is put on the document for the test */
const setFullscreen = (element: Element | null) =>
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
const click = (detail = 1) => new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail })

beforeEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})
afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenElement')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the floating button: what it is made of', () => {
  it('is Read Frog\'s column, top to bottom: translate, the main button with its two corner controls, settings, feedback', () => {
    const { root, q } = mount()
    const order = [...root.querySelectorAll('.dock > *')].map(e => e.className)
    expect(order).toEqual(['hidden-button translate', 'anchor', 'hidden-button settings', 'hidden-button feedback', 'shield'])
    expect([...q('.anchor').children].map(e => e.className)).toEqual(['main', 'control options', 'control lock', 'menu'])
    // Our mark in place of their mascot, decorative: the link carries the name
    expect(q<HTMLImageElement>('.main img').getAttribute('src')).toBe('chrome-extension://id/icon/mark.svg')
    expect(q<HTMLImageElement>('.main img').alt).toBe('')
  })

  it('opens the bilingual version from the main button and the one above it, in a new tab unless told otherwise', () => {
    const { entry, root } = mount()
    const links = [...root.querySelectorAll<HTMLAnchorElement>('a.main, a.translate')]
    expect(links.map(a => [a.getAttribute('href'), a.target, a.rel, a.getAttribute('aria-label')])).toEqual([
      [HREF, '_blank', 'noopener', STRINGS.open],
      [HREF, '_blank', 'noopener', STRINGS.open],
    ])
    entry.retarget(false)
    expect(links.map(a => [a.getAttribute('target'), a.getAttribute('rel')])).toEqual([[null, null], [null, null]])
    entry.retarget(true)
    expect(links.map(a => a.target)).toEqual(['_blank', '_blank'])
  })

  it('names every control, and sends feedback to the issue tracker with nothing about the page', () => {
    const { q, onSettings } = mount()
    expect(q('.options').getAttribute('aria-label')).toBe(STRINGS.options)
    expect(q('.lock').getAttribute('aria-label')).toBe(STRINGS.lock)
    expect([q('.settings .tip').textContent, q('.translate .tip').textContent, q('.feedback .tip').textContent])
      .toEqual([STRINGS.settings, STRINGS.open, STRINGS.feedback])
    const feedback = q<HTMLAnchorElement>('a.feedback')
    expect([feedback.getAttribute('href'), feedback.target, feedback.rel])
      .toEqual(['https://github.com/SRjoeee/ReadarXiv/issues/new', '_blank', 'noopener noreferrer'])
    q('.settings').dispatchEvent(click())
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it('follows a change of interface language while the PDF stays open', () => {
    const { entry, q } = mount()
    entry.relabel({ ...STRINGS, open: 'Zweisprachige Fassung', lock: 'Position sperren', hideForNow: 'Vorerst ausblenden' })
    expect([q('a.main').getAttribute('aria-label'), q('.translate .tip').textContent, q('.lock').getAttribute('aria-label'), q('.hide-now').textContent])
      .toEqual(['Zweisprachige Fassung', 'Zweisprachige Fassung', 'Position sperren', 'Vorerst ausblenden'])
  })

  it('leaves the rest of the document alone', () => {
    document.body.innerHTML = '<embed id="viewer" type="application/pdf">'
    const before = document.getElementById('viewer')!.outerHTML
    mount()
    expect(document.getElementById('viewer')!.outerHTML).toBe(before)
    expect(document.body.children).toHaveLength(2)
  })
})

describe('the floating button: tucked and opened', () => {
  it('rests tucked against the edge and faded; entering the main button opens it; leaving the dock tucks it again', () => {
    const { dock, main } = mount()
    expect([dock.dataset.side, dock.dataset.expanded, dock.dataset.attached]).toEqual(['right', 'no', 'no'])
    expect(dock.style.top).toBe('66vh')
    main.dispatchEvent(new MouseEvent('mouseenter'))
    expect([dock.dataset.expanded, dock.dataset.attached]).toEqual(['yes', 'yes'])
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    expect([dock.dataset.expanded, dock.dataset.attached]).toEqual(['no', 'no'])
  })

  it('locked, it stays out of the edge while closed; the lock says what it will do next, and the host saves it', () => {
    const { dock, q, onPlacement } = mount()
    q('.lock').dispatchEvent(click())
    expect(onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: 0.66, locked: true })
    expect(q('.lock').getAttribute('aria-label')).toBe(STRINGS.unlock)
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    expect([dock.dataset.expanded, dock.dataset.attached]).toEqual(['no', 'yes'])
    q('.lock').dispatchEvent(click())
    expect(onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: 0.66, locked: false })
    expect(dock.dataset.attached).toBe('no')
  })

  it('takes a placement saved in another tab, and hides while the document is fullscreen', () => {
    const { entry, dock } = mount()
    entry.place({ side: 'left', position: 0.3, locked: true })
    expect([dock.dataset.side, dock.style.top, dock.dataset.attached]).toEqual(['left', '30vh', 'yes'])
    setFullscreen(document.body)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(dock.hidden).toBe(true)
    setFullscreen(null)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(dock.hidden).toBe(false)
  })
})

describe('the floating button: click and drag', () => {
  it('a press released before the long press, without moving, is a click: the link opens and nothing is saved', () => {
    vi.useFakeTimers()
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    vi.advanceTimersByTime(349)
    m.main.dispatchEvent(pointer('pointerup', 1000, 569))
    const follow = click()
    m.main.dispatchEvent(follow)
    expect(follow.defaultPrevented).toBe(false)
    expect(m.dock.dataset.dragging).toBe('no')
    expect(m.onPlacement).not.toHaveBeenCalled()
  })

  it('a movement past 6 px drags it as a circle under the pointer; the drop picks the nearer side and keeps the height', () => {
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 1004, 572))
    expect(m.dock.dataset.dragging).toBe('no')
    m.main.dispatchEvent(pointer('pointermove', 300, 400))
    // The pointer held the button 20 px from its left and top, so the circle's corner is there
    expect([m.dock.dataset.dragging, m.dock.style.left, m.dock.style.right, m.dock.style.top]).toEqual(['yes', '280px', 'auto', '380px'])
    expect([document.body.style.cursor, document.body.style.userSelect]).toEqual(['grabbing', 'none'])
    m.main.dispatchEvent(pointer('pointerup', 300, 400))
    // Its centre (280 + 22) is in the left half; the dock's top is the button's less the 42 px above it
    expect(m.onPlacement).toHaveBeenCalledWith({ side: 'left', position: (380 - 42) / 768, locked: false })
    expect([m.dock.dataset.dragging, m.dock.dataset.side, m.dock.style.left]).toEqual(['no', 'left', ''])
    expect(Number.parseFloat(m.dock.style.top)).toBeCloseTo(((380 - 42) / 768) * 100, 4)
    // The page's own cursor and selection are back
    expect([document.body.style.cursor, document.body.style.userSelect]).toEqual(['', ''])
  })

  it('the click that follows a drag does not open the link, and the next real click does', () => {
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 900, 300))
    m.main.dispatchEvent(pointer('pointerup', 900, 300))
    const afterDrag = click()
    m.main.dispatchEvent(afterDrag)
    expect(afterDrag.defaultPrevented).toBe(true)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointerup', 1000, 569))
    const real = click()
    m.main.dispatchEvent(real)
    expect(real.defaultPrevented).toBe(false)
  })

  it('a press puts a shield over the window until it ends, so the moves reach this document and not the PDF viewer', () => {
    vi.useFakeTimers()
    const m = mount()
    placeBoxes(m)
    const shield = m.q('.shield')
    expect(shield.hidden).toBe(true)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    expect(shield.hidden).toBe(false)
    m.main.dispatchEvent(pointer('pointerup', 1000, 569))
    expect(shield.hidden).toBe(true)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 500, 300))
    m.main.dispatchEvent(pointer('pointercancel', 500, 300))
    expect(shield.hidden).toBe(true)
    // Locked, a press is a click and nothing covers the page
    m.entry.place({ side: 'right', position: 0.66, locked: true })
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    expect(shield.hidden).toBe(true)
  })

  it('a long press starts the drag without moving', () => {
    vi.useFakeTimers()
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    vi.advanceTimersByTime(350)
    expect(m.dock.dataset.dragging).toBe('yes')
    m.main.dispatchEvent(pointer('pointerup', 1000, 569))
    // Dropped where it was picked up: still on the right, at the same height
    expect(m.onPlacement).toHaveBeenCalledWith({ side: 'right', position: 507 / 768, locked: false })
  })

  it('the drop is held 30 px from the top and 200 px from the bottom of the window', () => {
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 1000, 5))
    m.main.dispatchEvent(pointer('pointerup', 1000, 5))
    expect(m.onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: 30 / 768, locked: false })
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 1000, 760))
    m.main.dispatchEvent(pointer('pointerup', 1000, 760))
    expect(m.onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: (768 - 200) / 768, locked: false })
  })

  it('locked, a press never becomes a drag: it stays a click', () => {
    vi.useFakeTimers()
    const m = mount({ placement: { side: 'right', position: 0.66, locked: true } })
    placeBoxes(m)
    const down = pointer('pointerdown', 1000, 569)
    m.main.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    m.main.dispatchEvent(pointer('pointermove', 300, 300))
    vi.advanceTimersByTime(1000)
    expect(m.dock.dataset.dragging).toBe('no')
    expect(m.onPlacement).not.toHaveBeenCalled()
  })

  it('ignores the other mouse buttons, so a middle click still opens the link in the background', () => {
    const m = mount()
    placeBoxes(m)
    const down = pointer('pointerdown', 1000, 569, { button: 1 })
    m.main.dispatchEvent(down)
    m.main.dispatchEvent(pointer('pointermove', 300, 300))
    expect([down.defaultPrevented, m.dock.dataset.dragging]).toEqual([false, 'no'])
  })

  it('fullscreen in the middle of a drag cancels it, and gives the page back its cursor and selection', () => {
    document.body.style.cursor = 'text'
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 500, 300))
    expect(document.body.style.cursor).toBe('grabbing')
    setFullscreen(document.body)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect([m.dock.dataset.dragging, document.body.style.cursor, document.body.style.userSelect]).toEqual(['no', 'text', ''])
    expect(m.q('.shield').hidden).toBe(true)
    // The release that finally arrives changes nothing
    m.main.dispatchEvent(pointer('pointerup', 500, 300))
    expect(m.onPlacement).not.toHaveBeenCalled()
  })
})

describe('the floating button: the close menu', () => {
  it('opens from the close control, keeps the dock open, and closes on Escape or a press elsewhere', () => {
    const { q, dock, main } = mount()
    main.dispatchEvent(new MouseEvent('mouseenter'))
    q('.options').dispatchEvent(click())
    expect([q('.menu').hidden, q('.options').getAttribute('aria-expanded')]).toEqual([false, 'true'])
    // The pointer may wander off towards the menu; the dock stays open while it is up (reference)
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    expect(dock.dataset.expanded).toBe('yes')
    q('.menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect([q('.menu').hidden, q('.options').getAttribute('aria-expanded')]).toEqual([true, 'false'])

    q('.options').dispatchEvent(click())
    expect(q('.menu').hidden).toBe(false)
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    expect(q('.menu').hidden).toBe(true)
  })

  it('opened from the keyboard, the first item takes focus and the arrows move through them', () => {
    const { q, root } = mount()
    q('.options').dispatchEvent(click(0))
    expect(root.activeElement).toBe(q('.hide-now'))
    q('.menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement).toBe(q('.hide-always'))
    q('.menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement).toBe(q('.hide-now'))
  })

  it('"hide for now" and "don\'t show again" take the entry off the page and tell the host which', () => {
    const now = mount()
    now.q('.options').dispatchEvent(click())
    now.q('.hide-now').dispatchEvent(click())
    expect([now.host.isConnected, now.onHide.mock.calls]).toEqual([false, [['now']]])

    const always = mount()
    always.q('.options').dispatchEvent(click())
    always.q('.hide-always').dispatchEvent(click())
    expect([always.host.isConnected, always.onHide.mock.calls]).toEqual([false, [['always']]])
    expect(document.querySelectorAll('.axt-pdf-entry')).toHaveLength(0)
  })

  it('removed, it stops listening to the document', () => {
    const { entry, host } = mount()
    const off = vi.spyOn(document, 'removeEventListener')
    entry.remove()
    expect(host.isConnected).toBe(false)
    expect(off.mock.calls.map(([type]) => type).sort()).toEqual(['fullscreenchange', 'pointerdown'])
  })
})
