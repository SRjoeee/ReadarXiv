// The sheet (preview/sheet.ts; link previews' §3.9, the Modern Web Guidance audit): on a device with no hover, or a pane narrower
// than the card with its margins, a tap on a link with a target opens its preview as a native modal dialog from the bottom
// (showModal: the focus held in it, the page inert; closedby="any" where the browser has it, the guide's pointer-position
// fallback elsewhere), the same content, one row of buttons: the search (S-R-31: filled, only where SEARCH_URL is set) then the
// go-to button (S-R-30: quiet, always last) for a citation, the go-to button alone for a float, a display, a section or a note;
// named by its target's label; the go-to button jumps and closes it; a link with no target jumps on a tap as today. Reduced motion: the sheet fades, nothing moves.
import type { Target } from '@readarxiv/format'
import { R, setLocale } from '@readarxiv/ui'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPreviews } from '../../src/preview/previews.ts'
import { createSheet } from '../../src/preview/sheet.ts'
import { previewWords } from '../../src/preview/words.ts'
import type { Clock } from '../../src/stack/clock.ts'
import { READER_CSS } from '../../src/styles.ts'

beforeAll(() => setLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const clock: Clock = {
  now: () => 0,
  later: (f) => {
    f()
    return 0
  },
  clear: () => {},
  frame: (f) => {
    f()
    return 0
  },
  cancel: () => {},
}
const CITE: Target = ['"cite.a"', 'reference', 1, 2, [72, 100, 300, 120]]
const FIG: Target = ['"figure.1"', 'float', 1, 3, [72, 400, 540, 700]]

function setUp() {
  const root = document.createElement('div')
  const pane = document.createElement('div')
  const page = document.createElement('div')
  page.dataset.pageNumber = '1'
  pane.append(page)
  root.append(pane)
  document.body.append(root)
  const link = (dest: string) => {
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.setAttribute('href', `#${encodeURIComponent(dest)}`)
    page.append(a)
    return a
  }
  const jumps: unknown[] = []
  const targets = new Map([CITE, FIG].map((t) => [t[0], t] as const))
  const content = async ({ target }: { target: Target }) => {
    const el = document.createElement('div')
    el.textContent = target[0]
    return {
      el,
      kind: target[1] === 'reference' ? ('card' as const) : ('crop' as const),
      label: target[1] === 'reference' ? R.preview.reference('2') : R.preview.figure('1'),
      described: el,
    }
  }
  const jump = (j: unknown) => jumps.push(j)
  const sheet = createSheet({ root, words: previewWords, content, jump, open: () => {}, search: () => null })
  createPreviews({
    root,
    panes: { containerOf: () => pane, pageElement: () => page, boxOf: () => null, on: () => () => {} },
    targets: () => targets,
    bracket: async () => ({ key: null, boxes: [], foot: null }),
    content,
    clock,
    words: previewWords,
    jump,
    open: () => {},
    narrow: () => true,
    sheet,
  })
  return { root, cite: link('"cite.a"'), fig: link('"figure.1"'), thm: link('"theorem.1"'), jumps }
}
const tap = (a: Element) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true })
  a.dispatchEvent(e)
  return e
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('the sheet', () => {
  it('a tap opens the sheet and does not jump: a modal dialog named by its target’s label', async () => {
    const t = setUp()
    const e = tap(t.fig)
    expect(e.defaultPrevented).toBe(true)
    await settle()
    const d = t.root.querySelector('dialog.axt-sheet') as HTMLDialogElement
    expect(d).not.toBeNull()
    expect(d.open).toBe(true)
    expect(d.getAttribute('closedby')).toBe('any')
    expect(d.getAttribute('aria-label')).toBe(R.preview.figure('1'))
    expect(t.jumps).toEqual([])
  })
  it('a float’s sheet has the go-to button alone; it jumps and closes it', async () => {
    const t = setUp()
    tap(t.fig)
    await settle()
    const d = t.root.querySelector('dialog.axt-sheet') as HTMLDialogElement
    const buttons = [...d.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual([R.preview.go])
    buttons[0]!.click()
    expect(t.jumps).toHaveLength(1)
    expect(t.jumps[0]).toMatchObject({ side: 'left', dest: '"figure.1"' })
    expect(d.open).toBe(false)
  })
  it('no search button while SEARCH_URL is null: a citation’s sheet has the go-to button alone too', async () => {
    const t = setUp()
    tap(t.cite)
    await settle()
    const d = t.root.querySelector('dialog.axt-sheet') as HTMLDialogElement
    expect([...d.querySelectorAll('button')].map((b) => b.textContent)).toEqual([R.preview.go])
  })
  it('the focus a closed sheet gives back to its link opens no preview over the page (a narrow screen shows none)', async () => {
    const t = setUp()
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
    vi.spyOn(t.root.firstElementChild as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(0, 44, 390, 800))
    vi.spyOn(t.fig, 'getBoundingClientRect').mockReturnValue(rect(100, 200, 10, 12))
    t.fig.tabIndex = 0
    t.fig.focus()
    await settle()
    expect(t.root.querySelector('.axt-pv')).toBeNull()
  })
  it('a zoom gesture over the sheet never zooms the page: a Ctrl-wheel and WebKit’s gesture taken from it, a plain wheel left', async () => {
    const t = setUp()
    tap(t.fig)
    await settle()
    const d = t.root.querySelector('dialog.axt-sheet') as HTMLDialogElement
    const wheel = (ctrlKey: boolean) => {
      const e = new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true })
      // (happy-dom's WheelEvent is a UIEvent: no modifier keys of its own)
      Object.defineProperty(e, 'ctrlKey', { value: ctrlKey })
      d.firstElementChild!.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(wheel(true)).toBe(true)
    expect(wheel(false)).toBe(false)
    const g = new Event('gesturestart', { bubbles: true, cancelable: true })
    d.dispatchEvent(g)
    expect(g.defaultPrevented).toBe(true)
    // (a touch's pinch: the sheet pans, never zooms)
    expect(READER_CSS).toMatch(/\.axt-reader \.axt-sheet \{[^}]*touch-action: pan-x pan-y;/)
  })
  it('a link with no target jumps on a tap as today (its click not taken)', () => {
    const t = setUp()
    expect(tap(t.thm).defaultPrevented).toBe(false)
    expect(t.root.querySelector('dialog.axt-sheet')).toBeNull()
  })
  it('reduced motion: no translate in any keyframe', () => {
    // (each reduced-motion block's own text, its braces balanced)
    const blocks: string[] = []
    for (let at = READER_CSS.indexOf('@media (prefers-reduced-motion: reduce)'); at >= 0; ) {
      let i = READER_CSS.indexOf('{', at) + 1,
        depth = 1
      const start = i
      for (; depth > 0 && i < READER_CSS.length; i++)
        depth += READER_CSS[i] === '{' ? 1 : READER_CSS[i] === '}' ? -1 : 0
      blocks.push(READER_CSS.slice(start, i - 1))
      at = READER_CSS.indexOf('@media (prefers-reduced-motion: reduce)', i)
    }
    const reduced = blocks.join('\n')
    const keyframes = [...reduced.matchAll(/@keyframes [\w-]+ \{[^}]*\}/g)].map((m) => m[0])
    expect(keyframes.length).toBeGreaterThan(0)
    for (const k of keyframes) expect(k).not.toMatch(/translate|scale/)
    // (every keyframe that moves is given a still form there)
    for (const name of ['axt-pv-in', 'axt-sheet-in', 'axt-sheet-out'])
      expect(keyframes.some((k) => k.startsWith(`@keyframes ${name} `))).toBe(true)
  })
})

describe('each name as listed, in zh-CN and en (S-R-30 to S-R-33)', () => {
  it('zh-CN', () => {
    setLocale('zh-CN')
    const w = previewWords()
    expect([w.go, w.keep('图 1'), w.close('图 1')]).toEqual(['前往', '图 1：留在屏幕上', '关闭图 1'])
  })
  it('en', () => {
    setLocale('en')
    const w = previewWords()
    expect([w.go, w.keep('Figure 1'), w.close('Figure 1')]).toEqual([
      'Go to',
      'Figure 1: keep on screen',
      'Close Figure 1',
    ])
    setLocale('zh-CN')
  })
})
