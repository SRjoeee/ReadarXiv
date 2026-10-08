// The PDF reader's browser checks, on a paper of our own and with no network (Stage 5, Task 6). The paper is the repository's
// sample (tests/fixtures/pdf/sample-1/): `https://arxiv.org/pdf/2600.00001` is answered with its stand-in PDF, and the layer
// API's hosts with the stand-in of the layer API (lib/layer-api.mjs) serving its bundle. One route table answers every
// request of the browser, the extension's service worker's included, and guards the run: a request to a host or a path it
// names no answer for is refused and fails the run (lib/route-table.mjs). The browser's resolver is a second wall: no name
// but the loopback resolves. Translation, where a check asks for it, comes from a local echo endpoint (lib/echo-endpoint.mjs).
//
// Each check has a positive control: the same assertion, run where its target is removed, must fail (a `control:` line, or
// a check that is false before the change it is about and true after it). A check that cannot fail checks nothing.
//
// What it holds today, on the reader that ships (the experiment's, which frames the TeX page for a translated view):
//   - the guard and the stand-in on its hosts, in a real browser;
//   - entries: the PDF page opens the reader on the sample, and so do its floating button's panel and the popup;
//   - viewer faults, those that need no translated view: the original display finishes loading, a link out of the paper
//     opens in a new tab, and a PDF that cannot be fetched (an error, nothing, a page that is no PDF) says so and mends;
//   - reader settings: the display and the sync follow the extension's settings and are written back.
// To come with the layer reader (Tasks 7 to 12): the reader's states on the layer (preparing, drawn, a unit lit, a
// refusal), the faults of the layer API (refused, none, 5xx, nothing, which the stand-in already answers) and the
// reading place kept between displays. The shipped reader's translated displays, which need the TeX page, are not checked.
//
// Usage: pnpm build && pnpm e2e:reader     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readBundle, VTAG } from '../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { layerApi, mode } from './lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-reader`
const SHOTS = `${HERE}.shots`

// ---- the paper, and the stand-in of the layer API over it
const api = layerApi()
const { sample } = api
const PAPER = sample.id
const TITLE = 'Counting Lattice Paths Around Blocked Cells'
const bundle = readBundle(sample.bundle)
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="${TITLE}">`
/** the hosts of the layer API: production's, and staging's where the build names it (the extension's page for the website) */
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const LINK = 'https://example.invalid/sample-1'
/** the panel's and the popup's two entries, by their words in either interface language */
const ENTRY = { html: /Translate HTML|HTML 翻译/, pdf: /Translate PDF|PDF 翻译/ }

// ---- reporting
const results = []
const notes = []
let current = ''
const section = name => { current = name; console.log(`\n# ${name}`) }
const check = (name, ok, detail = '') => {
  results.push({ section: current, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
/** a positive control: `result` is the check's assertion run where its target is removed, and it must say it fails */
const control = (name, result) => check(`control: ${name}`, !result.ok, result.detail)
const note = text => { notes.push(text); console.log(`NOTE ${text}`) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// ---- the network: one table, which is also the guard
/** which stand-in PDF answer arXiv's PDF address gives: ok, or one of the faults a section sets */
let pdfAnswer = 'ok'
const asked = { arxiv: [], tex: [] }
/** routes left unanswered for good (a document or a PDF that never comes), aborted when the run ends */
const held = []
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  asked.arxiv.push(`${route.request().method()} /${m[1]}`)
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  // (the sample has neither an HTML version nor a source: an answer arXiv gives for a paper it has none of)
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  switch (pdfAnswer) {
    case 'ok': return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf) })
    case 'not found': return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    case 'unavailable': return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' })
    case 'not a PDF': return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>This is no PDF</p>' })
    case 'cut short': return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf.subarray(0, 5000)) })
    case 'reset': return route.abort('connectionreset')
    default: throw new Error(`no such answer: ${pdfAnswer}`)
  }
}
/** the link out of the paper, and a document that never loads */
const outside = (route, url) => {
  if (url.pathname === '/sample-1') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>the link</title><p>a page outside the paper</p>' })
  if (url.pathname === '/never') { held.push(route); return undefined }
  return false
}
/** The TeX page. The shipped reader frames the production page for its translated displays, and a later change removes that
 *  (the layer reader draws without it): until then it is named here and answered with a refusal, so that a request to it is
 *  neither the network's nor a violation, and is counted: the displays checked here are expected to ask it nothing */
const tex = route => { asked.tex.push(route.request().url()); return route.fulfill({ status: 503, contentType: 'text/plain', body: 'no TeX page in this run' }) }

