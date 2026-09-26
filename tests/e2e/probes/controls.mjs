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

/** Task 16: buttons and shortcut labels (Part 3's interfaces; round 6, round 4, settings-2) */
async function buttons(page, lang) {
  for (const theme of THEMES) {
    const at = `[data-theme="${theme}"] [data-specimen="buttons"]`, tag = `${lang} ${theme}`
    for (const [selector, height, radius, pad, size, weight] of [
      ['.btn.brand.lg', 36, '9px', '0px', '13px', '500'],
      ['.btn.brand.md', 32, '8px', '16px', '13px', '500'],
      ['.btn.text.md', 32, '7px', '10px', '13px', '400'],
      ['.btn.neutral.sm', 28, '7px', '12px', '12.5px', '500'],
      ['.btn.text.sm', 28, '7px', '10px', '12.5px', '400'],
      ['.btn.raised', 26, '7px', '10px', '12.5px', '500'],
    ]) {
      const m = await look(page, `${at} ${selector}:not([aria-disabled])`)
      check(`${tag}: ${selector} ${height} px, radius ${radius}, ${pad} in, ${size} / ${weight}`, near(m?.height, height) && m.radius === radius && m.pad === pad && m.size === size && m.weight === weight, JSON.stringify(m))
    }
    for (const [selector, ground, words] of [
      ['.btn.brand.lg:not([aria-disabled])', 'var(--brand)', 'var(--on-brand)'],
      ['.btn.neutral.lg', 'var(--fill)', 'var(--ink)'],
      ['.btn.neutral.sm:not([aria-disabled])', 'var(--button)', 'var(--ink)'],
      ['.btn.raised', 'var(--button-raised)', 'var(--ink)'],
      ['.btn.brand[aria-disabled="true"]', 'var(--fill)', 'var(--ink-3)'],
      ['.btn.neutral.sm[aria-disabled="true"]', 'var(--button)', 'var(--ink-3)'],
      ['.btn.brand .kbd', 'var(--brand-chip)', 'var(--on-brand)'],
      ['.btn.neutral .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink-2)'],
      ['[data-row] > .kbd', 'color-mix(in oklab, var(--ink) 9%, transparent)', 'var(--ink-2)'],
      ['.btn[aria-busy="true"]', 'var(--brand)', 'var(--on-brand)'],
    ]) {
      const m = await look(page, `${at} ${selector}`)
      const want = { bg: await token(page, theme, 'background-color', ground), color: await token(page, theme, 'color', words) }
      check(`${tag}: ${selector} on ${ground}, in ${words}`, m?.bg === want.bg && m.color === want.color, JSON.stringify({ m, want }))
    }
    const raised = await look(page, `${at} .btn.raised`)
    check(`${tag}: a note's button raised by the raised shadow`, raised?.shadow === await token(page, theme, 'box-shadow', 'var(--raised-shadow)'), raised?.shadow)
    const kbd = await look(page, `${at} .btn.brand .kbd`)
    check(`${tag}: the shortcut label 11 px / 500, 3 by 5 in, radius 5`, kbd?.size === '11px' && kbd.weight === '500' && kbd.padBlock === '3px' && kbd.pad === '5px' && kbd.radius === '5px', JSON.stringify(kbd))
    const gaps = await page.evaluate(at => {
      const icon = document.querySelector(`${at} .btn.lg svg`), words = icon.nextElementSibling
      const label = document.querySelector(`${at} .btn.brand.lg .kbd`), before = label.previousElementSibling
      return { icon: words.getBoundingClientRect().left - icon.getBoundingClientRect().right, kbd: label.getBoundingClientRect().left - before.getBoundingClientRect().right, disabledKbd: document.querySelectorAll(`${at} .btn[aria-disabled="true"] .kbd`).length, neutralKbd: document.querySelectorAll(`${at} .btn.neutral .kbd`).length }
    }, at)
    check(`${tag}: an icon 7 px before its words, the shortcut 8 px after them, on a neutral one where it is given, none on a disabled one`, near(gaps.icon, 7) && near(gaps.kbd, 8) && gaps.disabledKbd === 0 && gaps.neutralKbd === 1, JSON.stringify(gaps))
    const busy = await page.evaluate(at => { const b = document.querySelector(`${at} .btn[aria-busy="true"]`), first = b.firstElementChild; return { spin: first.getAttribute('class'), turning: getComputedStyle(first).animationName, words: !!b.querySelector('span')?.textContent, kbd: b.querySelectorAll('.kbd').length } }, at)
    check(`${tag}: a busy button keeps its look and words, a loader turning in its icon's place`, busy.spin === 'spin' && busy.turning === 'turn' && busy.words && busy.kbd === 0, JSON.stringify(busy))
    const inside = await offCentre(page, { rows: `${at} .btn` })
    check(`${tag}: a button's icon, words and shortcut on its centre line`, inside.length === 0, JSON.stringify(inside))
    // the English words at the popup's width: nothing runs over its button (Review Focus)
    const over = await page.evaluate(at => [...document.querySelectorAll(`${at} .popup-width .btn`)].map(b => b.scrollWidth - b.clientWidth), at)
    check(`${tag}: the primary, the pair and the entries hold their words at the popup's width`, over.every(d => d <= 0), JSON.stringify(over))
    // the press: 0.96 while held, a disabled one not at all (§8); a text button lit on hover
    const press = async selector => {
      await page.hover(`${at} ${selector}`)
      await page.mouse.down()
      await page.waitForTimeout(200)
      const scale = (await look(page, `${at} ${selector}`))?.scale
      await page.mouse.up()
      return scale
    }
    const pressed = [await press('.btn.brand.md'), await press('.btn.brand[aria-disabled="true"]'), await press('.btn[aria-busy="true"]')]
    check(`${tag}: a press scales a button to 0.96, and not a disabled or a busy one`, pressed[0] === '0.96' && pressed[1] === 'none' && pressed[2] === 'none', JSON.stringify(pressed))
    await page.hover(`${at} .btn.text.md`)
    await page.waitForTimeout(200)
    const lit = await look(page, `${at} .btn.text.md`)
    check(`${tag}: a text button lit on hover, the fill behind ink`, lit?.bg === await token(page, theme, 'background-color', 'var(--fill)') && lit.color === await token(page, theme, 'color', 'var(--ink)'), JSON.stringify(lit))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const still = await press('.btn.brand.md')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    check(`${tag}: no press under reduced motion`, still === 'none', still)
  }
}

// ---- each task of Part 3 adds its control's checks above this line, and its function to CHECKS ----
const CHECKS = [base, buttons]

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
