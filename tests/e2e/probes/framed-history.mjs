// The framed reader's history, probed (link previews, the way back; PDF-READER §11.9 "Followed"): where the extension's reader
// sits in the frame arXiv's PDF page is given (src/entrypoints/pdf.content.ts), does an entry the reader adds to its own
// frame's history come back through the browser's Back and Forward, without arXiv's page leaving the tab? Its answer decides
// whether the extension gives the framed reader history entries (the reader's `Host.history`) or the capsule alone carries the
// way back there. A reading, not a gate: each row prints what the browser did, and the run exits 0 whatever it saw (1 only
// where it could not look).
//
// The paper is the reader package's CC0 fixture s1-columns behind the stand-in of our server (lib/v2-api.mjs), arXiv's PDF
// address answered with its stand-in, every other request refused (lib/route-table.mjs), as e2e:framing has it. In the frame
// the probe puts a small target of its own over the reader; a real click on it (the mouse, so the frame has the user's
// activation) adds one entry, `history.pushState({ axt: { v: 1, n } }, '')`, as the reader's jump will. The rows:
//   P1  Back from the top (Playwright's page.goBack: DevTools' navigateToHistoryEntry): the frame hears popstate with the entry
//       before; the top's address and arXiv's page stay; the frame's document is the same one (not loaded again)
//   P2  Forward (page.goForward): popstate with n 1
//   P3  the frame's own history.back(): as P1 (then forward again)
//   P4  an entry added with no transient activation (from a timer, once navigator.userActivation.isActive is false): where
//       the browser's Back lands (Chrome's history intervention skips an entry added without the user's activation); recorded,
//       not judged
//   P5  Alt+ArrowLeft and Meta+BracketLeft sent by Playwright (DevTools' key events reach the page, not the browser's
//       accelerators: recorded)
//   P6  the browser's own Back command, chrome.tabs.goBack from the extension's worker: the browser's GoBack, which the toolbar's
//       Back, Alt+Left and Cmd+[ run (with the intervention's skipping, which DevTools' entry navigation has not); and with
//       AXT_HAND=<seconds> in a headed run, a window in which a person presses Alt+Left and Cmd+[ with the focus in the frame,
//       each popstate the frame hears printed as it comes
//   P7  arXiv's page left (the abstract) with the frame at an entry of its own, then the browser's Back three times: where
//       each lands, whether the reader comes back over the page and at which entry, and whether a Back is spent on nothing
//   P8  arXiv's page reloaded with the frame at an entry of its own, then Back twice: the same
// The back-forward cache is on, as a reader's Chrome has it (Playwright turns it off; AXT_BFCACHE=0 leaves it off).
//
// Usage: pnpm build && node tests/e2e/probes/framed-history.mjs
// Environment: AXT_HEADED=1 watches it; AXT_CHROME=<binary> runs another Chrome (a branded Chrome ignores --load-extension:
// the probe then loads the build through DevTools' Extensions.loadUnpacked); AXT_HAND=<seconds> the hand window (headed).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyWithGrants } from '../ext-copy.mjs'
import { chromiumOptions } from '../lib/chromium.mjs'
import { startEchoEndpoint } from '../lib/echo-endpoint.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'
import { loadFixture, v2Api } from '../lib/v2-api.mjs'
import { seedService } from '../options-page.mjs'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const { chromium } = createRequire(REPO)('playwright')
const BUILD = process.env.AXT_EXT_DIR ?? join(REPO, '.output/chrome-mv3')
const EXT = join(REPO, 'tests/e2e/.ext-framed-history')
const HEADED = !!process.env.AXT_HEADED
const HAND = Number(process.env.AXT_HAND ?? 0)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const LAYER_HOSTS = ['https://readarxiv.com']

