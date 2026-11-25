import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Outline } from '../../src/chrome/Outline.tsx'
import { setLocale } from '@readarxiv/ui'
import { mountElement } from '../render-hook.ts'
import { fakeController, PREFS } from './fake-controller.ts'
import { LANGUAGES, withParts } from './parts.ts'
import { stubPopovers } from '../popover-stub.ts'

let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => {
  restore = stubPopovers()
})
afterEach(() => {
  restore()
  document.body.innerHTML = ''
})

const outline = [
  { id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1, number: '1' },
  { id: 5, title: '方法', original: 'Method', level: 1 as const, page: 3, number: '2' },
  { id: 6, title: '设置', original: 'Setup', level: 2 as const, page: 3, number: '2.1' },
  { id: 9, title: '细节', original: 'Details', level: 3 as const, page: 4, number: '2.1.1' },
  { id: 12, title: '致谢', original: 'Acknowledgements', level: 1 as const, page: 6, number: null },
]
const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-entry]')]

describe("the contents (the reader's design, §6.3)", () => {
  it('lists every heading, every level, each one link: its number, the translation, the original under it; no fold, no page', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    expect(
      rows(container).map((r) => [
        r.dataset.level,
        r.querySelector('.n')?.textContent ?? null,
        r.querySelector('.t')?.textContent,
        r.querySelector('.o')?.textContent,
        r.querySelectorAll('a').length,
      ]),
    ).toEqual([
      ['1', '1', '引言', 'Introduction', 1],
      ['1', '2', '方法', 'Method', 1],
      ['2', '2.1', '设置', 'Setup', 1],
      ['3', '2.1.1', '细节', 'Details', 1],
      // (a heading TeX set no number for: its column empty, its titles on its level's edge)
      ['1', '', '致谢', 'Acknowledgements', 1],
    ])
    expect(container.querySelectorAll('button, [aria-expanded], [hidden], svg').length).toBe(0)
    // (the link's name what it shows, in order: the number, the translation, the original)
    expect(rows(container)[2]!.querySelector('a')!.textContent).toBe(`2.1${outline[2]!.title}Setup`)
  })

  it('each level a number column as wide as its widest number; a level with none keeps a step where a deeper level follows', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    const tracks = () => container.querySelector<HTMLElement>('.toc-list')!.style.gridTemplateColumns
    expect(tracks()).toBe('auto auto auto minmax(0, 1fr)')
    await act(async () => fake.set({ outline: outline.map((e) => ({ ...e, number: null })) }))
    expect(tracks()).toBe('14px 14px 0px minmax(0, 1fr)')
    expect(container.querySelectorAll('.n').length).toBe(0)
  })

  it('closed, the sidebar is inert, not hidden: the style sheet slides it out of view (§7, the final review)', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: false }))
    const aside = container.querySelector<HTMLElement>('aside')!
    expect([aside.hasAttribute('hidden'), aside.inert]).toEqual([false, true])
  })

  it('a row jumps to its heading, and no row is marked: not the one gone to, not the one read (the maintainer, 2026-11-26)', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    container.querySelector<HTMLElement>('[data-entry="12"] a')!.click()
    expect(fake.controller.goToHeading).toHaveBeenCalledWith(12)
    expect(container.querySelectorAll('[aria-current], [aria-selected]').length).toBe(0)
  })

  it('the original whole in a tooltip beside the row, hidden from assistive technology (the name holds it)', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    const tip = container.querySelector<HTMLElement>('[data-entry="5"] a')!.nextElementSibling!
    expect([
      tip.matches('.tip[popover]'),
      tip.textContent,
      tip.getAttribute('data-side'),
      tip.getAttribute('aria-hidden'),
    ]).toEqual([true, 'Method', 'right', 'true'])
  })

  it("draws each title in the language it is in: the translation in the target's, by the host's tag, the original in the paper's; a heading not yet translated once, its original in the translation's place (WCAG 3.1.2)", async () => {
    const mixed = [{ ...outline[0]!, title: 'Introduction' }, outline[1]!]
    const fake = fakeController({ outline: mixed, prefs: { ...PREFS, target: 'ja' } })
    const { container } = await mountElement(
      withParts(createElement(Outline, { controller: fake.controller, open: true }), {
        languages: { ...LANGUAGES, tag: (t) => (t === 'ja' ? 'ja-JP' : t) },
      }),
    )
    const langs = () =>
      rows(container).map((r) => [...r.querySelectorAll('.t, .o')].map((t) => [t.textContent, t.getAttribute('lang')]))
    expect(langs()).toEqual([
      [['Introduction', 'en']],
      [
        [outline[1]!.title, 'ja-JP'],
        ['Method', 'en'],
      ],
    ])
    // no preferences yet: what is translated has no language to claim
    await act(async () => fake.set({ prefs: null }))
    expect(langs()[1]!.map(([, l]) => l)).toEqual([null, 'en'])
  })
})
