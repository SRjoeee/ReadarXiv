// The PDF reader's browser checks on a build of the rebuilt reader (AXT_READER=v2: the reader package whole behind the
// extension's host, src/pdf-reader/host/v2.ts), on a paper of our own and with no network. The paper is the reader package's
// CC0 fixture s1-columns (packages/reader/e2e/fixtures/): `https://arxiv.org/pdf/2600.00002` is answered with its stand-in of
// arXiv's PDF, and our server's hosts with the stand-in of our server's /api/v2 routes (lib/v2-api.mjs) serving the bundle its
// prepare made. One route table answers every request of the browser, the extension's service worker's included, and guards
// the run: a request to a host or a path it names no answer for is refused and fails the run (lib/route-table.mjs). The
// browser's resolver is a second wall. Translation comes from a local echo endpoint (lib/echo-endpoint.mjs) through the
// extension's background, as a reader's own service.
//
// Each check has a positive control where one can be had: the same assertion, run where its target is removed, must fail.
//
// What it holds is what the extension's host gives the reader (the reader's own behaviour is the reader package's e2e,
// packages/reader/e2e/run.mjs, which this suite does not repeat; the lane note's table says which of the old reader's checks
// went where): the guard; the stand-in on the build's hosts; the entries (the PDF page, its button's panel, the popup); the
// original's faults; an address with no paper; the reader's settings as the extension's (the display, the sync, unreadable
// settings, asked to translate); the reader on the layer (prepared, laid as the extension translates, the contents, a link out
// of the paper through the host, the original's download); another target and another service; what to translate from the
// reading options and the settings page; the states on our server's answers; arXiv's bytes not the layer's original; the
// papers this machine keeps, opened with our server out of reach, counted and cleared on the settings page; what the run
// did not do.
//
// Usage: AXT_READER=v2 pnpm build && pnpm e2e:reader     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { loadFixture, segOf, v2Api } from './lib/v2-api.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-reader-v2`
const SHOTS = `${HERE}.shots`
if (!existsSync(join(BUILD, 'pdfjs'))) throw new Error(`${BUILD} is no build of the rebuilt reader (no pdfjs/ of the reader package's): AXT_READER=v2 pnpm build`)

