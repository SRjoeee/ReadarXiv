// The extension's own controls in the reader's chrome (host/slots.tsx; the chrome's places for them: packages/reader
// tests/chrome): the translation service, the download, the settings and the way back, in the bar and as the reading options'
// rows in a narrow window, and the settings under a failure's card where a key is the remedy. They read the reader by its
// controller and the extension's configuration by its own store
import { act, createElement, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { type ChromeState, INITIAL, type ReaderController } from '@readarxiv/reader'
import { R, S, setLocale } from '@readarxiv/ui'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { prefsOf } from '@/pdf-reader/host/prefs'
import { type ConfigStore, DownloadMenu, extensionSlots, ServiceMenu } from '@/pdf-reader/host/slots'
import { clearRejected, markRejected } from '@/shared/service-health'
import { serviceName } from '@/ui/strings'
import { mountElement } from '../ui/render-hook'
import { isOpen, stubPopovers } from './ui/popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers(); fakeBrowser.reset() })
afterEach(() => { restore(); document.body.innerHTML = '' })

/** the chrome's controller as the slots read it: a state the test sets, the download a spy */
function fakeController(over: Partial<ChromeState> = {}) {
  let state: ChromeState = { ...INITIAL, prefs: prefsOf(DEFAULT_CONFIG), paper: { id: '2608.02163', title: '' }, display: 'bilingual', phase: 'ready', ...over }
  const listeners = new Set<() => void>()
  const controller = { getState: () => state, subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }, download: vi.fn(async () => {}) }
  return { controller: controller as unknown as ReaderController & { download: typeof controller.download }, set(next: Partial<ChromeState>) { state = { ...state, ...next }; for (const l of listeners) l() } }
}
/** the extension's configuration as the slots read it: what it holds (one snapshot, as host/today.ts configStore keeps it until
 *  told), and the changes a pick writes */
function fakeStore(config: Config | null = DEFAULT_CONFIG) {
  const changes: ((c: Config) => Config)[] = []
  const state = { config, pack: null }
  const store: ConfigStore = { state: () => state, subscribe: () => () => {}, patch: change => { changes.push(change) } }
  return { store, changes }
}
/** a control's accessible name, as far as these controls need: the elements it is labelled by, else its aria-label */
const nameOf = (el: Element | null | undefined) => el?.getAttribute('aria-labelledby')?.split(' ').map(id => document.getElementById(id)?.textContent).join(' ') ?? el?.getAttribute('aria-label')
const tipOf = (b: Element) => (b.nextElementSibling?.matches('.tip') ? b.nextElementSibling.textContent : null)
/** the defaults' service as the bar names it, in the interface's language when asked */
const microsoft = () => serviceName('microsoft')

async function openMenu(node: ReactNode) {
  const mounted = await mountElement(createElement('div', null, node))
  await act(async () => { mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover() })
  return mounted
}

