// Which units the live reader links on both sides, by kind: the reader's live mode on one paper, fetched from arXiv,
// until the final compile is shown; then every unit's kind and whether each side located it.
//   node spikes/diag-anchors.mjs <arXiv id>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper = '2212.06817'] = process.argv.slice(2)
const site = await serveSite()
const siteOrigin = `http://127.0.0.1:${site.address().port}`
const { context, readerUrl } = await launchWithReader({ profile: 'diag-anchors' })
const page = await context.newPage()
page.on('pageerror', e => console.error('pageerror', e.message))
await page.goto(readerUrl({ paper, live: '1', mode: 'bilingual', site: siteOrigin, endpoint: 'http://localhost:8070' }))
await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 1000 })
const out = await page.evaluate(() => {
  const d = window.__reader.debug
  return { status: document.getElementById('status').textContent, units: d.units.map(u => ({ ...u, left: !!d.left.anchors.get(u.i), right: !!d.right.anchors.get(u.i), leftMarked: !!d.left.anchors.get(u.i)?.bounded, rightMarked: !!d.right.anchors.get(u.i)?.bounded })) }
})
writeFileSync(join(root, `out/diag-anchors-${paper}.json`), JSON.stringify(out, null, 1))
console.log(out.status)
const kinds = new Map()
for (const u of out.units) { const k = kinds.get(u.kind) ?? { n: 0, both: 0, left: 0, right: 0 }; k.n++; if (u.left && u.right) k.both++; if (u.left) k.left++; if (u.right) k.right++; kinds.set(u.kind, k) }
for (const [k, v] of kinds) console.log(k.padEnd(10), v)
await context.close(); site.close()
