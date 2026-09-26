import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DockPlacement, type FloatingButtonOptions, type FloatingButtonStrings, mountFloatingButton } from '@/core/floating/button'
import { Settings as LucideSettings } from 'lucide'

// The floating button on arXiv's pages (issue #169, DESIGN §4.0c, UI.md S-I-06): Read Frog's frame, resting and opening
// as Immersive Translate's does. Layout and motion are the real browser's business (tests/e2e/floating-button.mjs);
// here, the state each interaction leaves behind

const STRINGS: FloatingButtonStrings = {
  main: 'Bilingual version (Read arXiv)',
  panel: 'Control panel',
  options: 'Floating button options',
  lock: 'Lock position',
  unlock: 'Unlock position',
  settings: 'Settings',
  hideForNow: 'Hide for now',
  hideAlways: "Don't show again",
}
const HREF = 'https://arxiv.org/html/2501.07202v1#readarxiv'

function mount(overrides: Partial<FloatingButtonOptions> = {}) {
  const host = document.createElement('div')
  host.className = 'axt-floating'
  document.body.append(host)
  const onPlacement = vi.fn<(placement: DockPlacement) => void>()
  const onSettings = vi.fn<() => void>()
  const onHide = vi.fn<(scope: 'now' | 'always') => void>()
  const entry = mountFloatingButton(document, host, {
    main: { kind: 'link', href: HREF },
    newTab: true,
    placement: { side: 'right', position: 0.66, locked: false },
    strings: STRINGS,
    // happy-dom would go and fetch a real address; what the frame shows is the browser's business (e2e)
    panelUrl: 'about:blank',
    onPlacement,
    onSettings,
    onHide,
    ...overrides,
  })
  const root = host.shadowRoot!
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector(selector) as T
  const dock = q('.axt-fb-dock')
  const main = q('.axt-fb-main')
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
  Reflect.deleteProperty(document, 'contentType')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the floating button: what it is made of', () => {
  it('is a column of three: the control panel, the main button with its two corner controls, the settings', () => {
    const { root, q } = mount()
    // The dock places; the column inside it is what is seen, and what undoes the page's zoom
    expect([...root.querySelectorAll('.axt-fb-dock > *')].map(e => e.className)).toEqual(['axt-fb-column', 'axt-fb-panel-box', 'axt-fb-shield'])
    expect([...q('.axt-fb-column').children].map(e => e.className)).toEqual(['axt-fb-hidden-button axt-fb-panel', 'axt-fb-anchor', 'axt-fb-hidden-button axt-fb-settings'])
    expect([...q('.axt-fb-anchor').children].map(e => e.className)).toEqual(['axt-fb-main', 'axt-fb-control axt-fb-options', 'axt-fb-control axt-fb-lock', 'axt-fb-menu'])
    // Our mark in its disc, inline vector and decorative: the button carries the name, and no image file is fetched
    const mark = q<SVGElement>('.axt-fb-main .axt-fb-disc svg.axt-fb-mark')
    // the view box drawn tight round the circle, 47 across (logo round 7 puts the circle at the origin)
    expect([mark.getAttribute('aria-hidden'), mark.getAttribute('viewBox'), mark.querySelector('circle')?.getAttribute('fill')]).toEqual(['true', '0 0 47 47', '#fff'])
    expect(root.querySelector('img')).toBeNull()
    expect(q('.axt-fb-main .axt-fb-disc .axt-fb-tick')).not.toBeNull()
  })

  it('on an abstract or PDF page the main button is a link to the bilingual version, in a new tab unless told otherwise', () => {
    const { entry, q } = mount()
    const link = q<HTMLAnchorElement>('a.axt-fb-main')
    expect([link.getAttribute('href'), link.target, link.rel, link.getAttribute('aria-label')]).toEqual([HREF, '_blank', 'noopener', STRINGS.main])
    entry.retarget(false)
    expect([link.getAttribute('target'), link.getAttribute('rel')]).toEqual([null, null])
    entry.retarget(true)
    expect(link.target).toBe('_blank')
  })

  it('on the full text the main button is a button that runs the toggle, and the tick says the page is translated', () => {
    const run = vi.fn<() => void>()
    const { entry, q, dock } = mount({ main: { kind: 'toggle', run } })
    const main = q<HTMLButtonElement>('button.axt-fb-main')
    expect([main.type, main.getAttribute('aria-label'), dock.dataset.axtActive]).toEqual(['button', STRINGS.main, 'no'])
    main.dispatchEvent(click())
    expect(run).toHaveBeenCalledOnce()
    entry.activate(true)
    entry.relabel({ ...STRINGS, main: 'Show the original' })
    expect([dock.dataset.axtActive, main.getAttribute('aria-label'), q('.axt-fb-main .axt-fb-tip').textContent]).toEqual(['yes', 'Show the original', 'Show the original'])
    entry.activate(false)
    expect(dock.dataset.axtActive).toBe('no')
    // A link has nothing to retarget here, and says nothing about it
    entry.retarget(false)
    expect(main.hasAttribute('target')).toBe(false)
  })

  it('a paper with no HTML version keeps the button, disabled, its tooltip saying why', () => {
    const { q } = mount({ main: { kind: 'none' }, strings: { ...STRINGS, main: 'arXiv has no HTML version of this paper' } })
    const main = q<HTMLButtonElement>('button.axt-fb-main')
    expect([main.getAttribute('aria-disabled'), main.getAttribute('aria-label'), q('.axt-fb-main .axt-fb-tip').textContent])
      .toEqual(['true', 'arXiv has no HTML version of this paper', 'arXiv has no HTML version of this paper'])
    // A click does nothing, and the other two buttons still work
    expect(() => main.dispatchEvent(click())).not.toThrow()
  })

  it('names every control; the tooltips are the same words for the eye only; the settings ask the host', () => {
    const { q, root, onSettings } = mount()
    expect([q('.axt-fb-panel').getAttribute('aria-label'), q('.axt-fb-settings').getAttribute('aria-label'), q('.axt-fb-options').getAttribute('aria-label'), q('.axt-fb-lock').getAttribute('aria-label')])
      .toEqual([STRINGS.panel, STRINGS.settings, STRINGS.options, STRINGS.lock])
    expect([q('.axt-fb-panel .axt-fb-tip').textContent, q('.axt-fb-settings .axt-fb-tip').textContent, q('.axt-fb-main .axt-fb-tip').textContent]).toEqual([STRINGS.panel, STRINGS.settings, STRINGS.main])
    expect([...root.querySelectorAll('.axt-fb-tip')].every(tip => tip.getAttribute('aria-hidden') === 'true')).toBe(true)
    q('.axt-fb-settings').dispatchEvent(click())
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it('the icons are one set on one grid: Lucide\'s, each a 24 px box with round strokes', () => {
    const { root } = mount()
    const icons = [...root.querySelectorAll('svg:not(.axt-fb-mark)')]
    expect(icons.length).toBeGreaterThanOrEqual(5)
    for (const icon of icons) {
      expect([icon.getAttribute('viewBox'), icon.getAttribute('stroke-linecap'), icon.getAttribute('stroke-linejoin'), icon.getAttribute('fill')])
        .toEqual(['0 0 24 24', 'round', 'round', 'none'])
      expect(icon.children.length).toBeGreaterThan(0)
    }
  })

  it('follows a change of interface language while the page stays open', () => {
    const { entry, q } = mount()
    entry.relabel({ ...STRINGS, main: 'Zweisprachige Fassung', panel: 'Bedienfeld', lock: 'Position sperren', hideForNow: 'Vorerst ausblenden' })
    expect([q('.axt-fb-main').getAttribute('aria-label'), q('.axt-fb-panel .axt-fb-tip').textContent, q('.axt-fb-lock').getAttribute('aria-label'), q('.axt-fb-hide-now').textContent])
      .toEqual(['Zweisprachige Fassung', 'Bedienfeld', 'Position sperren', 'Vorerst ausblenden'])
  })

  it('everything it injects carries the prefix, inside its shadow root too: classes, data attributes, CSS variables (hard rule 2; Devin on #250)', () => {
    const { root, q, entry } = mount({ zoom: 1.25 })
    q('.axt-fb-panel').dispatchEvent(click())
    entry.activate(true)
    for (const element of root.querySelectorAll('*')) {
      for (const name of element.classList) expect([element.tagName, name, name.startsWith('axt-')]).toEqual([element.tagName, name, true])
      for (const attribute of element.getAttributeNames().filter(n => n.startsWith('data-'))) expect([attribute, attribute.startsWith('data-axt-')]).toEqual([attribute, true])
    }
    const sheet = root.querySelector('style')!.textContent!.replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = [...sheet.matchAll(/\.([A-Za-z][\w-]*)/g)].map(m => m[1]!)
    const variables = [...sheet.matchAll(/(--[\w-]+)/g)].map(m => m[1]!)
    const attributes = [...sheet.matchAll(/\[(data-[\w-]+)/g)].map(m => m[1]!)
    expect(classes.filter(name => !name.startsWith('axt-'))).toEqual([])
    expect(variables.filter(name => !name.startsWith('--axt-'))).toEqual([])
    expect(attributes.filter(name => !name.startsWith('data-axt-'))).toEqual([])
    expect(q('.axt-fb-dock').style.getPropertyValue('--axt-unzoom')).toBe('0.8')
  })

  it('its sheet carries no :has() (hard rule 9): what a selector would ask of the structure, a data-axt-* mark says', () => {
    // The rule was measured on author sheets in the document (DESIGN §7.2); this one lives in a shadow root, where the
    // cost was not measured. It is held to the same rule all the same: the gate in tests/styles reads `src/styles/*.css`
    // and never sees CSS written in TypeScript, and a mark costs this sheet nothing a selector would save
    const { root, q, entry } = mount({ zoom: 1.25 })
    q('.axt-fb-panel').dispatchEvent(click())
    entry.activate(true)
    const sheets = [...root.querySelectorAll('style')].map(style => (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets.join('\n').length).toBeGreaterThan(1000)
    for (const sheet of sheets) expect(sheet).not.toContain(':has(')
  })

  it('its settings button draws the glyph the popup\'s settings gear draws: one control, one icon', () => {
    // Both take Lucide's `settings` node (the popup through ui/LucideIcon.tsx); the popup once had a gear of its own
    const { q } = mount()
    const path = q('.axt-fb-settings svg path')
    expect(path.getAttribute('d')).toBe((LucideSettings[0]![1] as { d: string }).d)
  })

  it('leaves the rest of the document alone', () => {
    document.body.innerHTML = '<embed id="viewer" type="application/pdf">'
    const before = document.getElementById('viewer')!.outerHTML
    mount()
    expect(document.getElementById('viewer')!.outerHTML).toBe(before)
    expect(document.body.children).toHaveLength(2)
  })
})

describe('the floating button: at rest, lit, open', () => {
  it('rests whole and dim; the pointer lights it at once, the other buttons come out once it has stayed 400 ms', () => {
    vi.useFakeTimers()
    const { dock, main } = mount()
    // 0.66 of happy-dom's 768 px window, on a whole pixel rather than at 66vh
    expect([dock.dataset.axtSide, dock.dataset.axtLit, dock.dataset.axtExpanded, dock.style.top]).toEqual(['right', 'no', 'no', '507px'])
    main.dispatchEvent(new MouseEvent('mouseenter'))
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['yes', 'no'])
    vi.advanceTimersByTime(399)
    expect(dock.dataset.axtExpanded).toBe('no')
    vi.advanceTimersByTime(1)
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['yes', 'yes'])
  })

  it('a pointer that only crosses it opens nothing, and the light goes out 200 ms after it has left', () => {
    vi.useFakeTimers()
    const { dock, main } = mount()
    main.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(150)
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(199)
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['yes', 'no'])
    vi.advanceTimersByTime(1)
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['no', 'no'])
    // The dwell that was under way died with the leave
    vi.advanceTimersByTime(1000)
    expect(dock.dataset.axtExpanded).toBe('no')
  })

  it('leaving is forgiven for 200 ms: back inside in time, it stays open', () => {
    vi.useFakeTimers()
    const { dock, main } = mount()
    main.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(400)
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(150)
    main.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(1000)
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['yes', 'yes'])
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(200)
    expect([dock.dataset.axtLit, dock.dataset.axtExpanded]).toEqual(['no', 'no'])
  })

  it('on a PDF the document never hears the pointer leave for the viewer: a layer behind the lit button hears it instead', () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'contentType', { configurable: true, get: () => 'application/pdf' })
    const { dock, main, q } = mount()
    const catcher = q('.axt-fb-catcher')
    expect(catcher.hidden).toBe(true)
    main.dispatchEvent(new MouseEvent('mouseenter'))
    main.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(catcher.hidden).toBe(false)
    vi.advanceTimersByTime(400)
    expect(dock.dataset.axtExpanded).toBe('yes')
    // Off the buttons and onto the layer, then back within the grace: still open
    catcher.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(150)
    q('.axt-fb-panel').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(1000)
    expect(dock.dataset.axtExpanded).toBe('yes')
    // Off for good: folded, dim, and the layer is gone with it, so the viewer has the pointer again
    catcher.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(200)
    expect([dock.dataset.axtExpanded, dock.dataset.axtLit, catcher.hidden]).toEqual(['no', 'no', true])
  })

  it('an ordinary page has no such layer', () => {
    expect(mount().root.querySelector('.axt-fb-catcher')).toBeNull()
  })

  it('the lock says what it will do next, and the host saves it', () => {
    const { q, onPlacement } = mount()
    q('.axt-fb-lock').dispatchEvent(click())
    expect(onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: 0.66, locked: true })
    expect(q('.axt-fb-lock').getAttribute('aria-label')).toBe(STRINGS.unlock)
    q('.axt-fb-lock').dispatchEvent(click())
    expect(onPlacement).toHaveBeenLastCalledWith({ side: 'right', position: 0.66, locked: false })
    expect(q('.axt-fb-lock').getAttribute('aria-label')).toBe(STRINGS.lock)
  })

  it('takes a placement saved in another tab, and hides while the document is fullscreen', () => {
    const { entry, dock } = mount()
    entry.place({ side: 'left', position: 0.3, locked: true })
    expect([dock.dataset.axtSide, dock.style.top]).toEqual(['left', '230px'])
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
    expect(m.dock.dataset.axtDragging).toBe('no')
    expect(m.onPlacement).not.toHaveBeenCalled()
  })

  it('a movement past 6 px drags it as a circle under the pointer; the drop picks the nearer side and keeps the height', () => {
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 1004, 572))
    expect(m.dock.dataset.axtDragging).toBe('no')
    m.main.dispatchEvent(pointer('pointermove', 300, 400))
    // The pointer held the button 20 px from its left and top, so the circle's corner is there
    expect([m.dock.dataset.axtDragging, m.dock.style.left, m.dock.style.right, m.dock.style.top]).toEqual(['yes', '280px', 'auto', '380px'])
    expect([document.body.style.cursor, document.body.style.userSelect]).toEqual(['grabbing', 'none'])
    m.main.dispatchEvent(pointer('pointerup', 300, 400))
    // Its centre (280 + 22) is in the left half; the dock's top is the button's less the 42 px above it
    expect(m.onPlacement).toHaveBeenCalledWith({ side: 'left', position: (380 - 42) / 768, locked: false })
    expect([m.dock.dataset.axtDragging, m.dock.dataset.axtSide, m.dock.style.left, m.dock.style.top]).toEqual(['no', 'left', '', '338px'])
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
    const shield = m.q('.axt-fb-shield')
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

  it('the same holds for the toggle on the full text: a drag runs nothing, the next click does', () => {
    const run = vi.fn<() => void>()
    const m = mount({ main: { kind: 'toggle', run } })
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 900, 300))
    m.main.dispatchEvent(pointer('pointerup', 900, 300))
    m.main.dispatchEvent(click())
    expect(run).not.toHaveBeenCalled()
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointerup', 1000, 569))
    m.main.dispatchEvent(click())
    expect(run).toHaveBeenCalledOnce()
  })

  it('a drag the browser cancels docks where it was, and swallows nothing: no click follows a cancel, and the next one is the reader\'s (Devin on #251)', () => {
    const run = vi.fn<() => void>()
    const m = mount({ main: { kind: 'toggle', run } })
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    m.main.dispatchEvent(pointer('pointermove', 300, 400))
    m.main.dispatchEvent(pointer('pointercancel', 300, 400))
    expect(m.onPlacement).toHaveBeenCalledOnce()
    // Enter on the focused button: a click with no pointerdown before it to reset anything
    m.main.dispatchEvent(click(0))
    expect(run).toHaveBeenCalledOnce()
  })

  it('a long press starts the drag without moving', () => {
    vi.useFakeTimers()
    const m = mount()
    placeBoxes(m)
    m.main.dispatchEvent(pointer('pointerdown', 1000, 569))
    vi.advanceTimersByTime(350)
    expect(m.dock.dataset.axtDragging).toBe('yes')
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
    expect(m.dock.dataset.axtDragging).toBe('no')
    expect(m.onPlacement).not.toHaveBeenCalled()
  })

  it('ignores the other mouse buttons, so a middle click still opens the link in the background', () => {
    const m = mount()
    placeBoxes(m)
    const down = pointer('pointerdown', 1000, 569, { button: 1 })
    m.main.dispatchEvent(down)
    m.main.dispatchEvent(pointer('pointermove', 300, 300))
    expect([down.defaultPrevented, m.dock.dataset.axtDragging]).toEqual([false, 'no'])
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
    expect([m.dock.dataset.axtDragging, document.body.style.cursor, document.body.style.userSelect]).toEqual(['no', 'text', ''])
    expect(m.q('.axt-fb-shield').hidden).toBe(true)
    // The release that finally arrives changes nothing
    m.main.dispatchEvent(pointer('pointerup', 500, 300))
    expect(m.onPlacement).not.toHaveBeenCalled()
  })
})

