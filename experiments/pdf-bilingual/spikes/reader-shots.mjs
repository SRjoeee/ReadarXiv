// Screenshots of the reader with chosen paragraphs lit: each brought to the reading line on the left, hovered, and
// the other side left to settle. For looking at highlight quality by eye. A precompiled demo paper, in the extension's
// build (node spikes/reader-papers.mjs first).
//   node spikes/reader-shots.mjs paper id ...
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper, ...ids] = process.argv.slice(2)
const { context, readerUrl } = await launchWithReader({ profile: 'reader-shots', demos: true })
const page = await context.newPage()
await page.goto(readerUrl({ paper, mode: 'bilingual' }))
await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
await page.waitForTimeout(800)
for (const id of ids.map(Number)) {
  const at = await page.evaluate(async id => {
    const { left, unitDocTop, pageView, setDriver, readingLine } = window.__reader.debug
    const a = left.anchors.get(id)
    if (!a) return null
    setDriver(left)
    left.container.scrollTop = unitDocTop(left, id) + 2 - left.container.clientHeight * readingLine
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
