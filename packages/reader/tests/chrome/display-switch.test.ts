import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplaySwitch } from '../../src/chrome/DisplaySwitch.tsx'
import { setLocale } from '@readarxiv/ui'
import { mountElement } from '../render-hook.ts'
import { stubPopovers } from '../popover-stub.ts'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => {
  restore = stubPopovers()
})
afterEach(() => {
  restore()
  document.body.innerHTML = ''
})

const mount = (
  value: 'original' | 'bilingual' | 'translation',
  translatable = true,
  off?: readonly ('original' | 'bilingual' | 'translation')[],
) => {
  const onChange = vi.fn()
  return mountElement(createElement(DisplaySwitch, { value, translatable, off, onChange })).then((m) => ({
    ...m,
    onChange,
  }))
}
const key = (target: EventTarget, k: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

describe("the display switch (the reader's design, §6.2)", () => {
  it('is a radio group named 显示, its three choices named by their words, the chosen one checked', async () => {
    const { container } = await mount('bilingual')
    expect(container.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('显示')
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map((r) => [r.getAttribute('aria-label'), r.getAttribute('aria-checked')])).toEqual([
      ['原文', 'false'],
      ['对照', 'true'],
      ['译文', 'false'],
    ])
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves the choice with the arrows, wrapping', async () => {
    const { container, onChange } = await mount('translation')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('original')
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('bilingual')
  })

  it('takes no single key on the page: a digit typed anywhere changes nothing, nor do its tooltips offer one (WCAG 2.1.4; the maintainer, 2026-09-26)', async () => {
    const { container, onChange } = await mount('original')
    for (const k of ['1', '2', '3']) await key(document.body, k)
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.tip kbd').length).toBe(0)
  })

  it('greys the translated displays when there is no translation to be had, and skips them', async () => {
    const { container, onChange } = await mount('original', false)
    const radios = [...container.querySelectorAll('[role="radio"]')]
    expect(radios.map((r) => r.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true'])
    ;(radios[1] as HTMLElement).click()
    await key(container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    await key(document.body, '2')
    expect(onChange).not.toHaveBeenCalled()
  })

  it("greys a display the host says this window cannot show (`off`, a phone's side by side): still a focusable radio, passed by the arrows, a press doing nothing", async () => {
    const { container, onChange } = await mount('translation', true, ['bilingual'])
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    expect(radios.map((r) => [r.getAttribute('aria-disabled'), r.disabled])).toEqual([
      [null, false],
      ['true', false],
      [null, false],
    ])
    radios[1]!.focus()
    expect(document.activeElement).toBe(radios[1])
    radios[1]!.click()
    expect(onChange).not.toHaveBeenCalled()
    const group = container.querySelector('[role="radiogroup"]')!
    await key(group, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('original')
    // from the original, the next that can be had is the translation: side by side is passed over
    document.body.innerHTML = ''
    const again = await mount('original', true, ['bilingual'])
    await key(again.container.querySelector('[role="radiogroup"]')!, 'ArrowRight')
    expect(again.onChange).toHaveBeenLastCalledWith('translation')
  })

  it('greys nothing more when `off` is empty or absent, and adds to what no translation greys', async () => {
    for (const off of [undefined, []]) {
      const { container } = await mount('bilingual', true, off)
      expect([...container.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-disabled'))).toEqual([
        null,
        null,
        null,
      ])
      document.body.innerHTML = ''
    }
    const { container } = await mount('original', false, ['original'])
    expect([...container.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
      'true',
    ])
  })
})
