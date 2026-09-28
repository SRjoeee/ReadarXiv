// The pages' buttons and shortcut labels (Part 3's interfaces; the redesign's design, §5.1, §6, §8)
import { Globe } from 'lucide'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/ui/controls/Button'
import { Kbd } from '@/ui/controls/Kbd'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })
const button = async (props: Parameters<typeof Button>[0]) => (await mountElement(createElement(Button, props))).container.querySelector('button')!

describe('Button', () => {
  it('is a plain button of its kind and size, neutral and md by default', async () => {
    const plain = await button({ children: 'Export' })
    expect([plain.className, plain.type]).toEqual(['btn neutral md', 'button'])
    expect((await button({ kind: 'brand', size: 'lg', className: 'wide', children: 'Translate' })).className).toBe('btn brand lg wide')
  })

  it('draws a Lucide icon before its words and the shortcut after them, hidden from a screen reader', async () => {
    const brand = await button({ kind: 'brand', icon: Globe, shortcut: '⌥T', children: 'Translate' })
    expect([...brand.children].map(c => c.tagName.toLowerCase())).toEqual(['svg', 'span', 'kbd'])
    expect([brand.querySelector('span')!.textContent, brand.querySelector('kbd')!.getAttribute('aria-hidden')]).toEqual(['Translate', 'true'])
  })

  it('draws no span for empty words: an icon alone is the icon alone', async () => {
    const b = await button({ icon: Globe, 'aria-label': 'Globe', children: '' })
    expect([...b.children].map(c => c.tagName.toLowerCase())).toEqual(['svg'])
  })

  it('shows a shortcut on the brand and on a neutral one (S-P-51: show original), never on a text or a raised one (ruling 7)', async () => {
    const kbd = async (kind: 'neutral' | 'text' | 'raised') => (await button({ kind, shortcut: '⌥T', children: 'Show original' })).querySelector('kbd')?.textContent ?? null
    expect([await kbd('neutral'), await kbd('text'), await kbd('raised')]).toEqual(['⌥T', null, null])
  })

  it('calls its onClick when enabled, and passes its other props through', async () => {
    const onClick = vi.fn()
    const b = await button({ onClick, 'aria-expanded': true, children: 'Service' })
    b.click()
    expect([onClick.mock.calls.length, b.getAttribute('aria-expanded')]).toEqual([1, 'true'])
  })

  it('disabled: stays in the tab order, marked aria-disabled, and does nothing, its shortcut gone', async () => {
    const onClick = vi.fn()
    const b = await button({ kind: 'brand', shortcut: '⌥T', disabled: true, onClick, children: 'Translate again' })
    b.click()
    expect([onClick.mock.calls.length, b.getAttribute('aria-disabled'), b.hasAttribute('disabled'), b.tabIndex, b.querySelector('kbd')]).toEqual([0, 'true', false, 0, null])
  })

  it('busy: a turning loader in the icon\'s place, or before the words without one; the words kept, no shortcut, and a click refused (ruling 2; Review Focus)', async () => {
    const onClick = vi.fn()
    const withIcon = await button({ kind: 'brand', icon: Globe, busy: true, shortcut: '⌥T', onClick, children: 'Connecting' })
    withIcon.click()
    expect([withIcon.getAttribute('aria-busy'), withIcon.hasAttribute('aria-disabled'), withIcon.children.length, withIcon.firstElementChild!.getAttribute('class'), withIcon.querySelector('span')!.textContent, withIcon.querySelector('kbd'), onClick.mock.calls.length])
      .toEqual(['true', false, 2, 'spin', 'Connecting', null, 0])
    const bare = await button({ kind: 'brand', busy: true, children: 'Connecting' })
    expect([[...bare.children].map(c => c.tagName.toLowerCase()), bare.firstElementChild!.getAttribute('class')]).toEqual([['svg', 'span'], 'spin'])
  })

  it('disabled, submits no form it sits in, though its type is submit (Review Focus)', async () => {
    const submitted = vi.fn((e: { preventDefault(): void }) => e.preventDefault())
    const form = (disabled: boolean) => createElement('form', { onSubmit: submitted }, createElement(Button, { type: 'submit', disabled }, 'Connect'))
    const on = await mountElement(form(false))
    on.container.querySelector('button')!.click()
    const off = await mountElement(form(true))
    off.container.querySelector('button')!.click()
    expect(submitted).toHaveBeenCalledTimes(1)
  })
})

describe('Kbd', () => {
  it('is a kbd, hidden from assistive technology: a visible hint beside a control named by its words', async () => {
    const kbd = (await mountElement(createElement(Kbd, null, '↵'))).container.querySelector('kbd')!
    expect([kbd.className, kbd.getAttribute('aria-hidden'), kbd.textContent]).toEqual(['kbd', 'true', '↵'])
  })
})
