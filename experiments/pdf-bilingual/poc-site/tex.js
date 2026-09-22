// Our static site's TeX page, framed by the reader (an extension page): BusyTeX in this origin, with its own caches.
// Protocol, by postMessage, from extension pages only:
//   → { type: 'init', endpoint }                       ← { type: 'init-done', ms }
//   → { type: 'project', key, files: [{ path, content }] }   the package's files, kept here for every compile of it
//   → { type: 'compile', id, key, main, engine, rerun, bibtex, overrides: [{ path, content }] }
//   ← { type: 'compiled', id, ok, ms, pdf (transferred), aux, bbl, log }
// Compiles run one at a time, in the order they were asked for. The page's extra files (pregenerated fonts) go with
// every compile.
import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex } from '/lib/index.js'

let runner = null, endpoint = null, extra = []
const projects = new Map()
let queue = Promise.resolve()

async function init(msg) {
  const t0 = performance.now()
  endpoint = msg.endpoint
  runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: ['/busytex/texlive-basic.js'] })
  await runner.initialize(true)
  const list = await fetch('/extra/list.json').then(r => (r.ok ? r.json() : [])).catch(() => [])
  extra = await Promise.all(list.map(async path => ({ path, content: new Uint8Array(await (await fetch(`/extra/${path}`)).arrayBuffer()) })))
  return { type: 'init-done', ms: Math.round(performance.now() - t0) }
}

async function compile(msg) {
  const t0 = performance.now()
  const base = projects.get(msg.key) ?? new Map()
  const files = new Map(base)
  for (const o of msg.overrides ?? []) files.set(o.path, o.content)
  const input = files.get(msg.main)
  files.delete(msg.main)
  const Engine = { xelatex: XeLatex, lualatex: LuaLatex }[msg.engine] ?? PdfLatex
  const r = await new Engine(runner).compile({ input, mainTexPath: msg.main, additionalFiles: [...[...files].map(([path, content]) => ({ path, content })), ...extra], bibtex: msg.bibtex, rerun: msg.rerun, remoteEndpoint: endpoint, verbose: 'silent' })
  const steps = r.logs ?? []
  const tex = steps.filter(l => !/^(bibtex|biber|makeindex|xdvipdfmx)/.test(l.cmd ?? '')).at(-1)
  const bib = steps.filter(l => /^bibtex/.test(l.cmd ?? '')).at(-1)
  const pdf = r.pdf ? r.pdf.slice().buffer : null
  return [{ type: 'compiled', id: msg.id, ok: !!r.pdf, ms: Math.round(performance.now() - t0), pdf, aux: tex?.aux ?? null, bbl: bib?.aux ?? null, log: String(r.log ?? '') }, pdf ? [pdf] : []]
}

addEventListener('message', e => {
  if (!e.origin.startsWith('chrome-extension://')) return
  const msg = e.data, reply = (data, transfer = []) => e.source.postMessage(data, e.origin, transfer)
  if (msg?.type === 'project') { projects.set(msg.key, new Map(msg.files.map(f => [f.path, f.content]))); return }
  if (msg?.type === 'init') queue = queue.then(() => init(msg)).then(reply, err => reply({ type: 'init-done', error: String(err?.stack ?? err).slice(0, 400) }))
  if (msg?.type === 'compile') queue = queue.then(() => compile(msg)).then(([data, transfer]) => reply(data, transfer), err => reply({ type: 'compiled', id: msg.id, ok: false, error: String(err?.stack ?? err).slice(0, 400) }))
})
parent.postMessage({ type: 'ready' }, '*')
