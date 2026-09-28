import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PopupActions } from '@/entrypoints/popup/data'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { PopupView } from '@/entrypoints/popup/PopupView'
import { derivePopupView } from '@/entrypoints/popup/view-model'
import { S, setLocale } from '@/ui/strings'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { draw, drawInput, fixture, nameOf, wordsOf } from './draw'

// The popup as it draws each state (the redesign's design, §5; round 6): found by role and by the pack's words, from the
// fixtures the gallery draws. Where things stand is the browser's to measure (tests/e2e/probes/popup-align.mjs)
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('the popup drawn (the redesign\'s design, §5)', () => {
  it('draws every state in the kind its view model says, each kind with its parts: the group where there are controls, the finder on P0 alone', async () => {
    const parts: Record<string, [group: boolean, finder: boolean]> = { pending: [false, false], loading: [false, false], find: [false, true], paper: [true, false], entry: [true, false], reader: [true, false] }
    for (const f of POPUP_FIXTURES) {
      const { main, unmount } = await draw(f.id)
      const kind = derivePopupView(f.input).kind
      expect([f.id, main.dataset.kind, !!main.querySelector('.group'), !!main.querySelector('.find')]).toEqual([f.id, kind, ...parts[kind]!])
      await unmount()
    }
  })

  it('P1: the brand row, the group of two rows, the primary with its key, the display, the foot (§5.1)', async () => {
    const { main, actions } = await draw('P1')
    const brand = main.querySelector('.brand-row')!
    expect(brand.querySelector('.wordmark')!.textContent).toBe(S.brand)
    const gear = brand.querySelector('button')!
    expect(gear.getAttribute('aria-label')).toBe(S.settings)
    await act(async () => { gear.click() })
    expect(actions.openOptions).toHaveBeenCalledWith()
    expect([...main.querySelectorAll('.group .group-row .k')].map(k => k.textContent)).toEqual([S.rows.service, S.rows.language])
    expect(main.querySelector(`button[aria-label="${S.primary.translate}"] kbd`)?.textContent).toBe('⌥T')
    const radios = [...main.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    // the stored preference is stacked. A segment's words are its visible span: its title rides in a hidden one
    // (Part 3's Segmented, its description), which textContent would read too
    expect(radios.map(r => [wordsOf(r), r.getAttribute('aria-checked'), !!r.querySelector('svg')])).toEqual([[S.mode.side, 'false', true], [S.mode.stack, 'true', true], [S.mode.only, 'false', true]])
    expect([...main.querySelectorAll('.foot [role="switch"]')].map(s => s.getAttribute('aria-label'))).toEqual([S.rows.highlight, S.rows.images])
    const style = main.querySelector('.foot .style-btn')!
    expect(style.textContent).toBe(S.rows.style)
    // a page with styles: the button opens their menu, as before Task 103b
    expect([style.hasAttribute('aria-disabled'), style.getAttribute('aria-haspopup'), !!style.getAttribute('popovertarget')]).toEqual([false, 'listbox', true])
  })

  it('P4: showing the original is the neutral face, and keeps its key (S-P-51)', async () => {
    const { main } = await draw('P4')
    expect(main.querySelector(`button[aria-label="${S.primary.restore}"] kbd`)?.textContent).toBe('⌥T')
  })

  it('P9: the note with its alert and its settings, then Translate again with its key before Show original without one (§5.2)', async () => {
    const { main, actions } = await draw('P9')
    const note = main.querySelector('.note')!
    expect(note.getAttribute('data-tone')).toBe('alert')
    expect(note.querySelector('button')!.textContent).toBe(S.settings)
    const pair = [...main.querySelectorAll('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect(pair.map(b => !!b.querySelector('kbd'))).toEqual([true, false])
    await act(async () => { (pair[1] as HTMLElement).click() })
    expect(actions.restore).toHaveBeenCalled()
  })

  it('P13: Translate again greyed and without its key, Show original beside it', async () => {
    const pair = [...(await draw('P13')).main.querySelectorAll('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect([pair[0]!.getAttribute('aria-disabled'), pair[0]!.querySelector('kbd')]).toEqual(['true', null])
  })

  it('P6b: the key made good, the page on the free service offered its way back — Translate again with the key, and Show original (the retranslate cue)', async () => {
    const { main, actions } = await draw('P6b')
    expect(main.querySelector('.note')).toBeNull()
    const pair = [...main.querySelectorAll<HTMLElement>('.pair > button')]
    expect(pair.map(nameOf)).toEqual([S.primary.retranslate, S.primary.restore])
    expect(pair.map(b => b.querySelector('kbd')?.textContent ?? null)).toEqual(['⌥T', null])
    await act(async () => { pair[0]!.click() })
    expect(actions.retranslate).toHaveBeenCalled()
  })

  it('P5: a failure is a note of its own, with its alert and Retry', async () => {
    const { main, actions } = await draw('P5')
    const note = [...main.querySelectorAll('.note')].find(n => n.textContent?.includes(S.failed.text(3)))!
    expect(note.getAttribute('data-tone')).toBe('alert')
    await act(async () => { note.querySelector('button')!.click() })
    expect(actions.retryFailed).toHaveBeenCalled()
  })

  it('P6: the service in use, the one put aside struck through beside it; the note carries the information icon', async () => {
    const { main } = await draw('P6')
    expect(main.querySelector('.group-row s')!.textContent).toBe('deepseek-v4-flash')
    expect(main.querySelector('.note')!.getAttribute('data-tone')).toBe('info')
  })

  it('P12: the display says the window is narrow, under it', async () => {
    expect((await draw('P12')).main.querySelector('.reading .line')!.textContent).toBe(S.mode.narrow)
  })

  it('P17: the group and the two entries with their icons, nothing of a translated page (§5.5)', async () => {
    const { main, actions } = await draw('P17')
    const entries = [...main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(entries.map(nameOf)).toEqual([S.entry.html, S.entry.pdf])
    expect(entries.every(b => b.querySelector('svg'))).toBe(true)
    expect([main.querySelector('[role="radiogroup"]'), main.querySelector('.foot')]).toEqual([null, null])
    await act(async () => { entries[1]!.click() })
    expect(actions.openPdf).toHaveBeenCalled()
  })

  it('P17a: the HTML entry greyed, the reason in a note with the information icon and no button', async () => {
    const { main, actions } = await draw('P17a')
    const [html] = [...main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(html!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { html!.click() })
    expect(actions.openHtml).not.toHaveBeenCalled()
    const note = main.querySelector('.note')!
    expect([note.getAttribute('data-tone'), note.querySelector('button')]).toEqual(['info', null])
  })

  it('P2: the Chrome row with its download runs it through onAction, never as a choice (Part 3\'s action API: a missing onAction is a silent no-op)', async () => {
    const { main, actions, flush } = await draw('P2')
    // the menus' rows are drawn from the frame after the first
    await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) })
    await flush()
    const row = [...main.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(S.service.chrome))!
    // greyed, yet operable: no aria-disabled, the class `unavailable` (Part 3)
    expect([row.getAttribute('aria-disabled'), row.classList.contains('unavailable')]).toEqual([null, true])
    await act(async () => { row.click() })
    expect([actions.downloadPack.mock.calls.length, actions.chooseService.mock.calls.length]).toEqual([1, 0])
    // Enter on the row, as the keyboard picks it, does the same
    const list = row.closest<HTMLElement>('[role="listbox"]')!
    await act(async () => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null })) })
    await act(async () => { list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect([actions.downloadPack.mock.calls.length, actions.chooseService.mock.calls.length]).toEqual([2, 0])
  })

  it('PR: stacked greyed, the switches kept, the style button in its place greyed: it opens nothing and says no reason (§5.2; the maintainer, 2026-09-28)', async () => {
    const { main, actions } = await draw('PR')
    const stack = [...main.querySelectorAll('[role="radio"]')].find(r => wordsOf(r) === S.mode.stack)!
    expect(stack.getAttribute('aria-disabled')).toBe('true')
    expect(main.querySelectorAll('.foot [role="switch"]').length).toBe(2)
    // the foot as every page's: the two switches, then the style button with its words and its chevron
    const foot = main.querySelector('.foot')!
    expect([foot.className, ...[...foot.children].map(c => c.className)]).toEqual(['foot', 'toggle', 'toggle', 'tbtn style-btn'])
    const style = foot.querySelector<HTMLButtonElement>(':scope > .style-btn')!
    expect([style.getAttribute('aria-disabled'), style.textContent, !!style.querySelector('svg')]).toEqual(['true', S.rows.style, true])
    // nothing to open and nothing to say: no menu, no tooltip, no anchor for either
    expect([style.hasAttribute('popovertarget'), style.hasAttribute('aria-haspopup'), style.getAttribute('style'), foot.querySelector('[popover]')]).toEqual([false, false, null, null])
    await act(async () => { style.click() })
    expect([document.querySelector('[data-open]'), actions.openMenu.mock.calls.length, actions.chooseStyle.mock.calls.length]).toEqual([null, 0, 0])
  })

  it('a paper whose settings are not read yet: the style button greyed in its place; read, the same place opens the styles (Task 103b)', async () => {
    const m = await drawInput({ ...fixture('P1').input, config: null })
    const style = () => m.main.querySelector('.foot > .style-btn')!
    expect([style().getAttribute('aria-disabled'), style().hasAttribute('popovertarget')]).toEqual(['true', false])
    await m.rerender(createElement(PopupView, { view: derivePopupView(fixture('P1').input), error: null, actions: m.actions as unknown as PopupActions }))
    expect([style().hasAttribute('aria-disabled'), style().hasAttribute('popovertarget')]).toEqual([false, true])
    await m.unmount()
  })

  it('PL says the page is loading and draws nothing else; PW is the brand row alone (§5.4)', async () => {
    const loading = await draw('PL')
    expect(loading.main.querySelector('.line.solo')!.textContent).toBe(S.loading)
    expect([loading.main.querySelector('.group'), loading.main.querySelector('input')]).toEqual([null, null])
    await loading.unmount()
    const pending = await draw('PW')
    expect([...pending.main.children].filter(c => c.getAttribute('role') !== 'status').map(c => c.className)).toEqual(['brand-row'])
  })

  it('PE: the failure line under the primary, with its alert; said to screen readers politely (§9)', async () => {
    const { main } = await draw('PE')
    const said = fixture('PE').error!
    expect(main.querySelector('.stack > .line.alert')!.textContent).toBe(said)
    expect(main.querySelector('[role="status"]')!.textContent).toBe(said)
    expect(main.querySelector('[role="alert"]')).toBeNull()
  })
})
