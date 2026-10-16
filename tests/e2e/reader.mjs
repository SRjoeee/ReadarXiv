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
// What it holds, on the reader that ships (the reading view on the layer, Stage 5):
//   - the guard and the stand-in on its hosts, in a real browser;
//   - entries: the PDF page opens the reader on the sample, and so do its floating button's panel and the popup;
//   - viewer faults: the original display finishes loading, a link out of the paper opens in a new tab, and a PDF that
//     cannot be fetched (an error, nothing, a page that is no PDF) says so and mends;
//   - reader settings: the display and the sync follow the extension's settings and are written back;
//   - the reading view, its layer held back: the original on both panes, the places at the left's page boxes and what they
//     show, the follower levelling the pair at rest, a zoom, a pinch over the right, a narrow window;
//   - the reader on the layer: the sample cut into BUNDLE 4's objects (lib/layer-cut.mjs), prepared by the stand-in
//     (a GET's 404, the run's prepare, the 202s with the objects made so far, the catalog), its objects fetched by digest,
//     the extension's own translation (the echo endpoint) taken as rows: the pages laid on the right in place, the original
//     until then, the highlight on both panes (the left's part fetched on the first want alone), a figure lit whole, the dark
//     look, the links (named, reached by Tab, followed by Enter on the left's document, out of the paper through the host,
//     axe's link-name, kept through a zoom), the contents and the heading read, the pair level, the window;
//   - the reader's states on the layer: none for the paper, refused, a server error, a reset and its retry, and arXiv's
//     bytes not the layer's base (our copy shown).
//
// Usage: pnpm build && pnpm e2e:reader     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { FACES } from '../../src/pdf-reader/engine/rules/font-roles.mjs'
import { readBundle, VTAG } from '../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import { CTAG4 } from '../../src/pdf-reader/engine/layer-proto/format.mjs'
import { cutSample, sampleFiles } from './lib/layer-cut.mjs'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { layerApi, mode, serves } from './lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-reader`
const SHOTS = `${HERE}.shots`

// ---- the paper, and the stand-in of the layer API over it
/** the sample as BUNDLE 4's objects, which the stand-in serves under CTAG4 beside BUNDLE 3's bundle */
const sampleCut = await cutSample(sampleFiles())
/** a face for the layer's Latin text, of the PDF.js package this tree holds: the stand-in's faces' table serves every face of
 *  the role table as one slice of it (the reader's target German, whose text it holds) */
