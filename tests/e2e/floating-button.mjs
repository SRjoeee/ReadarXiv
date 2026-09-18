// The floating button (issue #169, DESIGN §4.0c, UI.md S-I-06) in a real browser, on the three arXiv pages it lives
// on: how it rests, lights and opens, the drag and where it lands, hiding it and bringing it back, and on the full
// text the toggle, the tick of a translated page and the page's DOM staying its own.
//
// Layout, hover and pointer capture are the browser's: happy-dom answers none of them, and on a PDF the page under
// the button is another process's frame (the press shield in core/floating/button.ts exists because of what this
// suite measured).
//
// Usage: pnpm build && pnpm e2e:floating     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build.
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${HERE}.profile-floating`
const SHOTS = `${HERE}.shots`
const PAPER = process.env.AXT_PAPER ?? '1706.03762'

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
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host

/** The button as drawn: the dock's state, and the boxes and looks of its parts */
const dockState = (on = page) => on.evaluate(() => {
  const root = document.querySelector('.axt-floating')?.shadowRoot
  if (!root) return null
  const rect = selector => {
    const r = root.querySelector(selector)?.getBoundingClientRect()
    return r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), width: Math.round(r.width) } : null
  }
  const look = (selector, property) => (root.querySelector(selector) ? getComputedStyle(root.querySelector(selector))[property] : null)
  const dock = root.querySelector('.dock')
  const main = root.querySelector('.main')
  return {
    side: dock.dataset.side, lit: dock.dataset.lit, expanded: dock.dataset.expanded, active: dock.dataset.active, width: window.innerWidth,
    main: rect('.main'), disc: rect('.disc'), panel: rect('.panel'), settings: rect('.settings'), options: rect('.options'),
    mainOpacity: Number(look('.main', 'opacity')), panelOpacity: Number(look('.panel', 'opacity')), panelVisibility: look('.panel', 'visibility'),
    tickScale: look('.tick', 'scale'), discRadius: look('.disc', 'borderRadius'),
    label: main.getAttribute('aria-label'), tag: main.tagName, href: main.getAttribute('href'),
    order: [...root.querySelectorAll('.dock > *')].map(e => e.className),
  }
})

// ————— The PDF page: rest, light, open, drag, hide —————
await page.goto(`https://arxiv.org/pdf/${PAPER}`, { waitUntil: 'load' })
await sleep(6000)
const rest = await dockState()
check('three buttons in a column: the control panel, the main button, the settings (no feedback button)',
  JSON.stringify(rest?.order) === JSON.stringify(['hidden-button panel', 'anchor', 'hidden-button settings', 'shield', 'catcher']),
  `${rest?.order?.join(' · ')}`)
check('at rest the whole circle shows, dim, docked to the right edge, and the other buttons are out of sight',
  rest.side === 'right' && rest.main.right === rest.width && rest.disc.right <= rest.width && rest.disc.width === 32 && rest.discRadius === '50%'
    && Math.abs(rest.mainOpacity - 0.7) < 0.01 && rest.panelVisibility === 'hidden',
  `main ${rest.main.left}–${rest.main.right} of ${rest.width}px, circle ${rest.disc.left}–${rest.disc.right} (${rest.disc.width}px, radius ${rest.discRadius}), opacity ${rest.mainOpacity}, panel ${rest.panelVisibility}`)
await page.screenshot({ path: `${SHOTS}/floating-rest.png`, clip: { x: 1100, y: 440, width: 180, height: 260 } })
{
  // Folded, the column is mostly empty: where the panel and the settings will be, the page still gets the pointer
  const under = await page.evaluate(([panel, settings, main]) => {
    const ours = (x, y) => document.elementFromPoint(x, y)?.classList.contains('axt-floating') ?? false
    return { panel: ours(panel.x, panel.y), settings: ours(settings.x, settings.y), main: ours(main.x, main.y) }
  }, [rest.panel, rest.settings, rest.main])
  check('folded, only the tab itself takes the pointer: the page keeps the space above and below it',
    under.main && !under.panel && !under.settings,
    `under the pointer is ours — on the tab: ${under.main}, where the panel folds: ${under.panel}, where the settings fold: ${under.settings}`)
}

