import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { LOCALES } from '@/locales'
import { DEFAULT_ENTRY_SETTINGS, type EntrySettings, type FloatingEntryState } from '@/shared/entry-settings'

// The floating button's life on a page (shared/floating.ts): what the settings say is what the page shows — the
// button there or not, and after a save, whatever the background says is stored

const wire = vi.hoisted(() => ({
  follow: null as ((settings: unknown) => void) | null,
  sent: [] as { type: string; patch?: unknown }[],
  /** What the background answers a save with; null rejects */
  saveAnswer: null as { saved: boolean; floating: unknown } | null,
}))
vi.mock('@/shared/entry-settings', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/entry-settings')>()),
  watchEntrySettings: async (onSettings: (settings: unknown) => void) => {
    wire.follow = onSettings
    const { DEFAULT_ENTRY_SETTINGS: first } = await importOriginal<typeof import('@/shared/entry-settings')>()
    onSettings(first)
    return first
  },
}))
vi.mock('@/shared/messages', () => ({
  sendMessage: async (message: { type: string; patch?: unknown }) => {
    wire.sent.push(message)
    if (message.type !== 'axt:set-floating-entry') return { opened: true }
    if (wire.saveAnswer === null) throw new Error('no answer')
    return wire.saveAnswer
  },
}))

import { installFloatingButton } from '@/shared/floating'

const hosts = () => document.querySelectorAll('.axt-floating').length
const inside = (selector: string) => document.querySelector('.axt-floating')!.shadowRoot!.querySelector(selector) as HTMLElement
const click = (selector: string) => inside(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }))
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const settings = (floating: Partial<FloatingEntryState>): EntrySettings => ({ ...DEFAULT_ENTRY_SETTINGS, floating: { ...DEFAULT_ENTRY_SETTINGS.floating, ...floating } })
const install = () => installFloatingButton(document, { main: { kind: 'toggle', run: () => undefined }, label: (S, active) => (active ? S.primary.restore : S.primary.translate) })

beforeEach(() => {
  fakeBrowser.reset()
  // fake-browser implements neither: the interface language the browser reports, and an extension file's address
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en')
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(((path: string) => `chrome-extension://test${path}`) as typeof fakeBrowser.runtime.getURL)
  document.body.innerHTML = ''
  wire.sent = []
  wire.saveAnswer = null
})

describe('installFloatingButton', () => {
  it('is there when the settings say so, gone when they do not, and back without a reload', async () => {
    await install()
    expect(hosts()).toBe(1)
    wire.follow!(settings({ enabled: false }))
    expect(hosts()).toBe(0)
    wire.follow!(settings({ enabled: true, side: 'left' }))
    expect([hosts(), inside('.axt-fb-dock').dataset.axtSide]).toEqual([1, 'left'])
  })

  it('"hide for now" lasts through other changes of the settings, and ends when the reader turns the switch on again (Devin on #251)', async () => {
    await install()
    click('.axt-fb-options')
    click('.axt-fb-hide-now')
    expect([hosts(), wire.sent.filter(m => m.type === 'axt:set-floating-entry')]).toEqual([0, []])
    // A drag saved in another tab, a change of language: still hidden on this page
    wire.follow!(settings({ position: 0.4 }))
    expect(hosts()).toBe(0)
    // Off and on again on the settings page: the reader asking for it
    wire.follow!(settings({ enabled: false }))
    wire.follow!(settings({ enabled: true }))
    expect(hosts()).toBe(1)
  })

  it('"don\'t show again" is saved through the background, and a save that failed brings the button back (Devin on #250)', async () => {
    await install()
    wire.saveAnswer = { saved: false, floating: DEFAULT_ENTRY_SETTINGS.floating }
    click('.axt-fb-options')
    click('.axt-fb-hide-always')
    expect(wire.sent.at(-1)).toEqual({ type: 'axt:set-floating-entry', patch: { enabled: false } })
    await settle()
    expect(hosts()).toBe(1)

    wire.saveAnswer = { saved: true, floating: { ...DEFAULT_ENTRY_SETTINGS.floating, enabled: false } }
    click('.axt-fb-options')
    click('.axt-fb-hide-always')
    await settle()
    expect(hosts()).toBe(0)
  })

  it('the tick and the main button\'s words follow the page', async () => {
    const installed = await install()
    expect(inside('.axt-fb-main').getAttribute('aria-label')).toBe(LOCALES.en.S.primary.translate)
    installed.setActive(true)
    expect([inside('.axt-fb-dock').dataset.axtActive, inside('.axt-fb-main').getAttribute('aria-label')]).toEqual(['yes', LOCALES.en.S.primary.restore])
  })
})
