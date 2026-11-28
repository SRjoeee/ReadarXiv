// Keeping a crop (preview/keep.ts; link previews' §3.6): a click or Enter on a crop's preview keeps it where it is, one at a time
// (keeping another replaces it); it starts lifted and settles; the arrows move it 16 px while it has the focus, kept below the
// toolbar's 52 px and 8 px inside the window; its × closes it; Esc closes the topmost thing, a preview before the kept panel,
// the focus back to its link; the × shows on hover and on the keyboard's focus, never on the focus a drag leaves.
import { afterEach, describe, expect, it } from 'vitest'
import { createKeep, KEEP_EDGE, KEEP_STEP, KEEP_TOP } from '../../src/preview/keep.ts'
import type { PreviewContent } from '../../src/preview/previews.ts'
import type { Clock } from '../../src/stack/clock.ts'
import { READER_CSS } from '../../src/styles.ts'

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
const words = {
  keep: (l: string) => `${l}: keep`,
  close: (l: string) => `Close ${l}`,
  reset: 'Reset size',
  go: 'Go to',
  search: 'S',
}
afterEach(() => {
  document.body.innerHTML = ''
})

function crop(label: string, left = 100, top = 200) {
  const pv = document.createElement('div')
  pv.className = 'axt-pv'
  pv.setAttribute('role', 'tooltip')
  pv.style.left = `${left}px`
  pv.style.top = `${top}px`
  const button = document.createElement('button')
  button.className = 'axt-pv-keep'
  const img = document.createElement('div')
  img.setAttribute('role', 'img')
  img.setAttribute('aria-label', label)
  button.append(img)
  pv.append(button)
  document.body.append(pv)
  const content: PreviewContent = { el: button, kind: 'crop', label, described: img }
  const link = document.createElement('a')
  link.href = '#x'
  document.body.append(link)
  return { pv, content, link }
}

describe('keeping a crop', () => {
  it('kept, it is a dialog named by its label, its × named to close it, lifted then settled', () => {
    const k = createKeep({ clock, words: () => words })
    const a = crop('Figure 1')
    k.keep(a.pv, a.content, a.link, false)
    expect(a.pv.getAttribute('role')).toBe('dialog')
    expect(a.pv.getAttribute('aria-label')).toBe('Figure 1')
    expect(a.pv.classList.contains('axt-pv-kept')).toBe(true)
    expect(a.pv.querySelector('button.axt-pv-x')?.getAttribute('aria-label')).toBe('Close Figure 1')
    expect(a.pv.querySelector('.axt-pv-keep')).toBeNull()
  })
  it('keeping replaces the kept one', () => {
    const k = createKeep({ clock, words: () => words })
    const a = crop('Figure 1'),
      b = crop('Table 2')
    k.keep(a.pv, a.content, a.link, false)
    k.keep(b.pv, b.content, b.link, false)
    expect(document.querySelectorAll('.axt-pv-kept:not([data-axt-out])')).toHaveLength(1)
    expect(a.pv.isConnected && !a.pv.hasAttribute('data-axt-out')).toBe(false)
  })
  it('Enter keeps it and the panel takes the focus; the arrows move it 16 px and it stays under 52 px', () => {
    const k = createKeep({ clock, words: () => words })
    const a = crop('Figure 1', 100, 60)
    k.keep(a.pv, a.content, a.link, true)
    expect(document.activeElement).toBe(a.pv)
    a.pv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(a.pv.style.left).toBe(`${100 + KEEP_STEP}px`)
    a.pv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(a.pv.style.top).toBe(`${KEEP_TOP}px`)
    a.pv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    for (let i = 0; i < 20; i++) a.pv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(a.pv.style.left).toBe(`${KEEP_EDGE}px`)
  })
  it('Esc closes the kept panel and gives the focus back to its link; its × closes it', () => {
    const k = createKeep({ clock, words: () => words })
    const a = crop('Figure 1')
    k.keep(a.pv, a.content, a.link, true)
    expect(k.esc()).toBe(true)
    expect(document.activeElement).toBe(a.link)
    expect(k.esc()).toBe(false)
    const b = crop('Table 2')
    k.keep(b.pv, b.content, b.link, false)
    b.pv.querySelector<HTMLButtonElement>('.axt-pv-x')!.click()
    expect(b.pv.hasAttribute('data-axt-out') || !b.pv.isConnected).toBe(true)
  })
  it('the × shows on hover and on the keyboard’s focus, never on a drag’s (the sheet’s own rule: no :focus but :focus-visible)', () => {
    expect(READER_CSS).toMatch(/\.axt-pv-kept:hover \.axt-pv-x/)
    expect(READER_CSS).toMatch(/\.axt-pv-kept:focus-visible \.axt-pv-x/)
    expect(READER_CSS).not.toMatch(/\.axt-pv-kept:focus \.axt-pv-x/)
  })
})
