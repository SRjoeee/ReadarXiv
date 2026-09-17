// Probe: does the hover highlight reach reference entries, per engine? Opens a paper with Google, then Microsoft, scrolls to the
// bibliography, points at a glyph of each translated fragment of the first entries and counts bands; a long paragraph, a short
// one and the title serve as the comparison. Run 2026-09-17 before the fix: Google 0 of 13 fragments, Microsoft 13 of 13, the
// paragraphs and the title lit under both. Reuses the profile highlight-lag.mjs leaves behind (its cache). Usage: pnpm build && node tests/e2e/probes/ref-highlight.mjs
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { chooseBuiltIn, openOptions, openSection, setSwitch } from '../options-page.mjs'
const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-hl`
const IDLE = /session idle: (\d+)\/(\d+) requested of (\d+), (\d+) failed, (\d+) cached/
const sleep = ms => new Promise(r => setTimeout(r, ms))
const context = await chromium.launchPersistentContext(PROFILE, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1440, height: 900 } })
let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
const options = await openOptions(context, extId)
await openSection(options, 'reading')
await setSwitch(options, '对照高亮', true)
await openSection(options, 'services')
for (const engine of ['Google 翻译', 'Microsoft 翻译']) {
  await chooseBuiltIn(options, engine)
  await sleep(500)
  const page = await context.newPage()
  const logs = []
  page.on('console', m => { const t = m.text(); if (t.includes('[axt]')) logs.push(t) })
  await page.goto('https://arxiv.org/html/2410.00260#axt-translate', { waitUntil: 'domcontentloaded' })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 800) { await page.evaluate(top => window.scrollTo(0, top), y); await sleep(120) }
  let last = null, stable = 0
  for (let i = 0; i < 120 && stable < 3; i++) { await sleep(1000); const idle = logs.findLast(l => IDLE.test(l)); const pending = await page.evaluate(() => document.querySelectorAll('.axt-pending').length); stable = idle && pending === 0 && idle === last ? stable + 1 : 0; last = idle }
  await page.evaluate(() => document.querySelector('.ltx_bibliography')?.scrollIntoView())
  await sleep(1200)
  const rows = await page.evaluate(async () => {
    const out = []
    const items = [...document.querySelectorAll('.ltx_bibitem')].slice(0, 6)
    for (const item of items) {
      for (const t of item.querySelectorAll('.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)')) {
        const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
        let point = null
        for (let n = walk.nextNode(); n && !point; n = walk.nextNode()) for (let i = 0; i < n.data.length && !point; i++) {
          if (/\s/.test(n.data[i])) continue
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect()
          if (b.width > 0 && b.height > 0 && b.top > 0 && b.bottom < innerHeight) point = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        }
        if (!point) { out.push({ id: item.id, cls: t.className, bands: 'off screen' }); continue }
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: point.x, clientY: point.y, bubbles: true }))
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        const bands = document.querySelectorAll('.axt-hl > div').length
        out.push({ id: item.id, unit: t.previousElementSibling?.className?.split(' ').find(c => c.startsWith('ltx_')), text: (t.textContent ?? '').slice(0, 40), bands })
      }
    }
    // A body paragraph and a section heading for comparison, scrolled into view and pointed at the same way
    const compare = []
    for (const [sel, min] of [['.ltx_para .ltx_p.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)', 300], ['.ltx_para .ltx_p.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)', 20], ['.ltx_title.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)', 20], ['.ltx_caption.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)', 10]]) {
      const t = [...document.querySelectorAll(sel)].find(el => (el.textContent ?? '').length > min)
      if (!t) { compare.push({ sel, bands: 'none found' }); continue }
      t.scrollIntoView({ block: 'center' })
      await new Promise(r => setTimeout(r, 400))
      const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
      let point = null
      for (let n = walk.nextNode(); n && !point; n = walk.nextNode()) for (let i = 0; i < n.data.length && !point; i++) {
        if (/\s/.test(n.data[i])) continue
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect()
        if (b.width > 0 && b.height > 0 && b.top > 0 && b.bottom < innerHeight) point = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
      }
      if (!point) { compare.push({ sel, bands: 'no glyph' }); continue }
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: point.x, clientY: point.y, bubbles: true }))
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      compare.push({ sel: sel.slice(0, 24), text: (t.textContent ?? '').slice(0, 30), bands: document.querySelectorAll('.axt-hl > div').length })
    }
    return { rows: out, compare }
  })
  console.log(JSON.stringify({ engine, idle: last, ...rows }, null, 1))
  await page.close()
}
await context.close()
