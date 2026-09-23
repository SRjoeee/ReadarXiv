// The six sync modes on one paper in the live reader, by wheel: the reader scrolls the left side down in steps and each
// mode's follower is read at every step — where it ends, how far it ran back on the way (a hand-off in C, or a fault),
// and where it stands after the driver rests. A smoke check for the modes REPORT's fifteenth addendum offers; how they
// feel is judged by hand. Local corpus, the build's default service.
//   node spikes/sync-smoke.mjs [id]
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.02163'
const site = await serveSite()
const src = await new Promise(r => {
  const s = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const [, kind, id] = decodeURIComponent(req.url).match(/^\/(src|pdf)\/(.+)$/) ?? []
    try { res.end(readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
  }).listen(0, '127.0.0.1', () => r(s))
})
const at = `http://127.0.0.1:${src.address().port}`
const { context, readerUrl } = await launchWithReader({ profile: 'sync-smoke' })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(readerUrl({ paper, live: '1', mode: 'bilingual', site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` }))
await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 600000, polling: 500 })
const box = await page.locator('#left').boundingBox()
const both = () => page.evaluate(() => { const d = window.__reader.debug; return [d.left.container.scrollTop, d.right.container.scrollTop] })
for (const m of ['off', 'current', 'A', 'B', 'BD', 'C']) {
  await page.selectOption('#sync', m)
  await page.evaluate(() => { const d = window.__reader.debug; d.left.container.scrollTop = 0; d.right.container.scrollTop = 0 })
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  const trace = []
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); trace.push(await both()) }
  await page.waitForTimeout(800)
  const rest = await both()
  let back = 0
  for (let i = 1; i < trace.length; i++) back += Math.max(0, trace[i - 1][1] - trace[i][1])
  console.log(`${m.padEnd(8)} left ${Math.round(trace.at(-1)[0])}, right ${Math.round(trace.at(-1)[1])}, ran back ${Math.round(back)} px while scrolling, right ${Math.round(rest[1])} at rest`)
}
console.log('page errors:', errors.length, errors.slice(0, 3))
await context.close(); site.close(); src.close()
