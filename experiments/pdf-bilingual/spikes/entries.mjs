// The ways into the reader as a reader meets them (the reader's design, §2, §9), in a real browser on arXiv's own pages,
// each with its screenshot in out/entries/: the popup on an abstract page and on a PDF page with the reader closed (the
// two entries), the popup while the reader is open over the PDF (the reader's view), and the floating button's panel
// on the abstract page (the main button is the way in); a PDF-only submission's greyed PDF entry; the settings page's
// PDF reader section and its data line. Needs the network; the build at the repository root.
//   node experiments/pdf-bilingual/spikes/entries.mjs [paper]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/entries')
mkdirSync(out, { recursive: true })
const paper = process.argv[2] ?? '1706.03762'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }

const { context, worker, id } = await launchWithReader({ profile: 'entries', viewport: { width: 1280, height: 860 } })
context.setDefaultNavigationTimeout(90_000)
const page = await context.newPage()
const setReader = on => worker.evaluate(async on => {
  for (let i = 0; i < 100; i++) {
    const { config } = await chrome.storage.local.get('config')
    if (config) return chrome.storage.local.set({ config: { ...config, pdfReader: { ...config.pdfReader, enabled: on } } })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('no configuration after 10 s')
}, on)

/** The popup as the toolbar opens it over `tab`: its own page, the paper's tab then in front, and what it shows */
async function popupOver(tab, name) {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 360, height: 640 })
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await tab.bringToFront()
  await sleep(2500)
  const seen = await popup.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    const named = re => buttons.filter(b => re.test(b.textContent ?? '')).map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }))
    return {
      entries: named(/^(HTML 翻译|PDF 翻译|Translate HTML|Translate PDF)$/),
      primary: named(/^(翻译本页|显示原文|Translate this page|Show the original)/),
      stack: buttons.filter(b => /上下|Stacked/.test(b.textContent ?? '')).map(b => ({ disabled: b.getAttribute('aria-disabled') === 'true', title: b.title })),
      style: buttons.some(b => /译文样式|Style/.test(b.textContent ?? '')),
    }
  })
  await popup.locator('main').screenshot({ path: join(out, `${name}.png`) })
  await popup.close()
  return seen
}

// 1. the abstract page: the popup's two entries, and the floating button's main button opening the panel with them
await page.goto(`https://arxiv.org/abs/${paper}`, { waitUntil: 'load' })
await sleep(3000)
{
  const seen = await popupOver(page, '1-abstract-popup')
  check('the abstract page: the popup offers the two entries, both enabled', seen.entries.length === 2 && seen.entries.every(e => !e.disabled), JSON.stringify(seen.entries))
  const main = await page.evaluate(() => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
  await page.mouse.move(main.x, main.y, { steps: 3 })
  await sleep(900)
  await page.mouse.click(main.x, main.y)
  await sleep(2500)
  const panel = page.frames().find(f => f.url().includes('/popup.html'))
  const text = panel ? await panel.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) : ''
  check('the abstract page: the floating button\'s main button opens the panel with the entries', /HTML 翻译|Translate HTML/.test(text) && /PDF 翻译|Translate PDF/.test(text), text.slice(0, 80))
  await page.screenshot({ path: join(out, '2-abstract-panel.png') })
}

// 2. the PDF page with the reader turned off: the browser's viewer, and the same two entries
await setReader(false)
await page.goto(`https://arxiv.org/pdf/${paper}`, { waitUntil: 'load' })
await sleep(6000)
{
  const framed = await page.$('iframe[data-axt-pdf-reader]')
  const seen = await popupOver(page, '3-pdf-popup')
  check('the PDF page, the reader off: the browser\'s viewer, and the popup offers the two entries', !framed && seen.entries.length === 2 && seen.entries.every(e => !e.disabled), JSON.stringify(seen.entries))
}

// 3. the reader open over the PDF: the popup is the reader's — its primary switches the translation and the original,
// the stacked display greyed with its reason, no style row
await setReader(true)
await page.goto('about:blank')
await page.goto(`https://arxiv.org/pdf/${paper}`, { waitUntil: 'load' })
{
  const framed = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 30_000 }).catch(() => null)
  await sleep(4000)
  const seen = await popupOver(page, '4-reader-popup')
  check('the reader open: the popup\'s primary, the stacked display greyed with its reason, no style row',
    !!framed && seen.entries.length === 0 && seen.primary.length === 1 && seen.stack[0]?.disabled && !!seen.stack[0]?.title && !seen.style,
    JSON.stringify(seen))
}

// 4. a PDF-only submission (the corpus's 2608.07562): the PDF entry greyed, without words (the design, §2)
await page.goto('https://arxiv.org/abs/2608.07562', { waitUntil: 'load' })
await sleep(3000)
{
  const seen = await popupOver(page, '5-pdf-only-popup')
  const pdf = seen.entries.find(e => /PDF/.test(e.text ?? ''))
  check('a PDF-only submission: the PDF entry greyed', pdf?.disabled === true, JSON.stringify(seen.entries))
}

// 5. the settings page: the PDF reader's section writes at once; the data section's PDF line counts what the reader
// keeps and clears it in two presses. The store is the reader's IndexedDB on the extension's origin: the page opens it
// first (its schema), then one entry row is written the way the store's eviction reads them
{
  const options = await context.newPage()
  await options.goto(`chrome-extension://${id}/options.html#pdf-reader`)
  await sleep(1200)
  const rows = await options.evaluate(() => [...document.querySelectorAll('main [role="switch"]')].map(b => b.getAttribute('aria-label')))
  await options.getByRole('switch', { name: /同步滚动|Sync scrolling/ }).click()
  await sleep(500)
  const synced = await worker.evaluate(async () => (await chrome.storage.local.get('config')).config.pdfReader.sync)
  await options.getByRole('switch', { name: /同步滚动|Sync scrolling/ }).click()
  check('the settings page\'s PDF reader section: its switches, each written at once', rows.length === 3 && synced === false, JSON.stringify({ rows, synced }))
  await options.goto('about:blank')
  await options.goto(`chrome-extension://${id}/options.html#data`)
  await sleep(1200)
  await options.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('axt-pdf')
    req.onsuccess = () => { const tx = req.result.transaction('entries', 'readwrite'); tx.objectStore('entries').put({ digest: 'd', lang: 'zh-CN', paper: 'x', engine: 'e', bytes: 1024 * 1024, createdAt: 1, openedAt: 1 }); tx.oncomplete = () => { req.result.close(); resolve(null) }; tx.onerror = () => reject(tx.error) }
    req.onerror = () => reject(req.error)
  }))
  await options.reload()
  await sleep(1200)
  const line = () => options.evaluate(() => [...document.querySelectorAll('main span')].map(e => e.textContent).find(t => /^\d+ (篇|papers?) · /.test(t ?? '')) ?? null)
  const before = await line()
  const clears = options.getByRole('button', { name: /^(清空|Clear)$/ })
  await clears.nth(1).click()
  await options.getByRole('button', { name: /确认清空|Confirm clear/ }).click()
  await sleep(1500)
  const after = await line()
  await options.screenshot({ path: join(out, '6-settings-data.png') })
  check('the data section: the PDF translations counted, and cleared in two presses', /^1 (篇|paper) · 1\.0 MB$/.test(before ?? '') && /^0 (篇|papers) · 0\.0 MB$/.test(after ?? ''), JSON.stringify({ before, after }))
  await options.close()
}

await context.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
