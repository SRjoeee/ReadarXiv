// Probe for the TeX page's warm-up (DESIGN §16): which of the TeX page's storage a frame of it shares, framed where the
// extension frames it. Asked of the real browser, storage partitioning on (Playwright turns it off by default: its
// --disable-features list is replaced here), with a probe extension and a probe page on this machine under the real
// names — tex.readarxiv.org and arxiv.org mapped to a local HTTPS server whose certificate the browser trusts by key:
//   offscreen   the page framed by an offscreen document (where the warm-up runs)
//   reader      framed by an extension page open as a tab (the reader standalone)
//   embedded    framed by an extension page that arxiv.org frames (the reader laid over arXiv's PDF page), and embedded2
//               on another arXiv page
//   web         framed by another site, as a control;   top: the page itself, top-level
// Each says the Cache Storage entries it found (each context adds its own), whether an immutable response was served from
// the HTTP cache (the server's serial number repeats) by fetch and by a worker's synchronous XHR (BusyTeX's way), and
// the extension origin's own Cache Storage and Web Locks as the extension page around it sees them.
// Measured 2026-10-02 on Chrome 154, Chromium 153 and 145: offscreen and reader share the page's Cache Storage and HTTP
// cache; embedded shares neither with them (its own, shared by every arXiv page); the extension's own Cache Storage and
// Web Locks are one in every context. A host permission for the page's site changes nothing for embedded.
// Usage: node tests/e2e/probes/tex-partition.mjs [--host-permission]
//        AXT_CHROME=<binary>: another Chromium; a branded Chrome (137+ ignores --load-extension) gets the extension through
//        CDP's Extensions.loadUnpacked
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const exe = process.env.AXT_CHROME ?? null
const branded = !!exe && !/for Testing|Chromium/i.test(exe)
const hostPermission = process.argv.includes('--host-permission')
const work = mkdtempSync(join(tmpdir(), 'tex-partition-'))
const key = join(work, 'key.pem'), cert = join(work, 'cert.pem')
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=tex.readarxiv.org', '-addext', 'subjectAltName=DNS:tex.readarxiv.org,DNS:arxiv.org,DNS:other.example'], { stdio: 'ignore' })
const spki = createHash('sha256').update(execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: execFileSync('openssl', ['x509', '-pubkey', '-noout', '-in', cert]) })).digest('base64')

