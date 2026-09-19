import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { CONFIG_VERSION, type Config, DEFAULT_CONFIG } from '@/config/schema'
import { ConfigUnreadableError, setConfig } from '@/config/storage'
import { chainRevision } from '@/config/revision'
import type { PackState } from '@/shared/pack'
import { type Landing, type SurfaceConfigDeps, createSurfaceConfig } from '@/shared/surface-config'
import { createDrafts } from '@/ui/drafts'

// The configuration as a surface sees it (shared/surface-config.ts), through its interface and over the real store on
// a fake browser: no React, no module replaced. What the popup's and the settings page's data layers each asserted of
// their own copy is asserted here once

const BASE: Config = { ...DEFAULT_CONFIG, uiLanguage: 'en' }
/** Another surface saves: straight to the store, as the popup does beside the settings page */
const saveElsewhere = (config: Config) => setConfig(config)
const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) await new Promise(resolve => setTimeout(resolve, 0))
  expect(done()).toBe(true)
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 0)) }

function surface(extra: Partial<SurfaceConfigDeps> = {}) {
  const log: string[] = []
  const landed: Landing[] = []
  const packState = vi.fn(async (): Promise<PackState> => 'downloadable')
  const announce = vi.fn()
  const made = createSurfaceConfig({
    // The surface was painted in English, which is also what `auto` resolves to here
    localeStale: config => config.uiLanguage === 'zh-CN',
    reload: () => { log.push('reload') },
    onLanded: (_, from) => { landed.push(from) },
    packState,
    announce,
    ...extra,
  })
  return { made, log, landed, packState, announce, stop: made.start() }
}

/** Every write to the store waits for the gate, and is logged by the target language it carries */
function gateWrites(log: string[]) {
  let open!: () => void
  const gate = new Promise<void>(resolve => { open = resolve })
  const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
  vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async items => {
    await gate
    const written = (items as { config?: Config }).config
    if (written) log.push(`set:${written.targetLanguage}`)
    return set(items)
  })
  return open
}

beforeEach(async () => {
  vi.restoreAllMocks()
  fakeBrowser.reset()
  await setConfig(BASE)
})

describe('a surface reads the configuration and follows it', () => {
  it('nothing is read before it starts; the first reading is published whole — the configuration with its digest, never one without the other', async () => {
    const made = createSurfaceConfig({ localeStale: () => false, reload: () => undefined, packState: async () => 'available', announce: () => undefined })
    const seen: ReturnType<typeof made.state>[] = []
    made.subscribe(() => seen.push(made.state()))
    await flush()
    expect(made.state().config).toBeNull()
    const stop = made.start()
    await until(() => made.state().pack === 'available')
    for (const state of seen) expect(state.config === null).toBe(state.revision === null)
    expect(made.state()).toEqual({ config: BASE, revision: await chainRevision(BASE), fallbackReason: null, resetFailed: false, pack: 'available' })
    stop()
  })

  it('a change saved elsewhere shows without a reload, and says where it came from', async () => {
    const s = surface()
    await until(() => s.made.state().config !== null)
    await saveElsewhere({ ...BASE, targetLanguage: 'jpn' })
    await until(() => s.made.state().config?.targetLanguage === 'jpn')
    expect(s.made.state().revision).toBe(await chainRevision({ ...BASE, targetLanguage: 'jpn' }))
    expect(s.landed).toEqual(['first', 'elsewhere'])
    expect(s.log).toEqual([])
    s.stop()
  })

  it('another target language forgets the previous one\'s pack at once and looks the new one up', async () => {
    const s = surface()
    await until(() => s.made.state().pack === 'downloadable')
    const packs: (PackState | null)[] = []
    s.made.subscribe(() => packs.push(s.made.state().pack))
    await s.made.patch(latest => ({ ...latest, targetLanguage: 'jpn' }))
    await until(() => s.made.state().pack === 'downloadable')
    expect(packs[0]).toBeNull()
    expect(s.packState).toHaveBeenLastCalledWith('jpn')
    s.stop()
  })

  it('stopped, it follows nothing more', async () => {
    const s = surface()
    await until(() => s.made.state().config !== null)
    s.stop()
    await saveElsewhere({ ...BASE, targetLanguage: 'jpn' })
    await flush()
    expect(s.made.state().config?.targetLanguage).toBe(BASE.targetLanguage)
  })
})