const LATIN_FACE = readFileSync(fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const PAPER = sample.id
const TITLE = 'Counting Lattice Paths Around Blocked Cells'
const bundle = readBundle(sample.bundle)
// (with its submission history, as arXiv's has: the version the reader asks the layer for, the address naming none)
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="${TITLE}"><div class="submission-history"><strong>[v${sample.version}]</strong></div>`
/** the hosts of the layer API: production's, and staging's where the build names it (the extension's page for the website) */
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const LINK = 'https://example.invalid/sample-1'
/** whether the build holds the reading view: its places' code, in a chunk */
const viewBuilt = readdirSync(`${BUILD}/chunks`).some(f => f.endsWith('.js') && readFileSync(`${BUILD}/chunks/${f}`, 'utf8').includes('axt-place-view'))
if (!viewBuilt) throw new Error(`no chunk of ${BUILD} holds the reading view: build it with pnpm build`)
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
  // (a range is answered as arXiv answers it, a 206 of the bytes asked: the reader's base check reads the end of the file so)
  const pdf = bytes => {
    const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
    if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(bytes) })
    const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, bytes.length)
    return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${bytes.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(bytes.subarray(begin, end)) })
  }
  switch (pdfAnswer) {
    case 'ok': return pdf(sample.pdf)
    case 'not found': return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    case 'unavailable': return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' })
    case 'not a PDF': return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>This is no PDF</p>' })
    case 'cut short': return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf.subarray(0, 5000)) })
    case 'reset': return route.abort('connectionreset')
    // the PDF as arXiv may serve it rebuilt: other bytes than the layer's base (a comment after its end)
    case 'other': return pdf(Buffer.concat([Buffer.from(sample.pdf), Buffer.from('\n% rebuilt\n')]))
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
  // (the stand-in's routes only — the layer API, the faces' table and its file, the hyphenation —: any other path of these hosts
  // is not handled, and so is a violation of the guard)
  ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
])
console.log(`route table: ${guard.hosts.join(', ')}`)
console.log(`echo endpoint at ${echo.baseURL}; the layer API's bundle key ${VTAG}`)
// (the extension writes its default settings when its worker first runs: the echo service is added to them once they are there)
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config))); tries++) await sleep(200)
// (a service's id is `svc-` and eight of [a-z0-9], or the stored settings cannot be read and the extension runs on its defaults)
await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
// the layer's target: German, whose text the stand-in's one Latin face holds (a CJK target would leave every unit the original's)
await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })

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

    // the popup, on the same page: the reader must be off the page again first, or its appearing proves nothing
    const readerOnPage = () => page.evaluate(() => !!document.querySelector('iframe[data-axt-pdf-reader]'))
    control('the reader is over the page before its way back is taken the second time (so that it being gone, next, is the way back\'s doing)', { ok: !(await readerOnPage()), detail: `reader over the page: ${await readerOnPage()}` })
    const leftAgain = await leave(page)
    await sleep(1500)
    check('the reader is off the page again before the popup\'s entry is pressed', leftAgain && !(await readerOnPage()), `way back taken ${leftAgain}, reader over the page ${await readerOnPage()}`)
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
    // (framed by arXiv's page, as the PDF page frames it: the extension's own pages frame nothing, frame-src 'none')
    const framedLoadOf = async (frameUrl, timeout = 15_000) => {
      const host = track(await context.newPage())
      await host.goto(`https://arxiv.org/abs/${PAPER}`)
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
    check('framed by arXiv\'s page, as its PDF page frames it, its frame fires load', framed.ok, framed.detail)
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
    // (in the original: settings that cannot be read stand in the defaults, whose service is none the route table names)
    const d = await open({ mode: 'original' })
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

  // ------------------------------------------------------------------------------------------------ the reading view
  section('the reading view, its layer held back: the original on both panes, the places, the follower, zoom, pinch, narrow')
  {
    // (the layer API answers nothing for this section: the places show the original's pages, as before a layer comes)
    api.set({ layer: mode.hang() })
    const page = await openReader({ mode: 'bilingual' })
    const probe = () => page.evaluate(() => window.__reader.view.probe())
    const opened = await page.waitForFunction(() => window.__reader?.view?.probe().original === 'open', null, { timeout: 30_000 }).then(() => true, () => false)
    const p0 = opened ? await probe() : {}
    check('the reader opens the sample in the view: the left\'s pages, a place for each on the right, one loading task', opened && p0.pages === bundle.paper.pages && p0.places === bundle.paper.pages && p0.tasks === 1 && p0.opens === 1, JSON.stringify({ pages: p0.pages, places: p0.places, tasks: p0.tasks }))
    // the sample's PDF has no title of its own: the host's fallback, the abstract page's citation_title
    const titled = await page.waitForFunction(t => window.__reader.controller.getState().paper.title === t, TITLE, { timeout: 10_000 }).then(() => true, () => false)
    check('the paper\'s title, which its PDF lacks, is the abstract page\'s, through the host', titled && asked.arxiv.includes('GET /abs'), `${await page.evaluate(() => window.__reader.controller.getState().paper.title)}`)
    /** each pane's page boxes on the screen, and the right's pane's scroller */
    const boxes = () => page.evaluate(() => {
      const of = sel => [...document.querySelectorAll(sel)].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, width: r.width, height: r.height } })
      const L = document.getElementById('left'), R = document.getElementById('right')
      return { left: of('#left .pdfViewer > .page'), right: of('#right .pdfViewer > .page.axt-place'), scroll: [L.scrollTop, R.scrollTop], width: [L.clientWidth, R.clientWidth] }
    })
    const sameBoxes = b => b.left.length > 0 && b.left.length === b.right.length && b.left.every((l, i) => Math.abs(l.width - b.right[i].width) < 0.6 && Math.abs(l.height - b.right[i].height) < 0.6 && Math.abs(l.top - b.right[i].top) < 1.5)
    await page.waitForTimeout(800)
    const b0 = await boxes()
    check('the places are the left\'s page boxes, at the same sizes and the same heights on the screen (the identity map)', sameBoxes(b0), JSON.stringify({ left: b0.left[1], right: b0.right[1], scroll: b0.scroll }))
    // the places near the view show the original's page: PDF.js's page view drawn into each, its text selectable and its links there
    const near = await page.waitForFunction(() => {
      const first = document.querySelector('#right .axt-place .axt-place-view > .page')
      return first?.querySelector('canvas')?.width > 0 && first.querySelectorAll('.textLayer span').length > 0
    }, null, { timeout: 10_000 }).then(() => true, () => false)
    const shows = await page.evaluate(() => [...document.querySelectorAll('#right .axt-place')].map(p => ({ view: !!p.querySelector('.axt-place-view > .page canvas'), label: p.getAttribute('aria-label') })))
    check('a place near the view shows the original\'s page through PDF.js\'s page view: canvas, text, its name as a page of the right', near && shows[0]?.view && /\d/.test(shows[0]?.label ?? ''), JSON.stringify(shows))
    control('a place far from the view shows nothing: the sample\'s last page, three viewports down, holds no page view at first', { ok: shows.at(-1)?.view === true, detail: JSON.stringify(shows.at(-1)) })

    // the follower: a wheel on the left moves the right by the same steps, and the pair is levelled at rest
    const restAfter = async () => {
      await page.waitForFunction(() => { const p = window.__reader.view.probe(); return p.motion === null }, null, { timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(900)
      return probe()
    }
    const L0 = await page.locator('#left').boundingBox(), R0 = await page.locator('#right').boundingBox()
    await page.mouse.move(L0.x + L0.width / 2, L0.y + L0.height / 2)
    await page.mouse.wheel(0, 900)
    const afterLeft = await restAfter()
    const b1 = await boxes()
    check('a wheel on the left: the right follows, and at rest the pair stands level (levelError within 24 px)', Math.abs(afterLeft.levelError ?? 999) <= 24 && b1.scroll[0] > 100 && sameBoxes(b1), `levelError ${afterLeft.levelError}, driver ${afterLeft.driver}, compositing ${afterLeft.compositing}; scrolls ${b1.scroll.join(' / ')}`)
    await page.mouse.move(R0.x + R0.width / 2, R0.y + R0.height / 2)
    await page.mouse.wheel(0, -500)
    const afterRight = await restAfter()
    check('a wheel on the right: the left follows it back, level at rest', Math.abs(afterRight.levelError ?? 999) <= 24 && afterRight.driver === 'right', `levelError ${afterRight.levelError}, driver ${afterRight.driver}`)
    // the control: the sync off, the same wheel leaves the other pane where it was, and the level's error says so
    await page.evaluate(() => window.__reader.controller.setSync(false))
    await page.mouse.move(L0.x + L0.width / 2, L0.y + L0.height / 2)
    await page.mouse.wheel(0, 700)
    const off = await restAfter()
    control('with the sync off the pair is not levelled: the same check fails', { ok: Math.abs(off.levelError ?? 999) <= 24, detail: `levelError ${off.levelError}` })
    await page.evaluate(() => window.__reader.controller.setSync(true))

    // the zoom: the left's viewer scaled, the places with it, the menu's check the zoom applied
    await page.evaluate(() => window.__reader.controller.zoomTo(1.5))
    await page.waitForTimeout(900)
    const z = await probe(), bz = await boxes()
    check('a zoom to 150 %: the left at 1.5, the places at its page boxes, the zoom told', Math.abs(z.scale - 1.5) < 1e-3 && z.zoom === 1.5 && sameBoxes(bz), JSON.stringify({ scale: z.scale, zoom: z.zoom, left: bz.left[0], right: bz.right[0] }))
    // a pinch over the right scales the left's viewer, and the places follow
    const before = z.scale
    for (let i = 0; i < 4; i++) { await page.evaluate(([x, y]) => window.__reader.controller.pinch('right', 1.05, [x, y]), [R0.x + R0.width / 2, R0.y + R0.height / 3]); await page.waitForTimeout(30) }
    await page.waitForTimeout(1000)
    const pz = await probe(), bp = await boxes()
    check('a pinch over the right scales the left\'s viewer, the places with it; the zoom then none', pz.scale > before * 1.15 && pz.zoom === null && sameBoxes(bp), JSON.stringify({ from: before, to: pz.scale, zoom: pz.zoom }))
    await page.evaluate(() => window.__reader.controller.zoomTo('page-width'))
    await page.waitForTimeout(600)

    // a narrow window: the right alone, fitted to its own pane through the left's viewer; wide again, both
    await page.evaluate(() => window.__reader.controller.setNarrow(true))
    await page.waitForTimeout(800)
    const n = await boxes(), np = await probe()
    const fitted = n.right[0] && n.width[0] === 0 && Math.abs(n.right[0].width - Math.min(n.width[1] - 40, 1060)) < 2
    check('narrow: the left hidden, the right\'s pages fitted to the right pane (its width less 40 px, or the reading width)', fitted && np.narrow === true, JSON.stringify({ widths: n.width, place: n.right[0]?.width, scale: np.scale }))
    await page.evaluate(() => window.__reader.controller.setNarrow(false))
    await page.waitForTimeout(800)
    const w = await boxes()
    check('wide again: both panes, the places at the left\'s boxes', w.width[0] > 0 && w.width[1] > 0 && sameBoxes(w), JSON.stringify({ widths: w.width }))
    // a link out of the paper on the right: drawn by the place's page view, opened by the host (a new tab), the reader kept
    await page.evaluate(() => window.__reader.controller.goToPage('right', 4))
    const out = page.locator('#right .axt-place .annotationLayer a[href^="http"]')
    const drawn = await out.first().waitFor({ timeout: 10_000 }).then(() => true, () => false)
    const tabbed = drawn ? context.waitForEvent('page', { timeout: 10_000 }).catch(() => null) : null
    if (drawn) await out.first().click()
    const tab = await tabbed
    await tab?.waitForLoadState('load').catch(() => undefined)
    check('a link out of the paper on the right opens in a new tab through the host, the reader staying where it is', drawn && tab?.url() === LINK && page.url().includes('pdf-reader.html'), `drawn ${drawn}, opened ${tab?.url() ?? 'nothing'}`)
    await tab?.close()
    await page.screenshot({ path: `${SHOTS}/reader-view.png` })
    await page.close()
    api.set({ layer: mode.ready() })
    await api.release()
  }

  // ------------------------------------------------------------------------------------------ the reader on the layer
  section('the reader on the layer: prepared, laid on the right as the extension translates, the original until then, the place kept, the highlight on both panes, the contents, the links')
  {
    // a paper not prepared yet: the run's GET says so, it asks the prepare, the 202s carry the objects made so far, then the catalog
    api.set({ layer: mode.preparing(2500, { begun: false }) })
    const asked0 = api.requests.length
    const page = await openReader({ mode: 'bilingual' })
    const probe = () => page.evaluate(() => window.__reader.view.probe())
    const side = () => page.evaluate(() => window.__reader.side()?.probe() ?? null)
    // the phases the reader passes through, read as they come
    await page.waitForFunction(() => !!window.__reader?.controller, null, { timeout: 30_000 }).catch(() => undefined)
    await page.evaluate(() => { window.__phases = []; const c = window.__reader.controller; const tell = () => { const p = c.getState().phase; if (window.__phases.at(-1) !== p) window.__phases.push(p) }; tell(); c.subscribe(tell) })
    const opened = await page.waitForFunction(() => window.__reader?.view?.probe().original === 'open', null, { timeout: 30_000 }).then(() => true, () => false)
    check('the reader opens the sample in the view', opened, JSON.stringify(opened ? await probe() : {}))
    await page.evaluate(() => { window.__long = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
    const objectsAsked = () => api.requests.filter(r => /\/o\/[0-9a-f]{64}$/.test(r.path)).map(r => r.path.slice(-64))
    const lefts = new Set(Object.values(sampleCut.leftRefs))
    /** what each place shows: the layer (its copy drawn, its SVG's text), the original's page view, nothing */
    const shown = () => page.evaluate(() => [...document.querySelectorAll('#right .axt-place')].map(p => {
      const l = p.querySelector('.axt-place-view > .axt-layer')
      return { layer: p.hasAttribute('data-axt-layer'), copy: l?.querySelector('canvas.axt-layer-copy')?.width ?? 0, text: l?.querySelector('svg')?.textContent ?? '', original: !!p.querySelector('.axt-place-view > .page canvas') }
    }))
    await page.waitForFunction(() => !!document.querySelector('#right .axt-place .axt-place-view > .page canvas'), null, { timeout: 15_000 }).catch(() => undefined)
    const s0 = await shown()
    const before = await page.evaluate(() => { const p = document.querySelector('#right .axt-place'), r = p.getBoundingClientRect(); return { scroll: document.getElementById('right').scrollTop, box: [r.top, r.width, r.height] } })
    check('while the paper is prepared, the places near the view show the original\'s page view, none the layer', s0[0]?.original && s0.every(p => !p.layer), JSON.stringify(s0.map(p => p.original)))
    const laid = await page.waitForFunction(() => { const l = document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer'); return l?.querySelector('canvas.axt-layer-copy')?.width > 0 && /\[echo\]/.test(l.querySelector('svg')?.textContent ?? '') }, null, { timeout: 60_000 }).then(() => true, () => false)
    // (the first page may be laid before the catalog: its part came with a 202)
    await page.waitForFunction(() => window.__reader.side()?.probe().ended === true, null, { timeout: 30_000 }).catch(() => undefined)
    const layerAsked = api.requests.slice(asked0).filter(r => r.path.startsWith(`/api/v1/layer/${sample.segment}/${CTAG4}`) && !/\/o\//.test(r.path)).map(r => `${r.method} ${r.answered}`)
    const phases = await page.evaluate(() => window.__phases)
    check('the run asks the layer, then its prepare once, follows the 202s to the catalog, and the reader says it is preparing meanwhile', layerAsked[0] === 'GET 404' && layerAsked.filter(a => a.startsWith('POST')).length === 1 && layerAsked.some(a => a === 'GET 202') && layerAsked.at(-1) === 'GET 200' && phases.includes('preparing'), `${layerAsked.join(', ')}; phases ${phases.join(' > ')}`)
    const s2 = await shown()
    check('the extension\'s translation taken: the page laid on the right in place, its copy drawn and its translation drawn as text, no page view left in it', laid && s2[0]?.layer && !s2[0]?.original, JSON.stringify({ ...s2[0], text: s2[0]?.text.slice(0, 60) }))
    control('a place the layer has not drawn shows no translation: the last page, far from the view', { ok: /\[echo\]/.test(s2.at(-1)?.text ?? ''), detail: JSON.stringify(s2.at(-1)) })
    const after = await page.evaluate(() => { const p = document.querySelector('#right .axt-place'), r = p.getBoundingClientRect(); return { scroll: document.getElementById('right').scrollTop, box: [r.top, r.width, r.height] } })
    check('laid in place: the place\'s box and the pane\'s scroll as they were', JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} then ${JSON.stringify(after)}`)
    const p1 = await side()
    check('the side read every object: its parts through the end', p1?.ended === true && p1?.parts === sampleCut.refs.parts.length, JSON.stringify(p1))

    // the highlight: nothing of the left fetched before the pointer wants a page (trap 2); a want over the right fetches it once
    check('nothing of the left is fetched before the pointer wants a page', objectsAsked().filter(x => lefts.has(x)).length === 0, `${objectsAsked().length} objects fetched`)
    /** where a unit's first rectangle's middle is on the screen, on a pane's page */
    const screenOf = (pane, unit) => page.evaluate(([pane, page, r, view]) => {
      const box = document.querySelector(`#${pane} .pdfViewer > .page[data-page-number="${page}"]`).getBoundingClientRect()
      const x = (r[0] + r[2]) / 2, y = (r[1] + r[3]) / 2
      return { x: box.left + ((x - view[0]) / (view[2] - view[0])) * box.width, y: box.top + ((view[3] - y) / (view[3] - view[1])) * box.height }
    }, [pane, unit[2][0][0], unit[2][0].slice(1), sampleCut.views[unit[2][0][0] - 1]])
    const onPage1 = sampleCut.located.filter(u => u[2][0]?.[0] === 1 && sampleCut.kinds[u[0]] === 'para')
    const unit = onPage1[0]
    const litOf = () => page.evaluate(() => ({ lit: window.__reader.view.probe().lit, left: document.querySelectorAll('#left .page[data-page-number="1"] .axt-hl').length, right: document.querySelectorAll('#right .page[data-page-number="1"] .axt-hl').length }))
    const at = await screenOf('right', unit)
    await page.mouse.move(at.x, at.y)
    await page.waitForTimeout(150)
    await page.mouse.move(at.x + 1, at.y)
    const lightRight = await page.waitForFunction(id => window.__reader.view.probe().lit === id, unit[0], { timeout: 10_000 }).then(() => true, () => false)
    const h1 = await litOf()
    const fetchedLeft = objectsAsked().filter(x => lefts.has(x))
    check('the pointer over the right lights the unit under it on both panes, its page\'s left part fetched once', lightRight && h1.left > 0 && h1.right > 0 && fetchedLeft.length === 1 && fetchedLeft[0] === sampleCut.leftRefs[1], `${JSON.stringify(h1)}, left parts fetched ${fetchedLeft.length}`)
    const other = onPage1[1] ?? onPage1[0]
    const atL = await screenOf('left', other)
    await page.mouse.move(atL.x, atL.y)
    await page.waitForTimeout(150)
    await page.mouse.move(atL.x + 1, atL.y)
    const lightLeft = await page.waitForFunction(id => window.__reader.view.probe().lit === id, other[0], { timeout: 10_000 }).then(() => true, () => false)
    const h2 = await litOf()
    check('the pointer over the left lights the unit on both panes; the page\'s left part not fetched again', lightLeft && h2.left > 0 && h2.right > 0 && objectsAsked().filter(x => lefts.has(x)).length === 1, JSON.stringify(h2))
    // the dark look: the layer's text dimmed by the reader's filter, its copy by the page canvas's, the wash over the layer screened
    await page.evaluate(() => document.documentElement.setAttribute('data-axt-dim', ''))
    const dark = await page.evaluate(() => { const css = sel => (document.querySelector(sel) ? getComputedStyle(document.querySelector(sel)) : null); return { svg: css('#right .axt-layer > svg')?.filter ?? null, copy: css('#right .axt-layer > canvas')?.filter ?? null, wash: css('#right .axt-hl')?.mixBlendMode ?? null, links: css('#right .axt-layer > .axt-links')?.filter ?? null } })
    check('the dark look over the layer: its SVG and its copy dimmed alike, the wash screened, the links not inverted', /invert/.test(dark.svg) && dark.svg === dark.copy && dark.wash === 'screen' && dark.links === 'none', JSON.stringify(dark))
    await page.screenshot({ path: `${SHOTS}/reader-layer-dark.png` })
    await page.evaluate(() => document.documentElement.removeAttribute('data-axt-dim'))
    // a figure: its caption lights its float whole, on both panes
    const caption = sampleCut.located.find(u => sampleCut.kinds[u[0]] === 'caption')
    if (caption) {
      await page.mouse.move(5, 5)
      await page.evaluate(n => window.__reader.controller.goToPage('right', n), caption[2][0][0])
      await page.waitForTimeout(1500)
      const atC = await screenOf('right', caption)
      await page.mouse.move(atC.x, atC.y)
      await page.waitForTimeout(150)
      await page.mouse.move(atC.x + 1, atC.y)
      const litC = await page.waitForFunction(id => window.__reader.view.probe().lit === id, caption[0], { timeout: 10_000 }).then(() => true, () => false)
      const f = await page.evaluate(p => ({ left: document.querySelectorAll(`#left .page[data-page-number="${p}"] .axt-hl`).length, right: document.querySelectorAll(`#right .page[data-page-number="${p}"] .axt-hl`).length, frames: document.querySelectorAll(`.page[data-page-number="${p}"] .axt-hl-frame`).length }), caption[2][0][0])
      check('a caption lights its float whole on both panes (the figure framed, or the table washed)', litC && f.left > 0 && f.right > 0, JSON.stringify(f))
      await page.screenshot({ path: `${SHOTS}/reader-layer-float.png` })
    }

    // ---- the links (3b): real links over the laid pages, in reading order, named, reached by Tab, followed by Enter
    await page.mouse.move(5, 5)
    await page.evaluate(() => window.__reader.controller.goToPage('right', 1))
    await page.waitForTimeout(1200)
    const linkInfo = () => page.evaluate(() => [...document.querySelectorAll('#right .axt-layer .axt-links a.axt-link')].map(a => ({ name: a.getAttribute('aria-label'), href: a.getAttribute('href'), page: Number(a.closest('.axt-place')?.dataset.pageNumber), boxes: a.querySelectorAll(':scope > span.axt-link-box').length })))
    await page.waitForFunction(() => document.querySelectorAll('#right .axt-layer .axt-links a.axt-link').length > 0, null, { timeout: 15_000 }).catch(() => undefined)
    const links = await linkInfo()
    check('the laid pages carry their links: an anchor each, named, with its boxes, inside the paper or out of it', links.length > 0 && links.every(l => l.name && l.boxes > 0) && links.some(l => l.href?.startsWith('#')), JSON.stringify(links.slice(0, 6)))
    // Tab from the toolbar reaches a link of the right's layer, its ring the reader's
    await page.evaluate(() => { const b = [...document.querySelectorAll('header button, header a')].filter(e => e.offsetParent).at(-1); b?.focus() })
    let tabs = 0, reached = null
    for (; tabs < 400 && !reached; tabs++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => { const a = document.activeElement; return a?.matches?.('#right a.axt-link') ? { name: a.getAttribute('aria-label'), ring: getComputedStyle(a.querySelector('span.axt-link-box')).outlineStyle, width: getComputedStyle(a.querySelector('span.axt-link-box')).outlineWidth } : null })
    }
    check('Tab reaches a link of the laid page, after the left\'s, its focus ring drawn (2 px, solid)', !!reached && reached.ring === 'solid' && reached.width === '2px', `${tabs} Tab(s): ${JSON.stringify(reached)}`)
    // the ring reads on the page in the dark theme too, the pages undimmed (white paper) and dimmed: 3:1 at least on the
    // paper under it (WCAG 2.2 SC 1.4.11), its colour drawn on a canvas to be read
    const ringOn = async (dim) => {
      await setConfig({ theme: 'dark', pdfReader: { dimPages: dim } })
      await page.waitForFunction(d => document.documentElement.dataset.theme === 'dark' && document.documentElement.hasAttribute('data-axt-dim') === d, dim, { timeout: 10_000 }).catch(() => undefined)
      return page.evaluate(dim => {
        const a = document.activeElement?.matches?.('#right a.axt-link') ? document.activeElement : null
        const box = a?.querySelector('span.axt-link-box')
        if (!box) return null
        const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        const rgb = colour => { c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = colour; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)] }
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
        const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
        const ring = rgb(getComputedStyle(box).outlineColor)
        // the paper: white, or white through the layer's dimming filter (invert(88.8%): 0.112 of each channel)
        const paper = dim ? [29, 29, 29] : [255, 255, 255]
        return { ring, contrast: Math.round(ratio(lum(ring), lum(paper)) * 10) / 10 }
      }, dim)
    }
    const darkPaper = await ringOn(false), darkDimmed = await ringOn(true)
    await setConfig({ theme: 'system', pdfReader: { dimPages: true } })
    check('the focus ring reads on the page in the dark theme, on white paper and on dimmed pages alike (3:1 at least)', (darkPaper?.contrast ?? 0) >= 3 && (darkDimmed?.contrast ?? 0) >= 3, `undimmed ${JSON.stringify(darkPaper)}, dimmed ${JSON.stringify(darkDimmed)}`)
    // Enter on a link inside the paper: the right jumps (the pane it is on), the left follows with the sync on, nothing levelled
    const internal = await page.evaluate(() => { const a = [...document.querySelectorAll('#right a.axt-link[href^="#"]')][0]; a?.focus(); return a ? a.getAttribute('aria-label') : null })
    const jumpFrom = await page.evaluate(() => ({ right: document.getElementById('right').scrollTop, align: window.__reader.view.probe().lastAlign }))
    await page.keyboard.press('Enter')
    await page.waitForFunction(y => document.getElementById('right').scrollTop !== y, jumpFrom.right, { timeout: 5000 }).catch(() => undefined)
    await page.waitForFunction(() => window.__reader.view.probe().motion === null, null, { timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(900)
    const jumped = await page.evaluate(() => ({ right: document.getElementById('right').scrollTop, ...(({ driver, levelError, lastAlign }) => ({ driver, levelError, lastAlign }))(window.__reader.view.probe()), focus: document.activeElement?.className ?? '' }))
    check('Enter on a link inside the paper: the right jumps to its destination (resolved on the left\'s document), the left follows level, and the jump levels nothing of its own', internal !== null && jumped.right !== jumpFrom.right && jumped.driver === 'right' && Math.abs(jumped.levelError ?? 999) <= 24 && jumped.lastAlign === jumpFrom.align, `“${internal}”: ${JSON.stringify(jumpFrom)} then ${JSON.stringify(jumped)}`)
    // … and the focus is the place jumped to, a stop of its own (Tab goes on from there), never the document's body
    const focused = await page.evaluate(() => { const a = document.activeElement; return { place: a?.matches?.('#right .axt-place') ? Number(a.dataset.pageNumber) : null, tabindex: a?.getAttribute?.('tabindex') ?? null, body: a === document.body, shown: a?.getAttribute?.('aria-hidden') !== 'true' } })
    check('… and the focus goes to the place jumped to, shown and a stop of its own, not the document', focused.place !== null && focused.tabindex === '-1' && focused.shown && !focused.body, JSON.stringify(focused))
    // with the sync off, the same jump leaves the left where it is
    await page.evaluate(() => window.__reader.controller.setSync(false))
    await page.evaluate(() => window.__reader.controller.goToPage('right', 1))
    await page.waitForTimeout(1200)
    const leftBefore = await page.evaluate(() => document.getElementById('left').scrollTop)
    await page.evaluate(() => { const a = [...document.querySelectorAll('#right a.axt-link[href^="#"]')][0]; a?.click() })
    await page.waitForTimeout(1200)
    const offJump = await page.evaluate(() => ({ left: document.getElementById('left').scrollTop }))
    control('with the sync off a link\'s jump does not move the left: the follow-check fails there', { ok: offJump.left !== leftBefore, detail: `left ${leftBefore} then ${offJump.left}` })
    await page.evaluate(() => window.__reader.controller.setSync(true))
    // a link out of the paper: through the host alone, a new tab with no opener, the reader kept
    const outside = await page.evaluate(() => !!document.querySelector('#right a.axt-link[href^="http"]'))
    if (outside) {
      const tabbed = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
      await page.evaluate(() => document.querySelector('#right a.axt-link[href^="http"]')?.click())
      const tab = await tabbed
      await tab?.waitForLoadState('load').catch(() => undefined)
      const opener = tab ? await tab.evaluate(() => window.opener === null).catch(() => null) : null
      check('a link of the layer out of the paper opens in a new tab through the host, with no opener, the reader staying', !!tab && opener === true && page.url().includes('pdf-reader.html'), `opened ${tab?.url() ?? 'nothing'}, no opener ${opener}`)
      await tab?.close()
    } else note('the laid pages near the view hold no link out of the paper (the sample\'s \\href is elsewhere)')
    // the links name themselves to assistive technology: axe's link-name over the right, none failing
    const axe = await new AxeBuilder({ page }).include('#right .axt-links').withRules(['link-name', 'nested-interactive', 'aria-hidden-focus']).analyze().catch(e => ({ violations: [{ id: `axe did not run: ${e.message}` }] }))
    check('axe over the layer\'s links: no link without a name, none hidden while focusable', axe.violations.length === 0, axe.violations.map(v => v.id).join(', ') || 'none')
    // a zoom: each link keeps its place on the page, by shares (nothing measured)
    const rel = () => page.evaluate(() => { const a = document.querySelector('#right a.axt-link'), p = a?.closest('.axt-place')?.getBoundingClientRect(), r = a?.querySelector('span.axt-link-box')?.getBoundingClientRect(); return p && r ? [(r.left - p.left) / p.width, (r.top - p.top) / p.height, r.width / p.width, r.height / p.height] : null })
    const r0 = await rel()

    // the zoom keeps the place; the laid pages' copies are drawn again at the new k, none laid again
    const pz = await side()
    await page.evaluate(() => window.__reader.controller.zoomTo(1.5))
    await page.waitForTimeout(1600)
    const z = await probe(), pz2 = await side(), r1 = await rel()
    check('a zoom: the left and the places at 1.5, the laid pages\' copies drawn again, no page asked again for a layer it holds', Math.abs(z.scale - 1.5) < 1e-3 && pz2.copies > pz.copies && pz2.ready === pz.ready, JSON.stringify({ scale: z.scale, copies: [pz.copies, pz2.copies], ready: [pz.ready, pz2.ready] }))
    check('a link keeps its place on its page through the zoom (its box\'s shares of the page)', !!r0 && !!r1 && r0.every((v, i) => Math.abs(v - r1[i]) < 0.003), `${JSON.stringify(r0)} then ${JSON.stringify(r1)}`)
    await page.evaluate(() => window.__reader.controller.zoomTo('page-width'))
    await page.waitForTimeout(800)

    // the contents: the index's headings, their pages from the parts, their titles from the rows; the heading read on a scroll
    const st = await page.evaluate(() => window.__reader.controller.getState())
    const located = st.outline.filter(e => e.page)
    check('the contents: the paper\'s headings, located by the parts, titled by the rows', st.outline.length >= 5 && located.length === st.outline.length && st.outline.every(e => /\[echo\]/.test(e.title) && e.original && !/\[echo\]/.test(e.original)), JSON.stringify(st.outline.slice(0, 3)))
    const L0 = await page.locator('#left').boundingBox()
    await page.mouse.move(L0.x + L0.width / 2, L0.y + L0.height / 2)
    await page.mouse.wheel(0, 6000)
    await page.waitForFunction(() => window.__reader.view.probe().motion === null, null, { timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(900)
    const deep = await page.evaluate(() => window.__reader.controller.getState().currentHeading)
    const lvl = await probe()
    check('the heading read follows the scroll: further down, a later heading of the contents', deep !== null && st.outline.findIndex(e => e.id === deep) > 0, `${deep}`)
    check('on the layer the pair stands level at rest (levelError within 24 px)', Math.abs(lvl.levelError ?? 999) <= 24, `levelError ${lvl.levelError}`)
    // the window: through the paper and back, the right holds the layer near the view alone (§3.2), what it let go released
    const R1 = await page.locator('#right').boundingBox()
    const held = async () => page.evaluate(() => {
      const near = window.__reader.view.probe().nearPlaces, sp = window.__reader.side().probe()
      const right = document.getElementById('right')
      return { near, laid: sp.laid, retired: sp.retired, svgs: right.querySelectorAll('.axt-layer > svg').length, links: right.querySelectorAll('.axt-layer > .axt-links').length, copies: [...right.querySelectorAll('canvas.axt-layer-copy')].filter(c => c.width > 0).length, nodes: right.querySelectorAll('*').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null }
    })
    const w0 = await held()
    await page.mouse.move(R1.x + R1.width / 2, R1.y + R1.height / 2)
    for (const dy of [4000, 4000, -8000]) { await page.mouse.wheel(0, dy); await page.waitForTimeout(700) }
    await page.waitForFunction(() => window.__reader.view.probe().motion === null, null, { timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(1200)
    const w1 = await held()
    check('through the paper and back: the layer held near the view alone, each page far from it let go (its copy, its SVG and its links)', w1.laid <= w1.near && w1.svgs === w1.laid && w1.copies === w1.laid && w1.links <= w1.laid && w1.laid + w1.retired <= sampleCut.paper.pages, `${JSON.stringify(w0)} then ${JSON.stringify(w1)}`)
    note(`the window on the sample (4 pages; JS heap in MB): before ${JSON.stringify(w0)}, after a scroll through it and back ${JSON.stringify(w1)}`)
    const long = await page.evaluate(() => window.__long)
    note(`the layer's longest main-thread task in this run: ${Math.max(0, ...long)} ms over ${long.length} long task(s) (a reading on a shared machine: L7 is reader-perf's)`)
    const ps = await side()
    note(`the side: ${JSON.stringify({ ready: ps.ready, laid: ps.laid, retired: ps.retired, commits: ps.commits, copies: ps.copies, leftParts: ps.leftParts, composed: ps.composed, docs: ps.docs })}`)
    await page.screenshot({ path: `${SHOTS}/reader-layer.png` })
    await page.close()
    api.set({ layer: mode.ready() })
  }

  // --------------------------------------------------------------------------------- the reader's states on the layer
  section('the reader\'s states on the layer: none for the paper, refused, unreachable, a retry, arXiv\'s bytes not the base (Task 12)')
  {
    // (the papers' store emptied first: a paper whose catalog this machine holds opens with our server out of reach)
    const cleaner = await extensionPage()
    await cleaner.evaluate(() => new Promise(resolve => { const r = indexedDB.deleteDatabase('axt-layer'); r.onsuccess = r.onerror = r.onblocked = () => resolve(null) }))
    await cleaner.close()
    const stateOf = page => page.evaluate(() => { const s = window.__reader.controller.getState(); return { phase: s.phase, available: s.available, display: s.display, unavailable: s.unavailable, laid: s.layer.laid, capsule: document.querySelector('.capsule:not([data-out])')?.getAttribute('data-kind') ?? null, chips: [...document.querySelectorAll('.capsule:not([data-out]) [data-action]')].map(e => e.textContent) } })
    /** a wait on the controller's state (the reader's page allows no eval: each test is a function of its own) */
    const waitState = (page, test, arg, timeout = 15_000) => page.waitForFunction(test, arg, { timeout }).then(() => true, () => false)
    const whyIs = ([...whys]) => whys.includes(window.__reader?.controller?.getState().unavailable?.why)
    // none for the paper: the original, the translated displays greyed, the capsule; nothing asked again
    api.set({ layer: mode.none('no-source') })
    const none = await openReader({ mode: 'bilingual' })
    await waitState(none, whyIs, ['no-source'])
    await none.waitForTimeout(400)
    const n = await stateOf(none)
    check('no source for the paper: the original shown, the translated displays greyed, the capsule says so', n.available === false && n.display === 'original' && n.capsule === 'unavailable' && n.laid === 0, JSON.stringify(n))
    await none.close()
    // refused, and our server out of reach: the original, the capsule with its retry; the retry brings the layer once it is there
    for (const [name, m] of [['refused', mode.refused(60_000)], ['a server error', mode.error(503)], ['a reset', mode.reset()]]) {
      api.set({ layer: m })
      const page = await openReader({ mode: 'bilingual' })
      const said = await waitState(page, whyIs, ['refused', 'unreachable'], 20_000)
      await page.waitForTimeout(400)
      const st = await stateOf(page)
      check(`${name}: the original readable, the capsule says the bilingual version cannot be had now, with its retry`, said && st.capsule === 'notNow' && st.available === true && st.display === 'bilingual' && st.chips.length >= 1, JSON.stringify(st))
      if (name === 'a reset') {
        api.set({ layer: mode.ready() })
        await page.locator('.capsule[data-kind="notNow"] button[data-action]').click()
        const came = await page.waitForFunction(() => /\[echo\]/.test(document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer svg')?.textContent ?? ''), null, { timeout: 60_000 }).then(() => true, () => false)
        const back = await stateOf(page)
        check('… and its retry, our server back, brings the layer: the page laid, the capsule gone', came && back.capsule !== 'notNow' && back.unavailable === null, JSON.stringify(back))
      }
      await page.close()
    }
    api.set({ layer: mode.ready() })
    await api.release()
    // arXiv's bytes that are not the layer's base: our copy read by ranges, each held to the tag the layer names, shown on
    // the left, and the layer laid over it
    pdfAnswer = 'other'
    const copyAt = `/api/v1/original/${sample.segment}`, before = api.requests.length
    const other = await openReader({ mode: 'bilingual' })
    const laidOver = await other.waitForFunction(() => /\[echo\]/.test(document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer svg')?.textContent ?? ''), null, { timeout: 60_000 }).then(() => true, () => false)
    const ran = await other.evaluate(() => window.__reader.run?.probe() ?? null)
    const copies = api.requests.slice(before).filter(r => r.path === copyAt)
    const byRanges = copies.length > 0 && copies.every(r => typeof r.headers.range === 'string' && r.answered === 206)
    check('arXiv\'s bytes not the base: our copy read by ranges and shown on the left, the layer laid over it', laidOver && ran?.ours === true && ran?.basis === 'ranged' && byRanges, `laid ${laidOver}, ${JSON.stringify({ ours: ran?.ours, basis: ran?.basis, bound: ran?.bound })}, ${copies.length} reads of our copy, ${copies.filter(r => r.answered === 206).length} by range`)
    await other.close()
    pdfAnswer = 'ok'
    const same = await openReader({ mode: 'bilingual' })
    await same.waitForFunction(() => /\[echo\]/.test(document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer svg')?.textContent ?? ''), null, { timeout: 60_000 }).catch(() => undefined)
    const sameRun = await same.evaluate(() => window.__reader.run?.probe() ?? null)
    control('arXiv\'s bytes that are the base fetch no copy of ours (the same assertion, on the sample as arXiv serves it)', { ok: sameRun?.ours === true && sameRun?.basis === 'ranged', detail: `${JSON.stringify(sameRun && { ours: sameRun.ours, basis: sameRun.basis })}: our copy not shown, the left's bytes read` })
    await same.close()
  }

  // ----------------------------------------------------------------------------------------------------- what nothing did
  section('what the run did not do')
  await api.release()
  for (const route of held) await route.abort('timedout').catch(() => undefined)
  check('no request left the route table', guard.violations.length === 0, guard.violations.length ? guard.violations.map(v => `${v.method} ${v.url} from ${v.from}`).join('; ') : `${guard.hosts.length} origins named, none else asked`)
  check('no page of the reader or of the extension threw', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  check('the TeX page was not asked for anything: no display checked here is one it types', asked.tex.length === 0, asked.tex.join(', ') || 'none asked')
  note(`the echo endpoint was asked ${echo.seen.post} time(s): the extension's own translation of the layer's units`)
} finally {
  await context.close().catch(() => undefined)
  await echo.close()
}

const pass = results.filter(r => r.ok).length
const controls = results.filter(r => r.name.startsWith('control: ')).length
console.log(`\n${pass}/${results.length} passed (${controls} controls), ${notes.length} note(s); screenshots in ${SHOTS}`)
for (const r of results.filter(x => !x.ok)) console.log(`FAILED [${r.section}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
process.exit(pass === results.length ? 0 : 1)
