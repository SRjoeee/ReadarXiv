// arXiv's PDF page (issue #169, DESIGN §4.0b, UI.md S-I-06) in a real browser: the floating button is drawn there, its
// main button and the popup open the bilingual version. The button's own behaviour is `floating-button.mjs`.
//
// **What this suite really guards is a Chrome behaviour, not our code**: Chrome renders `arxiv.org/pdf/<id>` by
// putting the file into a synthetic host document at the paper's own URL, and a content script matching that URL runs
// in it. Nothing promises that stays true, and the button disappears the day it changes, so it is measured here rather
// than assumed. The same run checks the second half: whether an HTML version exists is a same-origin `HEAD`, so a
// paper without one gets a main button that is disabled and says why.
//
// Usage: pnpm build && pnpm e2e:pdf     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
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
    // S-P-50b: on an abstract or PDF page the button says what it opens, not “translate this page”
    const button = [...document.querySelectorAll('button')].find(b => /双语版本|Bilingual version/.test(b.textContent ?? ''))
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

/**
 * On the PDF experiment's branch a build may carry the bilingual PDF reader (experiments/pdf-bilingual, copied in by
 * wxt.config.ts once the experiment's setup has run): the page then opens in it, and the reader's way back to the
 * browser's viewer brings the floating button the rest of this suite checks. A build without it (CI's) goes straight on
 */
const READER = existsSync(`${EXT}/pdf-reader/reader.html`)
async function throughReader(paper) {
  if (!READER) return
  const frame = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 30_000 }).catch(() => null)
  const reader = await frame?.contentFrame()
  const back = await reader?.waitForSelector('#close:not([hidden])', { timeout: 30_000 }).catch(() => null)
  check(`the PDF page opens in the reader, with its way back to the browser's viewer (${paper})`, !!back, back ? 'the reader over the page' : `reader ${!!frame}, way back ${!!back}`)
  await back?.click()
  const gone = await page.waitForFunction(() => !document.querySelector('iframe[data-axt-pdf-reader]'), null, { timeout: 10_000 }).then(() => true, () => false)
  check(`the way back takes the reader away (${paper})`, gone, gone ? 'the browser\'s viewer underneath' : 'the reader is still there')
}

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

/** The button as the page holds it: the host element, the main button inside its shadow root, and whether it is drawn */
const readEntry = () => page.evaluate(() => {
  const host = document.querySelector('.axt-floating')
  const link = host?.shadowRoot?.querySelector('.axt-fb-main') ?? null
  const box = link?.getBoundingClientRect()
  return {
    contentType: document.contentType,
    hosts: document.querySelectorAll('.axt-floating').length,
    href: link?.getAttribute('href') ?? null,
    label: link?.getAttribute('aria-label') ?? null,
    disabled: link?.getAttribute('aria-disabled') === 'true',
    tag: link?.tagName ?? null,
    drawn: box ? box.width > 0 && box.height > 0 && box.bottom <= window.innerHeight : false,
    // The viewer is Chrome's own extension frame; the entry must not have gone anywhere near it
    viewerUntouched: document.querySelectorAll('embed, object').length === document.querySelectorAll('embed[data-axt-for], object[data-axt-for]').length,
  }
})

await page.goto(`https://arxiv.org/pdf/${WITH_HTML}`, { waitUntil: 'load' })
await throughReader(WITH_HTML)
await sleep(6000)
const entry = await readEntry()
check('a content script runs on Chrome\'s PDF page and the floating button is drawn there',
  entry.contentType === 'application/pdf' && entry.hosts === 1 && entry.drawn,
  `contentType ${entry.contentType}, ${entry.hosts} entry, drawn ${entry.drawn}`)
check('its main button leads to the HTML full text of the version the reader opened, already translating',
  entry.href === `https://arxiv.org/html/${WITH_HTML}#readarxiv`,
  `href ${entry.href}`)
check('it carries the same sentence as the abstract page\'s entry (S-I-06)', /Read arXiv/.test(entry.label ?? ''), `label “${entry.label}”`)

check('Chrome\'s own viewer is left alone', entry.viewerUntouched, 'no embed or object of ours')
await page.screenshot({ path: `${SHOTS}/pdf-entry.png` })

// The popup on that same page (UI.md S-P-03b): a working popup, not the “not an arXiv page” sentence
{
  const { popup, seen } = await popupOn(page)
  check('the popup works on a PDF page: the ordinary rows, and the translate button enabled',
    !seen.notArxiv && seen.rows && seen.label !== null && seen.disabled === false,
    `label “${seen.label}”, disabled ${seen.disabled}, rows ${seen.rows}, S-P-03 shown ${seen.notArxiv}`)
  await popup.screenshot({ path: `${SHOTS}/pdf-popup.png` })

  // The button follows the same setting: a new tab, with the PDF still open behind it
  const fromPopup = context.waitForEvent('page', { timeout: 60_000 })
  await popup.evaluate(() => [...document.querySelectorAll('button')].find(b => /双语版本|Bilingual version/.test(b.textContent ?? ''))?.click())
  const viaPopup = await fromPopup.catch(() => null)
  await viaPopup?.waitForLoadState('load').catch(() => undefined)
  check('the popup\'s button opens the translation in a new tab as well, leaving the PDF open',
    /\/html\//.test(viaPopup?.url() ?? '') && /\/pdf\//.test(page.url()),
    `opened ${viaPopup?.url().slice(0, 55) ?? 'nothing'}…, first tab ${page.url().slice(0, 40)}…`)
  await viaPopup?.close()
  await popup.close()
  await page.bringToFront()
}

