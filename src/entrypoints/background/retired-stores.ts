// What the parked compile path kept on this machine (parked/extension-compile/), deleted on an install or an update (Stage 5
// Tasks 10 and 17): the store of compiled translations (IndexedDB `axt-pdf`), the TeX page's files the warm-up kept (Cache
// Storage `axt-tex-files`, up to hundreds of megabytes) and the warm-up's mark (`axt-tex-warm` in storage.local). Nothing
// reads them any more; each goes on its own, and a failure of one leaves a store nothing reads, never an error

export const RETIRED = { database: 'axt-pdf', cache: 'axt-tex-files', key: 'axt-tex-warm' } as const

export interface RetiredIo {
  indexedDB?: IDBFactory
  caches?: CacheStorage
  storage: { remove(key: string): Promise<void> }
}

/** the three deleted, each on its own; resolves once each has answered, whatever the answer */
export async function forgetRetired(io: RetiredIo): Promise<void> {
  const warn = (what: string) => () => console.warn(`[axt] the retired ${what} could not be deleted`)
  try {
    const r = io.indexedDB?.deleteDatabase(RETIRED.database)
    if (r) r.onerror = warn(`store ${RETIRED.database}`)
  } catch { warn(`store ${RETIRED.database}`)() }
  await Promise.all([
    Promise.resolve().then(() => io.caches?.delete(RETIRED.cache)).catch(warn(`cache ${RETIRED.cache}`)),
    Promise.resolve().then(() => io.storage.remove(RETIRED.key)).catch(warn(`key ${RETIRED.key}`)),
  ])
}
