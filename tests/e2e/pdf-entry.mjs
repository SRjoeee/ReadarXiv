// The bilingual entry on arXiv's PDF page (issue #169, DESIGN §4.0b, UI.md S-I-06), in a real browser.
//
// **What this suite really guards is a Chrome behaviour, not our code**: Chrome renders `arxiv.org/pdf/<id>` by
// putting the file into a synthetic host document at the paper's own URL, and a content script matching that URL runs
// in it. Nothing promises that stays true, and the entry disappears the day it changes, so it is measured here rather
// than assumed. The same run checks the second half: whether an HTML version exists is a same-origin `HEAD`, so a
// paper without one is offered nothing.
//
// Usage: pnpm build && pnpm e2e:pdf     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${HERE}.profile-pdf`
const SHOTS = `${HERE}.shots`
/** A paper with an HTML version, and one old enough to have none (its abstract page carries no HTML link either) */
const WITH_HTML = process.env.AXT_PAPER ?? '1706.03762'
const WITHOUT_HTML = 'hep-th/9711200'

/** The popup reads the active tab, so the paper goes back in front after the popup page is opened */
async function popupOn(paperTab) {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'load' })
  await paperTab.bringToFront()
  await sleep(2500)
  const seen = await popup.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(b => /翻译本页|Translate this page/.test(b.textContent ?? ''))
    const text = (document.body.textContent ?? '').replace(/\s+/g, ' ')
    return {
      label: button?.textContent?.trim() ?? null,
      disabled: button?.disabled ?? null,
      // S-P-03: the one-sentence screen the popup used to show on any page but the full text
      notArxiv: /打开 arXiv|Open an arXiv/.test(text),
      noHtmlNote: /没有这篇论文的 HTML|no HTML version/.test(text),
      rows: /Microsoft/.test(text),
    }
  })
  return { popup, seen }
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 860 },
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? await context.newPage()
/** The extension's id, for the popup's own URL */
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host

/** The entry as the page holds it: the host element, the link inside its shadow root, and whether it is drawn */
const readEntry = () => page.evaluate(() => {
  const host = document.querySelector('.axt-pdf-entry')
  const link = host?.shadowRoot?.querySelector('a') ?? null
  const box = link?.getBoundingClientRect()
  return {
    contentType: document.contentType,
    hosts: document.querySelectorAll('.axt-pdf-entry').length,
    href: link?.getAttribute('href') ?? null,
    label: link?.textContent ?? null,
    drawn: box ? box.width > 0 && box.height > 0 && box.bottom <= window.innerHeight : false,
    // The viewer is Chrome's own extension frame; the entry must not have gone anywhere near it
    viewerUntouched: document.querySelectorAll('embed, object').length === document.querySelectorAll('embed[data-axt-for], object[data-axt-for]').length,
  }
})

await page.goto(`https://arxiv.org/pdf/${WITH_HTML}`, { waitUntil: 'load' })
await sleep(6000)
const entry = await readEntry()
check('a content script runs on Chrome\'s PDF page and the entry is drawn there',
  entry.contentType === 'application/pdf' && entry.hosts === 1 && entry.drawn,
  `contentType ${entry.contentType}, ${entry.hosts} entry, drawn ${entry.drawn}`)
check('the entry leads to the HTML full text of the version the reader opened, already translating',
  entry.href === `https://arxiv.org/html/${WITH_HTML}#axt-translate`,
  `href ${entry.href}`)
check('the entry carries the same sentence as the abstract page\'s (S-I-06)', /Read arXiv/.test(entry.label ?? ''), `label “${entry.label}”`)
check('Chrome\'s own viewer is left alone', entry.viewerUntouched, 'no embed or object of ours')
await page.screenshot({ path: `${SHOTS}/pdf-entry.png` })

// The popup on that same page (UI.md S-P-03b): a working popup, not the “not an arXiv page” sentence
{
  const { popup, seen } = await popupOn(page)
  check('the popup works on a PDF page: the ordinary rows, and the translate button enabled',
    !seen.notArxiv && seen.rows && seen.label !== null && seen.disabled === false,
    `label “${seen.label}”, disabled ${seen.disabled}, rows ${seen.rows}, S-P-03 shown ${seen.notArxiv}`)
  await popup.screenshot({ path: `${SHOTS}/pdf-popup.png` })
  await popup.close()
  await page.bringToFront()
}

// Following it lands on the HTML page, which starts translating by itself (the hash, DESIGN §4.1)
await page.evaluate(() => document.querySelector('.axt-pdf-entry')?.shadowRoot?.querySelector('a')?.click())
await page.waitForURL(/\/html\//, { timeout: 60_000 }).catch(() => undefined)
await sleep(12_000)
const landed = await page.evaluate(() => ({
  url: location.href,
  translations: document.querySelectorAll('.axt-t').length,
}))
check('the click lands on the HTML paper, with no dialog on the way, and the translation has started',
  /\/html\//.test(landed.url) && landed.translations > 0,
  `${landed.url.slice(0, 60)}…, ${landed.translations} translation nodes`)

await sleep(3000)
await page.goto(`https://arxiv.org/pdf/${WITHOUT_HTML}`, { waitUntil: 'load' })
await sleep(6000)
const none = await readEntry()
check('a paper with no HTML version is offered nothing, rather than a link that leads nowhere',
  none.hosts === 0,
  `${none.hosts} entries on ${WITHOUT_HTML}`)
await page.screenshot({ path: `${SHOTS}/pdf-entry-none.png` })

{
  const { popup, seen } = await popupOn(page)
  check('the popup on a paper with no HTML version: the button is there, disabled, with the reason (S-P-33)',
    !seen.notArxiv && seen.label !== null && seen.disabled === true && seen.noHtmlNote,
    `label “${seen.label}”, disabled ${seen.disabled}, reason shown ${seen.noHtmlNote}`)
  await popup.screenshot({ path: `${SHOTS}/pdf-popup-none.png` })
  await popup.close()
}

await context.close()
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