// ---- the paper, and the stand-in of our server over it
const fixture = loadFixture('s1-columns')
const PAPER = fixture.paper
const PV = segOf(PAPER, fixture.version)
const TITLE = 'Columns, Captions and Links: a Fixture of Our Own'
// (with its submission history, as arXiv's has: the version the reader opens, the address naming none)
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="${TITLE}"><div class="submission-history"><strong>[v${fixture.version}]</strong></div>`
const LINK = 'https://example.invalid/reader'
/** the panel's and the popup's two entries, by their words in either interface language */
const ENTRY = { html: /Translate HTML|HTML \u7ffb\u8bd1/, pdf: /Translate PDF|PDF \u7ffb\u8bd1/ }

// ---- reporting
const results = []
let current = ''
const section = name => { current = name; console.log(`\n# ${name}`) }
const check = (name, ok, detail = '') => {
  results.push({ section: current, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const control = (name, result) => check(`control: ${name}`, !result.ok, result.detail)
const note = text => console.log(`NOTE ${text}`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---- the network: one table, which is also the guard
/** which answer arXiv's PDF address gives: ok, or one of the faults a section sets */
let pdfAnswer = 'ok'
const asked = { arxiv: [] }
const held = []
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  asked.arxiv.push(`${route.request().method()} /${m[1]}`)
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  // (the fixture has neither an HTML version nor a source on arXiv)
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  // (a range answered as arXiv answers it, a 206 of the bytes asked, with an entity-tag of the file's)
  const pdf = bytes => {
    const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
    const etag = `"${bytes.length.toString(16)}-arxiv"`
    if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { etag }, body: Buffer.from(bytes) })
    const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, bytes.length)
    return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${bytes.length}`, 'accept-ranges': 'bytes', etag }, body: Buffer.from(bytes.subarray(begin, end)) })
  }
  switch (pdfAnswer) {
    case 'ok': return pdf(fixture.pdf)
    case 'not found': return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    case 'unavailable': return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' })
    case 'not a PDF': return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><p>This is no PDF</p>' })
    case 'reset': return route.abort('connectionreset')
    // the PDF as arXiv may serve it rebuilt: other bytes than the layer's original (a comment after its end)
    case 'other': return pdf(Buffer.concat([Buffer.from(fixture.pdf), Buffer.from('\n% rebuilt\n')]))
    default: throw new Error(`no such answer: ${pdfAnswer}`)
  }
}
/** the link out of the paper, and a document that never loads */
const outside = (route, url) => {
  if (url.pathname === '/reader') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>the link</title><p>a page outside the paper</p>' })
  if (url.pathname === '/never') { held.push(route); return undefined }
  return false
}

const echo = await startEchoEndpoint()
rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
/** our server's hosts: production's, and staging's where the build names it */
const manifestText = (await import('node:fs')).readFileSync(`${BUILD}/manifest.json`, 'utf8')
const API_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifestText.includes(host))]
// (a copy of the build with the loopback and our server's hosts granted, which Chrome would ask the reader for in a prompt)
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...API_HOSTS.map(host => `${host}/*`)] })
// (the back-forward cache on, as a reader's Chrome has it: the page's end is checked on it)
const { context, worker, id, readerUrl } = await launchWithReader({ profile: 'reader-v2-checks', extension: EXT, headless: !process.env.AXT_HEADED, viewport: { width: 1440, height: 900 }, args: [RESOLVER_WALL], backForwardCache: true })
const api = v2Api({ fixtures: [fixture], base: API_HOSTS[0], extension: `chrome-extension://${id}` })
const guard = await routeTable(context, [
  ['https://arxiv.org', arxiv],
  ['https://example.invalid', outside],
  [echo.origin, route => route.continue()],
  ...API_HOSTS.map(host => [host, (route, url) => api.route(route, url)]),
])
console.log(`route table: ${guard.hosts.join(', ')}`)
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
// the target: German, whose text the stand-in's one Latin face holds
await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })

const pageErrors = []
const track = page => { page.on('pageerror', e => pageErrors.push(`${page.url().slice(0, 60)}: ${e.message}`)); return page }
const extensionPage = async (path = 'options.html') => { const page = track(await context.newPage()); await page.goto(`chrome-extension://${id}/${path}`); return page }
const readerState = page => page.evaluate(() => window.__reader.controller.getState())
const sessionState = page => page.evaluate(() => { const s = window.__reader.reader.state(); return { original: s.original.s, layer: s.layer.s, rows: s.rows.s, display: s.view.display, prefs: s.prefs, crashed: s.crashed } })
const probe = page => page.evaluate(() => window.__reader.probe())
async function openReader(query = {}) {
  const page = track(await context.newPage())
  await page.goto(readerUrl({ live: '1', paper: PAPER, ...query }))
  return page
}
/** the paper's pages counted on the left, and the extension's settings read: the reader has opened the paper */
const paperOpened = (page, timeout = 30_000) => page.waitForFunction(() => { const s = window.__reader?.controller?.getState(); return !!s?.settings && s.sides.left.pages > 0 }, null, { timeout }).then(() => true, () => false)
/** the right's pages laid: the reader's own count */
const laid = (page, n = 1, timeout = 45_000) => page.waitForFunction(n => (window.__reader?.probe?.().laidPages ?? 0) >= n, n, { timeout }).then(() => true, () => false)
const setConfig = change => worker.evaluate(async change => {
  const { config } = await chrome.storage.local.get('config')
  const next = { ...config }
  for (const [k, v] of Object.entries(change)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...config[k], ...v } : v
  await chrome.storage.local.set({ config: next })
}, change)
/** the store of papers on this machine emptied (src/cache/paper-store.ts PAPER_DB), from a page of the extension's origin */
const clearPaperStore = async () => {
  const p = await extensionPage()
  const got = await p.evaluate(name => new Promise(ok => {
    const q = indexedDB.deleteDatabase(name)
    const t = setTimeout(() => ok('timed out'), 10_000)
    q.onsuccess = () => { clearTimeout(t); ok('deleted') }
    q.onerror = () => { clearTimeout(t); ok(`error ${q.error?.name}`) }
  }), 'axt-layer')
  await p.close()
  return got
}

try {
  // ------------------------------------------------------------------------------------------------------- the guard
  section('the guard: what the route table does not name never leaves')
  {
    const page = await extensionPage()
    const settle = fetchOf => fetchOf.then(() => 'answered', e => `refused: ${String(e.message).slice(0, 40)}`)
    const fromPage = await settle(page.evaluate(() => fetch('https://not-in-the-table.invalid/from-a-page')))
    const fromWorker = await settle(worker.evaluate(() => fetch('https://not-in-the-table.invalid/from-the-worker')))
    const otherPath = await settle(page.evaluate(() => fetch('https://arxiv.org/pdf/1706.03762')))
    const otherApi = await settle(page.evaluate(host => fetch(`${host}/not-a-route`), API_HOSTS[0]))
    const seen = guard.violations.splice(0)
    const refused = answer => answer.startsWith('refused')
    check('a request to a host the table does not name, or to a path it has no answer for (arXiv\'s, our server\'s), is refused, from a page and from the extension\'s service worker, and recorded with who asked',
      [fromPage, fromWorker, otherPath, otherApi].every(refused) && seen.length === 4 && seen.some(v => v.from.includes('service worker')),
      `${seen.length} recorded (${seen.map(v => `${v.method} ${new URL(v.url).host}${new URL(v.url).pathname} from ${v.from}`).join('; ')})`)
    control('the run\'s last check, that no request left the route table, fails once one has', { ok: seen.length === 0, detail: `${seen.length} on the list` })
    await page.evaluate(() => { setTimeout(() => { throw new Error('thrown on purpose by the control') }, 0) })
    await sleep(300)
    const thrown = pageErrors.splice(0)
    control('the last check that no page threw fails once one has: an error thrown on purpose is on its list', { ok: thrown.length === 0, detail: `${thrown.length} error(s)` })
    await page.close()
  }

  // ------------------------------------------------------------------------------------------ the stand-in, on its hosts
  section('the stand-in of our server, on the build\'s hosts')
  {
    // the extension page, with the hosts granted, opens the paper and reads its layer as the reader's client does
    const ext = await extensionPage()
    for (const host of API_HOSTS) {
      const got = await ext.evaluate(async ({ host, paper }) => {
        const opened = await fetch(`${host}/api/v2/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paper, target: null, formats: [1] }) })
        const a = await opened.json()
        const catalog = a.doc?.layer?.catalog
        const object = catalog ? await fetch(`${host}/api/v2/o/${catalog.path}`) : null
        const bytes = object ? new Uint8Array(await object.arrayBuffer()) : new Uint8Array()
        const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('')
        return { status: opened.status, pv: a.doc?.pv, layer: !!catalog, cache: object?.headers.get('cache-control') ?? null, same: catalog ? hex === catalog.sha256 : false }
      }, { host, paper: PAPER })
      check(`the paper opened at ${new URL(host).host} by the extension's page: its document, its layer's catalog held to its digest, immutable`, got.status === 200 && got.pv === PV && got.layer && got.same && /immutable/.test(got.cache ?? ''), JSON.stringify(got))
    }
    // each fault the stand-in is told to give, as the page meets it
    const asPage = () => ext.evaluate(async host => {
      try {
        const r = await fetch(`${host}/api/v2/papers/${'x'}`, { signal: AbortSignal.timeout(1500) })
        return String(r.status)
      } catch (e) { return e.name === 'TimeoutError' ? 'no answer' : 'reset' }
    }, API_HOSTS[0])
    const met = {}
    for (const [name, fault] of Object.entries({ none: null, error: 503, reset: 'reset', hang: 'hang' })) {
      api.set({ fault })
      met[name] = await asPage()
    }
    await api.release()
    api.set({ fault: null })
    const expected = { none: '400', error: '503', reset: 'reset', hang: 'no answer' }
    const wrong = Object.entries(expected).filter(([k, v]) => met[k] !== v)
    check('each fault the stand-in is told to give reaches the page as itself: a server error, a reset, no answer', wrong.length === 0, JSON.stringify(met))
    control('an answer is not a reset (the check tells them apart)', { ok: met.none === met.reset, detail: `${met.none} and ${met.reset}` })
    await ext.close()
    api.set({ fresh: true })
  }

  // ----------------------------------------------------------------------------------------------------------- entries
  section('entries: the PDF page, its button and the popup open the reader on the paper')
  {
    const readerOver = async (page, wait = 20_000) => {
      const frame = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: wait }).catch(() => null)
      if (!frame) return { ok: false, detail: 'no reader over the page' }
      const reader = await frame.contentFrame()
      const pages = await reader.waitForFunction(() => window.__reader?.controller?.getState().sides.left.pages, null, { timeout: 30_000 }).then(h => h.jsonValue(), () => 0)
      await reader.waitForFunction(() => window.__reader?.controller?.getState().paper.title, null, { timeout: 10_000 }).catch(() => undefined)
      const s = pages ? await reader.evaluate(() => { const s = window.__reader.controller.getState(); return { id: s.paper.id, title: s.paper.title, display: s.display } }) : { id: null, title: '', display: null }
      const src = ((await frame.getAttribute('src')) ?? '').replace(/^chrome-extension:\/\/[a-z]+\//, '')
      return { ok: pages === fixture.pages && s.id === `${PAPER}v${fixture.version}` && s.title === TITLE, detail: `${src}; ${pages} pages, paper ${s.id} “${s.title}”, display ${s.display}` }
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
    check('the PDF page opens in the reader, and the reader opens the paper', first.ok, first.detail)
    await page.screenshot({ path: `${SHOTS}/reader-v2-entry.png` })

    await setConfig({ pdfReader: { enabled: false } })
    const off = track(await context.newPage())
    await off.goto(`https://arxiv.org/pdf/${PAPER}`)
    await sleep(2500)
    const offButton = await off.evaluate(() => document.querySelectorAll('.axt-floating').length)
    control('the reader off in the settings, the PDF page does not open it (the browser\'s viewer and the floating button instead)', { ...(await readerOver(off, 2000)), detail: `${offButton} floating button` })
    await off.close()
    await setConfig({ pdfReader: { enabled: true } })

    const left = await leave(page)
    await sleep(2500)
    const buttons = await page.evaluate(() => document.querySelectorAll('.axt-floating').length)
    check('the reader\'s way back takes it off the page, and the floating button is there', left && buttons === 1, `reader gone ${left}, ${buttons} floating button`)
    control('the reader is not over the page once it has been left (what the next checks start from)', await readerOver(page, 1500))

    const target = await page.evaluate(() => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
    await page.mouse.click(target.x, target.y)
    await sleep(2500)
    const panel = page.frames().find(f => f.url().includes('/popup.html'))
    const entries = panel ? await panelEntries(panel) : []
    const [html, pdf] = [entries.find(e => /HTML/.test(e.text)), entries.find(e => /PDF/.test(e.text))]
    check('the button\'s panel offers both entries: the PDF one for the paper, the HTML one greyed (it has no HTML page)', !!pdf && !pdf.disabled && !!html && html.disabled, JSON.stringify(entries))
    await pressEntry(panel, 'pdf')
    const viaPanel = await readerOver(page)
    check('the panel\'s PDF entry opens the reader on the paper, asking for a translation', viaPanel.ok && /ask=translate/.test(viaPanel.detail), viaPanel.detail)

    const readerOnPage = () => page.evaluate(() => !!document.querySelector('iframe[data-axt-pdf-reader]'))
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
    check('the popup\'s PDF entry opens the reader on the paper, over this page, and no second tab of the paper', viaPopup.ok && /ask=translate/.test(viaPopup.detail) && tabs === 1, `${viaPopup.detail}; ${tabs} tab(s) of the paper`)
    if (!popup.isClosed()) await popup.close()
    await page.close()
  }

  // ------------------------------------------------------------------------------- the page's end: away and back (the cache)
  section('the reader\'s tab left by a navigation and come back to: the back-forward cache keeps the reader, or Chrome caches no such page')
  {
    // (the coordinator's ruling of 2026-11-13: the reader is closed only on a pagehide that is not persisted. Either the page is
    // restored from the cache and its reader is alive and translates a page it had not asked for, its messages to the background
    // asked anew; or Chrome does not cache the page, and the case cannot arise: which, the navigation's type says)
    const page = track(await context.newPage())
    await page.addInitScript(() => { addEventListener('pageshow', e => { window.__axtShown = [...(window.__axtShown ?? []), e.persisted] }) })
    // (Chrome's reasons unmasked, through the DevTools protocol: the page's own API masks a cross-origin frame's, the reader's)
    const notUsed = []
    const cdp = await context.newCDPSession(page)
    await cdp.send('Page.enable')
    cdp.on('Page.backForwardCacheNotUsed', e => { for (const x of e.notRestoredExplanations ?? []) notUsed.push(`${x.type}:${x.reason}`) })
    await setConfig({ targetLanguage: 'deu' })
    await page.goto(`https://arxiv.org/pdf/${PAPER}`)
    const frameOf = async () => (await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 20_000 }).catch(() => null))?.contentFrame()
    let reader = await frameOf()
    await reader?.waitForFunction(() => (window.__reader?.probe?.().laidPages ?? 0) >= 1, null, { timeout: 45_000 }).catch(() => undefined)
    await reader?.evaluate(() => { window.__axtMark = 'before' })
    await page.goto(`https://arxiv.org/abs/${PAPER}`)
    await sleep(1000)
    await page.goBack()
    await sleep(2500)
    // (Chrome's own word on why a page was not restored, where it gives one: PerformanceNavigationTiming.notRestoredReasons)
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0]
      const why = n?.notRestoredReasons
      const reasons = r => (r ? [...(r.reasons ?? []).map(x => x.reason ?? x), ...(r.children ?? []).flatMap(reasons)] : [])
      return { type: n?.type ?? null, shown: window.__axtShown ?? [], notRestored: reasons(why) }
    })
    nav.chrome = [...new Set(notUsed)]
    await cdp.detach().catch(() => undefined)
    reader = await frameOf()
    const restored = nav.shown.includes(true)
    const kept = reader ? await reader.evaluate(() => window.__axtMark === 'before').catch(() => false) : false
    if (restored) {
      // the reader kept: alive, and a page it had not asked for (another target's) translated through the background
      const posts = echo.seen.post
      await setConfig({ targetLanguage: 'spa' })
      const translated = await reader.waitForFunction(() => { const s = window.__reader.reader.state(); return s.rows.target === 'es' && s.rows.s === 'complete' }, null, { timeout: 30_000 }).then(() => true, () => false)
      check('restored from the back-forward cache: the reader kept as it was, alive, and another target translated through the background (its messages asked anew)', kept && translated && echo.seen.post > posts, JSON.stringify({ nav, kept, translated, asks: echo.seen.post - posts }))
      await setConfig({ targetLanguage: 'deu' })
    } else {
      const acting = reader ? await reader.waitForFunction(() => (window.__reader?.controller?.getState().sides.left.pages ?? 0) > 0, null, { timeout: 30_000 }).then(() => true, () => false) : false
      check('not restored from the back-forward cache (Chrome caches no such page: the case cannot arise): the page loaded again, its reader anew and acting', !kept && acting, JSON.stringify({ nav, kept, acting }))
    }
    note(`the back-forward cache and the reader's page: navigation ${nav.type}, pageshow persisted ${JSON.stringify(nav.shown)}`)
    await page.close()
  }

  // ---------------------------------------------------------------------------------------------------- the original's faults
  section('the original\'s faults, those that need no translated view')
  {
    const original = readerUrl({ live: '1', paper: PAPER, mode: 'original' })
    const loadedPage = track(await context.newPage())
    await loadedPage.goto(original, { waitUntil: 'commit' }).catch(() => undefined)
    const complete = await loadedPage.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15_000 }).then(() => true, () => false)
    check('the original display finishes loading though nothing is translated', complete && (await paperOpened(loadedPage)), await loadedPage.evaluate(() => document.readyState))
    await loadedPage.close()

    // a link out of the paper on the left opens in a new tab, not in the reader's own frame
    const reader = await openReader({ mode: 'original' })
    await paperOpened(reader)
    const anchor = reader.locator(`.annotationLayer a[href="${LINK}"]`)
    let link = null
    for (const p of [1, 2]) {
      await reader.evaluate(p => window.__reader.controller.goToPage('left', p), p)
      link = await anchor.first().waitFor({ timeout: 5_000 }).then(() => anchor.first().evaluate(a => ({ href: a.href, target: a.target })), () => null)
      if (link) break
    }
    check('a link out of the paper is set to open in a new tab', link?.target === '_blank' && link.href === LINK, JSON.stringify(link))
    const opened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await anchor.first().click().catch(() => undefined)
    const tab = await opened
    await tab?.waitForLoadState('load').catch(() => undefined)
    check('and a click on it opens the page in a new tab, the reader staying where it is', tab?.url() === LINK && reader.url().includes('pdf-reader.html'), `opened ${tab?.url() ?? 'nothing'}`)
    await tab?.close()
    await reader.close()

    // a PDF that cannot be fetched says so, in the display it was opened in, and mends when the PDF comes
    const failedWith = async (answer, display) => {
      pdfAnswer = answer
      const page = await openReader({ mode: display })
      await sleep(4000)
      const result = { page, state: await readerState(page), visible: await page.locator('div.card[data-card]').isVisible() }
      pdfAnswer = 'ok'
      return result
    }
    const says = r => ({ ok: r.state.phase === 'failed' && r.state.failure === 'network' && r.state.sides.left.pages === 0, detail: `phase ${r.state.phase}, failure ${r.state.failure}, ${r.state.sides.left.pages} pages, card ${r.visible ? 'shown' : 'not shown'}` })
    for (const answer of ['not found', 'unavailable', 'not a PDF', 'reset']) {
      const r = await failedWith(answer, 'bilingual')
      const said = says(r)
      check(`the PDF answered “${answer}”: the reader says it could not be read, shows its card, and keeps the display`, said.ok && r.visible && r.state.display === 'bilingual', said.detail)
      // a failure the session asks again by itself (the network's, a server error: PDF-READER §8.1, the original opened again
      // a second on, no retry offered) mends by itself; another, by the card's button
      if (r.state.selfAsks?.pdf) {
        const mended = await paperOpened(r.page, 15_000)
        check('… and the reader asks again by itself, no retry offered, now that the PDF is there: the paper opens', mended, `${(await readerState(r.page)).sides.left.pages} pages`)
      } else {
        const before = await paperOpened(r.page, 200)
        await r.page.locator('div.card[data-card] button').first().click().catch(() => undefined)
        const mended = await paperOpened(r.page, 15_000)
        check('… and the card\'s button asks again, now that the PDF is there: the paper opens (it was not open before)', !before && mended, `${(await readerState(r.page)).sides.left.pages} pages`)
      }
      await r.page.close()
    }
    const fine = await openReader({ mode: 'bilingual' })
    await paperOpened(fine)
    control('a PDF that is there raises no such failure: the same assertion, on the paper opened', says({ state: await readerState(fine), visible: await fine.locator('div.card[data-card]').isVisible() }))
    await fine.close()
  }

  // ----------------------------------------------------------------------------------------------- an address's paper
  section('a ?paper= that is no arXiv id')
  {
    const violationsBefore = guard.violations.length, errorsBefore = pageErrors.length
    const bad = track(await context.newPage())
    for (const paper of ['xv3', '../list/cs.AI/new']) {
      await bad.goto(readerUrl({ live: '1', paper, ask: 'translate' }))
      await bad.waitForFunction(() => !!window.__reader?.controller, null, { timeout: 15_000 }).catch(() => undefined)
      await sleep(1500)
    }
    const state = await bad.evaluate(() => { const s = window.__reader?.controller?.getState(); return s ? { noPaper: s.noPaper, id: s.paper.id } : null })
    const card = await bad.locator('div.card').count()
    check('a ?paper= that is no arXiv id (xv3, ../list/cs.AI/new): an address with no paper, its card shown, nothing thrown, nothing asked of arXiv or anyone',
      state?.noPaper === true && card > 0 && pageErrors.length === errorsBefore && guard.violations.length === violationsBefore,
      `${JSON.stringify(state)}, ${card} card(s); ${pageErrors.length - errorsBefore} error(s), ${guard.violations.length - violationsBefore} refused`)
    await bad.close()
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
    const becomes = async (name, read, expected, change, page) => {
      const before = await read()
      await change()
      await settle(page)
      const after = await read()
      check(name, !Object.is(before, expected) && Object.is(after, expected), `${JSON.stringify(before)}, then ${JSON.stringify(after)}`)
      return { before, after }
    }

    const a = await open()
    const first = await becomes('a change of the settings moves the display', () => display(a), 'translation', () => patch(a, { mode: 'only', pdfReader: { original: false } }), a)
    const b = await open()
    check('a reader opens in the display the settings ask for (the one opened before the change was in another)', (await display(b)) === 'translation' && first.before !== 'translation', `${await display(b)}; before the change: ${first.before}`)

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

    await becomes('the sync goes off with its setting', async () => (await readerState(b)).sync, false, () => patch(b, { pdfReader: { sync: false } }), b)
    const syncBefore = await readerState(b)
    await b.evaluate(() => window.__reader.controller.setSync(true))
    await settle(b)
    const synced = await readerState(b)
    check('the reader\'s switch writes the sync back, and the sides scroll together again', syncBefore.settings.pdfReader.sync === false && syncBefore.sync === false && synced.settings.pdfReader.sync === true && synced.sync === true, `setting ${syncBefore.settings.pdfReader.sync}, then ${synced.settings.pdfReader.sync}; applied ${syncBefore.sync}, then ${synced.sync}`)

    const stored = (await readerState(b)).settings.pdfReader.original
    const c = await open({ mode: 'original' })
    await settle(c)
    const afterAddress = (await readerState(c)).settings.pdfReader.original
    check('an address that names a display writes nothing', afterAddress === stored, `stored ${stored}, now ${afterAddress}`)
    await patch(c, { mode: 'only', pdfReader: { original: false } })
    await settle(c)
    check('and holds it whatever the settings say', (await display(c)) === 'original', await display(c))
    control('a reader that holds its display does not follow the settings (the check that another reader follows, run on it)', { ok: (await display(c)) === 'translation', detail: `${await display(c)} while the settings say translation` })

    await chosen(b, 'translation')
    const shownBefore = await display(b)
    await patch(a, { reading: { openIn: 'same-tab' } })
    await settle(b)
    check('a change of nothing it shows leaves the display', shownBefore === 'translation' && (await display(b)) === 'translation', await display(b))

    const stored0 = await b.evaluate(() => chrome.storage.local.get('config').then(r => r.config))
    const errors = []
    b.on('pageerror', e => errors.push(e.message))
    const unreadableBefore = (await readerState(b)).settingsUnreadable
    const displayBefore = await display(b)
    // (the session's settings, chosen display and refusals at each change from here, for the check's detail)
    await b.evaluate(() => {
      const r = window.__reader.reader
      window.__trail = []
      let last = ''
      r.subscribe(() => { const s = r.state(); const k = `${s.settings.s}:${s.prefs.display}:${s.settings.refused}`; if (k !== last) window.__trail.push(k); last = k })
    })
    await b.evaluate(c0 => chrome.storage.local.set({ config: { ...c0, mode: 'nonsense' } }), stored0)
    await settle(b)
    await b.evaluate(() => window.__trail.push('-- chosen: original'))
    await chosen(b, 'original')
    const after = await readerState(b)
    check('unreadable settings: a refused write says so, and it was not so before', unreadableBefore === false && after.settingsUnreadable === true, `before ${unreadableBefore}, after ${after.settingsUnreadable}`)
    const inSession = await b.evaluate(() => { const s = window.__reader.reader.state(); return { shown: s.view.display, chosen: s.prefs.display, ...s.settings, trail: window.__trail } })
    check('unreadable settings: the display chosen holds', displayBefore !== 'original' && after.display === 'original', `${displayBefore}, then ${after.display}; the session's ${JSON.stringify(inSession)}`)
    check('unreadable settings: nothing thrown', errors.length === 0, errors.join('; '))
    const d = await open({ mode: 'original' })
    check('unreadable settings: a reader opened on them knows at once', (await readerState(d)).settingsUnreadable === true)
    await d.close()
    await b.evaluate(c0 => chrome.storage.local.set({ config: c0 }), stored0)
    await settle(b)
    const repaired = await readerState(b)
    check('repaired settings are known (they were not before)', after.settingsUnreadable === true && repaired.settingsUnreadable === false, `${after.settingsUnreadable}, then ${repaired.settingsUnreadable}`)

    // asked to translate (#readarxiv on the PDF address, passed as ask=translate; PDF-READER §2): the original left on is
    // let go, and the reader opens in the translated display the mode names (the feature list's A3)
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
    await patch(e, { mode: 'side', pdfReader: { original: false, sync: true }, reading: { openIn: 'new-tab' } })
    for (const page of [a, b, c, e]) await page.close()
  }

  // -------------------------------------------------------------------------------- the reader on the layer (part 2)
  await import('./reader-v2-layer.mjs').then(m => m.layerChecks({ context, worker, id, api, fixture, PAPER, PV, TITLE, LINK, echo, guard, asked, pageErrors, track, extensionPage, readerState, sessionState, probe, openReader, paperOpened, laid, setConfig, clearPaperStore, setPdfAnswer: a => { pdfAnswer = a }, section, check, control, note, sleep, SHOTS }))

  // -------------------------------------------------------------------------------------------- what the run did not do
  section('what the run did not do')
  check('no request left the route table', guard.violations.length === 0, guard.violations.length ? guard.violations.map(v => `${v.method} ${v.url} from ${v.from}`).join('; ') : `${guard.hosts.length} hosts answered`)
  check('no page of the reader or of the extension threw', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  const v1 = api.requests.filter(r => r.path.startsWith('/api/v1/'))
  check('nothing asked of our server\'s old routes (/api/v1)', v1.length === 0, v1.map(r => r.path).join(', ') || 'none')
} catch (e) {
  check('the run ended without an exception', false, String(e?.stack ?? e).slice(0, 600))
} finally {
  await api.release()
  for (const r of held) await r.abort('timedout').catch(() => {})
  await context.close().catch(() => {})
  await echo.close()
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
for (const f of failed) console.log(`FAILED [${f.section}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
process.exit(failed.length ? 1 : 0)
