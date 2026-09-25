import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplaySwitch } from '@/pdf-reader/ui/DisplaySwitch'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const mount = (value: 'original' | 'bilingual' | 'translation', translatable = true) => {
  const onChange = vi.fn()
  return mountElement(createElement(DisplaySwitch, { value, translatable, onChange })).then(m => ({ ...m, onChange }))
}
const key = (target: EventTarget, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })

describe('the display switch (the reader\'s design, §6.2)', () => {
  it('is a radio group named 显示, its three choices named by their words, the chosen one checked', async () => {
    const { container } = await mount('bilingual')
    expect(container.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('显示')
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map(r => [r.getAttribute('aria-label'), r.getAttribute('aria-checked')])).toEqual([['原文', 'false'], ['对照', 'true'], ['译文', 'false']])
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves the choice with the arrows, wrapping', async () => {
    const { container, onChange } = await mount('translation')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('original')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('bilingual')
  })

  it('takes 1, 2 and 3 anywhere on the page, but not where text goes', async () => {
    const { onChange } = await mount('original')
    await key(document.body, '3')
    expect(onChange).toHaveBeenLastCalledWith('translation')
    const input = document.body.appendChild(document.createElement('input'))
    await key(input, '2')
    expect(onChange).toHaveBeenCalledTimes(1)
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true })) })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('leaves a digit to a menu or a dialog that has the focus, and to whatever took the key first (the final review)', async () => {
    // the zoom menu's letter jump: 1 goes to 100 %, and must not switch to the original, nor write it
    const { onChange } = await mount('bilingual')
    for (const role of ['menu', 'listbox', 'dialog']) {
      const box = document.body.appendChild(document.createElement('div'))
      box.setAttribute('role', role)
      await key(box.appendChild(document.createElement('div')), '1')
    }
    const taker = document.body.appendChild(document.createElement('div'))
    taker.addEventListener('keydown', e => e.preventDefault())
    await act(async () => { taker.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true })) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('greys the translated displays when there is no translation to be had, and skips them', async () => {
    const { container, onChange } = await mount('original', false)
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map(r => r.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true'])
    ;(radios[1] as HTMLElement).click()
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    await key(document.body, '2')
    expect(onChange).not.toHaveBeenCalled()
  })
})
