import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { Outline } from '@/pdf-reader/ui/Outline'
import { R, setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const outline = [
  { id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1 },
  { id: 5, title: '方法', original: 'Method', level: 1 as const, page: 3 },
  { id: 6, title: '设置', original: 'Setup', level: 2 as const, page: 3 },
  { id: 9, title: '细节', original: 'Details', level: 3 as const, page: 4 },
  { id: 12, title: '结果', original: 'Results', level: 1 as const, page: 6 },
]
const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-entry]')].filter(r => !r.closest('[hidden]'))

describe('the contents (the reader\'s design, §6.3)', () => {
  it('folds: the first level shown, the section being read marked and its branch open, as the session places the reading', async () => {
    const fake = fakeController({ outline, currentHeading: 9 })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    expect(rows(container).map(r => r.querySelector('.t')?.textContent)).toEqual(['引言', '方法', '设置', '细节', '结果'])
    expect(container.querySelector('[aria-current="true"]')!.textContent).toContain('细节')
    await act(async () => fake.set({ currentHeading: 2 }))
    expect(container.querySelector('[aria-current="true"]')!.textContent).toContain('引言')
  })

  it('closed, the sidebar is inert, not hidden: the style sheet slides it out of view (§7, the final review)', async () => {
    const fake = fakeController({ outline })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: false }))
    const aside = container.querySelector<HTMLElement>('aside')!
    expect([aside.hasAttribute('hidden'), aside.inert]).toEqual([false, true])
  })

  it('a fold closes a branch; a row jumps to its heading', async () => {
    const fake = fakeController({ outline, currentHeading: 2 })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    const fold = container.querySelector<HTMLElement>('[data-entry="5"] [aria-expanded]')!
    await act(async () => fold.click())
    expect(rows(container).map(r => r.dataset.entry)).toEqual(['2', '5', '6', '12'])
    await act(async () => fold.click())
    expect(rows(container).map(r => r.dataset.entry)).toEqual(['2', '5', '12'])
    container.querySelector<HTMLElement>('[data-entry="12"] a')!.click()
    expect(fake.controller.goToHeading).toHaveBeenCalledWith(12)
  })

  it('a fold says what a press does in a tooltip beside it, by the state it is in; its name stays the section (P3-M11)', async () => {
    const fake = fakeController({ outline, currentHeading: 2 })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    const fold = container.querySelector<HTMLElement>('[data-entry="5"] [aria-expanded]')!
    const tip = () => fold.nextElementSibling!
    expect([fold.getAttribute('aria-label'), tip().matches('.tip[popover]'), tip().textContent, tip().getAttribute('data-side')]).toEqual([outline[1]!.title, true, R.fold.expand, 'right'])
    await act(async () => fold.click())
    expect(tip().textContent).toBe(R.fold.collapse)
  })

  it('draws each title in the language it is in: the translation in the target\'s, a heading not yet translated in the paper\'s (WCAG 3.1.2)', async () => {
    const mixed = [{ ...outline[0]!, title: 'Introduction' }, outline[1]!]
    const fake = fakeController({ outline: mixed, settings: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' } })
    const { container } = await mountElement(createElement(Outline, { controller: fake.controller, open: true }))
    expect([...container.querySelectorAll('.t')].map(t => [t.textContent, t.getAttribute('lang')])).toEqual([['Introduction', 'en'], [outline[1]!.title, 'ja']])
    // no settings yet: what is translated has no language to claim
    await act(async () => fake.set({ settings: null }))
    expect([...container.querySelectorAll('.t')].map(t => t.getAttribute('lang'))).toEqual(['en', null])
  })
})