describe('every write is a patch on what storage holds now, one after another', () => {
  it('two controls changed before the first write lands: both changes are stored (Codex on #157)', async () => {
    const s = surface()
    const first = s.made.patch(latest => ({ ...latest, targetLanguage: 'jpn' }))
    const second = s.made.patch(latest => ({ ...latest, mode: 'stack' }))
    expect((await second).targetLanguage).toBe('jpn')
    expect((await first).mode).toBe(BASE.mode)
    expect(s.made.state().config).toMatchObject({ targetLanguage: 'jpn', mode: 'stack' })
    s.stop()
  })

  it('a patch builds on a change another surface saved meanwhile, not on the snapshot this one shows (Codex on #39)', async () => {
    const s = surface()
    await until(() => s.made.state().config !== null)
    s.stop() // no watcher: this surface still shows the old target
    await saveElsewhere({ ...BASE, targetLanguage: 'jpn' })
    expect((await s.made.patch(latest => ({ ...latest, mode: 'only' }))).targetLanguage).toBe('jpn')
  })

  it('a write that throws is its caller\'s failure and does not stop the ones behind it', async () => {
    const s = surface()
    const failing = s.made.patch(() => { throw new Error('a bad change') })
    const next = s.made.patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    await expect(failing).rejects.toThrow('a bad change')
    expect((await next).targetLanguage).toBe('kor')
    s.stop()
  })
})

describe('a stored configuration this build cannot read', () => {
  const unreadable = () => fakeBrowser.storage.local.set({ config: { ...BASE, version: CONFIG_VERSION + 1 }, config$: { v: CONFIG_VERSION + 1 } })

  it('a save is refused: the state shows what is in effect and why, and the patch rejects with the refusal', async () => {
    await unreadable()
    const s = surface()
    await until(() => s.made.state().config !== null)
    expect(s.made.state().fallbackReason).toEqual({ kind: 'tooNew', stored: CONFIG_VERSION + 1, supported: CONFIG_VERSION })
    await expect(s.made.patch(latest => ({ ...latest, targetLanguage: 'jpn' }))).rejects.toBeInstanceOf(ConfigUnreadableError)
    expect(s.made.state().config).toEqual(DEFAULT_CONFIG)
    expect(s.made.state().fallbackReason?.kind).toBe('tooNew')
    // Storage is as it was
    expect(((await fakeBrowser.storage.local.get('config')).config as Config).version).toBe(CONFIG_VERSION + 1)
    s.stop()
  })

  it('the reset is the way out, on the same chain; a reset storage refuses says so, and the next one that succeeds clears both', async () => {
    await unreadable()
    const s = surface()
    await until(() => s.made.state().config !== null)
    const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    await s.made.reset()
    expect(s.made.state()).toMatchObject({ resetFailed: true, fallbackReason: { kind: 'tooNew' } })
    vi.mocked(fakeBrowser.storage.local.set).mockImplementation(set)
    expect(await s.made.reset()).toEqual(DEFAULT_CONFIG)
    expect(s.made.state()).toMatchObject({ resetFailed: false, fallbackReason: null, config: DEFAULT_CONFIG })
    await s.made.patch(latest => ({ ...latest, targetLanguage: 'jpn' }))
    expect(s.made.state().config?.targetLanguage).toBe('jpn')
    s.stop()
  })

  it('an accepted save proves the store readable: the line about a refused reset goes, whoever repaired it', async () => {
    await unreadable()
    const s = surface()
    await until(() => s.made.state().config !== null)
    s.stop() // repaired below without an event reaching this surface
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('refused'))
    await s.made.reset()
    expect(s.made.state().resetFailed).toBe(true)
    vi.restoreAllMocks()
    await fakeBrowser.storage.local.set({ config: BASE, config$: { v: CONFIG_VERSION } })
    await s.made.patch(latest => ({ ...latest, targetLanguage: 'jpn' }))
    expect(s.made.state()).toMatchObject({ resetFailed: false, fallbackReason: null })
  })

  it('a valid write elsewhere is the repair: the reason goes, and the line about a refused reset with it (Codex on #185)', async () => {
    await unreadable()
    const s = surface()
    await until(() => s.made.state().config !== null)
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('refused'))
    await s.made.reset()
    expect(s.made.state().resetFailed).toBe(true)
    vi.restoreAllMocks()
    // Another surface's reset went through
    await fakeBrowser.storage.local.set({ config: { ...BASE, targetLanguage: 'jpn' }, config$: { v: CONFIG_VERSION } })
    await until(() => s.made.state().config?.targetLanguage === 'jpn')
    expect(s.made.state()).toMatchObject({ fallbackReason: null, resetFailed: false })
    s.stop()
  })
})

