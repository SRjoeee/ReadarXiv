// The TeX page under network failures, in Chromium: a file of the tree that answers 503 (or not at all, or 404 though
// the index lists it: an upload not complete) is asked twice and then reported by its path in `compiled.network`,
// never taken for a file the tree lacks; once the tree answers again, the same
// compile succeeds with nothing to report. A file the tree lacks is "not found" with no request. Also: a compile
// whose engine the init did not hint brings BusyTeX up again with it.
//   node experiments/pdf-bilingual/tex-page/network-check.mjs      (after tex-page/build.mjs)
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveTexSite } from './serve.mjs'

const { chromium } = createRequire(new URL('../../../', import.meta.url).pathname)('playwright')
const asked = []
let failing = null // a tree path that fails, and how: a status (503, 404) or a dropped connection
const server = await serveTexSite({ log: row => asked.push(row.path) })
// the fault: the site's handler is wrapped by listening first
const handlers = server.listeners('request')
server.removeAllListeners('request')
server.on('request', (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (failing && path.endsWith(failing.path)) {
    asked.push(path)
    if (failing.how === 'drop') return req.socket.destroy()
    res.statusCode = Number(failing.how)
    return res.end()
  }
  for (const h of handlers) h.call(server, req, res)
})
const HOST = new URL('./host', import.meta.url).pathname
const profile = mkdtempSync(join(tmpdir(), 'tex-network-'))
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${HOST}`, `--load-extension=${HOST}`] })
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const tab = await context.newPage()
await tab.goto(`chrome-extension://${new URL(sw.url()).host}/host.html`)
const site = `http://127.0.0.1:${server.address().port}`
let failed = 0
const check = (what, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); if (!ok) failed++ }

const doc = (pkg = '') => `\\documentclass{article}${pkg}\\begin{document}A page, $x^2$.\\end{document}\n`
const compile = (id, text, engine = 'pdflatex') => tab.evaluate(async ({ id, text, engine }) => {
  const h = window.texHost
  h.send({ type: 'compile', id, key: 'p', main: 'main.tex', engine, rerun: false, bibtex: false, overrides: [{ path: 'main.tex', content: new TextEncoder().encode(text) }] })
  const r = await h.wait(d => d?.type === 'compiled' && d.id === id, 300000)
  return { ok: r.ok, network: r.network, error: (r.log ?? '').match(/^! .*$/m)?.[0] ?? null }
}, { id, text, engine })
const ready = await tab.evaluate(async url => window.texHost.open(url), `${site}/tex.html`)
check('ready says protocol 2 and the versions', ready.protocol === 2 && !!ready.cv && !!ready.eid && !!ready.tid, ready)
const init = await tab.evaluate(async () => { const h = window.texHost; h.send({ type: 'init', protocol: 2, engines: ['pdflatex'], fonts: [] }); const d = await h.wait(m => m?.type === 'init-done', 300000); h.send({ type: 'project', key: 'p', files: [] }); return d })
check('init-done', !init.error, init)

// a package the tree has, and neither a preload nor the manifest
const pkg = '\\usepackage{epigraph}'
asked.length = 0
failing = { path: '/epigraph.sty', how: '503' }
const a = await compile(1, doc(pkg))
const tries = asked.filter(p => p.endsWith('/epigraph.sty')).length
const reported = r => r.network?.some(p => p.endsWith('/epigraph.sty'))
check('a 503 is asked twice, then reported in network, and the compile fails', !a.ok && reported(a) && tries === 2, { ...a, tries })
failing = { path: '/epigraph.sty', how: 'drop' }
asked.length = 0
const b = await compile(2, doc(pkg))
// (the browser itself may resend a request whose reused connection was dropped: at least the page's two)
const dropped = asked.filter(p => p.endsWith('/epigraph.sty')).length
check('a dropped connection the same', !b.ok && reported(b) && dropped >= 2, { ...b, tries: dropped })
failing = { path: '/epigraph.sty', how: '404' }
asked.length = 0
const b2 = await compile(21, doc(pkg))
check('a 404 for a file the index lists the same: the network\'s, not "not found" for good', !b2.ok && reported(b2) && asked.filter(p => p.endsWith('/epigraph.sty')).length === 2, b2)
failing = null
asked.length = 0
const c = await compile(3, doc(pkg))
check('once the tree answers, the same compile succeeds with nothing to report', c.ok && c.network?.length === 0, c)
asked.length = 0
const d = await compile(4, doc('\\usepackage{nosuchpackageanywhere}'))
check('a package the tree lacks: not found, no request, nothing in network', !d.ok && d.network?.length === 0 && /nosuchpackageanywhere/.test(d.error ?? '') && !asked.some(p => p.includes('nosuchpackageanywhere')), { ...d, asked: asked.filter(p => p.startsWith('/t/')) })
const e = await compile(5, doc(), 'xelatex')
check('a XeLaTeX compile after a pdfLaTeX-only init: BusyTeX comes up again with its part', e.ok, e)
const f = await compile(6, doc())
check('…and pdfLaTeX still compiles', f.ok, f)

await context.close()
rmSync(profile, { recursive: true, force: true })
server.close()
console.log(failed ? `${failed} FAILED` : 'PASS')
process.exit(failed ? 1 : 0)
