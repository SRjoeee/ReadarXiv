// Drives the reader prototype in Chromium: open it, wait for the anchors, hover a paragraph, scroll one side and check
// the other follows, take screenshots, and read the timings and the renderer's memory.
//   node spikes/reader-test.mjs [paper]
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.04322'
const EXT = join(root, 'poc-reader')
const rss = () => { try { return Math.round(execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 24 }).split('\n').filter(l => l.includes('ms-playwright') && l.includes('--type=renderer')).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024) } catch { return null } }
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'reader-')), { channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const id = new URL(worker.url()).host
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('misaligned')) console.error(m.text()) })
await page.goto(`chrome-extension://${id}/reader.html?paper=${paper}`)
await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
await page.waitForTimeout(800)
const info = await page.evaluate(() => { const r = window.__reader; return { timing: Object.fromEntries(Object.entries(r.timing).map(([k, v]) => [k, Math.round(v)])), units: r.units, linked: r.linked, leftPages: r.leftPages, rightPages: r.rightPages } })
const memLoaded = rss()
await page.screenshot({ path: join(root, `out/reader-${paper}-open.png`) })

// hover: the middle of the first line of a body paragraph that is linked on both sides and on page 1 or 2
const target = await page.evaluate(() => {
  const { left, right, pageView, toPageBox } = window.__reader.debug
  for (const [id, a] of left.anchors) {
    if (!a || !right.anchors.get(id) || a.rects[0].page > 2 || a.rects.length < 2) continue
    const r = a.rects[0], pv = pageView(left, r.page), box = toPageBox(left, r), pr = pv.div.getBoundingClientRect()
    return { id, x: pr.left + pv.div.clientLeft + box.left + box.width / 2, y: pr.top + pv.div.clientTop + box.top + box.height / 2 }
  }
})
await page.mouse.move(target.x, target.y)
await page.waitForTimeout(300)
const hover = await page.evaluate(() => ({ left: document.querySelectorAll('#left .axt-hl').length, right: document.querySelectorAll('#right .axt-hl').length }))
await page.screenshot({ path: join(root, `out/reader-${paper}-hover.png`) })

// scroll: wheel over the left side in small steps, as a reader would. The right side must follow every step, never
// move backwards, and keep the paragraph at the reading line level with the left.
await page.mouse.move(400, 500)
const trace = []
for (let n = 0; n < 60; n++) {
  await page.mouse.wheel(0, 120)
  await page.waitForTimeout(40)
  trace.push(await page.evaluate(() => { const { left, right } = window.__reader.debug; return [left.container.scrollTop, right.container.scrollTop] }))
}
await page.waitForTimeout(400)
const back = trace.filter((t, n) => n && t[1] < trace[n - 1][1] - 0.5).length
// alignment once scrolling stops: each sampled paragraph brought to the reading line on the left, the pointer over its
// column; how far from the reading line its first line stands on the right after the settle
const sync = await page.evaluate(async () => {
  const { left, right, unitDocTop, pageView, setDriver, READING_LINE } = window.__reader.debug
  const ids = [...left.anchors].filter(([id, a]) => a && right.anchors.get(id)).map(([id]) => id)
  const sample = ids.filter((_, n) => n % Math.max(1, Math.floor(ids.length / 40)) === 0)
  const errs = []
  for (const id of sample) {
    const r = left.anchors.get(id).rects[0], top = unitDocTop(left, id)
    const want = top + 2 - left.container.clientHeight * READING_LINE
    if (want < 0 || want > left.container.scrollHeight - left.container.clientHeight) continue
    setDriver(left)
    const pv = pageView(left, r.page), [cx] = pv.viewport.convertToViewportPoint((r.x0 + r.x1) / 2, r.y0)
    left.container.dispatchEvent(new PointerEvent('pointermove', { clientX: pv.div.getBoundingClientRect().left + pv.div.clientLeft + cx, bubbles: true }))
    left.container.scrollTop = want
    await new Promise(res => setTimeout(res, 900))
    const lOff = top - left.container.scrollTop, rOff = unitDocTop(right, id) - right.container.scrollTop
    errs.push(Math.abs(Math.round(rOff - lOff)))
    if (Math.abs(rOff - lOff) > 4) console.log('misaligned', JSON.stringify({ id, lOff: Math.round(lOff), rOff: Math.round(rOff), rightMax: right.container.scrollHeight - right.container.clientHeight, rightTop: Math.round(right.container.scrollTop), leftPage: r.page, rightPage: right.anchors.get(id).rects[0].page, x0: Math.round(r.x0), lines: left.anchors.get(id).rects.length }))
  }
  errs.sort((a, b) => a - b)
  return { sampled: errs.length, within4px: errs.filter(e => e <= 4).length, median: errs[errs.length >> 1], p90: errs[Math.floor(errs.length * 0.9)], max: errs.at(-1) }
})
Object.assign(sync, { steps: trace.length, rightMovedBack: back })
await page.waitForTimeout(800)
await page.mouse.move(400, 500)
await page.waitForTimeout(300)
await page.screenshot({ path: join(root, `out/reader-${paper}-scrolled.png`) })
// memory after scrolling the whole of both documents once
await page.evaluate(async () => { const { left, setDriver } = window.__reader.debug; setDriver(left); for (let f = 0; f <= 1; f += 0.05) { left.container.scrollTop = (left.container.scrollHeight - left.container.clientHeight) * f; await new Promise(r => setTimeout(r, 150)) } })
await page.waitForTimeout(1000)
const memScrolled = rss()
console.log(JSON.stringify({ paper, ...info, hover, sync, memLoadedMB: memLoaded, memAfterScrollMB: memScrolled, errors: errors.slice(0, 5) }, null, 1))
await context.close()