// The pointer arrives: lit at once, open only after it has stayed (Immersive Translate's two steps)
await page.mouse.move(rest.main.x, rest.main.y, { steps: 3 })
await sleep(280)
const lit = await dockState()
await sleep(500)
const open = await dockState()
check('the pointer lights it at once, and the other buttons come out only once it has stayed',
  lit.lit === 'yes' && lit.expanded === 'no' && lit.mainOpacity > 0.95 && lit.panelVisibility === 'hidden'
    && open.expanded === 'yes' && open.panelOpacity === 1 && open.panel.bottom <= open.main.top && open.settings.top >= open.main.bottom && open.options.right <= open.main.left,
  `at 280 ms: lit ${lit.lit}, open ${lit.expanded}, opacity ${lit.mainOpacity.toFixed(2)}; at 780 ms: open ${open.expanded}, panel above (${open.panel.bottom} ≤ ${open.main.top}), settings below (${open.settings.top} ≥ ${open.main.bottom}), close control beside (${open.options.right} ≤ ${open.main.left})`)
await page.screenshot({ path: `${SHOTS}/floating-open.png`, clip: { x: 1100, y: 440, width: 180, height: 260 } })
{
  // From the main button up to the panel at a crawl — a second for 45 px, far longer than the 200 ms of grace: the gap
  // between the two is bridged while the dock is open, so it must not fold on the way
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(open.main.x, open.main.y + (open.panel.y - open.main.y) * (i / 25))
    await sleep(40)
  }
  const arrived = await dockState()
  check('a slow pointer crossing from the main button to the panel does not fold it on the way',
    arrived.expanded === 'yes', `open ${arrived.expanded} after a one-second crossing of ${open.main.y - open.panel.y}px`)
}
await page.mouse.move(600, 200)
await sleep(700)
const folded = await dockState()
// Over Chrome's PDF viewer this document hears no `mouseleave`: the layer behind the lit button is what tells it (button.ts)
check('it folds and dims again after the pointer has left for the PDF viewer', folded.expanded === 'no' && folded.lit === 'no' && Math.abs(folded.mainOpacity - 0.7) < 0.01,
  `open ${folded.expanded}, lit ${folded.lit}, opacity ${folded.mainOpacity.toFixed(2)}`)

// The drag (Read Frog's): past 6 px it follows the pointer, the release docks it to the nearer side, the place is saved
{
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
  check('dragged to the left half of a PDF, it docks to the left edge, and is still there after a reload',
    dropped.side === 'left' && dropped.main.left === 0 && reloaded.side === 'left' && Math.abs(reloaded.main.top - dropped.main.top) <= 2,
    `side ${dropped.side} → ${reloaded.side} after reload, main top ${dropped.main.top} → ${reloaded.main.top}px`)
  check('the release of a drag does not open the link', context.pages().length === 1, `${context.pages().length} tab(s) open`)
}