describe('an interface language that resolves to another pack than the one in use takes a reload', () => {
  it('at the first read: reloaded, and the settings are not shown under the old language\'s labels first (Codex on #185)', async () => {
    await setConfig({ ...BASE, uiLanguage: 'zh-CN' })
    const s = surface()
    await until(() => s.log.length > 0)
    expect(s.log).toEqual(['reload'])
    expect(s.made.state().config).toBeNull()
    s.stop()
  })

  it('saved elsewhere with nothing in the way: reloaded at once, once', async () => {
    const s = surface()
    await until(() => s.made.state().config !== null)
    await saveElsewhere({ ...BASE, uiLanguage: 'zh-CN', targetLanguage: 'jpn' })
    await until(() => s.log.length > 0)
    await flush()
    expect(s.log).toEqual(['reload'])
    expect(s.made.state().config?.targetLanguage).toBe(BASE.targetLanguage)
    s.stop()
  })

  it('under a draft the reload waits for the draft to close, and the other settings follow meanwhile', async () => {
    const holds = createDrafts()
    const s = surface({ holds })
    await until(() => s.made.state().config !== null)
    const release = holds.hold()
    await saveElsewhere({ ...BASE, uiLanguage: 'zh-CN', targetLanguage: 'jpn' })
    await until(() => s.made.state().config?.targetLanguage === 'jpn')
    expect(s.log).toEqual([])
    // A second change while it waits asks for no second reload
    await saveElsewhere({ ...BASE, uiLanguage: 'zh-CN', targetLanguage: 'kor' })
    await until(() => s.made.state().config?.targetLanguage === 'kor')
    release()
    await flush()
    expect(s.log).toEqual(['reload'])
    s.stop()
  })

  it('it waits for a save queued as the draft closes — an editor saves and closes in one breath — and a save queued behind that one lands before it too', async () => {
    const holds = createDrafts()
    const s = surface({ holds })
    await until(() => s.made.state().config !== null)
    const release = holds.hold()
    await saveElsewhere({ ...BASE, uiLanguage: 'zh-CN' })
    await until(() => s.made.state().config?.uiLanguage === 'zh-CN')
    const open = gateWrites(s.log)
    const first = s.made.patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    release()
    await flush()
    const second = s.made.patch(latest => ({ ...latest, targetLanguage: 'fra' }))
    await flush()
    expect(s.log).toEqual([])
    open()
    await Promise.all([first, second])
    await flush()
    expect(s.log).toEqual(['set:kor', 'set:fra', 'reload'])
    s.stop()
  })

  it('a draft opened while the reload waits for a write holds it again', async () => {
    const holds = createDrafts()
    const s = surface({ holds })
    await until(() => s.made.state().config !== null)
    const releaseFirst = holds.hold()
    await saveElsewhere({ ...BASE, uiLanguage: 'zh-CN' })
    await until(() => s.made.state().config?.uiLanguage === 'zh-CN')
    const open = gateWrites(s.log)
    const saved = s.made.patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    releaseFirst()
    await flush()
    const releaseSecond = holds.hold()
    open()
    await saved
    await flush()
    expect(s.log).toEqual(['set:kor'])
    releaseSecond()
    await flush()
    expect(s.log).toEqual(['set:kor', 'reload'])
    s.stop()
  })
})

describe('the language pack follows the configuration\'s target language', () => {
  it('another surface\'s download of the wanted target is looked up again; of another target, not', async () => {
    const s = surface()
    await until(() => s.made.state().pack === 'downloadable')
    s.packState.mockResolvedValue('available')
    const before = s.packState.mock.calls.length
    s.made.receivePack('jpn')
    await flush()
    expect(s.packState).toHaveBeenCalledTimes(before)
    s.made.receivePack(BASE.targetLanguage)
    await until(() => s.made.state().pack === 'available')
    s.stop()
  })

  it('a download shows as one, runs what the surface gave it, tells the other surfaces, and looks the pack up after', async () => {
    const s = surface()
    await until(() => s.made.state().pack === 'downloadable')
    const run = vi.fn(async () => { expect(s.made.state().pack).toBe('downloading'); s.packState.mockResolvedValue('available') })
    await s.made.downloadPack(BASE.targetLanguage, run)
    expect(run).toHaveBeenCalledWith(BASE.targetLanguage)
    expect(s.announce).toHaveBeenCalledWith(BASE.targetLanguage)
    expect(s.made.state().pack).toBe('available')
    s.stop()
  })
})
