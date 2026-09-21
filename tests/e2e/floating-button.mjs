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
  const dock = root.querySelector('.axt-fb-dock')
  const main = root.querySelector('.axt-fb-main')
  return {
    side: dock.dataset.axtSide, lit: dock.dataset.axtLit, expanded: dock.dataset.axtExpanded, active: dock.dataset.axtActive, width: window.innerWidth,
    main: rect('.axt-fb-main'), disc: rect('.axt-fb-disc'), panel: rect('.axt-fb-panel'), settings: rect('.axt-fb-settings'), options: rect('.axt-fb-options'),
    mainOpacity: Number(look('.axt-fb-main', 'opacity')), panelOpacity: Number(look('.axt-fb-panel', 'opacity')), panelVisibility: look('.axt-fb-panel', 'visibility'),
    // The tick is scaled to nothing until the page is translated
    tickShown: look('.axt-fb-tick', 'transform') !== 'matrix(0, 0, 0, 0, 0, 0)', discRadius: look('.axt-fb-disc', 'borderRadius'),
    label: main.getAttribute('aria-label'), tag: main.tagName, href: main.getAttribute('href'),
    order: [...root.querySelectorAll('.axt-fb-column > *')].map(e => e.className),
    // In the screen's own pixels: what the reader's eye gets, whatever the page's zoom
    device: (() => { const r = main.getBoundingClientRect(); const k = window.devicePixelRatio; return { ratio: k, width: r.width * k, height: r.height * k, top: r.top * k, left: r.left * k } })(),
    vector: root.querySelector('.axt-fb-disc svg.axt-fb-mark') !== null && root.querySelector('img') === null,
  }
})

/**
 * Open the control panel with the mouse and say what is there: the panel's box, whether the popup loaded in its frame
 * and what it shows, and whether a press elsewhere closed it again
 */
async function openPanel() {
  const resting = await dockState()
  await page.mouse.move(resting.main.x, resting.main.y, { steps: 3 })
  await sleep(900)
  const panel = (await dockState()).panel
  await page.mouse.click(panel.x, panel.y)
  await sleep(2500)
  const frame = page.frames().find(f => f.url().includes('/popup.html'))
  const text = frame ? await frame.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).catch(() => null) : null
  const state = await page.evaluate(() => {
    const root = document.querySelector('.axt-floating').shadowRoot
    const box = root.querySelector('.axt-fb-panel-box')
    const r = box.getBoundingClientRect()
    const m = root.querySelector('.axt-fb-main').getBoundingClientRect()
    return { ready: box.dataset.axtReady, box: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }, main: { left: Math.round(m.left), y: Math.round(m.y + m.height / 2) }, innerHeight: window.innerHeight, expanded: root.querySelector('.axt-fb-panel').getAttribute('aria-expanded') }
  })
  await page.screenshot({ path: `${SHOTS}/floating-panel.png` })
  // Between the two places the panel can be — the dock may be docked to either side by now — and on the paper's text
  await page.mouse.click(640, 430)
  await sleep(500)
  const closedByPress = await page.evaluate(() => document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-panel-box').hidden)
  await page.mouse.move(640, 10)
  await sleep(600)
  return { ...state, loaded: frame !== undefined, text, closedByPress }
}

// ————— The PDF page: rest, light, open, drag, hide —————
await page.goto(`https://arxiv.org/pdf/${PAPER}`, { waitUntil: 'load' })
await sleep(6000)
const rest = await dockState()
check('three buttons in a column: the control panel, the main button, the settings (no feedback button)',
  JSON.stringify(rest?.order) === JSON.stringify(['axt-fb-hidden-button axt-fb-panel', 'axt-fb-anchor', 'axt-fb-hidden-button axt-fb-settings']),
  `${rest?.order?.join(' · ')}`)
