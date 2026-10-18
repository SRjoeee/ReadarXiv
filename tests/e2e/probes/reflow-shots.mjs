// The redesign's surfaces at 200 % and 400 % zoom (its design, §9, §12: every surface reflows at 200 % zoom and at 320 px
// of width). The settings page and the popup's states have their own probes at those widths and at twice the pixels
// (settings-align.mjs, popup-align.mjs); this one takes what they leave. The toolbar popup at 200 %: its window grows with
// the zoom, so it is its own 320 px at twice the pixels, and nothing may scroll sideways. On an arXiv paper at 200 % and
// 400 % — a 1280 px window is 640 and 320 CSS px wide there — the floating button at rest and open, its close menu, its
// panel with the popup inside, and the figure viewer's control, dialog and bar, in both themes: every part inside the
// window, the popup in the panel not scrolling sideways, the bar inside its dialog and its buttons apart. The shots, in
// lab/pdf/out/reflow/, are for reading at full size. Needs the network (arXiv).
//   pnpm build && node tests/e2e/probes/reflow-shots.mjs
// Environment: AXT_EXT_DIR another build; AXT_PAPER another paper; AXT_CHROME another Chrome.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../lab/pdf/out/reflow/', import.meta.url))
const PROFILE = `${E2E}.profile-reflow-shots`
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
const [WIDTH, HEIGHT] = [1280, 860]
const STILL = { animations: 'disabled', caret: 'hide' }
/** where a press closes what is open without reaching a link: the page's own margin */
const ASIDE = { x: 1, y: Math.round(HEIGHT / 2) }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: WIDTH, height: HEIGHT },
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? (await context.newPage())
/** The paper's window as the browser draws it. Playwright clips a page's shot by the scroll offset in CSS pixels, which
 * a tab's zoom does not scale: scrolled 3000 px down at 200 %, its shot was the page's ground alone (measured, Task 101) */
const cdp = await context.newCDPSession(page)
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
/** The extension's appearance, written into its configuration once the extension has written one */
const setTheme = theme => worker.evaluate(async theme => {
  for (let i = 0; i < 100; i++) {
    const { config } = await chrome.storage.local.get('config')
    if (config) return chrome.storage.local.set({ config: { ...config, theme } })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('no configuration after 10 s')
}, theme)
/** The active tab's zoom, as a reader's ⌘+ sets it */
const zoomTo = factor => worker.evaluate(async zoom => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  await chrome.tabs.setZoom(tab.id, zoom)
}, factor)
/** The centre of a part of the floating button, or null while it is not drawn */
const partAt = selector => page.evaluate(selector => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}, selector)
/** Every part of the floating button that is drawn, in the page's CSS pixels, and the window's size in the same */
const dockBoxes = () => page.evaluate(() => {
  const root = document.querySelector('.axt-floating')?.shadowRoot
  if (!root) return null
  const parts = {}
  for (const selector of ['.axt-fb-main', '.axt-fb-panel', '.axt-fb-settings', '.axt-fb-options', '.axt-fb-lock', '.axt-fb-menu', '.axt-fb-panel-box']) {
    const el = root.querySelector(selector)
    if (!el || el.hidden) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0) parts[selector] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  return { parts, width: innerWidth, height: innerHeight }
})
const round = box => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]))
const within = (a, b) => !!a && !!b && a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5
const apart = boxes => boxes.every((a, i) => boxes.every((b, j) => j <= i || a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5))

