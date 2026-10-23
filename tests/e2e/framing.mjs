// The extension's two framed pages, the PDF reader and the popup, in a real browser and with no network (DESIGN §4.0c,
// PDF-READER §11.1): every way the extension itself opens them still works, and a page that frames them gets nothing.
// The paper is the repository's sample (tests/fixtures/pdf/sample-1/), served at arXiv's addresses by one route table that
// is also the guard (lib/route-table.mjs); the layer API is its stand-in (lib/layer-api.mjs), translation the echo
// endpoint (lib/echo-endpoint.mjs).
//
// The extension's own flows: the PDF page's entry, a reload of that tab, the reader's own reload (a new target language
// loads it again), Back to the reader, the floating button's panel, the toolbar's popup, the abstract page's entry, the
// full text's panel translating its page, and a framed panel acting on its own tab while another tab is in front.
// What a page that frames them gets: the static address lands on an error page, and so does the dynamic one from any
// origin but arXiv's; framed from arXiv's own page with the dynamic address, the reader starts no run, fetches nothing
// and writes no setting, whatever its address asks, and the popup draws nothing; and an arXiv page that sends its own tab
// to the reader's address gets the same nothing (a release build's reader acts only in a frame its PDF page made). The
// build runs as it ships (`topLevel: false`: no harness key in its manifest).
//
// Usage: pnpm build && pnpm e2e:framing     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FACES } from '../../src/pdf-reader/engine/rules/font-roles.mjs'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { layerApi, serves } from './lib/layer-api.mjs'
import { cutSample, sampleFiles } from './lib/layer-cut.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-framing`

