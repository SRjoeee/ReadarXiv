// Screenshots of the reader with chosen paragraphs lit: each brought to the reading line on the left, hovered, and
// the other side left to settle. For looking at highlight quality by eye.
//   node spikes/reader-shots.mjs paper id ...
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const [paper, ...ids] = process.argv.slice(2)
const EXT = join(root, 'poc-reader')
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'reader-')), { channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const page = await context.newPage()
await page.goto(`chrome-extension://${new URL(worker.url()).host}/reader.html?paper=${paper}`)
await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
await page.waitForTimeout(800)
for (const id of ids.map(Number)) {
  const at = await page.evaluate(async id => {
    const { left, unitDocTop, pageView, setDriver, READING_LINE } = window.__reader.debug
    const a = left.anchors.get(id)
    if (!a) return null
    setDriver(left)
    left.container.scrollTop = unitDocTop(left, id) + 2 - left.container.clientHeight * READING_LINE
    await new Promise(r => setTimeout(r, 400))
    const r = a.rects[0], pv = pageView(left, r.page), box = pv.div.getBoundingClientRect(), [x, y] = pv.viewport.convertToViewportPoint((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
    return { x: box.left + pv.div.clientLeft + x, y: box.top + pv.div.clientTop + y }
  }, id)
  if (!at) { console.log(id, 'not linked on the left'); continue }
  // the pointer over the paragraph's column, then the settle a reader would get when scrolling stops there
  await page.mouse.move(at.x, at.y)
  await page.evaluate(() => { const { left, settle } = window.__reader.debug; settle(left) })
  await page.waitForTimeout(1000)
  console.log(id, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#left .axt-hl')].map(e => [e.closest('.page')?.dataset.pageNumber, e.style.top, e.style.height]))))
  const file = join(root, `out/reader-${paper}-u${id}.png`)
  await page.screenshot({ path: file })
  console.log(file)
}
await context.close()
