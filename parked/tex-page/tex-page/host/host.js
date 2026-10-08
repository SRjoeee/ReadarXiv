// An extension page that frames the TeX page and talks to it as the reader does (src/pdf-reader/session/session.mjs
// openCompiler): the page accepts messages from extension pages only. measure.mjs drives it through window.texHost.
// Every message from the frame is kept with its arrival time (performance.now()), so that a run can be timed from here.
;(() => {
  let frame = null
  let site = null
  const seen = []
  const waiters = []
  addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow) return
    const data = e.data
    seen.push({ t: performance.now(), type: data?.type, data })
    for (const w of [...waiters]) {
      if (w.match(data)) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(data)
      }
    }
  })
  const wait = (match, ms) => new Promise((resolve, reject) => {
    const w = { match, resolve }
    waiters.push(w)
    if (ms) setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`no answer in ${ms} ms`)) } }, ms)
  })
  window.texHost = {
    /** frames `url` (the page's address); → the page's `ready` message, or throws after 20 s */
    async open(url) {
      this.close()
      site = new URL(url).origin
      seen.length = 0
      const ready = wait(d => d?.type === 'ready', 20000)
      frame = Object.assign(document.createElement('iframe'), { src: url, hidden: true })
      document.body.append(frame)
      return ready
    },
    close() {
      frame?.remove()
      frame = null
    },
    send(msg, transfer = []) { frame.contentWindow.postMessage(msg, site, transfer) },
    wait,
    seen,
  }
})()