describe('the floating button: one size on every page, on the screen\'s own pixels', () => {
  it('undoes the page\'s zoom: the column and the panel carry its inverse, and a change of zoom is followed', () => {
    const { entry, dock } = mount({ zoom: 1.25 })
    expect(dock.style.getPropertyValue('--axt-unzoom')).toBe('0.8')
    entry.rescale(2)
    expect(dock.style.getPropertyValue('--axt-unzoom')).toBe('0.5')
    // Nonsense is not a zoom
    entry.rescale(0)
    entry.rescale(Number.NaN)
    expect(dock.style.getPropertyValue('--axt-unzoom')).toBe('0.5')
    expect(mount().dock.style.getPropertyValue('--axt-unzoom')).toBe('1')
  })

  it('its place down the edge is a whole pixel of the screen, whatever the pixel ratio, and follows the window', () => {
    const ratio = vi.spyOn(window, 'devicePixelRatio', 'get')
    ratio.mockReturnValue(2.5)
    const { entry, dock } = mount({ placement: { side: 'right', position: 0.333, locked: false } })
    // 0.333 × 768 = 255.744 → 639.36 device pixels → 639 → 255.6 px
    expect(dock.style.top).toBe('255.6px')
    ratio.mockReturnValue(1)
    entry.place({ side: 'right', position: 0.333, locked: false })
    expect(dock.style.top).toBe('256px')
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
    window.dispatchEvent(new Event('resize'))
    expect(dock.style.top).toBe('333px')
    height.mockRestore()
  })

  it('the drop\'s clearances hold wherever it is drawn: a window made shorter since does not leave the column below its edge (Devin on #251)', () => {
    const height = vi.spyOn(window, 'innerHeight', 'get')
    height.mockReturnValue(1000)
    const { dock } = mount({ placement: { side: 'right', position: 0.8, locked: false } })
    expect(dock.style.top).toBe('800px')
    // 0.8 of 300 would be 240, with the column's 124 px below it: held 200 px from the bottom instead
    height.mockReturnValue(300)
    window.dispatchEvent(new Event('resize'))
    expect(dock.style.top).toBe('100px')
    // …and never above the top clearance, in a window shorter than the two together
    height.mockReturnValue(150)
    window.dispatchEvent(new Event('resize'))
    expect(dock.style.top).toBe('30px')
    height.mockRestore()
  })

  it('the panel is placed in the window\'s pixels and written in its own, which the un-zoom scales', () => {
    const m = mount({ zoom: 2 })
    placeBoxes(m)
    m.q('.axt-fb-panel').dispatchEvent(click())
    const frame = m.q<HTMLIFrameElement>('.axt-fb-panel-box iframe')
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'axt:panel-size', height: 300 }, source: frame.contentWindow as Window }))
    // The popup's 300 px are 150 of the window's at half scale: centred on 569 → top 494, and both written doubled
    expect([m.q('.axt-fb-panel-box').style.height, m.q('.axt-fb-panel-box').style.top]).toEqual(['300px', '988px'])
  })
})

