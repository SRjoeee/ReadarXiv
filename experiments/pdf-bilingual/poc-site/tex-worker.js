// The TeX page's BusyTeX worker: BusyTeX's own (busytex_worker_busytex.js, imported below) with three additions.
// tex-page/build.mjs serves this file as busytex_worker.js, after tex-tree.mjs without its `export` keywords
// (treeFetcher, parseIndex).
//  - The engine and its preloads come from Cache Storage, where the page put them (tex-page.mjs): BusyTeX fetches
//    busytex.wasm and each preload's .data itself.
//  - The tree: BusyTeX's request for a file it did not find in its preloads (busytex.js KPSE_REMOTE.fetch, patched by
//    busytex/tree.diff to call self.__axtTreeFetch) is answered by the index the page sends ({ axt_tree: { base,
//    index } }, acknowledged by { axt_tree_ready }): a file the tree lacks is missing at once, any other is fetched
//    from the tree, a network failure asked once more.
//  - A compile's network failures are posted ({ axt_network: [names] }) just before its result.
/* global treeFetcher, parseIndex, BusytexPipeline */
;(() => {
  const network = self.fetch.bind(self)
  self.fetch = async (input, init) => (await caches.match(input).catch(() => undefined)) ?? network(input, init)

  let tree = null
  const get = url => {
    const x = new XMLHttpRequest()
    try {
      x.open('GET', url, false)
      x.responseType = 'arraybuffer'
      x.timeout = 30000
      x.send()
    } catch { return { status: 0, bytes: null } }
    return { status: x.status, bytes: x.status === 200 && x.response ? new Uint8Array(x.response) : null }
  }
  /** KPSE_REMOTE's fetch, given its own object `K` (register, misses): → the file's path in the FS, or null */
  self.__axtTreeFetch = (name, format, K) => {
    if (!tree) return null
    const r = tree.fetch(name, format)
    if (r.bytes) return K.register(name, format, r.bytes)
    if (r.missing) K.misses[`${format}/${name}`] = 1
    return null
  }
  addEventListener('message', ({ data }) => {
    if (!data?.axt_tree) return
    tree = treeFetcher({ index: parseIndex(data.axt_tree.index), base: data.axt_tree.base, get })
    postMessage({ axt_tree_ready: true })
  })

  importScripts('busytex_worker_busytex.js')

  const compile = BusytexPipeline.prototype.compile
  BusytexPipeline.prototype.compile = async function (...args) {
    try { return await compile.apply(this, args) } finally {
      const failed = tree?.takeFailures() ?? []
      if (failed.length) postMessage({ axt_network: failed })
    }
  }
})()
