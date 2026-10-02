// Another extension cannot plant files in the TeX page's cache (the warm-up review's I1), in Chromium with storage
// partitioning on, against the built site (out/tex-site) served on this machine under the real names. Two probe
// extensions, both allowed to drive a build that names no framers (as the live one), frame the page inside arXiv pages,
// which share one partition (the review's xext-probe):
//   B, over arxiv.org/abs, sends `init` with `store: true` and answers the page's `want` with its own bytes at the
//      lengths build.json gives — every file a pdfLaTeX visit in Chinese fetches ahead but the index;
//   A, over arxiv.org/pdf, as the reader does: `init` with `store: true`, nothing handed, then a compile.
// The page must refuse B's bytes (their SHA-256 is not build.json's) and download the files itself; A's page then finds
// the build's files in the cache it shares with B's, and starts and compiles. Before build.json carried the hashes, B's
// bytes were kept and A's page ran them: its BusyTeX did not start.
//   node experiments/pdf-bilingual/tex-page/xext-check.mjs      (after tex-page/build.mjs)
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { certificateSpki, serveTexSite } from './serve.mjs'

const { chromium } = createRequire(new URL('../../../', import.meta.url).pathname)('playwright')
const SITE = new URL('../out/tex-site/', import.meta.url).pathname
const cv = /\/c\/([0-9a-f]+)\/tex\.js/.exec(readFileSync(join(SITE, 'tex.html'), 'utf8'))?.[1]
const build = JSON.parse(readFileSync(join(SITE, 'c', cv, 'build.json'), 'utf8'))
/** what B hands: every file a pdfLaTeX visit with Chinese faces fetches ahead, at the length build.json gives */
const forged = {
  [`${build.engine}busytex.wasm`]: build.wasm,
  ...Object.fromEntries(build.engines.pdflatex.map(p => [`${build.engine}tl-${p}.data`, build.packages[p]])),
  ...Object.fromEntries(['common', 'pdflatex'].filter(b => build.manifest.bundles?.[b]).map(b => [build.manifest.bundles[b].url, build.manifest.bundles[b].size])),
  ...Object.fromEntries((build.manifest.fonts.Hans ?? []).map(([, , path, size]) => [`${build.tree}${path.split('/').map(encodeURIComponent).join('/')}`, size])),
}

const asked = []
const server = await serveTexSite({ tls: true, log: row => asked.push(row.path) })
// arXiv's pages: a stub, which the probes' content scripts frame their pages in
const site = server.listeners('request')
server.removeAllListeners('request')
server.on('request', (req, res) => {
  if ((req.headers[':authority'] ?? req.headers.host ?? '').split(':')[0] === 'arxiv.org') {
    res.setHeader('content-type', 'text/html')
    return res.end('<!doctype html><title>arXiv</title>')
  }
  for (const h of site) h.call(server, req, res)
})
const port = server.address().port

const work = mkdtempSync(join(tmpdir(), 'tex-xext-'))
const TEX = 'https://tex.readarxiv.org'
/** a probe extension: a content script on arXiv pages under `path` frames its page, which frames the TeX page and runs
 *  `script` on what the page says (`page`: its window; `say`: the report, as the arXiv page's title) */
const extension = (name, path, script) => {
  const dir = join(work, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name, version: '1', content_scripts: [{ matches: [`https://arxiv.org/${path}/*`], js: ['content.js'] }], web_accessible_resources: [{ resources: ['frame.html', 'frame.js'], matches: ['https://arxiv.org/*'] }] }))
  writeFileSync(join(dir, 'content.js'), "addEventListener('message', e => { if (e.data?.report) document.title = JSON.stringify(e.data.report) }); const f = document.createElement('iframe'); f.src = chrome.runtime.getURL('frame.html'); document.documentElement.append(f)")
  writeFileSync(join(dir, 'frame.html'), '<!doctype html><body><script src="frame.js"></script></body>')
  writeFileSync(join(dir, 'frame.js'), `const TEX = ${JSON.stringify(TEX)}
const f = document.createElement('iframe'); f.src = TEX + '/tex.html'; document.body.append(f)
const page = (m, t = []) => f.contentWindow.postMessage(m, TEX, t)
const say = report => parent.postMessage({ report }, '*')
addEventListener('message', e => { if (e.source !== f.contentWindow || e.origin !== TEX) return; const m = e.data; ${script} })`)
  return dir
}
const B = extension('B', 'abs', `
  if (m.type === 'ready') page({ type: 'init', protocol: 2, engines: ['pdflatex'], fonts: ['Hans'], store: true })
  if (m.type === 'want') {
    const sizes = ${JSON.stringify(forged)}, files = {}, transfer = []
    for (const url of m.files) if (sizes[url] && m.bytes) { const b = new Uint8Array(sizes[url]).fill(0x5a).buffer; files[url] = b; transfer.push(b) }
    page({ type: 'have', id: m.id, files }, transfer)
  }
  if (m.type === 'init-done') say({ init: m.error ? String(m.error).slice(0, 160) : 'ok' })`)