for (const theme of ['light', 'dark']) {
  await setTheme(theme)

  // The toolbar popup at 200 %: popup.html in a tab of 640 × 600 zoomed twice is the popup's 320 CSS px
  {
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 640, height: 600 })
    await popup.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.bringToFront()
    await zoomTo(2)
    await sleep(1200)
    const fit = await popup.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
    check(`${theme}: the toolbar popup at 200 % scrolls nothing sideways`, fit.content <= fit.width, JSON.stringify(fit))
    await popup.screenshot({ path: join(OUT, `${theme}-popup-200.png`), ...STILL })
    await zoomTo(1)
    await popup.close()
  }

  for (const zoom of [2, 4]) {
    const tag = `${theme}-${zoom * 100}`
    await page.bringToFront()
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
    await page.evaluate(value => localStorage.setItem('ar5iv_theme', value), theme)
    await page.reload({ waitUntil: 'load' })
    await sleep(4000)
    // arXiv's defect, not ours (the controller's ruling on Task 101's F1): below 1280 CSS px arXiv's .ltx_page_navbar is
    // a fixed, empty, transparent box over the window's right 20rem that takes the pointer, arXiv's own links' too, until
    // the reader has closed arXiv's table of contents once. Closed here as a reader would, by arXiv's own toggle, while
    // the window is still 1280 px wide and the contents show; arXiv keeps the choice, so a later load finds it closed
    if (await page.evaluate(() => document.documentElement.getAttribute('data-toc-display') !== 'none')) {
      await page.locator('.header-button[aria-label="Toggle navigation"]').click()
      await sleep(300)
    }
    await zoomTo(zoom)
    await sleep(1500)
    const shot = async name => {
      await sleep(300)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(OUT, `${tag}-${name}.png`), Buffer.from(data, 'base64'))
    }
    const inside = async name => {
      const boxes = await dockBoxes()
      if (!boxes) return check(`${tag} ${name}: the floating button is drawn`, false, 'no .axt-floating')
      const out = Object.entries(boxes.parts).filter(([, r]) => !within(r, { left: 0, top: 0, right: boxes.width, bottom: boxes.height }))
      check(`${tag} ${name}: every part of the floating button inside the window`, out.length === 0, out.map(([s, r]) => `${s} ${JSON.stringify(round(r))} in ${boxes.width} × ${boxes.height}`).join('; '))
    }

    await page.mouse.move(ASIDE.x, ASIDE.y)
    await sleep(600)
    await inside('rest')
    await shot('rest')
    const main = await partAt('.axt-fb-main')
    if (!main) { check(`${tag}: the floating button's main button`, false); continue }
    await page.mouse.move(main.x, main.y, { steps: 3 })
    await sleep(800)
    await inside('open')
    await shot('open')

    const close = await partAt('.axt-fb-options')
    if (close) {
      await page.mouse.click(close.x, close.y)
      await sleep(300)
      await inside('menu')
      await shot('menu')
      await page.mouse.click(ASIDE.x, ASIDE.y)
    } else check(`${tag}: the close control`, false)

    await page.mouse.move(main.x, main.y, { steps: 3 })
    await sleep(800)
    const panel = await partAt('.axt-fb-panel')
    if (panel) {
      await page.mouse.click(panel.x, panel.y)
      await sleep(2500)
      await inside('panel')
      const frame = page.frames().find(f => f.url().includes('/popup.html'))
      const fit = frame ? await frame.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })) : null
      check(`${tag} panel: the popup in its frame scrolls nothing sideways`, !!fit && fit.content <= fit.width, JSON.stringify(fit))
      await shot('panel')
      await page.mouse.click(ASIDE.x, ASIDE.y)
    } else check(`${tag}: the panel button`, false)

    await page.mouse.move(ASIDE.x, ASIDE.y)
    await sleep(600)
    // The figure viewer over the paper's first figure wide enough, its top just below what the page pins at the top
    const figure = await page.evaluate(() => {
      const image = [...document.querySelectorAll('.ltx_figure img')].find(i => i.getBoundingClientRect().width >= 100)
      if (!image) return null
      image.scrollIntoView({ block: 'start' })
      const pinned = [...document.querySelectorAll('body *')].filter(e => /^(fixed|sticky)$/.test(getComputedStyle(e).position))
        .map(e => e.getBoundingClientRect()).filter(r => r.top <= 1 && r.bottom > 0 && r.bottom < innerHeight / 2)
      window.scrollBy(0, -(Math.max(0, ...pinned.map(r => r.bottom)) + 24))
      const r = image.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) }
    })
    if (!figure) { check(`${tag}: a figure for the viewer`, false); continue }
    await page.mouse.move(figure.x, figure.y, { steps: 4 })
    await sleep(500)
    const control = await page.evaluate(() => {
      const r = document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')?.getBoundingClientRect()
      return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, width: innerWidth, height: innerHeight } : null
    })
    if (!control) { check(`${tag}: the viewer's control over a figure`, false); continue }
    check(`${tag}: the viewer's control inside the window`, within(control.box, { left: 0, top: 0, right: control.width, bottom: control.height }), JSON.stringify(round(control.box)))
    await shot('viewer-control')
    await page.mouse.click(control.x, control.y)
    await sleep(700)
    const viewer = await page.evaluate(() => {
      const root = document.querySelector('.axt-viewer')?.shadowRoot
      const box = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
      return { dialog: box(root?.querySelector('dialog')), bar: box(root?.querySelector('.axt-viewer-bar')), buttons: [...(root?.querySelectorAll('.axt-viewer-bar button') ?? [])].map(box).filter(Boolean), width: innerWidth, height: innerHeight }
    })
    check(`${tag}: the viewer's dialog inside the window, its bar inside it, the bar's three buttons apart`,
      within(viewer.dialog, { left: 0, top: 0, right: viewer.width, bottom: viewer.height }) && within(viewer.bar, viewer.dialog) && viewer.buttons.length >= 3 && viewer.buttons.every(b => within(b, viewer.bar)) && apart(viewer.buttons),
      JSON.stringify({ dialog: viewer.dialog && round(viewer.dialog), bar: viewer.bar && round(viewer.bar), buttons: viewer.buttons.map(round) }))
    await shot('viewer')
    await page.keyboard.press('Escape')
    await zoomTo(1)
  }
}
await context.close()
console.log(`shots in ${OUT}`)
process.exit(failed ? 1 : 0)
