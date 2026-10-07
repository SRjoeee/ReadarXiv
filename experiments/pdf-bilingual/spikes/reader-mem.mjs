// What the reader's memory is made of: renderer RSS with no document, one, and both, after load and after scrolling
// every page into view once. A precompiled demo paper, in the extension's build (node spikes/reader-papers.mjs first).
//   node spikes/reader-mem.mjs [id]
import { execFileSync } from 'node:child_process'
import { launchWithReader } from './extension.mjs'
const rss = () => Math.round(execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 24 }).split('\n').filter(l => l.includes('ms-playwright') && l.includes('--type=renderer')).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024)
for (const only of ['none', 'left', 'both']) {
  const { context, readerUrl } = await launchWithReader({ profile: 'mem', demos: true })
  const page = await context.newPage()
  await page.goto(readerUrl({ paper: process.argv[2] ?? '2608.04322', mode: 'bilingual', ...(only === 'both' ? {} : { only }) }))
  await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 120000 })
  await page.waitForTimeout(1500)
  const loaded = rss()
  await page.evaluate(async () => { const c = document.getElementById('left'); for (let f = 0; f <= 1; f += 0.05) { c.scrollTop = (c.scrollHeight - c.clientHeight) * f; await new Promise(r => setTimeout(r, 150)) } })
  await page.waitForTimeout(1500)
  console.log(only.padEnd(5), 'loaded', loaded, 'MB | after scrolling', rss(), 'MB')
  await context.close()
}