describe('the floating button: the control panel', () => {
  /** A message as the framed popup posts it: `source` is what the button checks, and a test can set it */
  const fromFrame = (frame: HTMLIFrameElement | Window | null, data: unknown) =>
    window.dispatchEvent(new MessageEvent('message', { data, source: (frame instanceof HTMLIFrameElement ? frame.contentWindow : frame) as Window }))

  it('opens the popup page in a frame beside the button, only while it is open, and holds the dock open', () => {
    vi.useFakeTimers()
    const { q, dock } = mount()
    expect([q('.axt-fb-panel-box').hidden, q('.axt-fb-panel-box iframe')]).toEqual([true, null])
    q('.axt-fb-panel').dispatchEvent(click())
    const frame = q<HTMLIFrameElement>('.axt-fb-panel-box iframe')
    expect([q('.axt-fb-panel-box').hidden, frame.getAttribute('src'), frame.title, q('.axt-fb-panel').getAttribute('aria-expanded'), dock.dataset.axtExpanded])
      .toEqual([false, 'about:blank', STRINGS.panel, 'true', 'yes'])
    // The pointer going away does not fold it while the panel is up
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(1000)
    expect(dock.dataset.axtExpanded).toBe('yes')
    // A second click closes it, and the frame goes with it
    q('.axt-fb-panel').dispatchEvent(click())
    expect([q('.axt-fb-panel-box').hidden, q('.axt-fb-panel-box iframe'), q('.axt-fb-panel').getAttribute('aria-expanded')]).toEqual([true, null, 'false'])
  })

  it('shows itself once the popup has said how tall it is, centred on the main button and kept inside the window', () => {
    const m = mount()
    placeBoxes(m)
    m.q('.axt-fb-panel').dispatchEvent(click())
    const box = m.q('.axt-fb-panel-box')
    expect(box.dataset.axtReady).toBe('no')
    fromFrame(m.q<HTMLIFrameElement>('.axt-fb-panel-box iframe'), { type: 'axt:panel-size', height: 300 })
    // The main button's centre is at 569 of 768: 569 − 150
    expect([box.dataset.axtReady, box.style.height, box.style.top]).toEqual(['yes', '300px', '419px'])
    // Taller than the window allows: 16 px kept clear at both ends
    fromFrame(m.q<HTMLIFrameElement>('.axt-fb-panel-box iframe'), { type: 'axt:panel-size', height: 2000 })
    expect([box.style.height, box.style.top]).toEqual(['736px', '16px'])
  })

  it('believes only its own frame: the same message from the page\'s window changes nothing', () => {
    const m = mount()
    placeBoxes(m)
    m.q('.axt-fb-panel').dispatchEvent(click())
    fromFrame(window, { type: 'axt:panel-size', height: 300 })
    expect(m.q('.axt-fb-panel-box').dataset.axtReady).toBe('no')
    fromFrame(window, { type: 'axt:panel-close' })
    expect(m.q('.axt-fb-panel-box').hidden).toBe(false)
  })

  it('closes when the popup asks, on Escape, on a press elsewhere, and when the close menu opens; a press inside keeps it', () => {
    const m = mount()
    const open = () => { m.q('.axt-fb-panel').dispatchEvent(click()); return m.q<HTMLIFrameElement>('.axt-fb-panel-box iframe') }
    fromFrame(open(), { type: 'axt:panel-close' })
    expect(m.q('.axt-fb-panel-box').hidden).toBe(true)

    open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(m.q('.axt-fb-panel-box').hidden).toBe(true)

    open()
    m.q('.axt-fb-panel-box').dispatchEvent(pointer('pointerdown', 900, 500))
    expect(m.q('.axt-fb-panel-box').hidden).toBe(false)
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    expect(m.q('.axt-fb-panel-box').hidden).toBe(true)

    open()
    m.q('.axt-fb-options').dispatchEvent(click())
    expect([m.q('.axt-fb-panel-box').hidden, m.q('.axt-fb-menu').hidden]).toEqual([true, false])
  })

  it('opens on the host\'s word too, for a click on the main button that nothing could serve', () => {
    const { entry, q } = mount({ main: { kind: 'toggle', run: () => undefined } })
    entry.openPanel()
    expect(q('.axt-fb-panel-box iframe')).not.toBeNull()
    entry.remove()
  })
})

