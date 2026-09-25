// The sync modes on one paper in the live reader, by wheel: the reader scrolls the left side down in steps and each
// mode's follower is read at every step, where the screen shows it — where it ends, how far it ran back on the way (a
// fault), and where it stands once the driver has rested (the together modes level the two then). The together modes
// twice, the follower moved by script and on the compositor. A smoke check for the modes REPORT's sixteenth and
// seventeenth addenda offer; how they feel is judged by hand (spikes/sync-frames.mjs measures the frames). Local
// corpus, the build's default service.
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
const both = () => page.evaluate(() => { const d = window.__reader.debug; return [d.shownAt(d.left), d.shownAt(d.right)] })
const together = new Set(['same', 'pointer', 'matched'])
const runs = [['off'], ['current'], ...['same', 'pointer', 'matched'].flatMap(m => [[m, false], [m, true]])]
for (const [m, compositor] of runs) {
  await page.evaluate(m => window.__reader.session.setSyncMode(m), m)
  if (compositor != null) await page.evaluate(on => window.__reader.session.setCompositor(on), compositor)
  await page.evaluate(() => { const d = window.__reader.debug; d.left.container.scrollTop = 0; d.right.container.scrollTop = 0 })
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  const trace = []
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); trace.push(await both()) }
  await page.waitForTimeout(800)
  const rest = await both()
  let back = 0
  for (let i = 1; i < trace.length; i++) back += Math.max(0, trace[i - 1][1] - trace[i][1])
  const level = together.has(m) ? await page.evaluate(() => window.__reader.debug.levelOf(window.__reader.debug.left)) : null
  console.log(`${`${m}${compositor == null ? '' : compositor ? ' (compositor)' : ' (script)'}`.padEnd(22)} left ${Math.round(trace.at(-1)[0])}, right ${Math.round(trace.at(-1)[1])}, ran back ${Math.round(back)} px while scrolling, right ${Math.round(rest[1])} at rest${level ? `, unit ${level.id} at ${level.at.toFixed(2)} ${Math.round(level.error)} px from level` : ''}`)
}
console.log('page errors:', errors.length, errors.slice(0, 3))
await context.close(); site.close(); src.close()
