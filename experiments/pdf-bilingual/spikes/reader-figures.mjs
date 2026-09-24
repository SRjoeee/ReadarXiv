// Screenshots of the reader's figure text: the translation's page `n` brought into view, its figure labels
// translated and laid over; counts of labels found and drawn.
//   node spikes/reader-figures.mjs paper page ...
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper, ...pages] = process.argv.slice(2)
const { context, readerUrl } = await launchWithReader({ profile: 'reader', demos: true })
const page = await context.newPage()
page.on('pageerror', e => console.error('pageerror', e.stack ?? e.message))
await page.goto(readerUrl({ paper, mode: 'bilingual' }))
await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
for (const n of pages.map(Number)) {
  await page.evaluate(n => { const { right, setDriver } = window.__reader.debug; setDriver(right); const pv = right.viewer.getPageView(n - 1); right.container.scrollTop = pv.div.offsetTop - 10 }, n)
  await page.waitForTimeout(3500)
  const count = await page.evaluate(n => { const pv = window.__reader.debug.right.viewer.getPageView(n - 1); return pv.div.querySelectorAll('.axt-img > span').length }, n)
  const file = join(root, `out/figures-${paper}-p${n}.png`)
  await page.screenshot({ path: file })
  console.log(`page ${n}: ${count} labels drawn → ${file.slice(root.length)}`)
}
await context.close()
