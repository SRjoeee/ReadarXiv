import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import { DEFAULT_FLOATING_ENTRY } from '@/shared/entry-settings'

// The floating button's state (DESIGN §4.0c): under its own key, one writer, one write after another. What this
// guards is Devin's finding on #250: inside the configuration, a drag's write was a whole-object write that could put
// back a snapshot taken before another context's save

const fresh = async () => {
  vi.resetModules()
  return import('@/entrypoints/background/floating-entry')
}

beforeEach(() => fakeBrowser.reset())

describe('the floating button\'s state', () => {
  it('reads the defaults when nothing is stored, and when what is stored is not whole and valid', async () => {
    const { getFloatingEntry } = await fresh()
    expect(await getFloatingEntry()).toEqual(DEFAULT_FLOATING_ENTRY)
    for (const bad of [null, 'x', { enabled: false }, { ...DEFAULT_FLOATING_ENTRY, position: 5 }, { ...DEFAULT_FLOATING_ENTRY, side: 'top' }]) {
      await fakeBrowser.storage.local.set({ floatingEntry: bad })
      expect([bad, await getFloatingEntry()]).toEqual([bad, DEFAULT_FLOATING_ENTRY])
    }
  })

  it('a patch is merged into what is stored at that moment, and answers with what is stored now', async () => {
    const { patchFloatingEntry, getFloatingEntry } = await fresh()
    expect(await patchFloatingEntry({ side: 'left', position: 0.3 })).toEqual({ saved: true, floating: { ...DEFAULT_FLOATING_ENTRY, side: 'left', position: 0.3 } })
    expect(await patchFloatingEntry({ enabled: false })).toEqual({ saved: true, floating: { enabled: false, side: 'left', position: 0.3, locked: false } })
    expect(await getFloatingEntry()).toEqual({ enabled: false, side: 'left', position: 0.3, locked: false })
  })

  it('writes sent at the same moment do not undo each other: a drag in one tab, the lock in another, the settings switch', async () => {
    const { patchFloatingEntry, getFloatingEntry } = await fresh()
    await Promise.all([patchFloatingEntry({ side: 'left', position: 0.2 }), patchFloatingEntry({ locked: true }), patchFloatingEntry({ enabled: false })])
    expect(await getFloatingEntry()).toEqual({ enabled: false, side: 'left', position: 0.2, locked: true })
  })

  it('never touches the configuration: a service saved while a drag is written is still there', async () => {
    const { patchFloatingEntry } = await fresh()
    const withService = { ...DEFAULT_CONFIG, provider: 'google-web' }
    await fakeBrowser.storage.local.set({ config: DEFAULT_CONFIG })
    const drag = patchFloatingEntry({ position: 0.4 })
    await fakeBrowser.storage.local.set({ config: withService })
    await drag
    expect((await fakeBrowser.storage.local.get('config')).config).toEqual(withService)
  })

  it('a patch that would not be valid is not saved, and the answer is what is still stored', async () => {
    const { patchFloatingEntry } = await fresh()
    await patchFloatingEntry({ side: 'left' })
    expect(await patchFloatingEntry({ position: 7 })).toEqual({ saved: false, floating: { ...DEFAULT_FLOATING_ENTRY, side: 'left' } })
  })

  it('a write that failed is said so, with what is still stored, and does not stop the writes behind it', async () => {
    const { patchFloatingEntry } = await fresh()
    await patchFloatingEntry({ side: 'left' })
    const set = vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES'))
    expect(await patchFloatingEntry({ enabled: false })).toEqual({ saved: false, floating: { ...DEFAULT_FLOATING_ENTRY, side: 'left' } })
    set.mockRestore()
    expect(await patchFloatingEntry({ locked: true })).toEqual({ saved: true, floating: { ...DEFAULT_FLOATING_ENTRY, side: 'left', locked: true } })
  })
})