const A = extension('A', 'pdf', `
  if (m.type === 'ready') page({ type: 'init', protocol: 2, engines: ['pdflatex'], fonts: ['Hans'], store: true })
  if (m.type === 'want') page({ type: 'have', id: m.id, files: {} })
  if (m.type === 'init-done') {
    if (m.error) return say({ init: String(m.error).slice(0, 160) })
    page({ type: 'project', key: 'p', files: [] })
    page({ type: 'compile', id: 1, key: 'p', main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false, overrides: [{ path: 'main.tex', content: new TextEncoder().encode('\\\\documentclass{article}\\\\begin{document}A page, $x^2$.\\\\end{document}\\n') }] })
  }
  if (m.type === 'compiled') say({ init: 'ok', compiled: m.ok })`)

const PLAYWRIGHT_OFF = ['AvoidUnnecessaryBeforeUnloadCheckSync', 'DestroyProfileOnBrowserClose', 'DialMediaRouteProvider', 'GlobalMediaControls', 'HttpsUpgrades', 'LensOverlay', 'MediaRouter', 'PaintHolding', 'BlockOriginHeaderModificationOnRedirect', 'Translate', 'AutoDeElevate', 'OptimizationHints']
const context = await chromium.launchPersistentContext(join(work, 'profile'), {
  channel: 'chromium', headless: true,
  // a later --disable-features replaces Playwright's list, which turns storage partitioning off
  args: [`--disable-features=${PLAYWRIGHT_OFF.join(',')}`, `--ignore-certificate-errors-spki-list=${certificateSpki()}`, `--host-resolver-rules=MAP tex.readarxiv.org 127.0.0.1:${port}, MAP arxiv.org 127.0.0.1:${port}`, `--disable-extensions-except=${A},${B}`, `--load-extension=${A},${B}`],
})
/** a visit's report, or no answer within two minutes: a BusyTeX given another's bytes for its engine never starts */
const visit = async url => {
  const tab = await context.newPage()
  await tab.goto(url)
  const said = await tab.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 120000 }).then(() => true, () => false)
  const report = said ? JSON.parse(await tab.title()) : { init: 'no answer in 120 s' }
  await tab.close()
  return report
}
let failed = 0
const check = (what, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); if (!ok) failed++ }
const ahead = Object.keys(forged)
const fetched = () => ahead.filter(url => asked.includes(decodeURIComponent(url)))

console.log(`c/${cv}: B hands ${ahead.length} files of its own at build.json's lengths (${(Object.values(forged).reduce((n, s) => n + s, 0) / 1e6).toFixed(1)} MB)`)
asked.length = 0
const b = await visit('https://arxiv.org/abs/1')
const byB = fetched()
check('B\'s bytes are refused: the page downloads every file B handed, and its init succeeds', b.init === 'ok' && byB.length === ahead.length, { init: b.init, downloaded: `${byB.length} of ${ahead.length}` })
asked.length = 0
const a = await visit('https://arxiv.org/pdf/1')
const byA = fetched()
check('A\'s page shares B\'s partition: it downloads none of those files again', byA.length === 0, { downloaded: byA.length })
check('A\'s page starts BusyTeX from that cache and compiles', a.init === 'ok' && a.compiled === true, a)

await context.close()
server.close()
rmSync(work, { recursive: true, force: true })
console.log(failed ? `${failed} FAILED` : 'PASS')
process.exit(failed ? 1 : 0)