describe('the floating button: the close menu', () => {
  it('opens from the close control, keeps the dock open, and closes on Escape or a press elsewhere', () => {
    vi.useFakeTimers()
    const { q, dock, main } = mount()
    main.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(400)
    q('.axt-fb-options').dispatchEvent(click())
    expect([q('.axt-fb-menu').hidden, q('.axt-fb-options').getAttribute('aria-expanded')]).toEqual([false, 'true'])
    // The pointer may wander off towards the menu; the dock stays open while it is up (Read Frog)
    dock.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(1000)
    expect(dock.dataset.axtExpanded).toBe('yes')
    q('.axt-fb-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect([q('.axt-fb-menu').hidden, q('.axt-fb-options').getAttribute('aria-expanded')]).toEqual([true, 'false'])

    q('.axt-fb-options').dispatchEvent(click())
    expect(q('.axt-fb-menu').hidden).toBe(false)
    document.body.dispatchEvent(pointer('pointerdown', 10, 10))
    expect(q('.axt-fb-menu').hidden).toBe(true)
  })

  it('opened from the keyboard, the first item takes focus and the arrows move through them', () => {
    const { q, root } = mount()
    q('.axt-fb-options').dispatchEvent(click(0))
    expect(root.activeElement).toBe(q('.axt-fb-hide-now'))
    q('.axt-fb-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement).toBe(q('.axt-fb-hide-always'))
    q('.axt-fb-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement).toBe(q('.axt-fb-hide-now'))
  })

  it('"hide for now" and "don\'t show again" take the entry off the page and tell the host which', () => {
    const now = mount()
    now.q('.axt-fb-options').dispatchEvent(click())
    now.q('.axt-fb-hide-now').dispatchEvent(click())
    expect([now.host.isConnected, now.onHide.mock.calls]).toEqual([false, [['now']]])

    const always = mount()
    always.q('.axt-fb-options').dispatchEvent(click())
    always.q('.axt-fb-hide-always').dispatchEvent(click())
    expect([always.host.isConnected, always.onHide.mock.calls]).toEqual([false, [['always']]])
    expect(document.querySelectorAll('.axt-floating')).toHaveLength(0)
  })

  it('removed, it stops listening to the document', () => {
    const { entry, host } = mount()
    const off = vi.spyOn(document, 'removeEventListener')
    entry.remove()
    expect(host.isConnected).toBe(false)
    expect(off.mock.calls.map(([type]) => type).sort()).toEqual(['fullscreenchange', 'keydown', 'pointerdown'])
  })
})
