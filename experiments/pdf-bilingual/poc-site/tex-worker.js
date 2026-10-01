// The TeX page's BusyTeX worker: BusyTeX's own (busytex_worker_busytex.js, imported below) with three additions.
// tex-page/build.mjs serves this file as busytex_worker.js, after tex-tree.mjs without its `export` keywords
// (treeFetcher, parseIndex).
//  - The engine and its preloads come from Cache Storage, where the page put them (tex-page.mjs): BusyTeX fetches
//    busytex.wasm and each preload's .data itself.
//  - The tree: BusyTeX's request for a file it did not find in its preloads (busytex.js KPSE_REMOTE.fetch, patched by
//    busytex/tree.diff to call self.__axtTreeFetch) is answered by the index the page sends ({ axt_tree: { base,
//    index } }, acknowledged by { axt_tree_ready }), for the program running (the pipeline's command): a file the tree
//    lacks is missing at once, any other is fetched from the tree, a network failure asked once more. A name whose
//    answer depends on the program is kept under the program's key too (BusyTeX keeps a file by format and name).
//  - A compile's network failures are posted ({ axt_network: [names] }) just before its result.
/* global treeFetcher, parseIndex, BusytexPipeline */
;(() => {
  const network = self.fetch.bind(self)
  self.fetch = async (input, init) => (await caches.match(input).catch(() => undefined)) ?? network(input, init)

  let tree = null
  /** the program running: the command the pipeline is running (pdflatex, xelatex, xdvipdfmx, bibtex8…) */
  let program = '*'
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
    const key = tree.keyOf(name, format)
    if (key !== name && K.hits[`${format}/${key}`]) return K.hits[`${format}/${key}`]
    const r = tree.fetch(name, format)
    if (r.bytes) return K.register(key, format, r.bytes)
    if (r.missing && key === name) K.misses[`${format}/${name}`] = 1
    return null
  }
  addEventListener('message', ({ data }) => {
    if (!data?.axt_tree) return
    tree = treeFetcher({ index: parseIndex(data.axt_tree.index), base: data.axt_tree.base, get, program: () => program })
    postMessage({ axt_tree_ready: true })
  })

  importScripts('busytex_worker_busytex.js')

  const runCommand = BusytexPipeline.prototype._run_cmd
  BusytexPipeline.prototype._run_cmd = function (Module, FS, cmd, ...rest) {
    program = cmd[0]
    try { return runCommand.call(this, Module, FS, cmd, ...rest) } finally { program = '*' }
  }
  const compile = BusytexPipeline.prototype.compile
  BusytexPipeline.prototype.compile = async function (...args) {
    try { return await compile.apply(this, args) } finally {
      const failed = tree?.takeFailures() ?? []
      if (failed.length) postMessage({ axt_network: failed })
    }
  }
})()