// ---- the paper and the stand-in of the layer API (as reader.mjs has them)
const sampleCut = await cutSample(sampleFiles())
const LATIN_FACE = readFileSync(fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const PAPER = sample.id
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
/** the panel's and the popup's two entries and its translate button (its words, then its shortcut), in either interface language */
const ENTRY = { html: 'Translate HTML|HTML \u7ffb\u8bd1', pdf: 'Translate PDF|PDF \u7ffb\u8bd1', translate: '^(Translate this page|\u7ffb\u8bd1\u672c\u9875)' }
/** a full-text page of the repository's own (tests/fixtures/arxiv/), for the panel there */
const FULL_TEXT = { id: '2410.00260', html: readFileSync(fileURLToPath(new URL('../fixtures/arxiv/2410.00260.html', import.meta.url))) }

// ---- reporting
const results = []
let current = ''
const section = name => { current = name; console.log(`\n# ${name}`) }
const check = (name, ok, detail = '') => {
  results.push({ section: current, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const control = (name, result) => check(`control: ${name}`, !result.ok, result.detail)
/** rows that need the reader, on a browser that does not offer it (src/pdf-reader/support.ts: Chrome 131, the floor) */
const notApplicable = []
const floor = name => { notApplicable.push({ section: current, name }); console.log(`N/A  ${name} — the reader is not offered on this browser (src/pdf-reader/support.ts)`) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---- the network: one table, which is also the guard
/** what a framing page is: its body, set by the check that serves it */
const framers = { arxiv: '', other: '' }
/** what arXiv was asked, by path */
const asked = []
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="The sample"><div class="submission-history"><strong>[v${sample.version}]</strong></div><div class="full-text"><ul><li><a class="download-eprint" href="/src/${PAPER}">TeX Source</a></li></ul></div>`
const arxiv = (route, url) => {
  asked.push(`${route.request().method()} ${url.pathname}`)
  if (url.pathname === '/framer') return route.fulfill({ status: 200, contentType: 'text/html', body: framers.arxiv })
  // the full text, and what it asks of arXiv besides (its style sheets, scripts and figures: none served)
  if (url.pathname === `/html/${FULL_TEXT.id}v1`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FULL_TEXT.html })
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith(`/html/${FULL_TEXT.id}`)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, sample.pdf.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${sample.pdf.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(sample.pdf.subarray(begin, end)) })
}
const elsewhere = (route, url) => (url.pathname === '/framer' ? route.fulfill({ status: 200, contentType: 'text/html', body: framers.other }) : false)

const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
const { context, worker, id } = await launchWithReader({ profile: 'framing-checks', extension: EXT, topLevel: false, headless: !process.env.AXT_HEADED, viewport: { width: 1280, height: 860 }, args: [RESOLVER_WALL] })
const guard = await routeTable(context, [
  ['https://arxiv.org', arxiv],
  ['https://example.invalid', elsewhere],
  // the full text's web fonts' style sheet: not served
  ['https://use.typekit.net', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })],
  [echo.origin, route => route.continue()],
  ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
])
// (polled until the worker's extension bindings are there: Chrome 131 binds them a moment after the worker starts)
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })

const pageErrors = []
const track = page => { page.on('pageerror', e => pageErrors.push(`${page.url().slice(0, 60)}: ${e.message}`)); return page }
const config = () => worker.evaluate(async () => (await chrome.storage.local.get('config')).config)
const setReader = change => worker.evaluate(async change => {
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, pdfReader: { ...config.pdfReader, ...change } } })
}, change)
/** the session's dynamic addresses of the two pages, as `runtime.getURL` gives them */
const dynamic = await worker.evaluate(() => ({ reader: chrome.runtime.getURL('/pdf-reader.html'), popup: chrome.runtime.getURL('/popup.html') }))
/** the layer API's answers for the sample so far: a run asks it */
const layerAsks = () => api.requests.filter(r => r.path.startsWith(`/api/v1/layer/${PAPER}v`)).length

/** the reader over a PDF page: its frame's address, whether it acts (its controller), the sample's pages, its run */
async function readerOn(page, { wait = 30_000, run = true } = {}) {
  const el = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: wait }).catch(() => null)
  // (each wait below is for its signal, with room for a loaded machine: the controller counting the sample's pages, the run)
  if (!el) return { ok: false, detail: 'no reader over the page' }
  const src = (await el.getAttribute('src')) ?? ''
  const frame = await el.contentFrame()
  const pages = await frame?.waitForFunction(() => window.__reader?.controller?.getState().sides.left.pages, null, { timeout: 60_000 }).then(h => h.jsonValue(), () => 0)
  const ran = run ? await frame?.waitForFunction(() => !!window.__reader?.run, null, { timeout: 30_000 }).then(() => true, () => false) : null
  const display = pages ? await frame.evaluate(() => window.__reader.controller.getState().display) : null
  const at = new URL(src).host
  return { frame, src, pages, ran, display, dynamicAddress: at !== id, detail: `${src.replace(/^chrome-extension:\/\/[^/]+/, '')} (${at === id ? 'the static id' : 'the session\'s dynamic id'}); ${pages} pages, display ${display}, run ${ran}` }
}
const acts = r => !!r.frame && r.pages > 0 && r.dynamicAddress && r.ran !== false
/** the floating button's main button, once the page has drawn it, where a pointer would press it */
const mainButton = page => page.waitForFunction(() => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}, null, { timeout: 20_000 }).then(h => h.jsonValue(), () => null)
const panelOf = async page => {
  const target = await mainButton(page)
  if (!target) return null
  await page.mouse.click(target.x, target.y)
  // (the one of the page's popup frames that draws, once it is vouched for: a page that frames the popup itself may have one there too)
  for (let i = 0; i < 100; i++) {
    for (const panel of page.frames().filter(f => f.url().includes('/popup.html'))) {
      if ((await panel.evaluate(() => document.querySelectorAll('button').length).catch(() => 0)) > 0) return panel
    }
    await sleep(200)
  }
  return null
}
const entries = frame => frame.evaluate(({ html, pdf }) => [...document.querySelectorAll('button')].filter(b => new RegExp(`${html}|${pdf}`).test(b.textContent ?? '')).map(b => ({ text: b.textContent?.trim(), disabled: b.getAttribute('aria-disabled') === 'true' })), ENTRY)
/** press an entry once it is offered: the popup asks its page for the paper's entries after it draws, and an entry it has
 *  not heard of yet is greyed and presses nothing. Whether it was offered and pressed (a popup that acts may close itself
 *  at once, its frame with it: that is no failure of the press) */
const press = async (frame, which) => {
  const offered = await frame.waitForFunction(re => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(re).test(x.textContent?.trim() ?? ''))
    return !!b && b.getAttribute('aria-disabled') !== 'true'
  }, ENTRY[which], { timeout: 20_000 }).then(() => true, () => false)
  if (offered) await frame.evaluate(re => [...document.querySelectorAll('button')].find(x => new RegExp(re).test(x.textContent?.trim() ?? ''))?.click(), ENTRY[which]).catch(() => undefined)
  return offered
}
/** what a page of ours shows in a frame: its root's children and its buttons */
const drawn = frame => frame.evaluate(() => ({ root: document.getElementById('root')?.childElementCount ?? null, buttons: document.querySelectorAll('button').length, reader: typeof window.__reader })).catch(e => ({ error: e.message.slice(0, 60) }))

try {
  // ------------------------------------------------------------------------------------------- the extension's own flows
  section('the extension\'s own ways into the reader and the popup')
  await setReader({ enabled: true, original: false })
  const page = track(await context.newPage())
  let before = layerAsks()
  await page.goto(`https://arxiv.org/pdf/${PAPER}`)
  // whether this browser offers the reader at all: one of the built-ins its PDF.js needs stands for the rest, as e2e:pdf has it
  const READER = await page.evaluate(() => typeof Map.prototype.getOrInsertComputed === 'function')
  console.log(`(${READER ? 'the reader is offered on this browser' : 'the reader is not offered on this browser: arXiv\'s PDF stays in its viewer'})`)
  if (READER) {
    const entry = await readerOn(page)
    check('the PDF page\'s entry: the reader over the page, at the session\'s dynamic address, opens the sample and starts its run', acts(entry) && layerAsks() > before, `${entry.detail}; ${layerAsks() - before} asks of the layer API`)

    before = layerAsks()
    await page.reload()
    const reloaded = await readerOn(page)
    check('a reload of the reader\'s tab: the reader again, acting, its run started again', acts(reloaded) && layerAsks() > before, `${reloaded.detail}; ${layerAsks() - before} asks of the layer API`)

    // the reader's own reload, as a new target language makes it (host.ts landed → location.reload())
    await reloaded.frame.evaluate(() => location.reload())
    await sleep(1500)
    const own = await readerOn(page)
    check('the reader\'s own reload (a new target language loads it again): it acts again, in the same frame', acts(own), own.detail)

    await page.goto(`https://arxiv.org/abs/${PAPER}`)
    await sleep(1500)
    await page.goBack()
    const back = await readerOn(page)
    check('Back to the reader: the reader again over the PDF page, acting', acts(back) && /\/pdf\//.test(page.url()), `${back.detail}; at ${page.url()}`)
  } else {
    await sleep(3000)
    const kept = await page.evaluate(() => ({ framed: !!document.querySelector('iframe[data-axt-pdf-reader]'), buttons: document.querySelectorAll('.axt-floating').length }))
    check('on a browser the reader cannot run on, the PDF page keeps the browser\'s viewer, with the floating button', !kept.framed && kept.buttons === 1 && layerAsks() === before, `${JSON.stringify(kept)}; ${layerAsks() - before} asks of the layer API`)
    for (const name of ['a reload of the reader\'s tab', 'the reader\'s own reload', 'Back to the reader']) floor(name)
  }

  // the floating button's panel, with the reader off in the settings: the panel is a framed popup that acts
  await setReader({ enabled: false })
  await page.goto('about:blank')
  await page.goto(`https://arxiv.org/pdf/${PAPER}`)
  await sleep(2500)
  const panel = await panelOf(page)
  const offered = panel ? await entries(panel) : []
  // (where the reader is not offered, the panel's PDF entry is not either: the panel is drawn, and its HTML entry is there)
  check('the floating button\'s panel draws the popup, framed and vouched for, with the paper\'s entries', READER ? offered.some(e => /PDF/.test(e.text) && !e.disabled) : offered.length > 0, JSON.stringify(offered))
  if (READER) {
    if (panel) await press(panel, 'pdf')
    const viaPanel = await readerOn(page)
    check('the panel\'s PDF entry opens the reader on this page, asking for a translation, and it acts', acts(viaPanel) && /ask=translate/.test(viaPanel.src) && viaPanel.display !== 'original', viaPanel.detail)

    // the toolbar's popup: a page of its own, acting on the active tab
    await page.goto('about:blank')
    await page.goto(`https://arxiv.org/pdf/${PAPER}`)
    await sleep(2500)
    const popup = track(await context.newPage())
    await popup.goto(`chrome-extension://${id}/popup.html`)
    await page.bringToFront()
    await sleep(2500)
    await press(popup, 'pdf')
    const viaPopup = await readerOn(page)
    check('the toolbar popup\'s "open the bilingual version": the reader over the PDF page in front, asking for a translation, acting', acts(viaPopup) && /ask=translate/.test(viaPopup.src), viaPopup.detail)
    if (!popup.isClosed()) await popup.close()

    // the abstract page: its floating button's panel offers the PDF entry (the page shows arXiv's TeX source link), which
    // opens the paper's PDF in a new tab (`reading.openIn`, by default), the reader over it
    await page.goto(`https://arxiv.org/abs/${PAPER}`)
    await sleep(2500)
    const absPanel = await panelOf(page)
    const tabOpened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null)
    if (absPanel) await press(absPanel, 'pdf')
    const pdfTab = await tabOpened
    if (pdfTab) track(pdfTab)
    const viaAbs = pdfTab ? await readerOn(pdfTab) : { detail: 'no tab opened' }
    if (pdfTab) viaAbs.detail = `${viaAbs.detail}; the new tab at ${pdfTab.url()}`
    check('the abstract page\'s entry: the paper\'s PDF in a new tab, the reader over it, asking for a translation, acting; the abstract stays', !!absPanel && acts(viaAbs) && /ask=translate/.test(viaAbs.src) && /\/abs\//.test(page.url()), `${absPanel ? 'panel drawn' : 'no panel'}; ${viaAbs.detail}`)
    await pdfTab?.close()
  } else {
    for (const name of ['the panel\'s PDF entry opens the reader', 'the toolbar popup\'s "open the bilingual version"', 'the abstract page\'s entry']) floor(name)
  }

  // the full text: the column's panel button opens the panel, whose button translates this page
  await page.goto(`https://arxiv.org/html/${FULL_TEXT.id}v1`)
  await sleep(2500)
  const dock = selector => page.evaluate(sel => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null }, selector)
  const rest = await mainButton(page)
  if (rest) { await page.mouse.move(rest.x, rest.y, { steps: 3 }); await sleep(900) }
  const panelButton = await dock('.axt-fb-panel')
  if (panelButton) await page.mouse.click(panelButton.x, panelButton.y)
  let fullPanel = null
  for (let i = 0; i < 30 && !fullPanel; i++) {
    for (const f of page.frames().filter(f => f.url().includes('/popup.html'))) if ((await f.evaluate(() => document.querySelectorAll('button').length).catch(() => 0)) > 0) fullPanel = f
    if (!fullPanel) await sleep(200)
  }
  const echoed = echo.seen.post
  const translatePressed = fullPanel ? await press(fullPanel, 'translate') : false
  const labels = translatePressed || !fullPanel ? '' : `; its buttons ${JSON.stringify(await fullPanel.evaluate(() => [...document.querySelectorAll('button')].map(b => `${b.textContent?.trim().slice(0, 24)}${b.getAttribute('aria-disabled') === 'true' ? ' (greyed)' : ''}`)).catch(() => []))}`
  const translatedNodes = await page.waitForFunction(() => document.querySelectorAll('.axt-t').length > 0 && document.body.textContent.includes('[echo]'), null, { timeout: 30_000 }).then(() => page.evaluate(() => document.querySelectorAll('.axt-t').length), () => 0)
  check('the full text\'s panel: the popup framed and vouched for, its button translates this page (through the extension\'s own service)', translatePressed && translatedNodes > 0 && echo.seen.post > echoed, `${fullPanel ? 'panel drawn' : 'no panel'}, pressed ${translatePressed}; ${translatedNodes} translation nodes, ${echo.seen.post - echoed} translation requests${labels}`)

  // a framed panel acts on the tab its content script is in, not on whichever tab is in front: the panel open on tab A,
  // tab B in front, the entry pressed in A's panel
  if (READER) {
    await page.goto('about:blank')
    await page.goto(`https://arxiv.org/pdf/${PAPER}`)
    await sleep(2500)
    const panelA = await panelOf(page)
    const other = track(await context.newPage())
    await other.goto(`https://arxiv.org/abs/${PAPER}`)
    await other.bringToFront()
    await sleep(1500)
    const pressedA = panelA ? await press(panelA, 'pdf') : false
    const onA = await readerOn(page)
    const panelState = pressedA || !panelA ? '' : ` (the panel then: ${JSON.stringify(await panelA.evaluate(() => [...document.querySelectorAll('button')].map(b => `${b.textContent?.trim().slice(0, 16)}${b.getAttribute('aria-disabled') === 'true' ? ' (greyed)' : ''}`)).catch(e => `gone: ${e.message.slice(0, 60)}`))})`
    onA.detail = `${pressedA ? 'pressed' : `not pressed${panelState}`}; ${onA.detail}; its tab at ${page.url()}`
    await sleep(1500)
    check('a framed panel acts on its own tab with another in front: the reader opens over its tab, the tab in front is left where it was', !!panelA && acts(onA) && /\/abs\//.test(other.url()), `${onA.detail}; the tab in front at ${other.url()}`)
    await other.close()
  } else floor('a framed panel acts on its own tab with another in front (its PDF entry)')
  await setReader({ enabled: true })

  // ------------------------------------------------------------------------------------------------------- a framing page
  section('a page that frames the reader or the popup')
  // (the checks below count what nothing should cause: the readers of the rows above are let go first, or a run of theirs
  // still preparing asks the layer API in the middle of the count)
  await page.goto('about:blank')
  await sleep(1500)
  await setReader({ original: true })
  const settingsBefore = JSON.stringify(await config())
  // the static address, from arXiv's own page; the dynamic one from another origin
  framers.arxiv = `<!doctype html><title>framer</title><iframe src="chrome-extension://${id}/pdf-reader.html?paper=${PAPER}&ask=translate"></iframe>`
  const framer = track(await context.newPage())
  await framer.goto('https://arxiv.org/framer')
  await sleep(2500)
  const staticFrame = framer.frames().find(f => f !== framer.mainFrame())
  check('the reader\'s static address framed by an arXiv page lands on Chrome\'s error page', /^chrome-error:/.test(staticFrame?.url() ?? ''), staticFrame?.url() ?? 'no frame')
  framers.other = `<!doctype html><title>framer</title><iframe src="${dynamic.reader}?paper=${PAPER}&ask=translate"></iframe>`
  await framer.goto('https://example.invalid/framer')
  await sleep(2500)
  const otherOrigin = framer.frames().find(f => f !== framer.mainFrame())
  check('the dynamic address framed by a page of another origin than arXiv\'s lands on Chrome\'s error page too (the manifest\'s matches)', /^chrome-error:/.test(otherOrigin?.url() ?? ''), otherOrigin?.url() ?? 'no frame')

  // the dynamic address, hidden, from an arXiv page our content script runs on: the whole attack of issue #83
  const layerBefore = layerAsks(), echoBefore = echo.seen.post
  await framer.goto(`https://arxiv.org/abs/${PAPER}`)
  await sleep(1500)
  const pdfAsksBefore = asked.filter(a => a.includes('/pdf/')).length
  await framer.evaluate(src => { const f = Object.assign(document.createElement('iframe'), { src }); f.style.display = 'none'; document.body.append(f) }, `${dynamic.reader}?live=1&paper=${PAPER}&ask=translate`)
  await sleep(7000)
  const hidden = framer.frames().find(f => f.url().includes('pdf-reader.html'))
  const shown = hidden ? await drawn(hidden) : null
  const settingsAfter = JSON.stringify(await config())
  check('framed hidden by an arXiv page, asking for a translation: the reader draws nothing, starts no run, asks the layer API nothing, translates nothing, fetches no PDF',
    !!hidden && shown?.root === 0 && shown.reader === 'undefined' && layerAsks() === layerBefore && echo.seen.post === echoBefore && asked.filter(a => a.includes('/pdf/')).length === pdfAsksBefore,
    `${JSON.stringify(shown)}; ${layerAsks() - layerBefore} asks of the layer API, ${echo.seen.post - echoBefore} translations, ${asked.filter(a => a.includes('/pdf/')).length - pdfAsksBefore} PDF fetches`)
  check('… and writes no setting: the original left on stays on', settingsAfter === settingsBefore && JSON.parse(settingsAfter).pdfReader.original === true, `pdfReader ${JSON.stringify(JSON.parse(settingsAfter).pdfReader)}`)
  // the control: the same ask in the frame our content script makes is honoured — a run, and the original let go
  if (READER) {
    await page.goto('about:blank')
    await page.goto(`https://arxiv.org/pdf/${PAPER}#readarxiv`)
    const honoured = await readerOn(page)
    // (the write lands after the reader opens: waited for, up to 15 s)
    let letGo = false
    for (let i = 0; i < 75 && !letGo; i++) { letGo = (await config()).pdfReader.original === false; if (!letGo) await sleep(200) }
    check('control: the same ask in our own frame starts the run and lets the original go (what the checks above find absent is there)', acts(honoured) && letGo, `${honoured.detail}; pdfReader.original ${!letGo}`)
    await setReader({ original: true })
  } else floor('control: the same ask in our own frame starts the run')

  // the popup framed by that page: it draws nothing, so a click there acts on no tab
  await framer.evaluate(src => { const f = Object.assign(document.createElement('iframe'), { src }); f.style.cssText = 'position:fixed;inset:0;width:320px;height:480px;opacity:0.01'; document.body.append(f) }, dynamic.popup)
  await sleep(7000)
  const theirs = framer.frames().find(f => f.url().includes('/popup.html'))
  const theirsShown = theirs ? await drawn(theirs) : null
  check('the popup framed by an arXiv page that is not ours draws nothing: no button to click, so nothing acts on the framing tab', !!theirs && theirsShown?.root === 0 && theirsShown.buttons === 0 && /\/abs\//.test(framer.url()), `${JSON.stringify(theirsShown)}; the tab at ${framer.url()}`)
  const ours = await panelOf(framer)
  control('the panel our floating button frames on the same page draws its buttons', { ok: !ours, detail: ours ? `${(await drawn(ours)).buttons} buttons` : 'no panel' })
  await framer.close()

  // ------------------------------------------------------------------------------------- the reader as a page of its own
  // A page script on an arXiv page can read the panel's frame address (the button's shadow root is open) and send its own
  // tab there. A release build's reader then draws nothing and does nothing, whatever the address or the settings ask:
  // only the PDF page ever opens it, in a frame it vouches for (src/entrypoints/pdf-reader/main.tsx)
  section('an arXiv page that sends its own tab to the reader\'s address')
  // (the control's reader above let go first, as before the frames' checks)
  await page.goto('about:blank')
  await sleep(1500)
  for (const [query, original, why] of [
    [`?live=1&paper=${PAPER}&ask=translate`, true, 'asking for a translation, the original left on'],
    [`?live=1&paper=${PAPER}&mode=bilingual`, true, 'naming a translated display'],
    [`?live=1&paper=${PAPER}`, false, 'naming the paper alone, the settings on a translated display'],
  ]) {
    await setReader({ original })
    const before = JSON.stringify(await config()), layerAt = layerAsks(), echoAt = echo.seen.post, pdfAt = asked.filter(a => a.includes('/pdf/')).length
    const tab = track(await context.newPage())
    await tab.goto(`https://arxiv.org/abs/${PAPER}`)
    await tab.evaluate(url => { location.href = url }, `${dynamic.reader}${query}`)
    const arrived = await tab.waitForURL(/\/pdf-reader\.html/, { timeout: 15_000 }).then(() => true, () => false)
    // (an absence: the page is given its owner's answer's worth of time, and then some)
    await sleep(4000)
    const shown = arrived ? await drawn(tab.mainFrame()) : null
    // (Chrome 131 refuses an arXiv page's navigation to the address outright: its error page, measured; nothing either)
    const refused = !arrived && /^chrome-error:/.test(tab.url())
    const after = JSON.stringify(await config())
    check(`sent to the reader's address ${why}: it draws nothing, starts no run, asks the layer API nothing, translates nothing, fetches no PDF, writes no setting`,
      (refused || (arrived && shown?.root === 0 && shown.reader === 'undefined')) && layerAsks() === layerAt && echo.seen.post === echoAt && asked.filter(a => a.includes('/pdf/')).length === pdfAt && after === before,
      `${arrived ? tab.url().replace(/^chrome-extension:\/\/[^/]+/, '') : refused ? 'the browser refused the navigation (its error page)' : `never arrived (at ${tab.url()})`}; ${JSON.stringify(shown)}; ${layerAsks() - layerAt} asks of the layer API, ${echo.seen.post - echoAt} translations, ${asked.filter(a => a.includes('/pdf/')).length - pdfAt} PDF fetches, settings ${after === before ? 'unchanged' : 'changed'}`)
    await tab.close()
  }
  await setReader({ original: false })

  section('what nothing did')
  await api.release()
  check('no request left the route table', guard.violations.length === 0, guard.violations.map(v => `${v.method} ${v.url} from ${v.from}`).join('; ') || 'none')
  check('no page threw', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none')
} finally {
  await context.close().catch(() => undefined)
  await echo.close()
}

const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed${notApplicable.length ? `; ${notApplicable.length} row(s) not applicable on this browser (no reader): ${notApplicable.map(r => r.name).join('; ')}` : ''}`)
for (const r of results.filter(x => !x.ok)) console.log(`FAILED [${r.section}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
process.exit(pass === results.length ? 0 : 1)