const echo = await startEchoEndpoint()
rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
// (a copy of the build with the loopback and the layer API's hosts granted, which Chrome would ask the reader for in a prompt Playwright cannot click)
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
const { context, worker, id, readerUrl } = await launchWithReader({
  profile: 'reader-checks', extension: EXT, headless: !process.env.AXT_HEADED, viewport: { width: 1440, height: 900 }, args: [RESOLVER_WALL],
})
const guard = await routeTable(context, [
  ['https://arxiv.org', arxiv],
  ['https://example.invalid', outside],
  ['https://tex.readarxiv.org', tex],
  [echo.origin, route => route.continue()],
  ...LAYER_HOSTS.map(host => [host, (route, url) => (url.pathname.startsWith('/api/v1/') ? api.route(route) : false)]),
])
console.log(`route table: ${guard.hosts.join(', ')}`)
console.log(`echo endpoint at ${echo.baseURL}; the layer API's bundle key ${VTAG}`)
// (the extension writes its default settings when its worker first runs: the echo service is added to them once they are there)
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config))); tries++) await sleep(200)
// (a service's id is `svc-` and eight of [a-z0-9], or the stored settings cannot be read and the extension runs on its defaults)
await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })

const pageErrors = []
const track = page => { page.on('pageerror', e => pageErrors.push(e.message)); return page }
const extensionPage = async () => { const page = track(await context.newPage()); await page.goto(`chrome-extension://${id}/options.html`); return page }
const readerState = page => page.evaluate(() => window.__reader.controller.getState())
/** a reader page of its own, on the sample (the reader's address, as the PDF page frames it) */
async function openReader(query = {}) {
  const page = track(await context.newPage())
  await page.goto(readerUrl({ live: '1', paper: PAPER, ...query }))
  return page
}
/** the paper's pages counted on the left, and the extension's settings read: the reader has opened the paper */
const paperOpened = (page, timeout = 30_000) => page.waitForFunction(() => { const s = window.__reader?.controller?.getState(); return !!s?.settings && s.sides.left.pages > 0 }, null, { timeout }).then(() => true, () => false)
/** a change of the extension's settings written where the extension keeps them (the worker's storage) */
const setConfig = change => worker.evaluate(async change => {
  const { config } = await chrome.storage.local.get('config')
  const next = { ...config }
  for (const [k, v] of Object.entries(change)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...config[k], ...v } : v
  await chrome.storage.local.set({ config: next })
}, change)