// The close menu's second item turns the switch off; the settings page turns it back on, and the open PDF follows at once
{
  const resting = await dockState()
  await page.mouse.move(resting.main.x, resting.main.y, { steps: 3 })
  await sleep(800)
  const close = (await dockState()).options
  await page.mouse.click(close.x, close.y)
  await sleep(300)
  const item = await page.evaluate(() => {
    const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.hide-always')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (item) await page.mouse.click(item.x, item.y)
  await sleep(1000)
  const stored = await worker.evaluate(() => chrome.storage.local.get('config')).then(v => v.config?.floatingEntry)
  const gone = await page.evaluate(() => document.querySelectorAll('.axt-floating').length)
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html#reading`, { waitUntil: 'load' })
  const toggle = options.getByRole('switch', { name: /显示悬浮按钮|Show the floating button/ })
  const wasOn = await toggle.getAttribute('aria-checked')
  await toggle.click()
  await sleep(1000)
  await page.bringToFront()
  const back = await page.evaluate(() => document.querySelectorAll('.axt-floating').length)
  check('“don\'t show again” takes it away and turns the setting off; the settings switch brings it back without a reload',
    item !== null && gone === 0 && stored?.enabled === false && stored?.side === 'left' && wasOn === 'false' && back === 1,
    `menu item ${item ? 'found' : 'missing'}, ${gone} buttons after hiding, stored enabled ${stored?.enabled} (side kept: ${stored?.side}), switch ${wasOn} before, ${back} button after turning it on`)
  await options.close()
}

// ————— The abstract page —————
await page.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
await sleep(3000)
{
  const abs = await dockState()
  const arxivHref = await page.evaluate(() => document.querySelector('a#latexml-download-link, a[href*="/html/"]')?.href ?? null)
  check('the abstract page has the button too, its main button a link to the href arXiv gives, already translating',
    abs !== null && abs.tag === 'A' && arxivHref !== null && abs.href === `${arxivHref}#axt-translate` && abs.side === 'left',
    `main <${abs?.tag?.toLowerCase()}> → ${abs?.href}, arXiv's own ${arxivHref}, docked ${abs?.side} as saved on the PDF`)
}

// ————— The HTML full text: the toggle, the tick, the page's DOM —————
await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
await sleep(5000)
/**
 * What a translation must put back exactly (DESIGN §7.1): the paper's own tree, the attributes on <html>, the title.
 * Not the whole document: arXiv's own scripts write to their report form on any click (measured: `style=""` on two of
 * its inputs), which is theirs to do
 */
const pageDom = () => page.evaluate(() => {
  const root = document.documentElement
  const html = `${[...root.attributes].map(a => `${a.name}="${a.value}"`).join(' ')}|${document.title}|${document.querySelector('article')?.outerHTML ?? ''}`
  return { html, ours: [...document.querySelectorAll('*')].filter(e => [...e.attributes].some(a => a.name.startsWith('data-axt-')) || [...e.classList].some(c => c.startsWith('axt-'))).map(e => e.className || e.tagName) }
})
const before = await pageDom()
const idle = await dockState()
check('on the full text the button is there before any translation, and it is the only thing of ours on the page',
  idle !== null && idle.tag === 'BUTTON' && idle.active === 'no' && /翻译本页|Translate this page/.test(idle.label ?? '') && JSON.stringify(before.ours) === JSON.stringify(['axt-floating']),
  `main <${idle?.tag?.toLowerCase()}> “${idle?.label}”, active ${idle?.active}, our nodes and marks: ${before.ours.join(', ')}`)

await page.mouse.click(idle.main.x, idle.main.y)
await sleep(10_000)
const on = await dockState()
const translated = await page.evaluate(() => document.querySelectorAll('.axt-t').length)
await page.mouse.move(600, 200)
await sleep(600)
await page.screenshot({ path: `${SHOTS}/floating-active.png`, clip: { x: 0, y: 440, width: 180, height: 260 } })
check('a click translates the page: translations arrive, the tick shows, and the button now offers the original',
  translated > 0 && on.active === 'yes' && on.tickScale === '1' && /显示原文|Show the original|original/i.test(on.label ?? ''),
  `${translated} translation nodes, active ${on.active}, tick scale ${on.tickScale}, label “${on.label}”`)

const again = await dockState()
await page.mouse.click(again.main.x, again.main.y)
await sleep(2500)
const off = await dockState()
const after = await pageDom()
/** Where the two documents part, tag by tag: the failure says what changed, not only that something did */
const firstDifference = (a, b) => {
  const tags = html => html.match(/<[^>]*>/g) ?? []
  const [ta, tb] = [tags(a), tags(b)]
  const at = ta.findIndex((tag, i) => tag !== tb[i])
  return at < 0 ? 'none' : `${ta[at]?.slice(0, 160)} → ${tb[at]?.slice(0, 160)}`
}
check('a second click restores it: the tick goes, nothing of ours is left but the button, and the document is what it was',
  off !== null && off.active === 'no' && JSON.stringify(after.ours) === JSON.stringify(['axt-floating']) && after.html === before.html,
  `active ${off?.active}, our nodes and marks: ${after.ours.join(', ')}, document ${before.html.length} → ${after.html.length} characters, first difference: ${firstDifference(before.html, after.html)}`)

// The control panel opens the extension's popup (`action.openPopup`, from the background)
{
  const resting = await dockState()
  await page.mouse.move(resting.main.x, resting.main.y, { steps: 3 })
  await sleep(800)
  const panel = (await dockState()).panel
  // An action popup is no tab, and Playwright reports no page for it: the extension's own contexts are asked instead
  const popups = () => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }).then(list => list.map(c => c.documentUrl)))
  const beforeClick = await popups()
  await page.mouse.click(panel.x, panel.y)
  let opened = []
  for (let i = 0; i < 20 && opened.length === 0; i++) {
    await sleep(250)
    opened = await popups()
  }
  check('the control panel opens the extension\'s popup', beforeClick.length === 0 && opened.length === 1 && /popup\.html/.test(opened[0] ?? ''),
    `${beforeClick.length} popup before the click, then ${opened.map(u => u.replace(/^chrome-extension:\/\/[a-z]+/, '…')).join(', ') || 'none'}`)
}

await context.close()
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