// Following it opens the HTML page **in a new tab** (config `reading.openIn`, UI.md S-O-49b), which starts
// translating by itself (the hash, DESIGN §4.1), and the PDF the reader was on is still there
// A real click, pressed and released with the mouse: the press puts up the drag shield, and the click must still reach the link
const target = await page.evaluate(() => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})
const opened = context.waitForEvent('page', { timeout: 60_000 })
await page.mouse.click(target.x, target.y)
const translated = await opened.catch(() => null)
await translated?.waitForLoadState('load').catch(() => undefined)
await sleep(12_000)
const landed = translated ? await translated.evaluate(() => ({ url: location.href, translations: document.querySelectorAll('.axt-t').length })) : { url: '', translations: 0 }
check('the click opens the HTML paper with no dialog on the way, and the translation has started',
  /\/html\//.test(landed.url) && landed.translations > 0,
  `${landed.url.slice(0, 60)}…, ${landed.translations} translation nodes`)
check('it opens in a new tab: the PDF the reader was on is still open, on the same paper',
  /\/pdf\//.test(page.url()),
  `the first tab is still ${page.url().slice(0, 50)}…`)
await translated?.close()
await page.bringToFront()

await sleep(3000)
await page.goto(`https://arxiv.org/pdf/${WITHOUT_HTML}`, { waitUntil: 'load' })
await throughReader(WITHOUT_HTML)
await sleep(6000)
const none = await readEntry()
check('a paper with no HTML version keeps the button, its main button disabled and saying why, rather than a link that leads nowhere',
  none.hosts === 1 && none.disabled && none.tag === 'BUTTON' && none.href === null && /HTML/.test(none.label ?? ''),
  `${none.hosts} button on ${WITHOUT_HTML}, main <${none.tag?.toLowerCase()}> disabled ${none.disabled}, says “${none.label}”`)
await page.screenshot({ path: `${SHOTS}/pdf-entry-none.png` })

{
  const { popup, seen } = await popupOn(page)
  check('the popup on a paper with no HTML version: the button is there, disabled, with the reason (S-P-33)',
    !seen.notArxiv && seen.label !== null && seen.disabled === true && seen.noHtmlNote,
    `label “${seen.label}”, disabled ${seen.disabled}, reason shown ${seen.noHtmlNote}`)
  await popup.screenshot({ path: `${SHOTS}/pdf-popup-none.png` })
  await popup.close()
}

// The popup on the abstract page (UI.md S-P-03b): the other entry page, whose answer comes from arXiv's own markup
// rather than from a request (Devin on #247: the browser runs exercised only PDFs)
await page.goto(`https://arxiv.org/abs/${WITH_HTML}`, { waitUntil: 'load' })
await sleep(3000)
{
  const { popup, seen } = await popupOn(page)
  check('the popup works on an abstract page too: the ordinary rows, and the button enabled',
    !seen.notArxiv && seen.rows && seen.label !== null && seen.disabled === false,
    `label “${seen.label}”, disabled ${seen.disabled}, rows ${seen.rows}, S-P-03 shown ${seen.notArxiv}`)
  const viaPopup = context.waitForEvent('page', { timeout: 60_000 })
  await popup.evaluate(() => [...document.querySelectorAll('button')].find(b => /双语版本|Bilingual version/.test(b.textContent ?? ''))?.click())
  const opened = await viaPopup.catch(() => null)
  await opened?.waitForLoadState('load').catch(() => undefined)
  check('its button opens the href arXiv gives, in a new tab, and the abstract page stays',
    /\/html\/.*#readarxiv$/.test(opened?.url() ?? '') && /\/abs\//.test(page.url()),
    `opened ${opened?.url().slice(0, 60) ?? 'nothing'}, first tab ${page.url().slice(0, 40)}…`)
  await opened?.close()
  await popup.close()
}

// Only the reader's own page can take the reader away: a page its frame has been sent to cannot (Devin on #297). The
// frame goes to a data: page, whose origin is opaque, and asks from there
if (READER) {
  await page.goto(`https://arxiv.org/pdf/${WITH_HTML}`, { waitUntil: 'load' })
  const frame = await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 30_000 }).catch(() => null)
  const reader = await frame?.contentFrame()
  await reader?.goto('data:text/html,<p>elsewhere</p>').catch(() => undefined)
  await reader?.evaluate(() => parent.postMessage({ type: 'axt-pdf-reader-close' }, '*')).catch(() => undefined)
  await sleep(1000)
  const stays = await page.evaluate(() => !!document.querySelector('iframe[data-axt-pdf-reader]'))
  check('a page the reader\'s frame was sent to cannot take the reader away', !!frame && stays, frame ? (stays ? 'the reader stays' : 'the reader was taken away') : 'no reader')
}

await context.close()
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
