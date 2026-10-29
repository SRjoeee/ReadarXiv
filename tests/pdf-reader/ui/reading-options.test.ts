import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { ReadingOptions } from '@/pdf-reader/ui/ReadingOptions'
import { R, S, setLocale } from '@/ui/strings'
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
    // what to translate in the place figure text had (S-R-27): the owner's rows in the owner's order, figures, tables and heads on
    expect(switches).toEqual([['对照高亮', 'true'], ['图中文字', 'true'], ['表中文字', 'true'], ['页眉页脚', 'true'], ['参考文献', 'false'], ['作者姓名', 'false'], ['深色时调暗页面', 'true']])
    expect(container.querySelectorAll('[data-swatch]').length).toBe(DEFAULT_CONFIG.appearance.highlights.length)
    // the appearance: the system's first, as icons named by their words, as the display switch is (the maintainer, 2026-09-26)
    expect([...container.querySelectorAll('[role="radio"]')].map(r => [r.getAttribute('aria-label'), r.getAttribute('aria-checked'), !!r.querySelector('svg'), r.textContent])).toEqual([['跟随系统', 'true', true, ''], ['浅色', 'false', true, ''], ['深色', 'false', true, '']])
  })

  it('moves the appearance with the arrows, the focus going with it, as a radio group does (the final review)', async () => {
    const { container, written } = await open()
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]')!
    const arrow = (key: string) => act(async () => { group.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
    // the defaults follow the system, the first choice: the right arrow goes to light; the left one wraps to dark
    await arrow('ArrowRight')
    expect([written().theme, document.activeElement?.getAttribute('aria-label')]).toEqual(['light', '浅色'])
    await arrow('ArrowLeft')
    expect(written().theme).toBe('dark')
  })

  it('holds the language and service menus as its first rows, for a window under 900 px (§5)', async () => {
    const { container } = await open()
    const rows = [...container.querySelectorAll('[popover="auto"] > .narrow-only.row')]
    const nameOf = (b: Element | null) => b?.getAttribute('aria-labelledby')?.split(' ').map(id => document.getElementById(id)?.textContent).join(' ')
    expect(rows.map(r => nameOf(r.querySelector('button')))).toEqual(['简体中文 目标语言', 'Microsoft 翻译 翻译服务'])
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
    container.querySelector<HTMLElement>(`[role="switch"][aria-label="${R.classes.names}"]`)!.click()
    // one toggle of what to translate, the others and the HTML page's figure text as they were
    expect(written().pdfReader.classes).toEqual({ ...DEFAULT_CONFIG.pdfReader.classes, names: true })
    expect(written().image).toEqual(DEFAULT_CONFIG.image)
    const swatches = [...container.querySelectorAll<HTMLElement>('[data-swatch]')]
    swatches[1]!.click()
    expect(written().appearance.activeHighlight).toBe(DEFAULT_CONFIG.appearance.highlights[1]!.id)
    ;[...container.querySelectorAll<HTMLElement>('[role="radio"]')][2]!.click()
    expect(written().theme).toBe('dark')
    container.querySelector<HTMLElement>('[role="switch"][aria-label="深色时调暗页面"]')!.click()
    expect(written().pdfReader.dimPages).toBe(false)
  })

  describe('out of reach while the settings are not read (P3-M14, P3-M16, C3-2; S-R-21)', () => {
    async function mountWith(over: Parameters<typeof fakeController>[0]) {
      const fake = fakeController(over)
      const mounted = await mountElement(createElement(ReadingOptions, { controller: fake.controller }))
      await act(async () => { mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover() })
      return { ...mounted, ...fake }
    }
    const controls = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[role="switch"], [data-swatch], [role="radio"]')]

    it('settings that cannot be read: every control that writes them is greyed and writes nothing; its tooltip tells why, and the button that opens them is where it was', async () => {
      const { container, controller } = await mountWith({ settingsUnreadable: true })
      expect(container.querySelector('button[popovertarget]')).not.toBeNull()
      const found = controls(container)
      // seven switches, the swatches, three appearances: each greyed, and none a button the browser disables (it would take its tooltip away)
      expect(found.length).toBe(7 + DEFAULT_CONFIG.appearance.highlights.length + 3)
      for (const el of found) expect([el.getAttribute('aria-disabled'), el.hasAttribute('disabled')], el.getAttribute('aria-label') ?? '').toEqual(['true', false])
      for (const el of found) el.click()
      container.querySelector<HTMLElement>('label.row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(controller.patchSettings).not.toHaveBeenCalled()
      // the tip beside each, hidden from assistive technology as every tip is, holds the control\'s name and the reason
      for (const el of found) expect(el.nextElementSibling?.textContent, el.getAttribute('aria-label') ?? '').toContain(R.status.unreadableHint)
      // …and the reason is each one's description, for assistive technology, to which the tip is hidden
      for (const el of found) expect(el.getAttribute('aria-description'), el.getAttribute('aria-label') ?? '').toBe(R.status.unreadableHint)
    })

    it('before the settings land the same controls stand in their places, greyed, and tell no reason; once they land they write', async () => {
      const { container, controller, set } = await mountWith({ settings: null })
      const found = controls(container)
      expect(found.length).toBe(7 + DEFAULT_CONFIG.appearance.highlights.length + 3)
      for (const el of found) expect([el.getAttribute('aria-disabled'), el.nextElementSibling?.textContent?.includes(R.status.unreadableHint) ?? false]).toEqual(['true', false])
      await act(async () => set({ settings: DEFAULT_CONFIG }))
      for (const el of controls(container)) expect(el.hasAttribute('aria-disabled'), el.getAttribute('aria-label') ?? '').toBe(false)
      container.querySelector<HTMLElement>(`[role="switch"][aria-label="${S.rows.highlight}"]`)!.click()
      expect(controller.patchSettings).toHaveBeenCalledOnce()
    })
  })

  it('a switch\'s row is its target, words and all, as the popup\'s are: a press on the words turns it (#299, Part 6\'s interface review)', async () => {
    const { container, controller, written } = await open()
    for (const [words, read] of [[S.rows.highlight, (c: Config) => c.reading.sentenceHighlight], [R.classes.figures, (c: Config) => c.pdfReader.classes.figures], [R.classes.heads, (c: Config) => c.pdfReader.classes.heads], [R.options.dim, (c: Config) => c.pdfReader.dimPages]] as const) {
      const row = [...container.querySelectorAll<HTMLElement>('.row')].find(r => r.textContent === words && r.querySelector('[role="switch"]'))!
      expect(row.tagName).toBe('LABEL')
      const before = controller.patchSettings.mock.calls.length
      // the row, its words: not the switch inside it
      await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(controller.patchSettings.mock.calls.length).toBe(before + 1)
      expect(read(written())).toBe(false)
    }
  })

  it('names its group of what to translate by the heading row above it, in the second ink, as the website\'s reading options do (S-R-27)', async () => {
    const { container } = await open()
    const group = container.querySelector<HTMLElement>('[data-axt-classes]')!
    expect(group.getAttribute('role')).toBe('group')
    const head = document.getElementById(group.getAttribute('aria-labelledby')!)!
    expect([head.textContent, head.classList.contains('row'), head.classList.contains('text-ink-2'), group.firstElementChild === head]).toEqual([R.classes.name, true, true, true])
    expect([...group.querySelectorAll('[data-axt-class]')].map(r => r.getAttribute('data-axt-class'))).toEqual(['figures', 'tables', 'heads', 'references', 'names'])
  })
})