try {
  // ------------------------------------------------------------------------------------------------------- the guard
  section('the guard: what the route table does not name never leaves')
  {
    const page = await extensionPage()
    const settle = fetchOf => fetchOf.then(() => 'answered', e => `refused: ${String(e.message).slice(0, 40)}`)
    const fromPage = await settle(page.evaluate(() => fetch('https://not-in-the-table.invalid/from-a-page')))
    const fromWorker = await settle(worker.evaluate(() => fetch('https://not-in-the-table.invalid/from-the-worker')))
    // a host the table names, a path its handler names no answer for (another paper than the sample)
    const otherPath = await settle(page.evaluate(() => fetch('https://arxiv.org/pdf/1706.03762')))
    const seen = guard.violations.splice(0)
    const refused = answer => answer.startsWith('refused')
    check('a request to a host the table does not name, or to a path it has no answer for, is refused, from a page and from the extension\'s service worker, and recorded with who asked',
      [fromPage, fromWorker, otherPath].every(refused) && seen.length === 3 && seen.some(v => v.from.includes('service worker')),
      `${seen.length} recorded (${seen.map(v => `${v.method} ${new URL(v.url).host}${new URL(v.url).pathname} from ${v.from}`).join('; ')})`)
    control('the run\'s last check, that no request left the route table, fails once one has: it holds nothing while a request is on the list', { ok: seen.length === 0, detail: `${seen.length} on the list` })
    // the last checks' other two targets, each put there once: an error thrown in a page, and a request to the TeX page
    await page.evaluate(() => { setTimeout(() => { throw new Error('thrown on purpose by the control') }, 0) })
    await page.evaluate(() => fetch('https://tex.readarxiv.org/control').catch(() => undefined))
    await sleep(300)
    const thrown = pageErrors.splice(0), texAsked = asked.tex.splice(0)
    control('the last checks that no page threw and that the TeX page was not asked fail once one has: an error thrown on purpose and a request to it are on their lists', { ok: thrown.length === 0 && texAsked.length === 0, detail: `${thrown.length} error(s), ${texAsked.length} request(s) to the TeX page; the table refused it, not the network (${guard.violations.length} violations)` })
    await page.close()
  }

  // ------------------------------------------------------------------------------------- the stand-in, in a real browser
  section('the stand-in of the layer API, on its hosts')
  {
    // a page of another origin (the stand-in abstract page of arXiv) reads the public GETs by CORS alone; the extension page, with the hosts granted, makes the POST
    const other = track(await context.newPage())
    await other.goto(`https://arxiv.org/abs/${PAPER}`)
    const ext = await extensionPage()
    const bundleOn = async (host, vtag = VTAG) => {
      const got = await other.evaluate(async url => {
        const r = await fetch(url).catch(e => ({ failed: String(e.message) }))
        return r.failed ? r : { status: r.status, cache: r.headers.get('cache-control'), text: await r.text() }
      }, `${host}/api/v1/layer/${PAPER}v${sample.version}/${vtag}`)
      if (got.failed) return { ok: false, detail: got.failed }
      let paper = null
      try { paper = got.status === 200 ? readBundle(got.text).paper : null } catch (e) { return { ok: false, detail: `a bundle the engine refuses: ${e.message}` } }
      return { ok: got.status === 200 && paper?.id === PAPER && /immutable/.test(got.cache ?? ''), detail: `${host} ${got.status}${paper ? `, paper ${paper.id}v${paper.version}, ${got.text.length} characters` : ''}` }
    }
    for (const host of LAYER_HOSTS) {
      const r = await bundleOn(host)
      check(`the bundle is read from ${new URL(host).host} by a page of another origin, and the engine accepts it`, r.ok, r.detail)
    }
    control('another version tag is not served (a GET of one the stand-in does not hold)', await bundleOn(LAYER_HOSTS[0], 'b0-j0-p0-l0-r0'))

    const prepareOn = (contentType, host = LAYER_HOSTS[0]) => ext.evaluate(async ({ url, contentType }) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body: '{}' })
      return { status: r.status, body: await r.text() }
    }, { url: `${host}/api/v1/layer/${PAPER}v${sample.version}/${VTAG}/prepare`, contentType })
    const json = await prepareOn('application/json')
    check('a prepare as application/json with {} is answered { ready: true }', json.status === 200 && JSON.parse(json.body).ready === true, `${json.status} ${json.body}`)
    const plain = await prepareOn('text/plain')
    control('a prepare that is not application/json is refused (415)', { ok: plain.status === 200, detail: `${plain.status} ${plain.body}` })

    const fetched = await ext.evaluate(async ({ pdf, original }) => {
      const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('')
      const take = async url => { const r = await fetch(url); return { status: r.status, type: r.headers.get('content-type'), sha: await hex(await r.arrayBuffer()) } }
      const part = await fetch(original, { headers: { Range: 'bytes=0-4' } })
      return { whole: await take(original), arxivs: await take(pdf), range: { status: part.status, text: await part.text(), of: part.headers.get('content-range') } }
    }, { pdf: `https://arxiv.org/pdf/${PAPER}`, original: `${LAYER_HOSTS[0]}${bundle.base.url}` })
    check('the original the layer API serves is the PDF arXiv serves, and the bundle fingerprints it', fetched.whole.sha === fetched.arxivs.sha && fetched.whole.sha === bundle.base.sha256 && fetched.whole.type === 'application/pdf',
      `${fetched.whole.sha.slice(0, 12)} and ${fetched.arxivs.sha.slice(0, 12)}; the bundle says ${bundle.base.sha256.slice(0, 12)}`)
    control('a part of the original does not carry the bundle\'s fingerprint', { ok: sha256(new TextEncoder().encode(fetched.range.text)) === bundle.base.sha256, detail: `the first five bytes: ${fetched.range.status} ${fetched.range.of}` })
    control('a request with no Range header is not answered as a range', { ok: fetched.whole.status === 206, detail: `status ${fetched.whole.status}` })
    check('a range of the original is answered as one', fetched.range.status === 206 && fetched.range.text === '%PDF-' && fetched.range.of === `bytes 0-4/${sample.pdf.length}`, `${fetched.range.status} ${fetched.range.of}`)

    // each answer the stand-in can be told to give, as the page meets it
    const asPage = url => ext.evaluate(async url => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(1500) })
        const body = await r.text()
        let why = null
        try { why = JSON.parse(body).why ?? null } catch { /* not JSON */ }
        return `${r.status}${why ? ` ${why}` : ''}`
      } catch (e) { return e.name === 'TimeoutError' ? 'no answer' : 'reset' }
    }, url)
    const layerUrl = `${LAYER_HOSTS[0]}/api/v1/layer/${PAPER}v${sample.version}/${VTAG}`
    const met = {}
    for (const [name, m] of Object.entries({ ready: mode.ready(), refused: mode.refused(), none: mode.none('no-source'), error: mode.error(503), reset: mode.reset(), hang: mode.hang() })) {
      api.set({ layer: m })
      met[name] = await asPage(layerUrl)
    }
    api.set({ layer: mode.preparing(1200, { begun: false }) })
    met.cold = await asPage(layerUrl)
    await ext.evaluate(url => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.status), `${layerUrl}/prepare`)
    met.preparing = await asPage(layerUrl)
    await sleep(1400)
    met.prepared = await asPage(layerUrl)
    await api.release()
    api.set({ layer: mode.ready() })
    const expected = { ready: '200', refused: '429', none: '404 no-source', error: '503 unavailable', reset: 'reset', hang: 'no answer', cold: '404 not-prepared', preparing: '202', prepared: '200' }
    const wrong = Object.entries(expected).filter(([k, v]) => met[k] !== v)
    check('each answer the stand-in is told to give reaches the page as itself: refused, none, a server error, a reset, no answer, a preparation from cold to ready', wrong.length === 0, wrong.length ? wrong.map(([k, v]) => `${k}: ${met[k]}, not ${v}`).join('; ') : JSON.stringify(met))
    control('a ready layer is not a reset one (the check tells the answers apart)', { ok: met.ready === met.reset, detail: `${met.ready} and ${met.reset}` })
    await other.close()
    await ext.close()
  }

  // ----------------------------------------------------------------------------------------------------------- entries
  section('entries: the PDF page, its button and the popup open the reader on the sample')
  {
    /** the reader over the PDF page, with the sample opened in it: its frame, the pages it counted, the paper it names */
    const readerOver = async (page, wait = 20_000) => {
      const frame = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: wait }).catch(() => null)
      if (!frame) return { ok: false, detail: 'no reader over the page' }
      const reader = await frame.contentFrame()
      const pages = await reader.waitForFunction(() => window.__reader?.controller?.getState().sides.left.pages, null, { timeout: 30_000 }).then(h => h.jsonValue(), () => 0)
      // (the title comes after the pages: the abstract page's, which the sample's PDF has none of its own to give)
      await reader.waitForFunction(() => window.__reader?.controller?.getState().paper.title, null, { timeout: 10_000 }).catch(() => undefined)
      const s = pages ? await reader.evaluate(() => { const s = window.__reader.controller.getState(); return { id: s.paper.id, title: s.paper.title, display: s.display } }) : { id: null, title: '', display: null }
      const src = ((await frame.getAttribute('src')) ?? '').replace(/^chrome-extension:\/\/[a-z]+\//, '')
      return { ok: pages === bundle.paper.pages && s.id === PAPER && s.title === TITLE, detail: `${src}; ${pages} pages, paper ${s.id} “${s.title}”, display ${s.display}` }
    }
    const leave = async page => {
      const reader = await (await page.$('iframe[data-axt-pdf-reader]'))?.contentFrame()
      await reader?.locator('button[data-leave]').click()
      return page.waitForFunction(() => !document.querySelector('iframe[data-axt-pdf-reader]'), null, { timeout: 10_000 }).then(() => true, () => false)
    }
    const sources = { html: ENTRY.html.source, pdf: ENTRY.pdf.source }
    const panelEntries = frame => frame.evaluate(({ html, pdf }) => [...document.querySelectorAll('button')].filter(b => new RegExp(`${html}|${pdf}`).test(b.textContent ?? '')).map(b => ({ text: b.textContent?.trim(), disabled: b.getAttribute('aria-disabled') === 'true' })), sources)
    const pressEntry = (frame, which) => frame.evaluate(({ which, sources }) => [...document.querySelectorAll('button')].find(b => new RegExp(sources[which]).test(b.textContent ?? ''))?.click(), { which, sources })

    const page = track(await context.newPage())
    await page.goto(`https://arxiv.org/pdf/${PAPER}`)
    const first = await readerOver(page)
    check('the PDF page opens in the reader, and the reader opens the sample', first.ok, first.detail)
    await page.screenshot({ path: `${SHOTS}/reader-entry.png` })

    // the reader off: the same assertion, where its target is removed
    await setConfig({ pdfReader: { enabled: false } })
    const off = track(await context.newPage())
    await off.goto(`https://arxiv.org/pdf/${PAPER}`)
    await sleep(2500)
    const offButton = await off.evaluate(() => document.querySelectorAll('.axt-floating').length)
    control('the reader off in the settings, the PDF page does not open it (the browser\'s viewer and the floating button instead)', { ...(await readerOver(off, 2000)), detail: `${offButton} floating button` })
    await off.close()
    await setConfig({ pdfReader: { enabled: true } })

    const over = await page.evaluate(() => ({ framed: !!document.querySelector('iframe[data-axt-pdf-reader]'), buttons: document.querySelectorAll('.axt-floating').length }))
    control('with the reader still over the page, it has not been left: the reader is there and the button is not', { ok: !over.framed && over.buttons === 1, detail: JSON.stringify(over) })
    const left = await leave(page)
    await sleep(2500)
    const buttons = await page.evaluate(() => document.querySelectorAll('.axt-floating').length)
    check('the reader\'s way back takes it off the page, and the floating button is there', left && buttons === 1, `reader gone ${left}, ${buttons} floating button`)
    control('the reader is not over the page once it has been left (what the next two checks start from)', await readerOver(page, 1500))

    // the button's panel, and its PDF entry
    const target = await page.evaluate(() => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
    await page.mouse.click(target.x, target.y)
    await sleep(2500)
    const panel = page.frames().find(f => f.url().includes('/popup.html'))
    const entries = panel ? await panelEntries(panel) : []
    const [html, pdf] = [entries.find(e => /HTML/.test(e.text)), entries.find(e => /PDF/.test(e.text))]
    check('the button\'s panel offers both entries: the PDF one for the sample, the HTML one greyed (it has no HTML page)', !!pdf && !pdf.disabled && !!html && html.disabled, JSON.stringify(entries))
    await pressEntry(panel, 'pdf')
    const viaPanel = await readerOver(page)
    check('the panel\'s PDF entry opens the reader on the sample, asking for a translation', viaPanel.ok && /ask=translate/.test(viaPanel.detail), viaPanel.detail)
    const elsewhere = await extensionPage()
    const noEntries = await panelEntries(elsewhere)
    control('a page of the extension that is no panel offers no such entries', { ok: noEntries.length === 2, detail: `${noEntries.length} entries on the settings page` })
    await elsewhere.close()

    // the popup, on the same page
    await leave(page)
    await sleep(1500)
    const popup = track(await context.newPage())
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await page.bringToFront()
    await sleep(2500)
    const popupEntries = await panelEntries(popup)
    check('the popup on the PDF page offers the same two entries', popupEntries.length === 2 && popupEntries.some(e => /PDF/.test(e.text) && !e.disabled), JSON.stringify(popupEntries))
    await pressEntry(popup, 'pdf')
    const viaPopup = await readerOver(page)
    const tabs = context.pages().filter(p => /arxiv\.org\/pdf\//.test(p.url())).length
    check('the popup\'s PDF entry opens the reader on the sample, over this page, and no second tab of the paper', viaPopup.ok && /ask=translate/.test(viaPopup.detail) && tabs === 1, `${viaPopup.detail}; ${tabs} tab(s) of the paper`)
    if (!popup.isClosed()) await popup.close()
    await page.close()
  }

  // ---------------------------------------------------------------------------------------------------- viewer faults
  section('viewer faults, those that need no translated view')
  {
    // the original display finishes loading though nothing is translated, and a frame of it fires `load`
    const loadsOf = async (url, timeout = 15_000) => {
      const page = track(await context.newPage())
      try {
        await page.goto(url, { waitUntil: 'commit', timeout }).catch(() => undefined)
        // (a document that never came leaves the page on its first blank one, which is complete)
        if (!page.url().startsWith(url.split('?')[0])) return { ok: false, detail: `the document never came: ${page.url()}` }
        const complete = await page.waitForFunction(() => document.readyState === 'complete', null, { timeout }).then(() => true, () => false)
        return { ok: complete, detail: await page.evaluate(() => document.readyState).catch(() => 'no document') }
      } finally { await page.close() }
    }
    const framedLoadOf = async (frameUrl, timeout = 15_000) => {
      const host = await extensionPage()
      try {
        const loaded = await host.evaluate(({ url, timeout }) => new Promise(resolve => {
          const f = Object.assign(document.createElement('iframe'), { src: url })
          const timer = setTimeout(() => resolve(false), timeout)
          f.onload = () => { clearTimeout(timer); resolve(true) }
          document.body.append(f)
        }), { url: frameUrl, timeout })
        return { ok: loaded, detail: loaded ? 'load fired' : 'no load' }
      } finally { await host.close() }
    }
    const original = readerUrl({ live: '1', paper: PAPER, mode: 'original' })
    const loaded = await loadsOf(original)
    check('the original display finishes loading though nothing is translated', loaded.ok, loaded.detail)
    const framed = await framedLoadOf(original)
    check('framed by an extension page, as arXiv\'s PDF page frames it, its frame fires load', framed.ok, framed.detail)
    const never = [await loadsOf('https://example.invalid/never', 2500), await framedLoadOf('https://example.invalid/never', 2500)]
    control('a document that never comes does not finish loading, nor does its frame fire load', { ok: never.some(r => r.ok), detail: never.map(r => r.detail).join('; ') })

    // a link out of the paper opens in a new tab, not in the reader's own frame (which, over arXiv's page, is the reader)
    const reader = await openReader({ mode: 'original' })
    await paperOpened(reader)
    await reader.evaluate(() => window.__reader.controller.goToPage('left', 4))
    const anchor = reader.locator('.annotationLayer a[href^="http"]')
    const link = await anchor.first().waitFor({ timeout: 10_000 }).then(() => anchor.first().evaluate(a => ({ href: a.href, target: a.target })), () => null)
    check('a link out of the paper is set to open in a new tab', link?.target === '_blank' && link.href === LINK, JSON.stringify(link))
    const opened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await anchor.first().click()
    const tab = await opened
    await tab?.waitForLoadState('load').catch(() => undefined)
    check('and a click on it opens the page in a new tab, the reader staying where it is', tab?.url() === LINK && reader.url().includes('pdf-reader.html'), `opened ${tab?.url() ?? 'nothing'}`)
    await tab?.close()
    await reader.evaluate(() => { for (const a of document.querySelectorAll('.annotationLayer a[href^="http"]')) a.remove() })
    control('with the link taken off the page there is none to open in a new tab', { ok: (await anchor.count()) > 0, detail: 'the annotation layer, the link removed' })
    await reader.close()

    // a PDF that cannot be fetched says so, in the display it was opened in, and mends when the PDF comes
    const failedWith = async (answer, display) => {
      pdfAnswer = answer
      const page = await openReader({ mode: display })
      await sleep(3500)
      const result = { page, state: await readerState(page), visible: await page.locator('div.card[data-card]').isVisible() }
      pdfAnswer = 'ok'
      return result
    }
    const says = r => ({ ok: r.state.phase === 'failed' && r.state.failure === 'network' && r.state.sides.left.pages === 0, detail: `phase ${r.state.phase}, failure ${r.state.failure}, ${r.state.sides.left.pages} pages, card ${r.visible ? 'shown' : 'not shown'}` })
    for (const answer of ['not found', 'unavailable', 'not a PDF', 'cut short', 'reset']) {
      const r = await failedWith(answer, 'bilingual')
      const said = says(r)
      check(`the PDF answered “${answer}”: the reader says the network failed, shows its card, and keeps the display`, said.ok && r.visible && r.state.display === 'bilingual', said.detail)
      const before = await paperOpened(r.page, 200)
      await r.page.locator('div.card[data-card] button').click()
      const mended = await paperOpened(r.page, 15_000)
      check('… and the card\'s button asks again, now that the PDF is there: the sample opens (it was not open before)', !before && mended, `${(await readerState(r.page)).sides.left.pages} pages`)
      await r.page.close()
    }
    const fine = await openReader({ mode: 'bilingual' })
    await paperOpened(fine)
    control('a PDF that is there raises no such failure: the same assertion, on the sample opened', says({ state: await readerState(fine), visible: await fine.locator('div.card[data-card]').isVisible() }))
    await fine.close()

    // the original display: the same failure in its state, and the same mending — but its card sits in the translation's pane, which that display hides
    const gone = await failedWith('unavailable', 'original')
    const goneSays = says(gone)
    const goneBefore = await paperOpened(gone.page, 200)
    await gone.page.evaluate(() => window.__reader.controller.retry())
    check('in the original display the reader says the same in its state, and the retry mends it (the sample was not open before)', goneSays.ok && !goneBefore && (await paperOpened(gone.page, 15_000)), goneSays.detail)
    if (!gone.visible) note('the original display shows nothing of a PDF that could not be fetched: its failure card is in the translation\'s pane, which that display hides (the pane stays blank, with the toolbar); the other displays show it')
    await gone.page.close()
  }

  // ----------------------------------------------------------------------------------------------------- reader settings
  section('reader settings: the display and the sync follow the extension\'s settings and are written back')
  {
    const settle = page => page.waitForTimeout(700)
    const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
      const out = { ...c }
      for (const [k, v] of Object.entries(p)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
      return out
    }), change)
    const open = async (query = {}) => { const page = await openReader(query); await paperOpened(page); return page }
    const display = async page => (await readerState(page)).display
    const chosen = async (page, shown) => { await page.evaluate(d => window.__reader.controller.setDisplay(d), shown); await settle(page) }
    /** a check that is its own control: `read` says the target is not there before `change`, and is there after it */
    const becomes = async (name, read, expected, change, page) => {
      const before = await read()
      await change()
      await settle(page)
      const after = await read()
      check(name, !Object.is(before, expected) && Object.is(after, expected), `${JSON.stringify(before)}, then ${JSON.stringify(after)}`)
      return { before, after }
    }

    // the display the settings ask for is the one a reader opens in
    const a = await open()
    const first = await becomes('a change of the settings moves the display', () => display(a), 'translation', () => patch(a, { mode: 'only', pdfReader: { original: false } }), a)
    const b = await open()
    check('a reader opens in the display the settings ask for (the one opened before the change was in another)', (await display(b)) === 'translation' && first.before !== 'translation', `${await display(b)}; before the change: ${first.before}`)

    // a display chosen in the reader is written back; the other tab follows and writes nothing
    const followedBefore = await display(a)
    const modeBefore = (await readerState(b)).settings.mode
    await chosen(b, 'bilingual')
    const written = (await readerState(b)).settings
    check('choosing side by side writes the side mode', modeBefore !== 'side' && written.mode === 'side' && written.pdfReader.original === false, `${modeBefore}, then ${written.mode}, original ${written.pdfReader.original}`)
    await settle(a)
    check('another reader follows it (it was not on side by side before)', followedBefore !== 'bilingual' && (await display(a)) === 'bilingual', `${followedBefore}, then ${await display(a)}`)
    await chosen(b, 'original')
    const orig = (await readerState(b)).settings
    check('choosing the original marks it and keeps the mode', written.pdfReader.original === false && orig.pdfReader.original === true && orig.mode === 'side', `original ${written.pdfReader.original}, then ${orig.pdfReader.original}; ${orig.mode}`)
    await becomes('stacked shows side by side', () => display(b), 'bilingual', () => patch(b, { mode: 'stack', pdfReader: { original: false } }), b)
    await patch(b, { mode: 'stack', pdfReader: { original: true } })
    await settle(b)
    const keptBefore = (await readerState(b)).settings
    await chosen(b, 'bilingual')
    const kept = (await readerState(b)).settings
    check('side by side chosen with stacked stored keeps stacked, and lets the original go', keptBefore.pdfReader.original === true && kept.mode === 'stack' && !kept.pdfReader.original, `original ${keptBefore.pdfReader.original}, then ${kept.pdfReader.original}; ${kept.mode}`)

    // the sync follows its setting, and the reader's switch writes it
    await becomes('the sync goes off with its setting', async () => (await readerState(b)).sync, false, () => patch(b, { pdfReader: { sync: false } }), b)
    const syncBefore = await readerState(b)
    await b.evaluate(() => window.__reader.controller.setSync(true))
    await settle(b)
    const synced = await readerState(b)
    check('the reader\'s switch writes the sync back, and the sides scroll together again', syncBefore.settings.pdfReader.sync === false && syncBefore.sync === false && synced.settings.pdfReader.sync === true && synced.sync === true, `setting ${syncBefore.settings.pdfReader.sync}, then ${synced.settings.pdfReader.sync}; applied ${syncBefore.sync}, then ${synced.sync}`)

    // an address that names a display writes nothing, and holds it whatever the settings say
    const stored = (await readerState(b)).settings.pdfReader.original
    const c = await open({ mode: 'original' })
    await settle(c)
    const afterAddress = (await readerState(c)).settings.pdfReader.original
    check('an address that names a display writes nothing', afterAddress === stored, `stored ${stored}, now ${afterAddress}`)
    control('the same assertion where the display was chosen in the reader and not named by an address: the setting was written', { ok: orig.pdfReader.original === written.pdfReader.original, detail: `original ${written.pdfReader.original}, then ${orig.pdfReader.original}` })
    await patch(c, { mode: 'only', pdfReader: { original: false } })
    await settle(c)
    check('and holds it whatever the settings say', (await display(c)) === 'original', await display(c))
    control('a reader that holds its display does not follow the settings (the check that another reader follows, run on it)', { ok: (await display(c)) === 'translation', detail: `${await display(c)} while the settings say translation` })

    // a change of something the reader does not show leaves the display and the sync as they are
    await chosen(b, 'translation')
    const shownBefore = await display(b)
    await patch(a, { reading: { openIn: 'same-tab' } })
    await settle(b)
    check('a change of nothing it shows leaves the display', shownBefore === 'translation' && (await display(b)) === 'translation', await display(b))
    control('a change of something it does show moves it (the first check of this section)', { ok: first.before === first.after, detail: `${first.before}, then ${first.after}` })

    // settings the extension cannot read: a refused write says so, what the reader chose holds, nothing is thrown
    const stored0 = await b.evaluate(() => chrome.storage.local.get('config').then(r => r.config))
    const errors = []
    b.on('pageerror', e => errors.push(e.message))
    const unreadableBefore = (await readerState(b)).settingsUnreadable
    const displayBefore = await display(b)
    await b.evaluate(c0 => chrome.storage.local.set({ config: { ...c0, mode: 'nonsense' } }), stored0)
    await settle(b)
    await chosen(b, 'original')
    const after = await readerState(b)
    check('unreadable settings: a refused write says so, and it was not so before', unreadableBefore === false && after.settingsUnreadable === true, `before ${unreadableBefore}, after ${after.settingsUnreadable}`)
    check('unreadable settings: the display chosen holds', displayBefore !== 'original' && after.display === 'original', `${displayBefore}, then ${after.display}`)
    check('unreadable settings: nothing thrown', errors.length === 0, errors.join('; '))
    const d = await open()
    check('unreadable settings: a reader opened on them knows at once', (await readerState(d)).settingsUnreadable === true)
    control('a reader that was open before, and has written nothing, does not know it yet', { ok: (await readerState(a)).settingsUnreadable === true, detail: `settingsUnreadable ${(await readerState(a)).settingsUnreadable}` })
    await d.close()
    await b.evaluate(c0 => chrome.storage.local.set({ config: c0 }), stored0)
    await settle(b)
    const repaired = await readerState(b)
    check('repaired settings are known (they were not before)', after.settingsUnreadable === true && repaired.settingsUnreadable === false, `${after.settingsUnreadable}, then ${repaired.settingsUnreadable}`)

    // asked to translate (#readarxiv on the PDF address, passed as ask=translate; the reader's design, §2): the original
    // left on is let go, and the reader opens in the translated display the mode names
    await patch(b, { mode: 'only', pdfReader: { original: true } })
    await settle(b)
    const plainPage = await open()
    const plain = await readerState(plainPage)
    await plainPage.close()
    const e = await open({ ask: 'translate' })
    await settle(e)
    const asked1 = await readerState(e)
    check('asked to translate: the translated display the mode names, the original let go', asked1.display === 'translation' && asked1.settings.pdfReader.original === false, `${asked1.display}, original ${asked1.settings.pdfReader.original}`)
    control('a reader that is not asked to translate opens in the original the settings leave on', { ok: plain.display === 'translation', detail: `${plain.display}, original ${plain.settings.pdfReader.original}` })
    for (const page of [a, b, c, e]) await page.close()
  }

  // ----------------------------------------------------------------------------------------------------- what nothing did
  section('what the run did not do')
  await api.release()
  for (const route of held) await route.abort('timedout').catch(() => undefined)
  check('no request left the route table', guard.violations.length === 0, guard.violations.length ? guard.violations.map(v => `${v.method} ${v.url} from ${v.from}`).join('; ') : `${guard.hosts.length} origins named, none else asked`)
  check('no page of the reader or of the extension threw', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  check('the TeX page was not asked for anything: no display checked here is one it types', asked.tex.length === 0, asked.tex.join(', ') || 'none asked')
  note(`the echo endpoint was asked ${echo.seen.post} time(s) (nothing translates yet: no translated view is checked here)`)
} finally {
  await context.close().catch(() => undefined)
  await echo.close()
}

const pass = results.filter(r => r.ok).length
const controls = results.filter(r => r.name.startsWith('control: ')).length
console.log(`\n${pass}/${results.length} passed (${controls} controls), ${notes.length} note(s); screenshots in ${SHOTS}`)
for (const r of results.filter(x => !x.ok)) console.log(`FAILED [${r.section}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
process.exit(pass === results.length ? 0 : 1)
