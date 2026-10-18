// The popup's alignment, and its pictures (the redesign's design, §12; the prototypes' align-probe.mjs and shoot.mjs,
// through Part 3's tests/e2e/probes/align.mjs): every state of the gallery — the popup's fixtures, light and dark side by
// side — in both languages. Each row's items on the row's centre line within 0.5 px; the popup's blocks at 12 px from
// both edges, the group's words at 24 and its values ending 24 from the trailing edge, the gear's glyph ending at 12;
// then the rows hovered and measured again, and each menu opened and measured against its row and its popup. Every
// fixture is shot at 2x (200 %) into lab/pdf/out/popup/, the menus open too. Prints what is off and
// exits 1 if anything is. The gallery is in development builds only (wxt.config.ts DEV_PAGES):
//   pnpm exec wxt build --mode development && node tests/e2e/probes/popup-align.mjs
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { edges, offCentre, shootEach } from './align.mjs'

const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const OUT = fileURLToPath(new URL('../../../lab/pdf/out/popup/', import.meta.url))
const GALLERY = join(EXT, 'gallery.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(GALLERY) || readFileSync(GALLERY, 'utf8').includes('localhost')) throw new Error('no gallery: pnpm exec wxt build --mode development first')
mkdirSync(OUT, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'popup-align-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, deviceScaleFactor: 2, reducedMotion: 'reduce', viewport: { width: 1200, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let failed = 0
const report = (what, off) => {
  console.log(`${off.length ? 'FAIL' : 'ok  '} ${what}${off.length ? `: ${off.length} off` : ''}`)
  for (const line of off.slice(0, 40)) console.log(`       ${typeof line === 'string' ? line : JSON.stringify(line)}`)
  failed += off.length
}
/** the distinct edges `items` stand at from their popup, and whether they are only `want` */
const edgesAt = async (what, items, want, side = 'start') => {
  const found = await edges(page, { items, frame: '.popup', side })
  report(`${what} at ${want} px`, found.filter(e => e !== want).map(e => `${side} edge at ${e} px`))
}
/** every row's items on its centre line (align.mjs), the rows whose padding is even and whose items are elements */
const ROWS = ['.popup .brand-row', '.popup .group-row', '.popup .stack button', '.popup .twin > button', '.popup .go', '.popup .find-field', '.popup .paper', '.popup [role="radiogroup"]', '.popup [role="radio"]', '.popup .toggle'].join(', ')

/**
 * What align.mjs does not take: the foot's items against its content box (8 px above it, 14 below), a switch's words
 * (a text node) against the switch, and a note's icon on its note's first line (and, on one line, the note's three on
 * its centre line)
 */
const rest = () => page.evaluate(() => {
  const off = []
  const rect = el => el.getBoundingClientRect()
  const mid = r => r.top + r.height / 2
  for (const popup of document.querySelectorAll('.popup')) {
    const where = `${popup.closest('section')?.querySelector('h2 span')?.textContent ?? '?'} ${popup.closest('[data-theme]')?.dataset.theme ?? ''}`
    const foot = popup.querySelector('.foot')
    if (foot) {
      const s = getComputedStyle(foot), r = rect(foot), centre = (r.top + parseFloat(s.paddingTop) + r.bottom - parseFloat(s.paddingBottom)) / 2
      for (const item of foot.querySelectorAll(':scope > .toggle, :scope > .style-btn')) {
        const d = mid(rect(item)) - centre
        if (Math.abs(d) > 0.5) off.push(`${where}: the foot's ${item.className} ${d.toFixed(1)} px off its centre line`)
      }
      for (const toggle of foot.querySelectorAll('.toggle')) {
        const words = document.createRange()
        words.selectNodeContents(toggle.lastChild)
        const d = mid(words.getBoundingClientRect()) - mid(rect(toggle.querySelector('[role="switch"]')))
        if (Math.abs(d) > 0.5) off.push(`${where}: a switch's words ${d.toFixed(1)} px off the switch's centre line`)
      }
    }
    for (const note of popup.querySelectorAll('.note')) {
      const words = note.querySelector('p'), line = parseFloat(getComputedStyle(words).lineHeight), icon = rect(words.querySelector('svg'))
      const d = mid(icon) - (rect(words).top + line / 2)
      if (Math.abs(d) > 0.5) off.push(`${where}: a note's icon ${d.toFixed(1)} px off its first line`)
      if (rect(words).height < line * 1.5) {
        const button = note.querySelector('button')
        const e = button ? mid(rect(button)) - mid(rect(words)) : 0
        if (Math.abs(e) > 0.5) off.push(`${where}: a one-line note's button ${e.toFixed(1)} px off its words' centre line`)
      }
    }
  }
  return off
})

/**
 * Every button's content inside the button (Part 7's final review): its words, its icon and its shortcut label, as one
 * box — the range over its contents, which counts a text cut short by its box as the text's own width — against the
 * button's, within 0.5 px. The popup's large buttons have no padding and never wrap: a longer word, a wider measure or a
 * wider shortcut label (Alt+T) runs over the button's edge, into the pair's gap or off its fill
 */
const overflowing = () => page.evaluate(() => {
  const off = []
  for (const button of document.querySelectorAll('.popup .btn')) {
    const b = button.getBoundingClientRect()
    if (!b.width || button.closest('[inert]')) continue
    const range = document.createRange()
    range.selectNodeContents(button)
    const c = range.getBoundingClientRect()
    const over = Math.max(b.left - c.left, c.right - b.right)
    if (over > 0.5) {
      const where = `${button.closest('section')?.querySelector('h2 span')?.textContent ?? '?'} ${button.closest('[data-theme]')?.dataset.theme ?? ''}`
      off.push(`${where}: "${button.textContent}" ${c.width.toFixed(1)} px of content in a ${b.width.toFixed(1)} px button, ${over.toFixed(1)} px over its edge`)
    }
  }
  return off
})

/** The one open menu: its place against its row and its popup */
const menuPlace = () => page.evaluate(() => {
  const pop = document.querySelector('.pop.menu:popover-open')
  if (!pop) return ['no menu open']
  const off = []
  const popup = pop.closest('.popup'), p = popup.getBoundingClientRect(), m = pop.getBoundingClientRect()
  // the trigger is a button: the language menu's search field carries aria-expanded too (Part 3's MenuList)
  const trigger = popup.querySelector('button[aria-expanded="true"]').getBoundingClientRect()
  const near = (what, got, want) => { if (Math.abs(got - want) > 0.5) off.push(`${what} ${got.toFixed(1)} px, not ${want}`) }
  near('the menu from the popup\'s leading edge', m.left - p.left, 8)
  near('the menu from the popup\'s trailing edge', p.right - m.right, 8)
  if (pop.classList.contains('up')) {
    near('the style menu above its button', trigger.top - m.bottom, 6)
    if (m.top - p.top < 7.5) off.push(`the style menu ${(m.top - p.top).toFixed(1)} px from the popup's top, under 8`)
  } else {
    near('the menu under its row', m.top - trigger.bottom, 4)
    if (p.bottom - m.bottom < 7.5) off.push(`the popup ${(p.bottom - m.bottom).toFixed(1)} px below the menu, under 8: it did not grow to hold it`)
  }
  return off
})

async function measureAll(what) {
  report(`${what}: rows on their centre lines`, await offCentre(page, { rows: ROWS }))
  report(`${what}: the foot, the switches' words, the notes`, await rest())
  await edgesAt(`${what}: the brand, the group, the blocks under it`, '.popup .brand-row .wordmark, .popup .group, .popup .stack > *, .popup .reading > *, .popup .find > *, .popup .found > *, .popup .twin, .popup .foot > .toggle:first-child', 12)
  await edgesAt(`${what}: the group, the blocks under it, the gear's glyph, the foot's end`, '.popup .group, .popup .stack > *, .popup .reading > *, .popup .find > *, .popup .found > *, .popup .twin, .popup .brand-row .tbtn svg, .popup .foot > .style-btn', 12, 'end')
  await edgesAt(`${what}: the group's words`, '.popup .group-row > .k', 24)
  await edgesAt(`${what}: the group's values`, '.popup .group-row > .v', 24, 'end')
}

for (const lang of ['zh-CN', 'en']) {
  await worker.evaluate(async lang => {
    for (let i = 0; i < 50 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, uiLanguage: lang } })
  }, lang)
  await page.goto(`chrome-extension://${id}/gallery.html`)
  await page.waitForSelector('.popup')
  await sleep(800)
  // one menu can be open at a time (popover="auto": P2, P3, P15 and P16 each shut the one before), so the menus are shot
  // below, one by one; the measures are taken with none open
  await page.evaluate(() => { for (const [i, section] of document.querySelectorAll('section').entries()) section.dataset.shot = section.querySelector('h2 span')?.textContent ?? String(i) })
  await shootEach(page, 'section', OUT, state => `${lang}-${state}`, 'shot')
  await page.keyboard.press('Escape')
  await sleep(300)
  await measureAll(`${lang}, every state at rest`)
  report(`${lang}, every state: each button's content inside it`, await overflowing())
  for (const row of (await page.locator('.popup button.group-row').all()).slice(0, 4)) { await row.hover(); await sleep(150) }
  await measureAll(`${lang}, the rows hovered`)
  const frameOf = state => page.locator('section', { has: page.locator('h2 span', { hasText: new RegExp(`^${state}$`) }) }).locator('[data-theme="light"] .popup')
  // P2's services too: its Chrome row carries the pack's download, the one row of the popup with an action in it
  for (const [state, trigger, name] of [['P1', 'button.group-row >> nth=0', 'services'], ['P2', 'button.group-row >> nth=0', 'services-download'], ['P1', 'button.group-row >> nth=1', 'languages'], ['P15', 'button.group-row >> nth=2', 'prompts'], ['P1', '.style-btn', 'styles']]) {
    await page.keyboard.press('Escape')
    await sleep(200)
    const frame = frameOf(state)
    await frame.locator(trigger).click()
    await sleep(400)
    report(`${lang}, ${state}'s ${name} menu: its place`, await menuPlace())
    report(`${lang}, ${state}'s ${name} menu: its rows`, await offCentre(page, { rows: '.pop.menu:popover-open [role="option"]' }))
    await frame.screenshot({ path: join(OUT, `${lang}-${state}-${name}.png`) })
  }
}
await context.close()
for (const e of errors) console.log(`FAIL page error — ${e}`)
console.log(`\nshots in ${OUT}`)
process.exit(failed || errors.length ? 1 : 0)
