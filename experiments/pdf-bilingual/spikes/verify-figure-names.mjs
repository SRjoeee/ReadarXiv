// A/B of the name rule in the real extension (feat/figure-names against next): real Chromium, Microsoft's engine (the
// shipped default), Simplified Chinese, real arXiv HTML papers. Every figure is scrolled into view, the image run is
// waited for, and each overlay's labels are read out — source and translation. Run once per build:
//   node spikes/verify-figure-names.mjs <extension dir> <label>
// Writes out/verify-names-<label>.json and a screenshot of each paper's first figure with names.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '../../../node_modules/playwright/index.mjs'
import { chooseBuiltIn, chooseLanguage, openOptions } from '../../../tests/e2e/options-page.mjs'

const root = new URL('..', import.meta.url).pathname
const [EXT, LABEL] = process.argv.slice(2)
const PAPERS = (process.env.PAPERS ?? '2608.04322 2608.06007 2608.30640 2608.23818 2608.30730 2608.04183 2608.25750 2608.30782 2608.27728 1706.03762 2402.03300 2310.06825 2405.04434').split(' ')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const PROFILE = join(root, `out/.profile-names-${LABEL}`)
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(join(root, 'out/verify-names'), { recursive: true })

const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium', headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
const options = await openOptions(context, extId)
await chooseBuiltIn(options, 'Microsoft 翻译')
await chooseLanguage(options, '简体中文', '简体中文')
await options.close()

const TARGETS = 'img.ltx_graphics, object.ltx_graphics[type="image/svg+xml"]'
const out = []
for (const id of PAPERS) {
  const page = await context.newPage()
  const said = []
  page.on('console', m => said.push(m.text()))
  try {
    await page.goto(`https://arxiv.org/html/${id}#readarxiv`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  } catch (e) { out.push({ id, error: String(e) }); await page.close(); continue }
  // every figure into view, one by one, until the image run says it is idle with all requested
  // the originals only: side mode's split copies join the same selector as figures are split, and shift every index
  const count = await page.evaluate(sel => Array.from(document.querySelectorAll(sel)).filter(el => !el.closest('.axt-split')).length, TARGETS)
  const idle = () => said.filter(t => /images idle/.test(t)).at(-1)
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < count; i++) {
      await page.evaluate(([sel, n]) => Array.from(document.querySelectorAll(sel)).filter(el => !el.closest('.axt-split'))[n]?.scrollIntoView({ block: 'center' }), [TARGETS, i])
      await sleep(250)
    }
    const t0 = Date.now()
    while (Date.now() - t0 < 60_000) {
      const m = /images idle: (\d+)\/(\d+) of (\d+), (\d+) failed/.exec(idle() ?? '')
      if (m && Number(m[1]) + Number(m[4]) >= Number(m[3])) break
      await sleep(500)
    }
    const m = /images idle: (\d+)\/(\d+) of (\d+), (\d+) failed/.exec(idle() ?? '')
    if (m && Number(m[1]) + Number(m[4]) >= Number(m[3])) break
  }
  const figures = await page.evaluate(sel => Array.from(document.querySelectorAll(sel)).filter(el => !el.closest('.axt-split')).map(el => {
    const overlay = el.nextElementSibling?.classList.contains('axt-img') ? el.nextElementSibling : null
    return { id: el.id || el.getAttribute('src') || el.getAttribute('data'), labels: overlay ? Array.from(overlay.children, span => ({ source: span.title, text: span.textContent })) : [] }
  }), TARGETS)
  out.push({ id, count, idle: idle() ?? null, names: said.find(t => /\] names: /.test(t)) ?? null, figures })
  console.log(id, count, 'figures,', figures.reduce((n, f) => n + f.labels.length, 0), 'labels |', idle())
  await page.close()
}
writeFileSync(join(root, `out/verify-names-${LABEL}.json`), JSON.stringify(out, null, 1))
await context.close()
