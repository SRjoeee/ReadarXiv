// lab/pdf/layer-lab/doc-loads.mjs
// The PDF.js documents a fixture load opens, and who closes them. Fixtures can be picked faster than they open, so loads
// overlap; each is begun, opens its documents through itself, and ends one of two ways. `keep()` while it is still the newest
// load: its documents are the page's from then on (a newer load closes them in its turn). Otherwise, or on a failure
// (`close()`), every document it opened is closed, the ones still loading too, and one that finishes loading afterwards is
// never opened: none is left open, and none is installed under a newer load.

/**
 * @param o.getDocument  PDF.js's, given a document's bytes: a loading task ({ promise, destroy() })
 * @param o.fetchBytes   the bytes at a URL
 */
export function createDocLoads({ getDocument, fetchBytes }) {
  let newest = 0
  return {
    begin() {
      const mine = ++newest
      const tasks = []
      let closed = false
      const close = () => {
        closed = true
        for (const task of tasks.splice(0)) Promise.resolve(task.destroy()).catch(() => {})
      }
      return {
        /** whether a newer load has begun */
        stale: () => mine !== newest,
        /** the document at a URL; it is closed with the load unless the load is kept */
        async open(url) {
          const bytes = await fetchBytes(url)
          if (closed) throw new Error('superseded')
          const task = getDocument(bytes)
          tasks.push(task)
          return task.promise
        },
        /** true where this load is still the newest: its documents are the caller's now. Otherwise they are closed, and false */
        keep() {
          if (mine !== newest) { close(); return false }
          tasks.length = 0
          return true
        },
        close,
      }
    },
  }
}
