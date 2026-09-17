// Probe for ADR-0011: what one DOM insertion costs the page in style recalculation once a paper is translated — a hover
// band written into the highlight layer, and a translation-shaped node landing after a paragraph — and how many elements
// that recalculation visits (`UpdateLayoutTree.elementCount` from a CDP trace). With a `:has()` in the injected sheet
// Chrome recalculated the whole document on every insertion: 14 ms on 2410.00260 (4 531 elements), 161–165 ms on
// 2312.17141 (59 035) and 141–146 ms on 2609.00080v1 (55 976), measured 2026-09-17 before the marks replaced it.
// Reuses the profile highlight-lag.mjs leaves behind (its cache holds the papers), so a paper settles in seconds.
// Usage: pnpm build && node tests/e2e/probes/insert-recalc.mjs [paper ...]   (default 2410.00260 2312.17141)
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-hl`
const PAPERS = process.argv.slice(2).length ? process.argv.slice(2) : ['2410.00260', '2312.17141']
const IDLE = /session idle: (\d+)\/(\d+) requested of (\d+), (\d+) failed, (\d+) cached/
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')

const idleStable = async (page, logs) => {
  let last = null
  let stable = 0
  for (let i = 0; i < 400 && stable < 3; i++) {
    await sleep(1000)
    const idle = logs.findLast(l => IDLE.test(l.text))
    const pending = await page.evaluate(() => document.querySelectorAll('.axt-pending').length).catch(() => 1)
    stable = idle && pending === 0 && idle.text === last?.text ? stable + 1 : 0
    last = idle
  }
  return last?.text
}

/** Runs `fn` under a trace and returns every style recalculation it caused: duration and the elements visited */
async function recalcs(cdp, fn) {
  const events = []
  const onData = e => events.push(...e.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
  await fn()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  await done
  cdp.off('Tracing.dataCollected', onData)
  return events.filter(e => e.name === 'UpdateLayoutTree' && e.ph === 'X').map(e => ({ ms: Math.round(e.dur / 100) / 10, elements: e.args?.elementCount ?? null }))
}

for (const id of PAPERS) {
  const page = await context.newPage()
  const logs = []
  page.on('console', m => { const t = m.text(); if (t.includes('[axt]')) logs.push({ t: Date.now(), text: t }) })
  await page.goto(`https://arxiv.org/html/${id}#axt-translate`, { waitUntil: 'domcontentloaded' })
  const cdp = await context.newCDPSession(page)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 800) { await page.evaluate(top => window.scrollTo(0, top), y); await sleep(120) }
  console.log(`${id}: ${await idleStable(page, logs)}`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
  const report = await page.evaluate(() => {
    const median = xs => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[s.length >> 1] * 100) / 100 }
    const force = () => void document.documentElement.offsetHeight
    /** Median over 5 runs of: insert (`place` puts a fresh node in and returns what to remove), force style + layout, remove, force */
    const cost = place => {
      const ts = []
      for (let i = 0; i < 5; i++) {
        force()
        const undo = place()
        const t0 = performance.now()
        force()
        ts.push(performance.now() - t0)
        undo()
        force()
      }
      return median(ts)
    }
    // The band layer as the controller creates it, if the pointer has not yet made one
    let layer = document.querySelector('.axt-hl')
    if (!layer) { layer = document.createElement('div'); layer.className = 'axt-hl'; document.body.append(layer); force() }
    const band = () => { const d = document.createElement('div'); d.setAttribute('data-axt-hl-side', 'target'); d.setAttribute('style', 'left:10px;top:10px;width:10px;height:10px;position:absolute'); return d }
    const para = [...document.querySelectorAll('.ltx_p[data-axt-id]')].find(p => p.nextElementSibling?.classList.contains('axt-t'))
    const tnode = () => { const d = document.createElement('div'); d.className = 'axt-t'; d.textContent = 'probe translation'; return d }
    const appended = (parent, make) => () => { const node = make(); parent.append(node); return () => node.remove() }
    const after = (sibling, make) => () => { const node = make(); sibling.after(node); return () => node.remove() }
    return {
      elements: document.getElementsByTagName('*').length,
      mode: document.documentElement.getAttribute('data-axt-mode'),
      'band div appended into .axt-hl (ms)': cost(appended(layer, band)),
      'translation node inserted after a translated paragraph (ms)': para ? cost(after(para, tnode)) : null,
      'root custom property changed, the whole tree (ms)': cost(() => { document.documentElement.style.setProperty('--axt-probe', '1'); return () => document.documentElement.style.removeProperty('--axt-probe') }),
    }
  })
  const visited = await recalcs(cdp, () => page.evaluate(() => {
    const layer = document.querySelector('.axt-hl')
    const force = () => void document.documentElement.offsetHeight
    force()
    const d = document.createElement('div'); d.setAttribute('style', 'left:10px;top:10px;width:10px;height:10px;position:absolute')
    layer.append(d); force(); d.remove(); force()
  }))
  console.log(JSON.stringify({ paper: id, ...report, 'style recalculations for one band insert + remove': visited }))
  await page.close()
}
await context.close()
