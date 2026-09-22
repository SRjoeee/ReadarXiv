// Which units the live reader links on both sides, by kind: the reader's live mode on one paper, fetched from arXiv,
// until the final compile is shown; then every unit's kind and whether each side located it.
//   node spikes/diag-anchors.mjs <arXiv id>
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { serveSite } from './live-site.mjs'
const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const [paper = '2212.06817'] = process.argv.slice(2)
const site = await serveSite()
const siteOrigin = `http://127.0.0.1:${site.address().port}`
const EXT = join(root, 'poc-reader')
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'diag-anchors-')), { channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const page = await context.newPage()
page.on('pageerror', e => console.error('pageerror', e.message))
await page.goto(`chrome-extension://${new URL(worker.url()).host}/reader.html?${new URLSearchParams({ paper, live: '1', site: siteOrigin, endpoint: 'http://localhost:8070' })}`)
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
