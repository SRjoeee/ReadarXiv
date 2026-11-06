import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { O, R, S, setLocale } from '@readarxiv/ui'
import type { Slots } from '../../src/chrome/parts.tsx'
import { ReadingOptions } from '../../src/chrome/ReadingOptions.tsx'
import type { PrefsPatch } from '../../src/prefs.ts'
import { stubPopovers } from '../popover-stub.ts'
import { mountElement } from '../render-hook.ts'
import { fakeController, PREFS } from './fake-controller.ts'
import { withParts } from './parts.ts'

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

/** a host's slots, each telling where it is drawn: the extension's service before the reading options, its download, settings
 *  and way back after them (the extension's own rows: tests/pdf-reader/host-slots.test.ts) */
const SLOTS: Slots = {
  beforeOptions: (at) => createElement('div', { className: 'row narrow-only', 'data-slot': `before-${at}` }, 'before'),
  afterOptions: (at) => createElement('div', { className: 'row narrowest-only', 'data-slot': `after-${at}` }, 'after'),
}

async function open(slots: Slots = SLOTS) {
  const fake = fakeController()
  const mounted = await mountElement(
    withParts(createElement(ReadingOptions, { controller: fake.controller }), { slots }),
  )
  await act(async () => {
    mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover()
  })
  /** the patch the last write made */
  const written = (): PrefsPatch => fake.controller.setPrefs.mock.calls.at(-1)![0]
  return { ...mounted, ...fake, written }
}

