// Can an SVG figure's <object> hand over a document that is still loading — an <svg> root already there, its glyphs
// not all parsed yet? Polls the figure right after DOMContentLoaded, no extension.
import { chromium } from '../../../node_modules/playwright/index.mjs'
const browser = await chromium.launch({ channel: 'chromium' })
for (let run = 0; run < 3; run++) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto('https://arxiv.org/html/2608.04322v1', { waitUntil: 'domcontentloaded' })
  const seen = []
  for (let i = 0; i < 800; i++) {
    const s = await page.evaluate(() => {
      const doc = document.getElementById('S2.F2.g1')?.contentDocument
      const root = doc?.documentElement
      return root ? `${doc.readyState} ${root.tagName.toLowerCase()} ${doc.querySelectorAll('use[data-text], text').length}` : 'no document'
    })
    if (seen.at(-1)?.s !== s) seen.push({ t: i * 25, s })
    if (s.startsWith('complete svg')) break
    await page.waitForTimeout(25)
  }
  console.log(`run ${run}:`, seen.map(x => `${x.t} ms: ${x.s}`).join(' | '))
  await page.close()
}
await browser.close()
