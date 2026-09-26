// The shared controls in a real browser (the redesign's Part 3): the controls sheet (src/entrypoints/controls, a dev
// page) in both interface languages, light and dark side by side. Each specimen is shot at rest per language and theme
// into experiments/pdf-bilingual/out/controls/ (at twice the pixels: the 200 % look), every row's items are held to the
// row's centre line (align.mjs), and each control is measured against the values the prototypes agreed. The popup's and
// the settings page's own documents are checked for the pointer's and the keyboard's turns. Exits 1 on a failure or a
// page error. The sheet is in development builds only (wxt.config.ts DEV_PAGES):
//   pnpm exec wxt build --mode development && node tests/e2e/probes/controls.mjs
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { offCentre, shootEach } from './align.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/controls', import.meta.url))
const PROFILE = `${E2E}.profile-controls`
const SHEET = join(EXT, 'controls.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(SHEET) || readFileSync(SHEET, 'utf8').includes('localhost')) throw new Error('no controls sheet: pnpm exec wxt build --mode development first')
rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const THEMES = ['light', 'dark']
let failed = 0
const check = (what, ok, detail = '') => {
  console.log(ok ? `ok   ${what}` : `FAIL ${what} — ${detail}`)
  if (!ok) failed++
}
const near = (a, b, tolerance = 0.5) => typeof a === 'number' && Math.abs(a - b) <= tolerance

/** what the first element matching `selector` draws (or its `pseudo`): its box and the styles the checks read; null when there is none */
const look = (page, selector, pseudo) => page.evaluate(([selector, pseudo]) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const c = getComputedStyle(el, pseudo), r = el.getBoundingClientRect()
  return {
    tag: el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
    radius: c.borderTopLeftRadius, pad: c.paddingInlineStart, padBlock: c.paddingTop, size: c.fontSize, lineHeight: c.lineHeight, weight: c.fontWeight,
    bg: c.backgroundColor, color: c.color, shadow: c.boxShadow, scale: c.scale, opacity: c.opacity, visibility: c.visibility, align: c.textAlign, animation: c.animationName,
    ring: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineOffset}`, ringColor: c.outlineColor,
  }
}, [selector, pseudo ?? null])

/** `value` as a half's tokens resolve it for `property` (a probe element in the half, read and removed): what a check compares with */
const token = (page, theme, property, value) => page.evaluate(([theme, property, value]) => {
  const probe = document.createElement('i')
  probe.style.setProperty(property, value)
  document.querySelector(`[data-theme="${theme}"]`).append(probe)
  const out = getComputedStyle(probe).getPropertyValue(property)
  probe.remove()
  return out
}, [theme, property, value])

/** Task 15: the pages' base — ink on the chrome in the extension's font, the keyboard's ring and not the pointer's */
async function base(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"]`, tag = `${lang} ${theme}`
    const half = await look(page, at)
    const want = { bg: await token(page, theme, 'background-color', 'var(--chrome)'), color: await token(page, theme, 'color', 'var(--ink)') }
    check(`${tag}: ink on the chrome, 13 / 1.4`, half?.bg === want.bg && half.color === want.color && half.size === '13px' && half.lineHeight === '18.2px', JSON.stringify({ half, want }))
    const focus = await token(page, theme, 'outline-color', 'var(--focus)')
    // the keyboard from the specimen's heading: the link, then the field; then the pointer on the field
    await page.click(`${at} [data-specimen="base"] > h2`)
    await page.keyboard.press('Tab')
    const link = await look(page, ':focus')
    await page.keyboard.press('Tab')
    const field = await look(page, ':focus')
    await page.click(`${at} [data-specimen="base"] input`)
    const pressed = await look(page, ':focus')
    check(`${tag}: the keyboard's ring, 2 px of the focus ink 2 px off, hugging a field; none for the pointer's field`,
      link?.tag === 'A' && link.ring === 'solid 2px 2px' && link.ringColor === focus && field?.tag === 'INPUT' && field.ring === 'solid 2px 0px' && pressed?.ring.startsWith('none'),
      JSON.stringify({ link, field, pressed }))
  }
}

// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----
const CHECKS = [base]

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  // tall enough for the whole sheet and its menus: a popover past the window's foot is cut short in its shot
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host

// the popup's and the settings page's documents mark the pointer's turn and the keyboard's from their first paint
for (const path of ['popup.html', 'options.html']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${path}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/${path}`)
  await page.waitForTimeout(800)
  await page.mouse.click(4, 4)
  const pointer = await page.evaluate(() => document.documentElement.hasAttribute('data-axt-pointer'))
  await page.keyboard.press('Tab')
  const keyboard = await page.evaluate(() => !document.documentElement.hasAttribute('data-axt-pointer'))
  check(`${path}: a press marks the pointer's turn, Tab the keyboard's (trackModality)`, pointer && keyboard)
  await page.close()
}

for (const lang of ['zh-CN', 'en']) {
  const page = await context.newPage()
  page.on('pageerror', e => check(`${lang}: no page error`, false, e.message))
  await page.goto(`chrome-extension://${id}/controls.html?lang=${lang}`)
  await page.waitForSelector('[data-specimen]')
  await page.waitForTimeout(300)
  // at rest: each specimen shot, every row's items on the row's centre line
  for (const theme of THEMES) await shootEach(page, `[data-theme="${theme}"] [data-specimen]`, OUT, name => `${lang}-${theme}-${name}`, 'specimen')
  const off = await offCentre(page, { rows: '[data-row]' })
  check(`${lang}: every row's items on its centre line, within 0.5 px`, off.length === 0, JSON.stringify(off))
  for (const run of CHECKS) {
    await run(page, lang)
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.activeElement?.blur())
  }
  await page.close()
}
await context.close()
process.exit(failed ? 1 : 0)