/** Every edge of the main button on a whole pixel of the screen: half a pixel is a soft edge */
const onTheGrid = device => [device.width, device.height, device.top, device.left].every(v => Math.abs(v - Math.round(v)) < 0.01)
check('the mark is inline vector, and the main button sits on whole pixels of the screen',
  rest.vector && onTheGrid(rest.device),
  `inline svg and no image: ${rest.vector}; device px: ${rest.device.width} × ${rest.device.height} at top ${rest.device.top}, left ${rest.device.left} (ratio ${rest.device.ratio})`)
const pdfSize = rest.device
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

// The control panel on a PDF: the popup framed in a document whose body is Chrome's viewer, closed by a press on that viewer
{
  const seen = await openPanel()
  check('on a PDF the control panel opens beside the button with the popup in it, and a press on the viewer closes it',
    seen.ready === 'yes' && seen.loaded && /双语版本|Bilingual version/.test(seen.text ?? '') && seen.box.right <= seen.main.left && seen.closedByPress,
    `ready ${seen.ready}, popup loaded ${seen.loaded} (“${seen.text?.slice(0, 40)}…”), panel ${seen.box.left}–${seen.box.right} beside the button at ${seen.main.left}, closed by a press elsewhere: ${seen.closedByPress}`)
}

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
    const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-hide-always')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (item) await page.mouse.click(item.x, item.y)
  await sleep(1000)
  // Under its own key, not in the configuration: a drag's write can touch nothing else (Devin on #250)
  const stored = await worker.evaluate(() => chrome.storage.local.get(['config', 'floatingEntry'])).then(v => ({ ...v.floatingEntry, inConfig: 'floatingEntry' in (v.config ?? {}) }))
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
    item !== null && gone === 0 && stored?.enabled === false && stored?.side === 'left' && stored?.inConfig === false && wasOn === 'false' && back === 1,
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
    abs !== null && abs.tag === 'A' && arxivHref !== null && abs.href === `${arxivHref}#readarxiv` && abs.side === 'left',
    `main <${abs?.tag?.toLowerCase()}> → ${abs?.href}, arXiv's own ${arxivHref}, docked ${abs?.side} as saved on the PDF`)
}

