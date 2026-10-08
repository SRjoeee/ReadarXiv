// The extension's store of the TeX page's files (the page's `store: true`): the page the reader frames over arXiv's PDF
// page has a Cache Storage and an HTTP cache of its own — the browser partitions them by the top-level site —, which a
// warm-up run in the offscreen document cannot fill, while the extension's own storage and Web Locks are one wherever
// its pages run (measured in Chrome 145, 153 and 154, partitioning on: .superpowers/sdd/2026-10-01-parallel/
// warmup-report.md). So the warm-up (entrypoints/ocr/tex-warm.ts) keeps the page's files here, by their address on the
// page's site, and the reader hands its page those its own cache lacks. One lock keeps the two from downloading a file
// twice: the warm-up takes it alone and only when it is free, every reader that frames the page shares it while open;
// a reader that finds a warm-up holding it asks it to give way (through the background) — it is stopped when it is for
// another language or its pace says it would outlast the reader's patience, else waited for — and then takes what the
// store holds.

/** the Cache Storage cache of the page's files, in the extension's origin */
export const STORE = 'axt-tex-files'
/** the Web Lock: held alone by a warm-up, shared by every open reader that typesets */
export const LOCK = 'axt-tex'

const keyOf = (site, url) => new URL(url, site).href
const open = caches => (caches ? caches.open(STORE).catch(() => null) : Promise.resolve(null))

/** the page's `want` answered from the store, its files read at once → { message: its `have`, transfer }: the files
 *  held, by their names alone or, when the page asks for bytes, as ArrayBuffers to transfer */
export async function answerWant(site, want, caches = globalThis.caches) {
  const store = await open(caches)
  const files = {}, transfer = []
  if (store) {
    const held = await Promise.all((want.files ?? []).map(async url => {
      const hit = await store.match(keyOf(site, url)).catch(() => undefined)
      if (!hit) return null
      return [url, want.bytes ? await hit.arrayBuffer().catch(() => null) : true]
    }))
    for (const [url, file] of held.filter(h => h?.[1])) {
      files[url] = file
      if (file !== true) transfer.push(file)
    }
  }
  return { message: { type: 'have', id: want.id, files }, transfer }
}

/** a file the page gives (its `keep`), kept → whether it was: a store that cannot be written (a full disk) throws
 *  nothing, and the warm-up stops rather than download what it cannot keep */
export async function keepFile(site, keep, caches = globalThis.caches) {
  const store = await open(caches)
  if (!store) return false
  return store.put(keyOf(site, keep.url), new Response(keep.bytes)).then(() => true, () => false)
}

/** the store pruned to these files: another language's faces, an older page's engine go */
export async function pruneStore(site, urls, caches = globalThis.caches) {
  const store = await open(caches)
  if (!store) return
  const named = new Set(urls.map(url => keyOf(site, url)))
  for (const { url } of await store.keys().catch(() => [])) if (!named.has(url)) await store.delete(url).catch(() => {})
}

/** a reader's share of the lock, held for the page's life → settles once it is granted: at once, unless a warm-up
 *  holds it — then `busy` is called, which asks the warm-up to give way (stopped, it keeps what came; one of the
 *  reader's language nearly done is let finish), and the share is granted once it has ended. A `busy` that throws (an
 *  extension context gone: runtime.sendMessage throws at once) changes nothing of that: the share is still asked for,
 *  and the reader never runs beside a warm-up that writes (the re-review's m5) */
export function shareLock(locks = globalThis.navigator?.locks, busy = null) {
  if (!locks?.request) return Promise.resolve()
  return new Promise(granted => {
    const hold = () => { granted(); return new Promise(() => {}) }
    locks.request(LOCK, { mode: 'shared', ifAvailable: true }, lock => {
      if (lock) return hold()
      try { busy?.() } catch {}
      locks.request(LOCK, { mode: 'shared' }, hold).catch(() => granted())
      return undefined
    }).catch(() => granted())
  })
}
