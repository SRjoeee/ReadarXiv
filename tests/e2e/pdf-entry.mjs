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

/** The entry as the page holds it: the host element, the main button inside its shadow root, and whether it is drawn */
const readEntry = () => page.evaluate(() => {
  const host = document.querySelector('.axt-pdf-entry')
  const link = host?.shadowRoot?.querySelector('a.main') ?? null
  const box = link?.getBoundingClientRect()
  return {
    contentType: document.contentType,
    hosts: document.querySelectorAll('.axt-pdf-entry').length,
    href: link?.getAttribute('href') ?? null,
    label: link?.getAttribute('aria-label') ?? null,
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

// Read Frog's floating button (UI.md S-I-06): tucked into the edge and faded, out and with its controls on hover
const dockState = () => page.evaluate(() => {
  const root = document.querySelector('.axt-pdf-entry')?.shadowRoot
  const rect = el => {
    const r = root?.querySelector(el)?.getBoundingClientRect()
    return r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null
  }
  const dock = root?.querySelector('.dock')
  const opacity = el => (root?.querySelector(el) ? Number(getComputedStyle(root.querySelector(el)).opacity) : null)
  const visible = el => (root?.querySelector(el) ? getComputedStyle(root.querySelector(el)).visibility : null)
  return {
    side: dock?.dataset.side, expanded: dock?.dataset.expanded, width: window.innerWidth,
    main: rect('a.main'), translate: rect('a.translate'), options: rect('.options'),
    mainOpacity: opacity('a.main'), optionsVisible: visible('.options'),
  }
})
const tucked = await dockState()
// Onto the part that shows: tucked, a third of the button is past the window's edge
await page.mouse.move(Math.min(tucked.main.x, tucked.width - 8), tucked.main.y)
await sleep(700)
const hovering = await dockState()
check('it rests tucked into the right edge and faded, with its other buttons out of view',
  tucked.side === 'right' && tucked.main.right > tucked.width && tucked.mainOpacity < 1 && tucked.translate.left >= tucked.width && tucked.optionsVisible === 'hidden',
  `main ${tucked.main.left}–${tucked.main.right} of ${tucked.width}px, opacity ${tucked.mainOpacity}, translate button from ${tucked.translate.left}px, close control ${tucked.optionsVisible}`)
check('hovering brings it out whole, with the button above it and the close control beside it',
  hovering.expanded === 'yes' && hovering.main.right <= hovering.width && hovering.mainOpacity === 1 && hovering.translate.right <= hovering.width && hovering.optionsVisible === 'visible' && hovering.options.right <= hovering.main.left,
  `main ${hovering.main.left}–${hovering.main.right}, translate button ${hovering.translate.left}–${hovering.translate.right}, close control at ${hovering.options?.left}px`)
await page.mouse.move(10, 10)
await sleep(400)
check('Chrome\'s own viewer is left alone', entry.viewerUntouched, 'no embed or object of ours')
await page.screenshot({ path: `${SHOTS}/pdf-entry.png` })

// The drag (Read Frog's): past 6 px it follows the pointer, the release docks it to the nearer side, the place is saved
{
  const before = await dockState()
  await page.mouse.move(Math.min(before.main.x, before.width - 8), before.main.y)
  await sleep(400)
  const from = (await dockState()).main
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x - (from.x - 200) * (i / 12), from.y - 150 * (i / 12))
  await page.mouse.up()
  await page.mouse.move(640, 10)
  await sleep(1500)
  const dropped = await dockState()
  await page.reload({ waitUntil: 'load' })
  await sleep(6000)
  const reloaded = await dockState()
  check('dragged to the left half, it docks to the left edge, and is still there after a reload',
    dropped.side === 'left' && dropped.main.left < 0 && reloaded.side === 'left' && Math.abs(reloaded.main.top - dropped.main.top) <= 2,
    `side ${dropped.side} → ${reloaded.side} after reload, main top ${dropped.main.top} → ${reloaded.main.top}px`)
  // The click that ends a drag opens nothing: still one tab
  check('the release of a drag does not open the link', context.pages().length === 1, `${context.pages().length} tab(s) open`)
}
await page.screenshot({ path: `${SHOTS}/pdf-entry-left.png` })

// The close menu's 不再显示 turns the switch off; the settings page turns it back on, and the open PDF follows at once
{
  const resting = await dockState()
  await page.mouse.move(Math.max(8, Math.min(resting.main.x, resting.width - 8)), resting.main.y)
  await sleep(500)
  const close = (await dockState()).options
  await page.mouse.click((close.left + close.right) / 2, (close.top + close.bottom) / 2)
  await sleep(300)
  const item = await page.evaluate(() => {
    const r = document.querySelector('.axt-pdf-entry')?.shadowRoot?.querySelector('.hide-always')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (item) await page.mouse.click(item.x, item.y)
  await sleep(1000)
  const stored = await worker.evaluate(() => chrome.storage.local.get('config')).then(v => v.config?.floatingEntry)
  const gone = (await readEntry()).hosts
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html#reading`, { waitUntil: 'load' })
  const toggle = options.getByRole('switch', { name: /在 PDF 页显示悬浮按钮|Floating button on PDF pages/ })
  const wasOn = await toggle.getAttribute('aria-checked')
  await toggle.click()
  await sleep(1000)
  await page.bringToFront()
  const back = (await readEntry()).hosts
  check('“don\'t show again” takes it away and turns the setting off; the settings switch brings it back without a reload',
    item !== null && gone === 0 && stored?.enabled === false && wasOn === 'false' && back === 1,
    `menu item ${item ? 'found' : 'missing'}, ${gone} entries after hiding, stored enabled ${stored?.enabled}, switch ${wasOn} before, ${back} entry after turning it on`)
  await options.close()
}

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
const resting = await dockState()
await page.mouse.move(Math.max(8, Math.min(resting.main.x, resting.width - 8)), resting.main.y)
await sleep(500)
const target = (await dockState()).main
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
