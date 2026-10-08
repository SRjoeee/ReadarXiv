// The floating button and the figure viewer, shot for the maintainer before and after the redesign's Part 6 (its design,
// §7): the button at rest, with the tick of a translated page, lit, open, with its close menu and with its control
// panel; the viewer's control over a figure, its dialog and the dialog's bar — each in light and in dark, at twice the
// pixels (the 200 % look). A theme is set three ways at once, so that a build from before the part (the button following
// the system's colour scheme) and one from after it (following the extension's appearance) are shot in the same one:
// the system's scheme, the extension's `theme`, and arXiv's own theme for the paper under them. Where each part of the
// button stands is written beside the shots (measures.json); with both sets there, the two are compared part by part,
// and a page shows them side by side (index.html). A part that moved fails the probe (exit 1), but for those the
// redesign changed on purpose (FREE, below). The setup is floating-button.mjs's. Needs the network (arXiv).
//   pnpm build && node tests/e2e/probes/floating-shots.mjs <before|after>
// Environment: AXT_EXT_DIR points at another build (Part 6 keeps Part 3's in out/floating/build-before); AXT_PAPER
// another paper; AXT_CHROME another Chrome.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const label = process.argv[2]
if (label !== 'before' && label !== 'after') throw new Error('usage: node tests/e2e/probes/floating-shots.mjs <before|after>')
const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../lab/pdf/out/floating/', import.meta.url))
const PROFILE = `${E2E}.profile-floating-shots`
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
const [WIDTH, HEIGHT] = [1280, 860]
const STILL = { animations: 'disabled', caret: 'hide' }
const dir = join(OUT, label)
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? (await context.newPage())
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]

