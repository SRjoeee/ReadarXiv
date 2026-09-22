// The reader's ?progressive=1 in Chromium: the right side starts untranslated and is replaced by each newer stage.
// The reader sits in the middle of the paper; per replacement: how long it took (load, anchors, drawing the pages in
// view out of sight) and how far the paragraph at the reading line moved. A screenshot after each.
//   node spikes/reader-progressive.mjs paper [every ms]
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper = '2608.00055', every = '3000'] = process.argv.slice(2)
const { context, readerUrl } = await launchWithReader({ profile: 'reader' })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message) }); page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[swap]')) console.error(m.type(), m.text()) })
await page.goto(readerUrl({ paper, progressive: '1', every }))
await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
// the reader in the middle of the paper, the pointer over the left page's text column
await page.mouse.move(300, 500)
await page.evaluate(async () => { const { left, setDriver } = window.__reader.debug; setDriver(left); left.container.scrollTop = left.container.scrollHeight * 0.4; await new Promise(r => setTimeout(r, 1200)) })
await page.screenshot({ path: join(root, `out/progressive-${paper}-0.png`) })
for (let n = 1; ; n++) {
  const done = await page.waitForFunction(k => (window.__reader.swaps?.length ?? 0) >= k || window.__reader.progressDone, n, { timeout: Number(process.env.WAIT ?? 60000) }).then(() => page.evaluate(() => window.__reader.progressDone && window.__reader.swaps.length))
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(root, `out/progressive-${paper}-${n}.png`) })
  if (done && n >= done) break
}
console.log(JSON.stringify({ paper, swaps: await page.evaluate(() => window.__reader.swaps), errors: errors.slice(0, 5) }, null, 1))
await context.close()