// The opening motion, frame by frame (the maintainer, 2026-09-18: the parts came out on different curves, and flickered).
// What an eye judges as "together" and "smooth" is, in numbers: every part has the same opacity in every frame, no
// opacity ever falls back on the way in, and nothing that was already on screen moves
{
  await page.mouse.move(640, 10)
  await sleep(700)
  await page.evaluate(() => {
    const root = document.querySelector('.axt-floating').shadowRoot
    const parts = ['.axt-fb-panel', '.axt-fb-settings', '.axt-fb-options', '.axt-fb-lock', '.axt-fb-main .axt-fb-tip'].map(selector => root.querySelector(selector))
    const dock = root.querySelector('.axt-fb-dock')
    const main = root.querySelector('.axt-fb-main')
    window.__frames = []
    let from = null
    const read = () => {
      if (from === null && dock.dataset.axtExpanded === 'yes') from = performance.now()
      if (from !== null) {
        const m = main.getBoundingClientRect()
        const d = dock.getBoundingClientRect()
        window.__frames.push({ opacities: parts.map(part => Number(getComputedStyle(part).opacity)), still: [m.left, m.top, d.left, d.top, d.width, d.height].join() })
      }
      if (from === null || performance.now() - from < 500) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  const at = (await dockState()).main
  await page.mouse.move(at.x, at.y, { steps: 3 })
  await sleep(1300)
  const frames = await page.evaluate(() => window.__frames)
  const together = frames.every(f => Math.max(...f.opacities) - Math.min(...f.opacities) < 0.02)
  const rising = frames.every((f, i) => i === 0 || f.opacities.every((o, k) => o >= frames[i - 1].opacities[k] - 0.001))
  const still = frames.every(f => f.still === frames[0].still)
  const arrived = frames.at(-1)?.opacities.every(o => o > 0.99) ?? false
  check('the panel, the settings, the two corner controls and the tooltip come out as one: same opacity every frame, never falling back, and nothing already on screen moves',
    frames.length > 10 && together && rising && still && arrived,
    `${frames.length} frames; together ${together}, only rising ${rising}, main button and dock still ${still}, all fully in at the end ${arrived}`)
  await page.mouse.move(640, 10)
  await sleep(700)
}

// A pointer at rest on an edge trembles across it (the maintainer, 2026-09-18: a strobing jump as the pointer reached
// the button). Measured then: with the dock open, a pointer trembling across the main button's edge towards the two
// corner controls made the main button's tooltip reverse its opacity 48 times in 1.5 s. A reversal is an opacity that
// was rising and falls, or the other way: a look that only comes, stays and goes has none while the pointer trembles.
// The cure is Read Frog's — the hit area grows when the button lights, so the edge that lit it is no longer an edge —
// and a close delay on the tooltips
{
  await page.mouse.move(640, 10)
  await sleep(700)
  const at = (await dockState()).main
  // The edge that faces the page — the one a pointer coming for the button reaches first, whichever side it is docked to
  const docked = (await dockState()).side
  const edge = docked === 'right' ? at.left : at.right
  const inward = docked === 'right' ? 1 : -1
  const watch = () => page.evaluate(() => {
    const root = document.querySelector('.axt-floating').shadowRoot
    const parts = ['.axt-fb-main', '.axt-fb-main .axt-fb-tip', '.axt-fb-panel', '.axt-fb-options'].map(selector => root.querySelector(selector))
    window.__looks = []
    window.__watching = true
    const read = () => {
      window.__looks.push(parts.map(part => Number(getComputedStyle(part).opacity)))
      if (window.__watching) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  const reversals = looks => [0, 1, 2, 3].map(k => {
    let turns = 0
    let direction = 0
    for (let i = 1; i < looks.length; i++) {
      const step = Math.sign(Math.round((looks[i][k] - looks[i - 1][k]) * 1000))
      if (step === 0) continue
      if (direction !== 0 && step !== direction) turns++
      direction = step
    }
    return turns
  })
  const tremble = async (ms) => {
    for (let t = 0; t < ms; t += 30) {
      await page.mouse.move(edge + inward * ((t / 30) % 2 ? -1 : 1), at.y)
      await sleep(30)
    }
  }

  // The hit area: folded, 10 px outside the edge is the page's; lit, it is the dock's, and lets the pointer tremble
  const oursAt = (x, y) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.classList.contains('axt-floating') ?? false, [x, y])
  const outside = edge - inward * 10
  const foldedReach = await oursAt(outside, at.y)
  // From folded: the pointer comes to rest on the edge and trembles there. The dwell must survive it
  await watch()
  await page.mouse.move(edge + inward, at.y, { steps: 4 })
  await sleep(120)
  const litReach = await oursAt(outside, at.y)
  await tremble(1500)
  const opened = (await dockState()).expanded
  // Still trembling, now with the dock open and the corner controls a pixel away
  const before = await page.evaluate(() => window.__looks.length)
  await tremble(1500)
  const looks = await page.evaluate(() => { window.__watching = false; return window.__looks })
  const turns = reversals(looks.slice(before))
  check('the hit area grows when the button lights: a pointer trembling on its edge still opens the dock, and nothing strobes while it trembles there',
    !foldedReach && litReach && opened === 'yes' && turns.every(n => n === 0),
    `10 px outside the edge is ours — folded: ${foldedReach}, lit: ${litReach}; open after 1.5 s of trembling: ${opened}; opacity reversals over the next 1.5 s — main ${turns[0]}, its tooltip ${turns[1]}, panel button ${turns[2]}, close control ${turns[3]} (${looks.length - before} frames)`)
  await page.mouse.move(640, 10)
  await sleep(700)
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
/** The page's tools of ours, there from the load whether or not it is translated: this button, and the figure viewer's two boxes — its dialog's host and the spot its control stands in (DESIGN §15.7) */
const TOOLS = JSON.stringify(['axt-floating', 'axt-viewer', 'axt-viewer-spot'])
const onlyTools = ours => JSON.stringify([...ours].sort()) === TOOLS
check('on the full text the button is there before any translation, and nothing of ours is on the page but it and the figure viewer',
  idle !== null && idle.tag === 'BUTTON' && idle.active === 'no' && /翻译本页|Translate this page/.test(idle.label ?? '') && onlyTools(before.ours),
  `main <${idle?.tag?.toLowerCase()}> “${idle?.label}”, active ${idle?.active}, our nodes and marks: ${before.ours.join(', ')}`)

await page.mouse.click(idle.main.x, idle.main.y)
await sleep(10_000)
const on = await dockState()
const translated = await page.evaluate(() => document.querySelectorAll('.axt-t').length)
await page.mouse.move(600, 200)
await sleep(600)
await page.screenshot({ path: `${SHOTS}/floating-active.png`, clip: { x: 0, y: 440, width: 180, height: 260 } })
check('a click translates the page: translations arrive, the tick shows, and the button now offers the original',
  translated > 0 && on.active === 'yes' && on.tickShown && idle.tickShown === false && /显示原文|Show the original|original/i.test(on.label ?? ''),
  `${translated} translation nodes, active ${on.active}, tick shown ${idle.tickShown} → ${on.tickShown}, label “${on.label}”`)

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
check('a second click restores it: the tick goes, nothing of ours is left but the button and the figure viewer, and the document is what it was',
  off !== null && off.active === 'no' && onlyTools(after.ours) && after.html === before.html,
  `active ${off?.active}, our nodes and marks: ${after.ours.join(', ')}, document ${before.html.length} → ${after.html.length} characters, first difference: ${firstDifference(before.html, after.html)}`)

// The control panel (Immersive Translate's manner: a panel in the page, beside the button — not the toolbar's popup)
{
  const seen = await openPanel()
  check('the control panel opens beside the button, inside the window, with the popup for this page in it; a press elsewhere closes it',
    seen.ready === 'yes' && seen.loaded && /翻译本页|Translate this page/.test(seen.text ?? '') && seen.box.top >= 16 && seen.box.bottom <= seen.innerHeight - 16
      && Math.abs((seen.box.left > seen.main.left ? seen.box.left - seen.main.left : seen.main.left - seen.box.right)) <= 80 && seen.closedByPress,
    `ready ${seen.ready}, popup loaded ${seen.loaded} (“${seen.text?.slice(0, 40)}…”), panel ${seen.box.top}–${seen.box.bottom} of ${seen.innerHeight}px, closed by a press elsewhere: ${seen.closedByPress}`)
}

// One size on every page (the maintainer, 2026-09-18: larger on the full text than on a PDF). A reader's zoom scales
// the full text and everything in it, and never the document hosting Chrome's PDF viewer; the button undoes it
{
  const zoomTo = factor => worker.evaluate(async zoom => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    await chrome.tabs.setZoom(tab.id, zoom)
  }, factor)
  await page.bringToFront()
  const seen = []
  for (const zoom of [1.25, 1.5, 1]) {
    await zoomTo(zoom)
    await sleep(1500)
    const { device } = await dockState()
    seen.push({ zoom, ...device })
  }
  const same = seen.every(d => Math.abs(d.width - pdfSize.width) < 0.5 && Math.abs(d.height - pdfSize.height) < 0.5)
  check('zoomed to 125 % and 150 %, the button on the full text stays the size it has on a PDF, and on whole pixels',
    same && seen.every(onTheGrid) && seen[0].ratio > seen[2].ratio,
    `PDF ${pdfSize.width} × ${pdfSize.height} device px; full text ${seen.map(d => `${d.zoom * 100} %: ${Math.round(d.width * 10) / 10} × ${Math.round(d.height * 10) / 10} (ratio ${d.ratio})`).join(', ')}`)
}

await context.close()
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