describe('the service menu (the reader\'s design, §6.1, §6.7)', () => {
  it('is named by what it shows, first, and its words, from what is on the page; the whole value in its tooltip (WCAG 2.5.3; the interface review)', async () => {
    const { controller } = fakeController()
    const { container } = await mountElement(createElement(ServiceMenu, { controller, store: fakeStore().store }))
    const button = container.querySelector<HTMLElement>('.menu-btn')!
    expect([nameOf(button), button.hasAttribute('aria-label'), tipOf(button)]).toEqual([`${microsoft()} ${S.rows.service}`, false, `${S.rows.service}${microsoft()}`])
  })

  it('a service another tab has deleted meanwhile is not written, as the popup\'s choice is not (Codex on #301)', async () => {
    const mine = POPUP_FIXTURES.find(f => f.id === 'P15')!.input.config!.services[0]!
    const settings: Config = { ...DEFAULT_CONFIG, services: [mine] }
    const { controller } = fakeController()
    const { store, changes } = fakeStore(settings)
    const { container } = await openMenu(createElement(ServiceMenu, { controller, store }))
    const option = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(mine.name))!
    option.click()
    expect(changes).toHaveLength(1)
    expect(changes[0]!(settings).provider).toBe(mine.id)
    const deleted = { ...settings, services: [] }
    expect(changes[0]!(deleted)).toBe(deleted)
    expect(isOpen(container.querySelector('[popover="auto"]'))).toBe(false)
  })

  it('a service whose key the endpoint refused says so, as the popup\'s menu does, and follows the record while the menu is open (the redesign\'s design, §5.2; the controller\'s ruling 22)', async () => {
    const mine: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'My model', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'test', model: 'vendor/model', thinking: 'disabled' }
    await markRejected(mine.id)
    const { controller } = fakeController()
    const { container, flush } = await openMenu(createElement(ServiceMenu, { controller, store: fakeStore({ ...DEFAULT_CONFIG, services: [mine] }).store }))
    const row = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(mine.name))!
    const settled = async (ready: () => boolean) => { for (let i = 0; i < 20 && !ready(); i++) await flush() }
    await settled(() => row().textContent!.includes(S.service.llm_rejected))
    expect(row().textContent).toContain(S.service.llm_rejected)
    // the record's change reaches the menu through a state update: inside act, as a test's updates are
    await act(async () => { await clearRejected(mine.id) })
    await settled(() => row().textContent!.includes(mine.model))
    expect([row().textContent!.includes(mine.model), row().textContent!.includes(S.service.llm_rejected)]).toEqual([true, false])
  })

  it('one list, its separators not items of it (the final review)', async () => {
    const { controller } = fakeController()
    const { container } = await openMenu(createElement(ServiceMenu, { controller, store: fakeStore().store }))
    const lists = container.querySelectorAll('[role="listbox"], [role="menu"]')
    expect(lists.length).toBe(1)
    expect([...lists[0]!.children].every(c => ['option', 'menuitemradio', 'none'].includes(c.getAttribute('role') ?? ''))).toBe(true)
  })

  it('before the settings land it stands in its place, greyed and opening nothing, the defaults\' service in it; no reason told yet; once they land it opens (P3-M14, P3-M16, C3-2; S-R-21)', async () => {
    const { controller, set } = fakeController({ prefs: null })
    const { container } = await mountElement(createElement(ServiceMenu, { controller, store: fakeStore(null).store }))
    const button = () => container.querySelector<HTMLElement>('.menu-btn')!
    expect([button().getAttribute('aria-disabled'), button().hasAttribute('popovertarget'), tipOf(button())]).toEqual(['true', false, `${S.rows.service}${microsoft()}`])
    await act(async () => set({ prefs: prefsOf(DEFAULT_CONFIG) }))
    expect([button().hasAttribute('aria-disabled'), button().hasAttribute('popovertarget')]).toEqual([false, true])
  })

  it('settings that cannot be read grey it with the reason in its tooltip, and as its description, which the tooltip hides from assistive technology', async () => {
    const { controller } = fakeController({ settingsUnreadable: true })
    const { container } = await mountElement(createElement(ServiceMenu, { controller, store: fakeStore().store }))
    const button = container.querySelector<HTMLElement>('.menu-btn')!
    expect([button.getAttribute('aria-disabled'), tipOf(button), button.getAttribute('aria-description')]).toEqual(['true', `${S.rows.service}${R.status.unreadableHint}`, R.status.unreadableHint])
  })
})