describe("the reading options (the reader's design, §6.1)", () => {
  it('is a dialog of the reading switches, the swatches and the appearance, as the settings have them', async () => {
    const { container } = await open()
    expect(container.querySelector('[popover="auto"]')!.getAttribute('role')).toBe('dialog')
    const switches = [...container.querySelectorAll('[role="switch"]')].map((s) => [
      s.getAttribute('aria-label'),
      s.getAttribute('aria-checked'),
    ])
    // what to translate in the place figure text had (S-R-27): the owner's rows in the owner's order, figures, tables and heads on
    expect(switches).toEqual([
      ['对照高亮', 'true'],
      ['图中文字', 'true'],
      ['表中文字', 'true'],
      ['页眉页脚', 'true'],
      ['参考文献', 'false'],
      ['作者信息', 'false'],
      ['深色时调暗页面', 'true'],
    ])
    // the bands the preferences hold, a built-in one named by the reader, one the visitor named by its name
    expect([...container.querySelectorAll('[data-swatch]')].map((s) => s.getAttribute('aria-label'))).toEqual([
      O.reading.builtInHighlights['soft-green'],
      O.reading.builtInHighlights.sky,
      'Mine',
    ])
    expect([...container.querySelectorAll('[data-swatch]')].map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
    // the appearance: the system's first, as icons named by their words, as the display switch is (the maintainer, 2026-09-26)
    expect(
      [...container.querySelectorAll('[role="radio"]')].map((r) => [
        r.getAttribute('aria-label'),
        r.getAttribute('aria-checked'),
        !!r.querySelector('svg'),
        r.textContent,
      ]),
    ).toEqual([
      ['跟随系统', 'true', true, ''],
      ['浅色', 'false', true, ''],
      ['深色', 'false', true, ''],
    ])
  })

  it('moves the appearance with the arrows, the focus going with it, as a radio group does (the final review)', async () => {
    const { container, written } = await open()
    const group = container.querySelector<HTMLElement>('[role="radiogroup"]')!
    const arrow = (key: string) =>
      act(async () => {
        group.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      })
    // the defaults follow the system, the first choice: the right arrow goes to light; the left one wraps to dark
    await arrow('ArrowRight')
    expect([written(), document.activeElement?.getAttribute('aria-label')]).toEqual([{ theme: 'light' }, '浅色'])
    await arrow('ArrowLeft')
    expect(written()).toEqual({ theme: 'dark' })
  })

  it("holds the language menu and the host's own before the options (the extension's service) as its first rows, for a window under 900 px (§5)", async () => {
    const { container } = await open()
    const rows = [...container.querySelectorAll('[popover="auto"] > .narrow-only.row')]
    const nameOf = (b: Element | null) =>
      b
        ?.getAttribute('aria-labelledby')
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' ')
    expect(nameOf(rows[0]!.querySelector('button'))).toBe('简体中文 译为')
    expect(rows.slice(1).map((r) => r.getAttribute('data-slot'))).toEqual(['before-options'])
  })

  it("holds the host's own after the options (the extension's download, settings and way back) before them all, for a window under 500 px (§5; the maintainer, 2026-09-26)", async () => {
    const { container } = await open()
    const pop = container.querySelector('[popover="auto"]')!
    expect([
      pop.firstElementChild?.getAttribute('data-slot'),
      [...pop.querySelectorAll('[data-slot]')].map((r) => r.getAttribute('data-slot')),
    ]).toEqual(['after-options', ['after-options', 'before-options']])
    // a host with no slots: the language row first, nothing of a host's in their places
    const { container: bare } = await open({})
    expect([
      bare.querySelectorAll('[data-slot]').length,
      bare.querySelector('[popover="auto"]')!.firstElementChild?.classList.contains('narrow-only'),
    ]).toEqual([0, true])
  })

  it('writes each change at once', async () => {
    const { container, written } = await open()
    container.querySelector<HTMLElement>('[role="switch"][aria-label="对照高亮"]')!.click()
    expect(written()).toEqual({ highlight: { on: false } })
    container.querySelector<HTMLElement>(`[role="switch"][aria-label="${R.classes.names}"]`)!.click()
    // one toggle of what to translate, by the field it names: the others as they were (the extension's figure text of its HTML
    // page too, tests/pdf-reader/host-prefs.test.ts)
    expect(written()).toEqual({ classes: { names: true } })
    const swatches = [...container.querySelectorAll<HTMLElement>('[data-swatch]')]
    swatches[1]!.click()
    expect(written()).toEqual({ highlight: { band: PREFS.bands[1]!.id } })
    ;[...container.querySelectorAll<HTMLElement>('[role="radio"]')][2]!.click()
    expect(written()).toEqual({ theme: 'dark' })
    container.querySelector<HTMLElement>('[role="switch"][aria-label="深色时调暗页面"]')!.click()
    expect(written()).toEqual({ dim: false })
  })

  describe('out of reach while the settings are not read (P3-M14, P3-M16, C3-2; S-R-21)', () => {
    async function mountWith(over: Parameters<typeof fakeController>[0]) {
      const fake = fakeController(over)
      // the host's defaults, which hold its bands, stand in before its preferences land
      const mounted = await mountElement(
        withParts(createElement(ReadingOptions, { controller: fake.controller }), { defaults: PREFS }),
      )
      await act(async () => {
        mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover()
      })
      return { ...mounted, ...fake }
    }
    const controls = (c: HTMLElement) => [
      ...c.querySelectorAll<HTMLElement>('[role="switch"], [data-swatch], [role="radio"]'),
    ]

    it('settings that cannot be read: every control that writes them is greyed and writes nothing; its tooltip tells why, and the button that opens them is where it was', async () => {
      const { container, controller } = await mountWith({ settingsUnreadable: true })
      expect(container.querySelector('button[popovertarget]')).not.toBeNull()
      const found = controls(container)
      // seven switches, the swatches, three appearances: each greyed, and none a button the browser disables (it would take its tooltip away)
      expect(found.length).toBe(7 + PREFS.bands.length + 3)
      for (const el of found)
        expect(
          [el.getAttribute('aria-disabled'), el.hasAttribute('disabled')],
          el.getAttribute('aria-label') ?? '',
        ).toEqual(['true', false])
      for (const el of found) el.click()
      container.querySelector<HTMLElement>('label.row')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(controller.setPrefs).not.toHaveBeenCalled()
      // the tip beside each, hidden from assistive technology as every tip is, holds the control\'s name and the reason
      for (const el of found)
        expect(el.nextElementSibling?.textContent, el.getAttribute('aria-label') ?? '').toContain(
          R.status.unreadableHint,
        )
      // …and the reason is each one's description, for assistive technology, to which the tip is hidden
      for (const el of found)
        expect(el.getAttribute('aria-description'), el.getAttribute('aria-label') ?? '').toBe(R.status.unreadableHint)
    })

    it('before the settings land the same controls stand in their places, greyed, and tell no reason; once they land they write', async () => {
      const { container, controller, set } = await mountWith({ prefs: null })
      const found = controls(container)
      expect(found.length).toBe(7 + PREFS.bands.length + 3)
      for (const el of found)
        expect([
          el.getAttribute('aria-disabled'),
          el.nextElementSibling?.textContent?.includes(R.status.unreadableHint) ?? false,
        ]).toEqual(['true', false])
      await act(async () => set({ prefs: PREFS }))
      for (const el of controls(container))
        expect(el.hasAttribute('aria-disabled'), el.getAttribute('aria-label') ?? '').toBe(false)
      container.querySelector<HTMLElement>(`[role="switch"][aria-label="${S.rows.highlight}"]`)!.click()
      expect(controller.setPrefs).toHaveBeenCalledOnce()
    })
  })

  it("a switch's row is its target, words and all, as the popup's are: a press on the words turns it (#299, Part 6's interface review)", async () => {
    const { container, controller, written } = await open()
    for (const [words, patch] of [
      [S.rows.highlight, { highlight: { on: false } }],
      [R.classes.figures, { classes: { figures: false } }],
      [R.classes.heads, { classes: { heads: false } }],
      [R.options.dim, { dim: false }],
    ] as const) {
      const row = [...container.querySelectorAll<HTMLElement>('.row')].find(
        (r) => r.textContent === words && r.querySelector('[role="switch"]'),
      )!
      expect(row.tagName).toBe('LABEL')
      const before = controller.setPrefs.mock.calls.length
      // the row, its words: not the switch inside it
      await act(async () => {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(controller.setPrefs.mock.calls.length).toBe(before + 1)
      expect(written()).toEqual(patch)
    }
  })

  it("names its group of what to translate by the heading row above it, in the second ink, as the website's reading options do (S-R-27)", async () => {
    const { container } = await open()
    const group = container.querySelector<HTMLElement>('[data-axt-classes]')!
    expect(group.getAttribute('role')).toBe('group')
    const head = document.getElementById(group.getAttribute('aria-labelledby')!)!
    expect([
      head.textContent,
      head.classList.contains('row'),
      head.classList.contains('text-ink-2'),
      group.firstElementChild === head,
    ]).toEqual([R.classes.name, true, true, true])
    expect([...group.querySelectorAll('[data-axt-class]')].map((r) => r.getAttribute('data-axt-class'))).toEqual([
      'figures',
      'tables',
      'heads',
      'references',
      'names',
    ])
  })
})
