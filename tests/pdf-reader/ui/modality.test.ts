import { afterEach, describe, expect, it } from 'vitest'
import { trackModality } from '@/pdf-reader/ui/modality'

let stop = () => {}
afterEach(() => { stop(); document.documentElement.removeAttribute('data-axt-pointer') })

const pointer = () => document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
const marked = () => document.documentElement.hasAttribute('data-axt-pointer')

describe('how the reader is being worked, for its focus rings (better-accessibility; the maintainer, 2026-09-26)', () => {
  it('marks the pointer\'s turn on a press, and the keyboard\'s on a key that moves or acts', () => {
    stop = trackModality(document)
    pointer()
    expect(marked()).toBe(true)
    for (const k of ['Tab', 'ArrowDown', 'Enter', 'Escape']) {
      pointer()
      key(k)
      expect([k, marked()]).toEqual([k, false])
    }
  })

  it('leaves typing to the pointer\'s turn: a search typed into after a click keeps its ring off', () => {
    stop = trackModality(document)
    pointer()
    for (const k of ['f', 'r', 'a', 'Backspace', ' ']) key(k)
    expect(marked()).toBe(true)
  })

  it('lets go of the page when stopped', () => {
    trackModality(document)()
    pointer()
    expect(marked()).toBe(false)
  })
})
