// Our static site's compiler page, framed by the extension's reader: takes a paper's files by postMessage, compiles them
// with BusyTeX in this origin (its own storage, its own caches), sends the PDF back. Accepts messages from extension pages only.
import { BusyTexRunner, PdfLatex, XeLatex, LuaLatex } from '/lib/index.js'
const probe = async () => {
  const p = { origin: location.origin, isolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined' }
  const tryIt = async (name, f) => { try { p[name] = await f() } catch (e) { p[name] = `ERR ${String(e).slice(0, 120)}` } }
  await tryIt('indexedDB', () => new Promise((res, rej) => { const q = indexedDB.open('poc'); q.onsuccess = () => res('ok'); q.onerror = () => rej(q.error) }))
  await tryIt('cacheApi', async () => { await caches.open('poc'); return 'ok' })
  await tryIt('storageEstimate', async () => { const e = await navigator.storage.estimate(); return `usage ${Math.round(e.usage / 1048576)} MB, quota ${Math.round(e.quota / 1073741824)} GB` })
  return p
}
let runner = null
addEventListener('message', async e => {
  if (!e.origin.startsWith('chrome-extension://') || e.data?.type !== 'compile') return
  const { main, files, endpoint, compiler } = e.data
  try {
    const t0 = performance.now()
    if (!runner) { runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: ['/busytex/texlive-basic.js'] }); await runner.initialize(true) }
    const initMs = Math.round(performance.now() - t0)
    const Engine = { xelatex: XeLatex, lualatex: LuaLatex }[compiler] ?? PdfLatex
    const r = await new Engine(runner).compile({ input: files.find(f => f.path === main).content, mainTexPath: main, additionalFiles: files.filter(f => f.path !== main), rerun: true, remoteEndpoint: endpoint })
    const compileMs = Math.round(performance.now() - t0) - initMs
    const pdf = r.pdf ? r.pdf.slice().buffer : null
    e.source.postMessage({ type: 'done', success: r.success, initMs, compileMs, pdf, log: String(r.log ?? '').slice(-400) }, e.origin, pdf ? [pdf] : [])
  } catch (err) { e.source.postMessage({ type: 'done', success: false, error: String(err?.stack ?? err).slice(0, 400) }, e.origin) }
})
parent.postMessage({ type: 'ready', probe: await probe() }, '*')