const fixture = loadFixture('s1-columns')
const PAPER = fixture.paper
const pdfOf = (route) => {
  const bytes = fixture.pdf
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(bytes) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, bytes.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${bytes.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(bytes.subarray(begin, end)) })
}
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'html' || m[1] === 'src') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>stand-in abstract</title><div class="submission-history"><strong>[v${fixture.version}]</strong></div>` })
  return pdfOf(route)
}

// ---- the browser, the build loaded (Playwright's Chromium by --load-extension; a branded Chrome through DevTools)
const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(h => `${h}/*`)] })
const profile = mkdtempSync(join(tmpdir(), 'framed-history-'))
const branded = !!process.env.AXT_CHROME
// (a branded Chrome: the profile in developer mode, as a person loading an unpacked build has it)
if (branded) {
  mkdirSync(join(profile, 'Default'), { recursive: true })
  writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }))
}
const context = await chromium.launchPersistentContext(profile, chromiumOptions({
  ...(branded ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !HEADED,
  // (the back-forward cache on unless AXT_BFCACHE=0, as a reader's Chrome has it: Playwright launches with it off)
  // and, in a branded Chrome, Playwright's --disable-extensions left out: there it disables what DevTools loads
  ignoreDefaultArgs: [...(process.env.AXT_BFCACHE === '0' ? [] : ['--disable-back-forward-cache']), ...(branded ? ['--disable-extensions'] : [])],
  viewport: { width: 1280, height: 860 },
  args: [...(branded ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]), RESOLVER_WALL],
}, { partitioned: true }))
const leave = async () => {
  await context.close().catch(() => undefined)
  await echo.close()
  rmSync(profile, { recursive: true, force: true })
  rmSync(EXT, { recursive: true, force: true })
}
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null))
let loadedBy = '--load-extension'
if (!worker) {
  // (a branded Chrome since 137 ignores the switch: DevTools' Extensions domain loads it, on a browser session)
  try {
    const s = await context.browser().newBrowserCDPSession()
    const loaded = await s.send('Extensions.loadUnpacked', { path: EXT })
    loadedBy = `DevTools Extensions.loadUnpacked (${loaded.id})`
  } catch (e) {
    await leave()
    throw e
  }
}
// (a branded Chrome shows the build's service worker only once something wakes it: until then the reader's own frame, an
// extension page with the same chrome.tabs, makes the calls)
const id = worker ? new URL(worker.url()).host : /\(([a-p]{32})\)/.exec(loadedBy)[1]
let page = null
const ext = worker ?? {
  // (its service worker once the browser shows one, else the reader's frame; the abstract page has none)
  evaluate: async (fn, arg) => {
    const w = context.serviceWorkers().find(x => x.url().startsWith(`chrome-extension://${id}/`))
    if (w) return w.evaluate(fn, arg)
    const f = await (await page.$('iframe[data-axt-pdf-reader]'))?.contentFrame()
    if (!f) throw new Error('neither a service worker nor a reader frame to call chrome.tabs from')
    return f.evaluate(fn, arg)
  },
}
const version = await context.browser()?.version() ?? '(version not read)'
console.log(`browser: ${branded ? process.env.AXT_CHROME : 'Playwright\'s Chromium (Chrome for Testing)'} ${version}; ${HEADED ? 'headed' : 'headless'}; the build loaded by ${loadedBy}; chrome.* called from ${worker ? 'its service worker' : 'its service worker once shown, else the reader\'s frame'}`)
const api = v2Api({ fixtures: [fixture], base: LAYER_HOSTS[0], extension: `chrome-extension://${id}` })
const guard = await routeTable(context, [
  ['https://arxiv.org', arxiv],
  [echo.origin, route => route.continue()],
  ...LAYER_HOSTS.map(host => [host, (route, url) => api.route(route, url)]),
])
// (a branded Chrome shows the build's worker once something wakes it: the abstract page's content script does, before the
// reader opens, so that its translations go to the echo endpoint like the rest)
const settings = worker ?? (await (async () => {
  const p = await context.newPage()
  await p.goto(`https://arxiv.org/abs/${PAPER}`)
  const w = context.serviceWorkers().find(x => x.url().startsWith(`chrome-extension://${id}/`)) ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }).catch(() => null))
  await p.close()
  return w
})())
if (!settings) {
  await leave()
  throw new Error('no service worker of the build to seed the echo endpoint through')
}
for (let tries = 0; tries < 50 && !(await settings.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
await seedService(settings, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
await settings.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu', pdfReader: { ...config.pdfReader, enabled: true, original: false } } }) })

const rows = []
const row = (name, saw) => { rows.push({ name, saw }); console.log(`${name}: ${saw}`) }
let failed = ''

/** the reader's frame over the page, once its controller counts the paper's pages */
async function readerFrame(page) {
  const el = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 30_000 }).catch(() => null)
  const frame = await el?.contentFrame()
  if (!frame) console.log(`(no reader frame over ${page.url()}: ${JSON.stringify(await page.evaluate(() => ({ type: document.contentType, floating: document.querySelectorAll('.axt-floating').length, embed: document.querySelectorAll('embed').length })).catch(e => e.message.slice(0, 80)))}; workers ${context.serviceWorkers().map(w => w.url()).join(' ') || 'none'})`)
  const pages = await frame?.waitForFunction(() => window.__reader?.controller?.getState().sides.left.pages, null, { timeout: 60_000 }).then(h => h.jsonValue(), () => 0)
  return pages ? frame : null
}
/** the probe's own target in the frame (a real click on it adds an entry) and its record of popstate */
const arm = frame => frame.evaluate(() => {
  const p = { pops: [], n: 0, born: performance.timeOrigin }
  window.__probe = p
  addEventListener('popstate', e => { p.pops.push({ state: e.state, at: Math.round(performance.now()) }); if (p.live) console.log(`[hand] popstate ${JSON.stringify(e.state)}`) })
  const t = Object.assign(document.createElement('button'), { textContent: '+' })
  t.id = 'axt-probe-push'
  t.style.cssText = 'position:fixed;left:600px;top:400px;width:40px;height:40px;z-index:2147483647'
  t.addEventListener('click', () => { p.n += 1; history.pushState({ ...(history.state ?? {}), axt: { v: 1, n: p.n } }, '') })
  document.body.append(t)
})
/** the frame's state: its entry, its history's length, whether it is the same document, the popstates heard since `since` */
const look = async (frame, since = 0) => frame.evaluate(since => ({ state: history.state, length: history.length, same: !!window.__probe, pops: window.__probe?.pops.slice(since) ?? null }), since).catch(e => ({ gone: e.message.slice(0, 80) }))
const nOf = s => s?.state?.axt?.n ?? null
const popsN = pops => (pops ?? []).map(p => p.state?.axt?.n ?? 'none').join(',') || 'no popstate'