// ---- the server: the probe page on tex.readarxiv.org, a stub page on arxiv.org, a framing page on other.example
let serial = 0
const PROBE = `(async () => {
  const ctx = new URLSearchParams(location.search).get('ctx'), out = { ctx }
  const c = await caches.open('probe')
  out.entries = (await c.keys()).map(r => new URL(r.url).pathname.slice(4))
  await c.put('/by-' + ctx, new Response(ctx))
  out.http = await (await fetch('/immutable')).text()
  out.xhr = await new Promise(r => { const w = new Worker('/worker.js'); w.onmessage = e => r(e.data) })
  if (parent !== window) parent.postMessage(out, '*'); else document.title = JSON.stringify(out)
})()`
const WORKER = `const x = new XMLHttpRequest(); x.open('GET', '/immutable-xhr', false); x.send(); postMessage(x.responseText)`
const server = createServer({ key: execFileSync('cat', [key]), cert: execFileSync('cat', [cert]) }, (req, res) => {
  const host = req.headers.host?.split(':')[0], path = req.url.split('?')[0]
  if (host === 'tex.readarxiv.org') {
    if (path === '/probe.html') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><script src="/probe.js"></script>')
    if (path === '/probe.js') return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(PROBE)
    if (path === '/worker.js') return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(WORKER)
    if (path.startsWith('/immutable')) return res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' }).end(`#${++serial}`)
  }
  if (host === 'arxiv.org') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>arXiv</title>')
  if (host === 'other.example') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><script>addEventListener("message", e => { document.title = JSON.stringify(e.data) })</script><iframe src="https://tex.readarxiv.org/probe.html?ctx=web"></iframe>')
  res.writeHead(404).end()
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

// ---- the probe extension: an extension page that frames the probe and reports through the background
const ext = join(work, 'ext')
mkdirSync(ext)
writeFileSync(join(ext, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'tex partition probe', version: '1', permissions: ['offscreen', 'storage'],
  ...(hostPermission ? { host_permissions: ['https://tex.readarxiv.org/*'] } : {}),
  background: { service_worker: 'bg.js' },
  content_scripts: [{ matches: ['https://arxiv.org/*'], js: ['content.js'] }],
  web_accessible_resources: [{ resources: ['frame.html'], matches: ['https://arxiv.org/*'] }],
}))
writeFileSync(join(ext, 'bg.js'), `chrome.runtime.onMessage.addListener((m, _s, reply) => { if (m?.probe) chrome.storage.local.set({ [m.probe]: m.data }).then(() => reply(true)); return true })`)
writeFileSync(join(ext, 'content.js'), `const f = document.createElement('iframe'); f.src = chrome.runtime.getURL('frame.html?ctx=' + (new URLSearchParams(location.search).get('ctx') || 'embedded')); document.documentElement.append(f)`)
for (const page of ['frame.html', 'offscreen.html', 'control.html']) writeFileSync(join(ext, page), `<!doctype html><meta charset="utf-8"><body>${page === 'control.html' ? '' : '<script src="frame.js"></script>'}</body>`)
writeFileSync(join(ext, 'frame.js'), `const ctx = new URLSearchParams(location.search).get('ctx') || 'offscreen'
;(async () => {
  if (ctx === 'offscreen') navigator.locks.request('probe-lock', () => new Promise(() => {}))
  const c = await caches.open('ext')
  const own = { entries: (await c.keys()).map(r => new URL(r.url).pathname.slice(1)), locks: (await navigator.locks.query()).held.map(l => l.name) }
  await c.put('https://ext.invalid/' + ctx, new Response(ctx))
  own.http = await (await fetch('https://tex.readarxiv.org/immutable-ext')).text()
  const got = new Promise(r => addEventListener('message', e => { if (e.origin === 'https://tex.readarxiv.org') r(e.data) }))
  const f = document.createElement('iframe')
  f.src = 'https://tex.readarxiv.org/probe.html?ctx=' + ctx
  document.body.append(f)
  await chrome.runtime.sendMessage({ probe: ctx, data: { own, tex: await got } })
})().catch(e => chrome.runtime.sendMessage({ probe: ctx, data: { error: String(e) } }))`)

// ---- the browser, partitioning on
const profile = join(work, 'profile')
mkdirSync(join(profile, 'Default'), { recursive: true })
writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }))
const context = await chromium.launchPersistentContext(profile, {
  ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
  headless: true,
  ...(branded ? { ignoreDefaultArgs: ['--disable-extensions'] } : {}),
  args: ['--disable-features=Translate', `--ignore-certificate-errors-spki-list=${spki}`, `--host-resolver-rules=MAP tex.readarxiv.org 127.0.0.1:${port}, MAP arxiv.org 127.0.0.1:${port}, MAP other.example 127.0.0.1:${port}`,
    ...(branded ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`])],
})
let id
if (branded) id = (await (await context.browser().newBrowserCDPSession()).send('Extensions.loadUnpacked', { path: ext })).id
else id = new URL((context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))).url()).host
const control = await context.newPage()
await control.goto(`chrome-extension://${id}/control.html`)
const answer = async ctx => {
  for (let i = 0; i < 150; i++) {
    const r = await control.evaluate(c => chrome.storage.local.get(c).then(o => o[c]), ctx)
    if (r) return r
    await new Promise(r => setTimeout(r, 100))
  }
  return { error: 'no answer' }
}
const titled = async url => { const p = await context.newPage(); await p.goto(url); await p.waitForFunction(() => document.title.startsWith('{')); return { tex: JSON.parse(await p.title()) } }
const rows = []
await control.evaluate(() => chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['IFRAME_SCRIPTING'], justification: 'probe' }))
rows.push(['offscreen', await answer('offscreen')])
await (await context.newPage()).goto(`chrome-extension://${id}/frame.html?ctx=reader`)
rows.push(['reader', await answer('reader')])
await (await context.newPage()).goto('https://arxiv.org/pdf/2608.02163?ctx=embedded')
rows.push(['embedded', await answer('embedded')])
await (await context.newPage()).goto('https://arxiv.org/abs/2608.18090?ctx=embedded2')
rows.push(['embedded2', await answer('embedded2')])
rows.push(['web', await titled('https://other.example/')])
rows.push(['top', await titled('https://tex.readarxiv.org/probe.html?ctx=top')])
console.log(`${branded ? 'Chrome' : 'Chromium'} ${context.browser()?.version() ?? ''}, partitioning on, host permission for the page's site: ${hostPermission}`)
console.log('context     page: Cache Storage entries found          fetch  xhr  | extension: Cache Storage entries found, locks held, fetch')
for (const [name, r] of rows) {
  if (r.error) { console.log(name.padEnd(11), r.error); continue }
  console.log(name.padEnd(11), `${JSON.stringify(r.tex.entries).padEnd(42)} ${r.tex.http.padEnd(6)} ${r.tex.xhr.padEnd(4)}`, r.own ? `| ${JSON.stringify(r.own.entries)} ${JSON.stringify(r.own.locks)} ${r.own.http}` : '')
}
await context.close()
server.close()
rmSync(work, { recursive: true, force: true })