describe('the download menu (the reader\'s design, §6.1)', () => {
  it('the original greyed until its document is open — loading, or a fetch that failed (Codex on #301)', async () => {
    const { controller } = fakeController({ sides: { left: { page: 0, pages: 0 }, right: { page: 0, pages: 0 } } })
    const { container } = await openMenu(createElement(DownloadMenu, { controller }))
    const [, original] = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(original!.getAttribute('aria-disabled')).toBe('true')
    original!.click()
    expect(controller.download).not.toHaveBeenCalled()
  })

  it('the translation greyed until there is one to give; the original given once open', async () => {
    const { controller, set } = fakeController({ download: 'original', sides: { left: { page: 1, pages: 25 }, right: { page: 1, pages: 26 } } })
    const { container } = await openMenu(createElement(DownloadMenu, { controller }))
    const items = () => [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const [translation, original] = items()
    expect([translation!.textContent, translation!.getAttribute('aria-disabled'), original!.textContent]).toEqual([R.download.translation, 'true', R.download.original])
    translation!.click()
    original!.click()
    expect(controller.download.mock.calls).toEqual([['original']])
    await act(async () => set({ download: 'translation' }))
    await act(async () => { container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover() })
    expect(items()[0]!.hasAttribute('aria-disabled')).toBe(false)
    items()[0]!.click()
    expect(controller.download.mock.calls).toEqual([['original'], ['translation']])
  })
})

describe('the slots of the extension\'s reader (extensionSlots)', () => {
  const slots = (embedded: boolean, over: Partial<ChromeState> = {}) => extensionSlots({ controller: fakeController(over).controller, store: fakeStore().store, embedded })

  it('in the bar after the reading options: the download, the settings as a link, which a middle click or ⌘-click opens as well, and the way back only over arXiv\'s page (the interface review)', async () => {
    const over = await mountElement(createElement('div', null, slots(true).afterOptions('bar')))
    const link = over.container.querySelector<HTMLAnchorElement>(`a[aria-label="${S.settings}"]`)!
    expect([link.getAttribute('href')?.endsWith('/options.html#reading/pdf'), link.target, link.rel]).toEqual([true, '_blank', 'noopener'])
    expect([...over.container.querySelectorAll('[aria-label]')].filter(el => el.matches('button, a')).map(el => el.getAttribute('aria-label'))).toEqual([R.download.name, S.settings, R.leave])
    // each leaves the bar for the reading options below 500 px (reader.css data-wide)
    expect([...over.container.querySelectorAll('button, a')].filter(el => el.matches('[aria-label]')).every(el => el.hasAttribute('data-wide'))).toBe(true)
    await over.unmount()
    const alone = await mountElement(createElement('div', null, slots(false).afterOptions('bar')))
    expect(alone.container.querySelector(`button[aria-label="${R.leave}"]`)).toBeNull()
  })

  it('the settings stay in reach while they cannot be read: the settings page is the way to mend them', async () => {
    const { container } = await mountElement(createElement('div', null, slots(true, { settingsUnreadable: true }).afterOptions('bar')))
    expect(container.querySelector(`a[aria-label="${S.settings}"]`)!.hasAttribute('aria-disabled')).toBe(false)
  })

  it('in the bar before the reading options: the service menu', async () => {
    const { container } = await mountElement(createElement('div', null, slots(false).beforeOptions('bar')))
    expect(nameOf(container.querySelector('.menu-btn'))).toBe(`${microsoft()} ${S.rows.service}`)
  })

  it('as the reading options\' rows: the service under 900 px; the download, the settings and the way back under 500 px, then their separator (§5; the maintainer, 2026-09-26)', async () => {
    const service = await mountElement(createElement('div', null, slots(false).beforeOptions('options')))
    const row = service.container.querySelector('.narrow-only.row')!
    expect([row.firstChild?.textContent, nameOf(row.querySelector('button'))]).toEqual([S.rows.service, `${microsoft()} ${S.rows.service}`])
    await service.unmount()
    const rows = async (embedded: boolean) => {
      const { container, unmount } = await mountElement(createElement('div', null, slots(embedded).afterOptions('options')))
      const found = [...container.querySelectorAll('.narrowest-only.row')].map(r => [r.firstChild?.textContent, r.querySelector('button, a')?.getAttribute('aria-label')])
      const last = container.firstElementChild?.lastElementChild?.matches('.sep.narrowest-only')
      await unmount()
      return { found, last }
    }
    expect(await rows(false)).toEqual({ found: [[R.download.name, R.download.name], [S.settings, S.settings]], last: true })
    expect(await rows(true)).toEqual({ found: [[R.download.name, R.download.name], [S.settings, S.settings], [R.leave, R.leave]], last: true })
  })

  it('under a failure\'s card where a key is the remedy: the settings, opened at the translation services', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create')
    const { container } = await mountElement(createElement('div', null, slots(false).card()))
    const button = container.querySelector<HTMLButtonElement>('button')!
    expect(button.textContent).toBe(S.settings)
    button.click()
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]![0].url).toMatch(/\/options\.html#translate\/services$/)
  })
})
