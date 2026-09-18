import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { EntrySettings } from '@/shared/entry-settings'

// What a page follows of the settings (shared/entry-settings.ts): asked of the background, asked again on a change,
// and never taken from an answer that is not the settings

const wire = vi.hoisted(() => ({ answers: [] as unknown[], asked: 0, pending: [] as { promise: Promise<unknown> }[] }))
vi.mock('@/shared/messages', () => ({
  sendMessage: async () => {
    wire.asked++
    // An answer the test holds back, handed out in the order the asks were made
    const held = wire.pending.shift()
    if (held) return held.promise
    const next = wire.answers.length > 1 ? wire.answers.shift() : wire.answers[0]
    if (next instanceof Error) throw next
    return next
  },
}))

const SETTINGS: EntrySettings = { uiLanguage: 'en', openIn: 'same-tab', zoom: 1.25, floating: { enabled: false, side: 'left', position: 0.3, locked: true } }
const fresh = async () => {
  vi.resetModules()
  return import('@/shared/entry-settings')
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const deferredAnswer = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  fakeBrowser.reset()
  fakeBrowser.runtime.onMessage.removeAllListeners()
  wire.answers = [SETTINGS]
  wire.asked = 0
  wire.pending = []
})

describe('watchEntrySettings', () => {
  it('tells the settings once at the start, and again when either storage key changes', async () => {
    const { watchEntrySettings } = await fresh()
    const seen: EntrySettings[] = []
    expect(await watchEntrySettings(s => seen.push(s))).toEqual(SETTINGS)
    wire.answers = [{ ...SETTINGS, openIn: 'new-tab' }]
    await fakeBrowser.storage.local.set({ floatingEntry: { enabled: true } })
    await settle()
    await fakeBrowser.storage.local.set({ unrelated: 1 })
    await settle()
    expect(seen.map(s => s.openIn)).toEqual(['same-tab', 'new-tab'])
    expect(wire.asked).toBe(2)
  })

  it('an answer that is not the settings is no answer: the defaults stand, as they do when the background is silent', async () => {
    for (const bad of [undefined, null, 'x', {}, { ...SETTINGS, floating: null }, new Error('Receiving end does not exist')]) {
      wire.answers = [bad]
      const { watchEntrySettings, DEFAULT_ENTRY_SETTINGS } = await fresh()
      expect(await watchEntrySettings(() => undefined)).toEqual(DEFAULT_ENTRY_SETTINGS)
    }
  })

  it('a later answer that is not the settings changes nothing: the page keeps what it had', async () => {
    const { watchEntrySettings } = await fresh()
    const seen: EntrySettings[] = []
    await watchEntrySettings(s => seen.push(s))
    wire.answers = [undefined]
    await fakeBrowser.storage.local.set({ config: { version: 99 } })
    await settle()
    expect(seen.at(-1)).toEqual(SETTINGS)
  })

  it('answers may come back out of order: only the newest ask\'s is told, and a zoom pushed since is not undone (Devin on #251)', async () => {
    const { watchEntrySettings } = await fresh()
    const seen: EntrySettings[] = []
    await watchEntrySettings(s => seen.push(s))
    // Two changes in quick succession; the first ask's answer arrives last
    const slow = deferredAnswer()
    const quick = deferredAnswer()
    wire.pending = [slow, quick]
    await fakeBrowser.storage.local.set({ floatingEntry: { position: 0.3 } })
    await fakeBrowser.storage.local.set({ floatingEntry: { position: 0.7 } })
    quick.resolve({ ...SETTINGS, floating: { ...SETTINGS.floating, position: 0.7 } })
    await settle()
    slow.resolve({ ...SETTINGS, floating: { ...SETTINGS.floating, position: 0.3 } })
    await settle()
    expect(seen.at(-1)?.floating.position).toBe(0.7)

    // An ask is out when the background pushes a zoom: the ask's answer was read before it
    const stale = deferredAnswer()
    wire.pending = [stale]
    await fakeBrowser.storage.local.set({ config: { version: 1 } })
    await (fakeBrowser.runtime.onMessage.trigger as unknown as (message: unknown) => Promise<unknown>)({ type: 'axt:zoom-changed', zoom: 3 })
    stale.resolve({ ...SETTINGS, zoom: 1 })
    await settle()
    expect(seen.at(-1)?.zoom).toBe(3)
  })

  it('a zoom pushed while the first ask is out costs the answer its zoom and nothing else: the saved place and the switch still arrive', async () => {
    // A PDF's viewer sets the tab's zoom as it loads, so the push lands inside the page's first ask more often than
    // not. The whole answer used to be dropped for it, and with nothing to ask again the button sat at its default
    // place, and showed for a reader who had turned it off (the e2e's dragged place lost after a reload, 2026-09-19)
    const first = deferredAnswer()
    wire.pending = [first]
    const { watchEntrySettings } = await fresh()
    const seen: EntrySettings[] = []
    const started = watchEntrySettings(s => seen.push(s))
    await (fakeBrowser.runtime.onMessage.trigger as unknown as (message: unknown) => Promise<unknown>)({ type: 'axt:zoom-changed', zoom: 1.5 })
    first.resolve(SETTINGS)
    expect(await started).toEqual({ ...SETTINGS, zoom: 1.5 })
    expect(seen.at(-1)).toEqual({ ...SETTINGS, zoom: 1.5 })
  })

  it('one subscription per page: a second follower asks nothing again and hears the same settings; a change of zoom reaches both', async () => {
    const { watchEntrySettings } = await fresh()
    const first: number[] = []
    const second: number[] = []
    await watchEntrySettings(s => first.push(s.zoom))
    await watchEntrySettings(s => second.push(s.zoom))
    expect(wire.asked).toBe(1)
    // fake-browser types `trigger` with the listener's full signature; a background's push carries the message alone
    await (fakeBrowser.runtime.onMessage.trigger as unknown as (message: unknown) => Promise<unknown>)({ type: 'axt:zoom-changed', zoom: 2 })
    expect([first, second]).toEqual([[1.25, 2], [1.25, 2]])
  })
})
