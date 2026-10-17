// What the parked compile path kept on this machine goes on an install or an update (Stage 5 Tasks 10 and 17): the store of
// compiled translations, the TeX page's files the warm-up kept, and the warm-up's mark; each on its own, a failure of one
// leaving the others gone and nothing thrown
import { describe, expect, it, vi } from 'vitest'
import { forgetRetired, RETIRED } from '@/entrypoints/background/retired-stores'

const io = () => {
  const request = { onerror: null as null | (() => void) }
  return {
    indexedDB: { deleteDatabase: vi.fn(() => request) } as unknown as IDBFactory,
    caches: { delete: vi.fn(async () => true) } as unknown as CacheStorage,
    storage: { remove: vi.fn(async () => {}) },
    request,
  }
}

describe('the retired stores', () => {
  it('names the three the parked compile path kept', () => {
    expect(RETIRED).toEqual({ database: 'axt-pdf', cache: 'axt-tex-files', key: 'axt-tex-warm' })
  })

  it('deletes the database, the Cache Storage of the TeX page\'s files, and the warm-up\'s key', async () => {
    const o = io()
    await forgetRetired(o)
    expect(o.indexedDB.deleteDatabase).toHaveBeenCalledWith('axt-pdf')
    expect(o.caches.delete).toHaveBeenCalledWith('axt-tex-files')
    expect(o.storage.remove).toHaveBeenCalledWith('axt-tex-warm')
  })

  it('one that fails leaves the others gone, and throws nothing', async () => {
    const o = io()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(o.caches.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    ;(o.indexedDB.deleteDatabase as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('no idb') })
    await expect(forgetRetired(o)).resolves.toBeUndefined()
    expect(o.storage.remove).toHaveBeenCalledWith('axt-tex-warm')
    // no Cache Storage, no IndexedDB (a context without them): nothing asked of them
    await expect(forgetRetired({ storage: o.storage })).resolves.toBeUndefined()
  })
})
