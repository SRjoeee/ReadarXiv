// The chrome's menus (the reader's design, §6.1, §6.7): the zoom and the target language. The translation service and the
// download are a host's slots: the extension's are its tests' (tests/pdf-reader/host-slots.test.ts)
import { act, createElement, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { S, setLocale } from '@readarxiv/ui'
import { LanguageMenu, ZoomMenu } from '../../src/chrome/Menus.tsx'
import { fileName, type ReaderController } from '../../src/chrome/model.ts'
import { stubPopovers } from '../popover-stub.ts'
import { mountElement } from '../render-hook.ts'
import { fakeController, PREFS } from './fake-controller.ts'
import { LANGUAGES, NAMES, withParts } from './parts.ts'

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

async function openMenu(component: (props: { controller: ReaderController }) => ReactNode, over = {}) {
  const fake = fakeController(over)
  const mounted = await mountElement(withParts(createElement(component, { controller: fake.controller })))
  await act(async () => {
    mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover()
  })
  return { ...mounted, ...fake }
}

describe("the reader's menus (the reader's design, §6.1, §6.7)", () => {
  it('zoom: the fits, then the scales, the current one checked; a pick zooms', async () => {
    const { container, controller } = await openMenu(ZoomMenu, { scale: 1.5, zoom: 1.5 })
    const items = [...container.querySelectorAll('[role="menuitemradio"]')]
    expect(items.map((i) => i.textContent)).toEqual([
      '适合宽度',
      '适合页面',
      '实际大小',
      '50%',
      '75%',
      '100%',
      '125%',
      '150%',
      '200%',
    ])
    expect(items.filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent)).toEqual(['150%'])
    ;(items[0] as HTMLElement).click()
    expect(controller.zoomTo).toHaveBeenCalledWith('page-width')
  })

  it("language: the host's rows, the search narrowing them by their keywords; a pick writes the target's tag as a patch", async () => {
    const { container, controller } = await openMenu(LanguageMenu)
    expect([...container.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(Object.values(NAMES))
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      search.value = 'deu'
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map((o) => o.textContent)).toEqual(['Deutsch'])
    ;(options[0] as HTMLElement).click()
    expect(controller.setPrefs.mock.calls).toEqual([[{ target: 'de' }]])
  })

  it("language: the button names the target by the host's own name for it in either interface language, as the menu's rows do (the maintainer, 2026-10-04)", async () => {
    try {
      for (const locale of ['zh-CN', 'en'] as const) {
        setLocale(locale)
        const { container } = await openMenu(LanguageMenu, { prefs: { ...PREFS, target: 'ja' } })
        const button = container.querySelector<HTMLElement>('.menu-btn [data-value]')!
        const row = [...container.querySelectorAll('[role="option"]')].find(
          (o) => o.getAttribute('aria-selected') === 'true',
        )
        expect([locale, button.textContent]).toEqual([locale, NAMES.ja])
        expect(row?.textContent).toBe(button.textContent)
        document.body.innerHTML = ''
      }
    } finally {
      setLocale('zh-CN')
    }
  })

  it("language: a target the host's table lacks shows as the host names it (the extension's: the code itself), never nothing", async () => {
    const { container } = await openMenu(LanguageMenu, { prefs: { ...PREFS, target: 'zzz' } })
    expect(container.querySelector('.menu-btn [data-value]')?.textContent).toBe('zzz')
  })

  it("language: the button's value and each row carry the language they are written in, and the button's name starts with the own name (WCAG 3.1.2, 2.5.3)", async () => {
    const { container } = await openMenu(LanguageMenu, { prefs: { ...PREFS, target: 'ja' } })
    const button = container.querySelector<HTMLElement>('.menu-btn')!
    expect(button.querySelector('[data-value]')?.getAttribute('lang')).toBe(LANGUAGES.tag('ja'))
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map((o) => o.querySelector('[lang]')?.getAttribute('lang'))).toEqual(
      Object.keys(NAMES).map(LANGUAGES.tag),
    )
    // the name aria-labelledby builds: the value, then the label that is hidden
    const name = button
      .getAttribute('aria-labelledby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ')
    expect(name).toBe(`${NAMES.ja} ${S.rows.language}`)
  })

  it('language: before the preferences land the defaults stand in the button, greyed (S-R-21)', async () => {
    const fake = fakeController({ prefs: null })
    const { container } = await mountElement(
      withParts(createElement(LanguageMenu, { controller: fake.controller }), {
        defaults: { ...PREFS, target: 'fr' },
      }),
    )
    const button = container.querySelector<HTMLElement>('.menu-btn')!
    expect([button.querySelector('[data-value]')?.textContent, button.getAttribute('aria-disabled')]).toEqual([
      NAMES.fr,
      'true',
    ])
  })

  it('language: the arrows move one language at a time from the search field, and Enter picks once (the final review)', async () => {
    const { container, controller } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!
    const active = () => document.getElementById(search.getAttribute('aria-activedescendant') ?? '')?.textContent
    const names = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    const first = active()
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(active()).toBe(names[(names.indexOf(first ?? '') + 1) % names.length])
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(controller.setPrefs).toHaveBeenCalledTimes(1)
  })

  it('language: the search field is a combobox naming the list and its active option, and the list holds options alone (the final review)', async () => {
    const { container } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!,
      list = container.querySelector<HTMLElement>('[role="listbox"]')!
    expect([search.getAttribute('role'), search.getAttribute('aria-controls'), list.contains(search)]).toEqual([
      'combobox',
      list.id,
      false,
    ])
    expect(document.getElementById(search.getAttribute('aria-activedescendant') ?? '')?.getAttribute('role')).toBe(
      'option',
    )
    expect([...list.children].every((c) => c.getAttribute('role') === 'option')).toBe(true)
    // one list, not a listbox in a listbox: the popover itself takes no role
    expect(container.querySelectorAll('[role="listbox"], [role="menu"]').length).toBe(1)
  })

  it('zoom: one list, its separators not items of it (the final review)', async () => {
    const { container } = await openMenu(ZoomMenu)
    const lists = container.querySelectorAll('[role="listbox"], [role="menu"]')
    expect(lists.length).toBe(1)
    expect(
      [...lists[0]!.children].every((c) => ['option', 'menuitemradio', 'none'].includes(c.getAttribute('role') ?? '')),
    ).toBe(true)
  })

  it("names the files by the paper, an old-style id's slash made safe", () => {
    expect(fileName('2608.02163', 'original', 'zh')).toBe('2608.02163.pdf')
    expect(fileName('hep-th/9711200', 'translation', 'zh-Hant')).toBe('hep-th_9711200.zh-Hant.pdf')
  })
})