try {
  page = await context.newPage()
  page.on('console', m => { if (m.text().startsWith('[hand]')) console.log(m.text()) })
  await page.goto(`https://arxiv.org/pdf/${PAPER}`)
  let frame = await readerFrame(page)
  if (!frame) throw new Error('no reader over the PDF page')
  const top = page.url()
  await arm(frame)
  const at0 = await look(frame)
  console.log(`start: top ${top}; frame entry ${JSON.stringify(at0.state)}, its history.length ${at0.length}`)
  await page.mouse.click(620, 420)
  await sleep(300)
  const at1 = await look(frame)
  row('push by a real click', `frame entry n=${nOf(at1)}, history.length ${at0.length} -> ${at1.length}`)

  // P1
  let since = (await look(frame)).pops.length
  await page.goBack({ timeout: 3000 }).catch(() => undefined)
  await sleep(800)
  let s = await look(frame, since)
  row('P1 page.goBack()', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; same document ${s.same}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  // P2
  since = (await look(frame)).pops.length
  await page.goForward({ timeout: 3000 }).catch(() => undefined)
  await sleep(800)
  s = await look(frame, since)
  row('P2 page.goForward()', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; same document ${s.same}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  // P3
  since = (await look(frame)).pops.length
  await frame.evaluate(() => history.back())
  await sleep(800)
  s = await look(frame, since)
  row('P3 the frame\'s history.back()', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; same document ${s.same}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  await frame.evaluate(() => history.forward())
  await sleep(800)
  row('P3 then history.forward()', `frame entry n=${nOf(await look(frame))}`)

  // P6 (before P4, while every entry was added with the user's activation): the browser's own GoBack, then GoForward
  const tabId = await ext.evaluate(async () => (await chrome.tabs.query({ url: 'https://arxiv.org/pdf/*' }))[0]?.id ?? null)
  since = (await look(frame)).pops.length
  await ext.evaluate(id => chrome.tabs.goBack(id), tabId).catch(e => console.log(`(tabs.goBack: ${e.message.split('\n')[0]})`))
  await sleep(800)
  s = await look(frame, since)
  row('P6 chrome.tabs.goBack (the browser\'s GoBack)', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; same document ${s.same}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  since = (await look(frame)).pops.length
  await ext.evaluate(id => chrome.tabs.goForward(id), tabId).catch(e => console.log(`(tabs.goForward: ${e.message.split('\n')[0]})`))
  await sleep(800)
  s = await look(frame, since)
  row('P6 chrome.tabs.goForward', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)

  // P5: the keys as DevTools sends them, the focus in the frame
  await frame.focus('#axt-probe-push')
  for (const key of ['Alt+ArrowLeft', 'Meta+BracketLeft']) {
    since = (await look(frame)).pops.length
    await page.keyboard.press(key)
    await sleep(800)
    s = await look(frame, since)
    row(`P5 ${key} by Playwright`, `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  }

  // P6 by hand: a person presses the keys while the probe listens
  if (HAND > 0 && HEADED) {
    await page.bringToFront()
    await frame.evaluate(() => { window.__probe.live = true; document.getElementById('axt-probe-push')?.focus() })
    since = (await look(frame)).pops.length
    console.log(`\n[hand] ${HAND} s: with the focus in the reader, press Alt+Left, then Cmd+] (forward), then Cmd+[ ; each popstate prints here`)
    await sleep(HAND * 1000)
    s = await look(frame, since)
    row('P6 by hand', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  } else row('P6 by hand', 'not run (AXT_HAND=<seconds> with AXT_HEADED=1)')

  // P4: an entry added without the user's transient activation (a timer, once navigator.userActivation.isActive is false)
  const before4 = await look(frame)
  const activation = await frame.evaluate(() => new Promise(done => {
    const t0 = performance.now()
    const tick = () => {
      if (navigator.userActivation.isActive && performance.now() - t0 < 30_000) return setTimeout(tick, 250)
      const was = { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive, waitedMs: Math.round(performance.now() - t0) }
      window.__probe.n += 1
      history.pushState({ axt: { v: 1, n: window.__probe.n } }, '')
      done(was)
    }
    tick()
  }))
  const at4 = await look(frame)
  row('P4 a push from a timer', `frame entry n=${nOf(before4)} -> ${nOf(at4)}, history.length ${before4.length} -> ${at4.length}; activation at the push ${JSON.stringify(activation)}`)
  since = (await look(frame)).pops.length
  await ext.evaluate(id => chrome.tabs.goBack(id), tabId).catch(e => console.log(`(tabs.goBack: ${e.message.split('\n')[0]})`))
  await sleep(800)
  s = await look(frame, since)
  row('P4 then the browser\'s GoBack', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)
  await ext.evaluate(id => chrome.tabs.goForward(id), tabId).catch(() => undefined)
  await sleep(800)
  since = (await look(frame)).pops.length
  await page.goBack({ timeout: 3000 }).catch(() => undefined)
  await sleep(800)
  s = await look(frame, since)
  row('P4 then page.goBack()', `popstate heard: ${popsN(s.pops)}; frame entry n=${nOf(s)}; top ${page.url() === top ? 'unchanged' : `CHANGED to ${page.url()}`}`)

  /** the browser's Back pressed `k` times, one row each: where the top is, the reader's frame's entry, what it heard */
  const backs = async (label, k) => {
    for (let i = 1; i <= k; i++) {
      const el = await page.$('iframe[data-axt-pdf-reader]').catch(() => null)
      const f = await el?.contentFrame()
      if (f) await f.evaluate(() => { if (!window.__probe) { window.__probe = { pops: [], fresh: true }; addEventListener('popstate', e => window.__probe.pops.push({ state: e.state })) } }).catch(() => undefined)
      const was = f ? (await look(f)).pops?.length ?? 0 : 0
      await ext.evaluate(id => chrome.tabs.goBack(id), tabId).catch(e => console.log(`(tabs.goBack: ${e.message.split('\n')[0]})`))
      await sleep(2500)
      const el2 = await page.$('iframe[data-axt-pdf-reader]').catch(() => null)
      const f2 = await el2?.contentFrame()
      const at = f2 ? await look(f2, f2 === f ? was : 0) : null
      row(`${label}, Back ${i}`, `top ${page.url()}; ${at && !at.gone ? `reader frame entry ${JSON.stringify(at.state)}, history.length ${at.length}, ${f2 === f && at.same ? 'the same frame document' : 'another frame document'}, popstate heard ${popsN(at.pops)}` : 'no reader frame'}`)
    }
  }

  // P7: arXiv's page left (the abstract) with the frame at an entry of its own, then Back three times
  await ext.evaluate(id => chrome.tabs.goForward(id), tabId).catch(() => undefined)
  await sleep(800)
  row('P7 before leaving', `frame entry n=${nOf(await look(frame))}, history.length ${(await look(frame)).length}`)
  await page.goto(`https://arxiv.org/abs/${PAPER}`)
  await sleep(1000)
  await backs('P7 the abstract', 3)
  frame = await readerFrame(page)

  // P8: arXiv's page reloaded with the frame at an entry of its own, then Back twice
  if (frame) {
    await arm(frame)
    await page.mouse.click(620, 420)
    await sleep(300)
    row('P8 before the reload', `frame entry n=${nOf(await look(frame))}, history.length ${(await look(frame)).length}`)
    await page.reload()
    frame = await readerFrame(page)
    row('P8 after the reload', frame ? `frame entry ${JSON.stringify((await look(frame)).state)}, history.length ${(await look(frame)).length}` : 'no reader')
    await backs('P8 the reload', 2)
  } else row('P8', 'no reader after P7')
  if (guard.violations.length) row('route table', guard.violations.map(v => `${v.method} ${v.url}`).join('; '))
} catch (e) {
  failed = e.message
  console.log(`COULD NOT LOOK: ${e.message}`)
} finally {
  await leave()
}
process.exit(failed ? 1 : 0)
