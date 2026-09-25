import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { ReadingOptions } from '@/pdf-reader/ui/ReadingOptions'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

async function open(embedded = false) {
  const fake = fakeController()
  const mounted = await mountElement(createElement(ReadingOptions, { controller: fake.controller, embedded }))
  await act(async () => { mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover() })
  /** what the last write would make of the defaults */
  const written = () => (fake.controller.patchSettings.mock.calls.at(-1)![0] as (c: Config) => Config)(DEFAULT_CONFIG)
  return { ...mounted, ...fake, written }
}

describe('the reading options (the reader\'s design, §6.1)', () => {
  it('is a dialog of the reading switches, the swatches and the appearance, as the settings have them', async () => {
    const { container } = await open()
    expect(container.querySelector('[popover="auto"]')!.getAttribute('role')).toBe('dialog')
    const switches = [...container.querySelectorAll('[role="switch"]')].map(s => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])
    expect(switches).toEqual([['对照高亮', 'true'], ['图片翻译', 'true'], ['深色时调暗页面', 'true']])
    expect(container.querySelectorAll('[data-swatch]').length).toBe(DEFAULT_CONFIG.appearance.highlights.length)
    expect([...container.querySelectorAll('[role="radio"]')].map(r => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['浅色', 'false'], ['深色', 'false'], ['跟随系统', 'true']])
  })

  it('moves the appearance with the arrows, the focus going with it, as a radio group does (the final review)', async () => {
    const { container, written } = await open()
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]')!
    const arrow = (key: string) => act(async () => { group.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    // the defaults follow the system, the last choice: the right arrow wraps to the first, light; the left one goes to dark
    await arrow('ArrowRight')
    expect([written().pdfReader.appearance, document.activeElement?.textContent]).toEqual(['light', '浅色'])
    await arrow('ArrowLeft')
    expect(written().pdfReader.appearance).toBe('dark')
  })

  it('holds the language and service menus as its first rows, for a window under 900 px (§5)', async () => {
    const { container } = await open()
    const rows = [...container.querySelectorAll('[popover="auto"] > .narrow-only.row')]
    expect(rows.map(r => r.querySelector('button')?.getAttribute('aria-label'))).toEqual(['目标语言 简体中文', '翻译服务 Microsoft 翻译'])
  })

  it('holds the download, the settings and the way back before them, for a window under 500 px (§5; the maintainer, 2026-09-26)', async () => {
    const rows = async (embedded: boolean) => {
      const { container, unmount } = await open(embedded)
      const found = [...container.querySelectorAll('[popover="auto"] > .narrowest-only.row')].map(r => [r.firstChild?.textContent, r.querySelector('button, a')?.getAttribute('aria-label')])
      await unmount()
      return found
    }
    expect(await rows(false)).toEqual([['下载', '下载'], ['设置', '设置']])
    expect(await rows(true)).toEqual([['下载', '下载'], ['设置', '设置'], ['在默认查看器中打开', '在默认查看器中打开']])
  })

  it('writes each change at once', async () => {
    const { container, written } = await open()
    container.querySelector<HTMLElement>('[role="switch"][aria-label="对照高亮"]')!.click()
    expect(written().reading.sentenceHighlight).toBe(false)
    container.querySelector<HTMLElement>('[role="switch"][aria-label="图片翻译"]')!.click()
    expect(written().image.enabled).toBe(false)
    const swatches = [...container.querySelectorAll<HTMLElement>('[data-swatch]')]
    swatches[1]!.click()
    expect(written().appearance.activeHighlight).toBe(DEFAULT_CONFIG.appearance.highlights[1]!.id)
    ;[...container.querySelectorAll<HTMLElement>('[role="radio"]')][1]!.click()
    expect(written().pdfReader.appearance).toBe('dark')
    container.querySelector<HTMLElement>('[role="switch"][aria-label="深色时调暗页面"]')!.click()
    expect(written().pdfReader.dimPages).toBe(false)
  })
})