/** The extension's appearance, written into its configuration once the extension has written one */
const setTheme = theme => worker.evaluate(async theme => {
  for (let i = 0; i < 100; i++) {
    const { config } = await chrome.storage.local.get('config')
    if (config) return chrome.storage.local.set({ config: { ...config, theme } })
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('no configuration after 10 s')
}, theme)
/** The centre of a part of the button, from inside its shadow root; null while it is not there or has no box */
const partAt = selector => page.evaluate(selector => {
  const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}, selector)
/** Every part of the button, in CSS pixels to a tenth, and whether it is lit and open: what must not move (§7) */
const measure = () => page.evaluate(() => {
  const root = document.querySelector('.axt-floating').shadowRoot
  const dock = root.querySelector('.axt-fb-dock')
  const box = element => { const r = element.getBoundingClientRect(); return r.width > 0 ? [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10) : null }
  const PARTS = ['.axt-fb-main', '.axt-fb-disc', '.axt-fb-panel', '.axt-fb-settings', '.axt-fb-options', '.axt-fb-lock', '.axt-fb-panel-box', '.axt-fb-menu', '.axt-fb-menu button', '.axt-fb-main .axt-fb-tip']
  return { state: [dock.dataset.axtLit, dock.dataset.axtExpanded], ...Object.fromEntries(PARTS.map(selector => [selector, [...root.querySelectorAll(selector)].map(box)])) }
})

const measures = {}
const missing = []
let shots = 0
for (const theme of ['light', 'dark']) {
  await setTheme(theme)
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
  await page.evaluate(value => localStorage.setItem('ar5iv_theme', value), theme)
  await page.reload({ waitUntil: 'load' })
  await sleep(5000)
  const main = await partAt('.axt-fb-main')
  if (!main) { missing.push(`${theme}: no floating button`); continue }
  /** the button and everything that comes out of it, beside the window's right edge */
  const near = { x: WIDTH - 360, y: Math.max(0, Math.round(main.y - 150)), width: 360, height: 300 }
  /** the control panel, the right of the window */
  const side = { x: WIDTH - 460, y: 0, width: 460, height: HEIGHT }
  const shot = async (name, clip, settle = 300, measured = true) => {
    await sleep(settle)
    // Measured before the capture: in `lit` the 400 ms dwell may end while the screenshot is taken
    if (measured) measures[`${theme}-${name}`] = await measure()
    await page.screenshot({ path: join(dir, `${theme}-${name}.png`), ...(clip ? { clip } : {}), ...STILL })
    shots++
  }
  /** The tick of a translated page, set on the dock for a shot: a translation is the network's, the tick is what is looked at */
  const tick = value => page.evaluate(value => { document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-dock').dataset.axtActive = value }, value)
  await page.mouse.move(640, 10)
  await sleep(700)
  await shot('rest', near)
  await tick('yes')
  await shot('tick', near)
  await tick('no')
  // Lit: the pointer on it, shot before the 400 ms dwell opens it (reduced motion: the light-up is instant)
  await page.mouse.move(main.x, main.y, { steps: 3 })
  await shot('lit', near, 0)
  await sleep(700)
  await shot('open', near)
  // Each of the two closed by a press on the paper, as a reader closes it: a key would leave the keyboard's focus in the
  // dock, which holds it open
  const close = await partAt('.axt-fb-options')
  if (close) {
    await page.mouse.click(close.x, close.y)
    await shot('menu', near)
    await page.mouse.click(640, 430)
  } else missing.push(`${theme}: no close control`)
  await page.mouse.move(main.x, main.y, { steps: 3 })
  await sleep(700)
  const panel = await partAt('.axt-fb-panel')
  if (panel) {
    await page.mouse.click(panel.x, panel.y)
    await shot('panel', side, 2500)
    await page.mouse.click(640, 430)
  } else missing.push(`${theme}: no panel button`)
  await page.mouse.move(640, 10)
  await sleep(700)
  // The figure viewer over the paper's first figure large enough for it
  const figure = await page.evaluate(() => {
    const image = [...document.querySelectorAll('.ltx_figure img')].find(i => i.getBoundingClientRect().width >= 160)
    if (!image) return null
    // the figure's top just below what the page pins at the top (arXiv's header): its control sits on that edge, and a
    // centred tall figure put it under the header, where a click reached the header's link
    image.scrollIntoView({ block: 'start' })
    const pinned = [...document.querySelectorAll('body *')].filter(e => /^(fixed|sticky)$/.test(getComputedStyle(e).position))
      .map(e => e.getBoundingClientRect()).filter(r => r.top <= 1 && r.bottom > 0 && r.bottom < innerHeight / 2)
    window.scrollBy(0, -(Math.max(0, ...pinned.map(r => r.bottom)) + 24))
    const r = image.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right, top: r.top }
  })
  if (!figure) { missing.push(`${theme}: no figure`); continue }
  await page.mouse.move(figure.x, figure.y, { steps: 4 })
  await shot('viewer-control', { x: Math.max(0, Math.round(figure.right - 220)), y: Math.max(0, Math.round(figure.top - 20)), width: 240, height: 120 }, 500, false)
  const control = await page.evaluate(() => {
    const r = document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')?.getBoundingClientRect()
    return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (!control) { missing.push(`${theme}: no viewer control`); continue }
  await page.mouse.click(control.x, control.y)
  await shot('viewer-dialog', null, 700, false)
  const bar = await page.evaluate(() => {
    const r = document.querySelector('.axt-viewer')?.shadowRoot?.querySelector('.axt-viewer-bar')?.getBoundingClientRect()
    return r && r.width > 0 ? { x: Math.max(0, Math.round(r.left - 24)), y: Math.max(0, Math.round(r.top - 24)), width: Math.round(r.width + 48), height: Math.round(r.height + 48) } : null
  })
  if (bar) await shot('viewer-bar', bar, 0, false)
  else missing.push(`${theme}: no viewer bar`)
  await page.keyboard.press('Escape')
}
await context.close()
writeFileSync(join(dir, 'measures.json'), JSON.stringify(measures, null, 1))
console.log(`${shots} shots in ${dir}`)
for (const line of missing) console.log(`MISSING ${line}`)

/**
 * What the redesign's Part 6 changed on purpose (its design, §7; DESIGN §4.0c): the tooltip's and the close menu's own
 * measures, and the control panel's frame in its top and height — it grows with a menu it holds, from the same left
 * edge and at the same width. Every other part must stand where it stood (Part 6's constraint), and one that moved
 * fails the probe: its exit code is the only re-check the constraint has (Part 7's final review)
 */
const FREE = new Set(['.axt-fb-main .axt-fb-tip', '.axt-fb-menu', '.axt-fb-menu button'])
const KEPT = { '.axt-fb-panel-box': box => box && [box[0], box[2]] }
/** whether a part stood where it stood: all of it, but what the redesign was free to change */
const held = (part, was, now) => {
  if (FREE.has(part)) return true
  const keep = KEPT[part] ?? (box => box)
  const of = boxes => (Array.isArray(boxes) && part !== 'state' ? boxes.map(keep) : boxes)
  return JSON.stringify(of(was)) === JSON.stringify(of(now))
}

// With both sets there: every part of the button compared, shot by shot, and a page pairing the shots
const other = join(OUT, label === 'before' ? 'after' : 'before', 'measures.json')
const moved = []
if (existsSync(other)) {
  const [was, is] = label === 'before' ? [measures, JSON.parse(readFileSync(other, 'utf8'))] : [JSON.parse(readFileSync(other, 'utf8')), measures]
  for (const [name, parts] of Object.entries(was)) {
    for (const [part, boxes] of Object.entries(parts)) {
      const now = is[name]?.[part]
      const same = JSON.stringify(boxes) === JSON.stringify(now)
      const allowed = !same && held(part, boxes, now)
      if (!same && !allowed) moved.push(`${name} ${part}`)
      console.log(`${same ? 'same   ' : allowed ? 'differs (free to)' : 'differs'} ${name} ${part}${same ? '' : ` — ${JSON.stringify(boxes)} → ${JSON.stringify(now)}`}`)
    }
  }
  const names = readdirSync(join(OUT, 'before')).filter(n => n.endsWith('.png')).sort()
  writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Floating button, before and after</title>
<style>body{font:13px system-ui;margin:24px;background:#8a8a8a}figure{margin:0 0 32px}figcaption{margin:0 0 8px;font-weight:600}div{display:flex;gap:16px;align-items:flex-start}img{max-width:46vw}</style>
${names.map(n => `<figure><figcaption>${n}: before, after</figcaption><div><img src="before/${n}" alt="before"><img src="after/${n}" alt="after"></div></figure>`).join('\n')}\n`)
  console.log(`side by side: ${join(OUT, 'index.html')}`)
}
for (const part of moved) console.log(`MOVED ${part}`)
process.exit(missing.length || moved.length ? 1 : 0)
