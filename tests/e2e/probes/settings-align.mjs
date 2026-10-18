// Probe: the settings page's alignment and looks (the redesign's design, §6.2, §12), ported from settings-2's
// tools/align-probe.mjs and tools/shoot.mjs. On the build, in a real browser, in both themes and both languages, each
// state of each section — at rest, a row hovered, a form open, a list open, an editor open, a confirm armed, a search, a
// deep link — is measured: every item's centre within 0.5 px of its row's; the words' leading edge at 14, 42 or 70 px
// from the card, a leading control at 14 or 42; the trailing edge at 14 (an icon button's glyph box); a group heading at
// 14; a hovered row's fill on the card's inner edge, the separators on either side stepped aside; the small segmented
// controls a state shows exactly the agreed set (220 and 200 in reading, 210, 300 and 120 in the style editor,
// settings-2), each at its width. A state that measures no card or no row fails, so a selector that stopped matching
// cannot pass. Each state is shot at 2x into lab/pdf/out/settings/, and the page at 320 px and at
// 200 % zoom, measured there too: no horizontal scroll, the sidebar above the column below 640 px, nothing past its
// card, a trail that moved under its words still ending on the trailing edge. The frame, the sidebar and the column one
// group (Task 103b): centred at 1300 px, the interface language at the sidebar's foot; from the window's edge at 1000
// px, narrower than the group; below 640 px the interface language at the title row's end, its menu opening downward,
// no gap under the sidebar, and a language chosen from there with the e2e helper. Its row a search shows names the
// place true at each width (Task 104b). Prints what is off; exits 1 when anything is.
//   pnpm build && node tests/e2e/probes/settings-align.mjs
import { mkdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { copyWithGrants } from '../ext-copy.mjs'
import { chooseUiLanguage } from '../options-page.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const SRC = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const EXT = `${E2E}.ext-settings-align`
const PROFILE = `${E2E}.profile-settings-align`
const OUT = fileURLToPath(new URL('../../../lab/pdf/out/settings/', import.meta.url))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** The user message carries JSON.stringify(segments) (src/providers/prompt.ts): the longest valid array from the end (local-endpoint.mjs) */
function segmentsFrom(prompt) {
  const start = prompt.indexOf('[{"id":')
  if (start < 0) return []
  const ends = []
  for (let i = prompt.indexOf(']', start); i >= 0; i = prompt.indexOf(']', i + 1)) ends.push(i + 1)
  for (const end of ends.reverse()) {
    try {
      const parsed = JSON.parse(prompt.slice(start, end))
      if (Array.isArray(parsed)) return parsed
    } catch {
      // a closing bracket inside a string: a shorter one
    }
  }
  return []
}
// An OpenAI-compatible endpoint on this machine: its models listed, the sample given back as it came, so the form connects
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'echo-1', name: 'Echo One' }, { id: 'echo-2' }] }))
    return
  }
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const content = JSON.stringify({ segments: segmentsFrom(typeof user === 'string' ? user : '') })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'echo-1', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }))
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}/v1`

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
copyWithGrants(SRC, EXT, { hostPermissions: ['http://127.0.0.1/*'] })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1300, height: 1100 },
  deviceScaleFactor: 2,
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
for (let i = 0; i < 50 && !(await worker.evaluate(async () => 'config' in await chrome.storage.local.get('config'))); i++) await sleep(200)

// the reader's own: a key the endpoint refused, one an earlier version stored without a key; a prompt of one's own; a glossary
const REFUSED = 'DeepSeek V4 Flash'
const KEYLESS = 'Older'
const SERVICES = [
  { id: 'svc-proberef', kind: 'openai-compat', name: REFUSED, baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-v1-probe', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' },
  { id: 'svc-probekey', kind: 'openai-compat', name: KEYLESS, baseURL: 'https://api.example.com/v1', apiKey: '', model: 'model-a', thinking: 'disabled' },
]
const PROMPTS = { promptId: 'default', patterns: [{ id: 'p-probe', name: 'Mine', systemPrompt: 'Translate into {{targetLanguage}}, briefly.', prompt: '{{input}}' }] }
const GLOSSARY = [{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }, { term: 'attention', translation: '注意力' }]
// the words only O.search.keywords['translate/glossary'] holds, in each language: a search by them finds the glossary's row
const KEYWORD = { 'zh-CN': '词汇', en: 'vocabulary' }
// the small segmented controls' agreed widths (settings-2): the set each state that draws them must show, no more, no
// fewer; a state not named here may show only widths among these
const AGREED = {
  reading: [200, 220],
  'reading-pdf-off': [200, 220],
  'appearance-editor': [120, 210, 300],
}
const WIDTHS = new Set(Object.values(AGREED).flat())
// the configuration first, then the record: written in one set, the background's watcher would clear the mark of a
// service it had not seen before (health-guard.ts, idsToClear)
const seed = over => worker.evaluate(async over => {
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...over } })
  await new Promise(resolve => setTimeout(resolve, 300))
  await chrome.storage.local.set({ serviceHealth: { 'svc-proberef': { rejected: Date.now() } } })
}, over)

/**
 * every row of every card shown: centres, the three leading edges and the trailing one; the headings; the segmented
 * controls' agreed widths as found. `empty`: the state shows no card (a search that found nothing). `narrow`: a 320 px
 * window or 200 % zoom (§9) — nothing inside a card ends past its box, and a row whose end moved under its words is two
 * lines: its lead stays on its words' centre and its trail's items on the trail's, the trail still ending on the
 * trailing edge (at full width no row wraps, so a wrap there fails the centre rule as it should)
 */
const measure = (page, { empty = false, narrow = false } = {}) => page.evaluate(({ empty, narrow }) => {
  const out = []
  const r = el => el.getBoundingClientRect()
  const shown = el => { const b = r(el); return b.width > 0 && b.height > 0 && !el.closest('[inert]') }
  let cards = 0
  let rows = 0
  for (const card of document.querySelectorAll('main [data-card]')) {
    if (!shown(card)) continue
    cards++
    const c = r(card)
    if (narrow) {
      // what ends past the card, outermost only (its children would repeat it); a menu open from a row is drawn in the
      // top layer, not in the card
      const past = new Map()
      for (const el of card.querySelectorAll('*')) {
        if (el.closest('[popover]') || !shown(el)) continue
        const b = r(el)
        const by = Math.max(c.left - b.left, b.right - c.right)
        if (by > 0.5) past.set(el, by)
      }
      for (const [el, by] of past) {
        if (past.has(el.parentElement)) continue
        const name = (el.closest('[data-srow]')?.querySelector('.o-label')?.textContent ?? '').trim().slice(0, 16)
        out.push(`${name} · ${el.getAttribute('class') || el.tagName.toLowerCase()} ends ${by.toFixed(1)} px past its card`)
      }
    }
    for (const row of card.querySelectorAll('[data-srow]')) {
      if (!shown(row) || row.closest('[data-card]') !== card) continue
      rows++
      const b = r(row)
      const mid = b.top + b.height / 2
      const name = (row.querySelector('.o-label')?.textContent ?? row.textContent ?? '').trim().slice(0, 16)
      const parts = [...row.querySelectorAll('[data-part]')].filter(el => el.closest('[data-srow]') === row && shown(el)).map(el => ({ kind: el.dataset.part, el }))
      // a radio row's lead is its mark, the radio's direct child (Part 3's Radio)
      const mark = [...row.querySelectorAll('[role="radio"] > .radio')].find(el => el.closest('[data-srow]') === row)
      if (mark) parts.push({ kind: 'lead', el: mark })
      const part = kind => parts.find(p => p.kind === kind)?.el
      // the trail's items: a menu opened from one of them (a service's "…", §6.2) sits in the trail's markup but is drawn
      // in the top layer, placed under its button, not in the row
      const items = trail => [...trail.children].filter(el => shown(el) && !el.matches('[popover]'))
      const words = part('words')
      const moved = narrow && !!part('trail') && !!words && r(part('trail')).top >= r(words).bottom - 0.5
      for (const { kind, el } of parts) {
        const line = !moved ? mid : kind === 'trail' ? r(el).top + r(el).height / 2 : r(words).top + r(words).height / 2
        for (const item of kind === 'trail' ? items(el) : [el]) {
          const d = r(item).top + r(item).height / 2 - line
          if (Math.abs(d) > 0.5) out.push(`${name} · ${kind} centre ${d > 0 ? '+' : ''}${d.toFixed(1)} px`)
        }
      }
      if (words) { const x = Math.round(r(words).left - c.left); if (![14, 42, 70].includes(x)) out.push(`${name} · words at ${x} px`) }
      const lead = part('lead')
      if (lead) { const x = Math.round(r(lead).left - c.left); if (![14, 42].includes(x)) out.push(`${name} · lead at ${x} px`) }
      const last = part('trail') && items(part('trail')).pop()
      if (last) {
        const edge = last.matches('[data-icon-button]') ? r(last.querySelector('svg')) : r(last)
        const x = Math.round(c.right - edge.right)
        if (x !== 14) out.push(`${name} · trailing at ${x} px`)
      }
    }
  }
  if (empty) {
    if (cards) out.push(`${cards} card(s) shown where none should be`)
    const none = document.querySelector('main .o-empty')
    if (!none || !shown(none)) out.push('no sentence saying nothing was found')
  } else if (!cards) out.push('no card')
  else if (!rows) out.push('no rows measured')
  const column = r(document.querySelector('.o-column'))
  for (const heading of document.querySelectorAll('main [data-heading]')) {
    if (!shown(heading)) continue
    const x = Math.round(r(heading.querySelector('h2')).left - column.left)
    if (x !== 14) out.push(`heading ${heading.querySelector('h2').textContent} at ${x} px`)
  }
  // a small segmented control at the width its wrapper carries (`--w`, segmentWidth); which widths are found is
  // checked against the agreed set outside
  const widths = []
  for (const seg of document.querySelectorAll('main .o-seg')) {
    if (!shown(seg)) continue
    const want = Number.parseFloat(seg.style.getPropertyValue('--w'))
    widths.push(want)
    const got = r(seg.querySelector('[role="radiogroup"]')).width
    if (Math.abs(got - want) > 0.5) out.push(`a segmented control ${got.toFixed(1)} px wide, agreed ${want}`)
  }
  return { out, widths }
}, { empty, narrow })

/** the widths found against the state's agreed set: a control missing, an extra one, or one of a width nobody agreed */
function agreed(name, widths) {
  const found = [...widths].sort((a, b) => a - b)
  const want = AGREED[name]
  if (want) return found.join(',') === want.join(',') ? [] : [`segmented controls at ${found.join(', ') || 'none'} px, agreed ${want.join(', ')}`]
  return found.filter(w => !WIDTHS.has(w)).map(w => `a segmented control at ${w} px, no agreed width`)
}

/** a hovered row: its fill on the card's inner edge; the separator on its top edge and the next shown row's stepped aside */
const hovered = (page, selector) => page.evaluate(selector => {
  const row = document.querySelector(selector)
  if (!row) return [`no row at ${selector}`]
  const card = row.closest('[data-card]')
  const b = row.getBoundingClientRect()
  const c = card.getBoundingClientRect()
  const out = []
  if (Math.abs(b.left - (c.left + 4)) > 0.5 || Math.abs(b.right - (c.right - 4)) > 0.5) out.push('the hovered fill is off the card\'s inner edge')
  if (getComputedStyle(row).backgroundColor === 'rgba(0, 0, 0, 0)') out.push('the hovered row does not light')
  const rows = [...card.querySelectorAll('[data-srow]')].filter(x => x.getBoundingClientRect().height && !x.closest('[inert]'))
  const next = rows[rows.indexOf(row) + 1]
  for (const [which, el] of [['its own', row], ['the next row\'s', next]]) if (el && getComputedStyle(el, '::before').opacity !== '0') out.push(`${which} separator shows`)
  return out
}, selector)

/**
 * the frame as one group (Task 103b, the maintainer's choice): the sidebar and the column centred in a window wider
 * than the two, from the window's edge in one narrower; the interface language at the sidebar's foot there
 */
const frame = page => page.evaluate(() => {
  const r = el => el.getBoundingClientRect()
  const f = r(document.querySelector('.o-frame'))
  const side = document.querySelector('.o-side')
  const width = document.documentElement.clientWidth
  return {
    left: f.left,
    right: width - f.right,
    sideways: document.documentElement.scrollWidth > innerWidth,
    foot: r(side).bottom - Number.parseFloat(getComputedStyle(side).paddingBottom) - r(document.querySelector('.o-lang')).bottom,
  }
})

/**
 * the interface language's row a search shows (Task 104b): of its description's two sentences, the one true at the
 * window's width is drawn and read — the foot's (`.o-wide`) at 1300 px, the title row's (`.o-narrow`) at 320 — and the
 * other neither drawn nor in the row's accessible name. The search is cleared after
 */
async function languageRow(page, shown) {
  const search = page.locator('.o-search input')
  await search.fill('interface')
  await sleep(300)
  const row = page.locator('main [data-row="language/ui"]')
  const said = (await row.count()) === 1 ? await row.evaluate(el => {
    const d = el.querySelector('.o-desc')
    const drawn = part => !!part && part.getClientRects().length > 0 && part.textContent.length > 0
    return { wide: drawn(d.querySelector('.o-wide')), narrow: drawn(d.querySelector('.o-narrow')), read: d.innerText.trim(), text: { wide: d.querySelector('.o-wide')?.textContent ?? '', narrow: d.querySelector('.o-narrow')?.textContent ?? '' } }
  }) : null
  const name = said ? await row.ariaSnapshot() : ''
  await search.fill('')
  await sleep(300)
  if (!said) return ['the interface language\'s row is not one row a search finds']
  const hidden = shown === 'wide' ? 'narrow' : 'wide'
  const out = []
  if (!said[shown] || said[hidden]) out.push(`its search row draws the ${[said.wide && 'foot\'s', said.narrow && 'title row\'s'].filter(Boolean).join(' and ') || 'no'} place, not the ${shown === 'wide' ? 'foot\'s' : 'title row\'s'} alone`)
  if (said.read !== said.text[shown]) out.push(`its search row reads "${said.read}", not its ${shown} sentence "${said.text[shown]}"`)
  if (!name.includes(said.text[shown]) || name.includes(said.text[hidden])) out.push(`its search row's accessible name ${name.trim()} does not carry its ${shown} sentence alone`)
  return out
}

/**
 * below 640 px (Task 103b): the interface language at the end of the mark's row — on its centre line, ending on the
 * frame's trailing edge (the sidebar's 16) —, the search right under that row (the mark's 10 below it and the
 * sidebar's 2 between rows, as before the language came up), and the column right under the sidebar: the two rows
 * sized to their content, not stretched to the window's height
 */
const titleRow = page => page.evaluate(() => {
  const out = []
  const r = sel => document.querySelector(sel).getBoundingClientRect()
  const mid = b => b.top + b.height / 2
  const brand = r('.o-brand')
  const lang = r('.o-lang')
  const line = mid(lang) - mid(brand)
  if (Math.abs(line) > 0.5) out.push(`the interface language ${line.toFixed(1)} px off the title row's centre line`)
  const edge = r('.o-frame').right - lang.right
  if (Math.abs(edge - 16) > 0.5) out.push(`the interface language ends ${edge.toFixed(1)} px from the frame's trailing edge, not 16`)
  const under = r('.o-search').top - brand.bottom
  if (Math.abs(under - 12) > 0.5) out.push(`the search ${under.toFixed(1)} px under the title row, not 12`)
  const gap = r('.o-main').top - r('.o-side').bottom
  if (Math.abs(gap) > 0.5) out.push(`a gap of ${gap.toFixed(1)} px between the sidebar and the column`)
  return out
})

const off = []
for (const lang of ['zh-CN', 'en']) {
  for (const theme of ['light', 'dark']) {
    const tag = `${lang}-${theme}`
    await seed({ theme, uiLanguage: lang, services: SERVICES, provider: 'microsoft', prompts: PROMPTS, glossary: GLOSSARY, pdfReader: { enabled: true, original: false, sync: true, swapped: false, dimPages: true } })
    const page = await context.newPage()
    await page.setViewportSize({ width: 1300, height: 1100 })
    // a load of its own each time: a URL that differs only in its hash would stay the same document, the settings
    // read once (the unreadable state needs them read again) and a deep link followed rather than arrived at
    const open = async hash => {
      await page.goto('about:blank')
      await page.goto(`chrome-extension://${extId}/options.html#${hash}`)
      await page.waitForSelector('main [data-card]')
      await page.mouse.move(1290, 1090)
      await sleep(400)
    }
    /** `shows`: what the state opens, which must be drawn (a box with size, not inert), or the state was never reached */
    const state = async (name, act, { shows, ...options } = {}) => {
      if (act) await act()
      await sleep(400)
      const { out, widths } = await measure(page, options)
      const reached = !shows || await page.evaluate(selector => [...document.querySelectorAll(selector)].some(el => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0 && !el.closest('[inert]')
      }), shows)
      if (!reached) out.push(`not reached: nothing drawn at ${shows}`)
      off.push(...[...out, ...agreed(name, widths)].map(o => `${tag} ${name}: ${o}`))
      // a press below the fold scrolled the page, and a full-page shot draws the sticky sidebar where the scroll left
      // it, halfway down: measured, the page goes back to its top, the pointer parked, before the shot
      if (await page.evaluate(() => scrollY > 0)) {
        await page.evaluate(() => scrollTo(0, 0))
        await page.mouse.move(1290, 1090)
        await sleep(200)
      }
      await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true })
    }
    const services = '[data-row="translate/services"] > [data-srow]'
    // a service of one's own, found by its name (the list's order is the page's, not the probe's)
    const service = name => page.locator(services).filter({ has: page.locator('.o-label', { hasText: name }) })

    /** the control chooseUiLanguage (tests/e2e/options-page.mjs) presses, found as it finds it: one button, drawn */
    const oneLanguageButton = async () => {
      const found = page.getByRole('button', { name: /Interface language/ })
      return (await found.count()) === 1 && (await found.isVisible())
    }
    await open('translate')
    {
      const f = await frame(page)
      if (!(await oneLanguageButton())) off.push(`${tag} wide: the interface language is not one button the e2e helper finds`)
      if (f.sideways) off.push(`${tag} wide: the page scrolls sideways`)
      if (f.left < 1 || Math.abs(f.left - f.right) > 1) off.push(`${tag} wide: the frame ${f.left.toFixed(1)} px from the left, ${f.right.toFixed(1)} px from the right, not centred`)
      if (Math.abs(f.foot) > 0.5) off.push(`${tag} wide: the interface language ${f.foot.toFixed(1)} px off the sidebar's foot`)
    }
    await state('translate')
    await state('translate-hover', async () => {
      await page.hover(`${services}:nth-child(2)`)
      await sleep(250)
      off.push(...(await hovered(page, `${services}:nth-child(2)`)).map(o => `${tag} translate-hover: ${o}`))
    })
    await state('translate-refused', () => service(REFUSED).click(), { shows: 'form[data-form="key"]' })
    await state('translate-keyless', () => service(KEYLESS).click(), { shows: 'form[data-form="key"]' })
    await state('translate-menu', async () => { await service(REFUSED).hover(); await service(REFUSED).locator('[data-icon-button]').click() }, { shows: ':popover-open [role="menu"]' })
    await page.keyboard.press('Escape')
    await state('translate-add', async () => {
      await page.locator('[data-row="translate/services"] > button[data-srow]').last().click()
      await page.locator('form[data-form="service"] input').first().fill(BASE)
      await page.waitForFunction(() => document.querySelector('form[data-form="service"] [role="combobox"]')?.getAttribute('aria-busy') === null && !!document.querySelector('form[data-form="service"] [role="combobox"]')?.getAttribute('placeholder')?.match(/2/), null, { timeout: 5000 }).catch(() => undefined)
      await page.locator('form[data-form="service"] [role="combobox"]').focus()
    }, { shows: 'form[data-form="service"] .o-combo-list' })
    await state('translate-connected', async () => {
      await page.locator('.o-combo-item').first().dispatchEvent('pointerdown')
      await page.locator('form[data-form="service"] button[type="submit"]').click()
      await page.waitForSelector('form[data-form="service"]', { state: 'detached', timeout: 10000 }).catch(() => undefined)
    }, { shows: '[data-row="translate/services"] .o-status[data-tone="ok"]' })
    await state('translate-prompts', () => page.locator('[data-row="translate/prompts"]').click(), { shows: '.o-prompt' })
    await state('translate-own-prompt', () => page.locator('[role="radiogroup"] [role="radio"]').filter({ hasText: 'Mine' }).last().click(), { shows: '.o-prompt .o-prompt-text[data-editable]' })
    await state('translate-glossary', () => page.locator('[data-row="translate/glossary"]').click(), { shows: '.o-gloss' })

    await open('appearance')
    await state('appearance')
    await state('appearance-editor', async () => {
      const row = page.locator('[data-row="appearance/styles"] > [data-srow]').nth(4)
      await row.hover()
      await row.locator('[data-icon-button]').click()
      await page.locator('.o-editor .o-disclose').click()
      await page.locator('.o-editor [role="radiogroup"]').nth(1).locator('[role="radio"]').nth(1).click()
    }, { shows: '.o-editor .o-more' })
    await open('reading')
    await state('reading')
    await state('reading-pdf-off', () => page.locator('[data-row="reading/pdf"] [role="switch"]').first().click())
    await open('data')
    await state('data')
    await state('data-confirm', () => page.locator('[data-row="data/cache"] button').click(), { shows: '.o-confirm[data-armed]' })
    await state('search', () => page.locator('.o-search input').fill('PDF'), { shows: 'main .o-hit' })
    await state('search-none', () => page.locator('.o-search input').fill('zzzz'), { empty: true })
    await state('search-keyword', async () => {
      await page.locator('.o-search input').fill(KEYWORD[lang])
      await sleep(250)
      const found = await page.evaluate(() => {
        const row = document.querySelector('main [data-row="translate/glossary"]')
        const b = row?.getBoundingClientRect()
        return !!b && b.height > 0 && !row.closest('[inert]')
      })
      if (!found) off.push(`${tag} search-keyword: the glossary's row is not found by "${KEYWORD[lang]}"`)
    })
    off.push(...(await languageRow(page, 'wide')).map(o => `${tag} wide: the interface language: ${o}`))
    await open('translate/prompts')
    await state('deeplink', undefined, { shows: '[data-row="translate/prompts"][data-flash]' })
    await state('language-menu', () => page.locator('.o-lang').click(), { shows: ':popover-open [role="listbox"]' })
    await page.keyboard.press('Escape')
    // S-O-02 (§6.7): settings this build cannot read — the card at the top, the data section alone; then the settings put back
    const kept = await worker.evaluate(() => chrome.storage.local.get(['config', 'config$']))
    await worker.evaluate(s => chrome.storage.local.set({ config: { ...s.config, version: s.config.version + 1 }, config$: { ...s.config$, v: s.config.version + 1 } }), kept)
    await open('data')
    await state('unreadable', undefined, { shows: '.o-unreadable [data-card]' })
    // put back with the page gone: open, it would reload itself into the settings' own language (surface-config.ts)
    // under the next navigation
    await page.goto('about:blank')
    await worker.evaluate(s => chrome.storage.local.set(s), kept)

    // a window narrower than the group (1008 px): the frame from the window's edge, nothing scrolling sideways
    await page.setViewportSize({ width: 1000, height: 900 })
    await open('translate')
    {
      const f = await frame(page)
      if (f.sideways) off.push(`${tag} 1000 px: the page scrolls sideways`)
      if (Math.abs(f.left) > 0.5 || Math.abs(f.right) > 0.5) off.push(`${tag} 1000 px: the frame ${f.left.toFixed(1)} px from the left, ${f.right.toFixed(1)} px from the right, not the window's width`)
    }

    // §9: 320 px and 200 % zoom (a 1280 px window at 2x): nothing scrolls sideways; below 640 px the sidebar is above the
    // column; every row measured as it is drawn there, nothing past its card
    for (const [name, width, height] of [['narrow', 320, 900], ['zoom', 640, 550]]) {
      await page.setViewportSize({ width, height })
      for (const section of ['translate', 'appearance']) {
        const shot = section === 'translate' ? name : `${name}-${section}`
        await open(section)
        const fold = await page.evaluate(() => ({
          sideways: document.documentElement.scrollWidth > innerWidth,
          above: document.querySelector('.o-side').getBoundingClientRect().bottom <= document.querySelector('.o-main').getBoundingClientRect().top + 0.5,
        }))
        if (fold.sideways) off.push(`${tag} ${shot}: the page scrolls sideways`)
        if (width < 640 && !fold.above) off.push(`${tag} ${shot}: the sidebar is not above the column`)
        if (width < 640) off.push(...(await titleRow(page)).map(o => `${tag} ${shot}: ${o}`))
        const { out, widths } = await measure(page, { narrow: true })
        off.push(...[...out, ...agreed(shot, widths)].map(o => `${tag} ${shot}: ${o}`))
        await page.screenshot({ path: `${OUT}${tag}-${shot}.png`, fullPage: true })
      }
    }
    // below 640 px, a section shorter than the window: the column right under the sidebar, no gap the window's height
    // opened; the interface language's menu opening downward from the title row, inside the window; the control the
    // e2e helper presses found there as at the foot, and a language chosen through it
    await page.setViewportSize({ width: 320, height: 900 })
    await open('data')
    off.push(...(await titleRow(page)).map(o => `${tag} narrow-data: ${o}`))
    off.push(...(await languageRow(page, 'narrow')).map(o => `${tag} narrow: the interface language: ${o}`))
    if (!(await oneLanguageButton())) off.push(`${tag} narrow: the interface language is not one button the e2e helper finds`)
    await page.locator('.o-lang').click()
    await sleep(400)
    const menu = await page.evaluate(() => {
      const pop = document.querySelector('.o-lang-menu:popover-open')
      if (!pop) return null
      const m = pop.getBoundingClientRect()
      const b = document.querySelector('.o-lang').getBoundingClientRect()
      return { below: m.top - b.bottom, end: b.right - m.right, left: m.left, right: document.documentElement.clientWidth - m.right, bottom: innerHeight - m.bottom }
    })
    if (!menu) off.push(`${tag} narrow-language-menu: not reached: no menu open`)
    else {
      if (Math.abs(menu.below - 6) > 0.5) off.push(`${tag} narrow-language-menu: ${menu.below.toFixed(1)} px under its button, not 6 (opening downward)`)
      if (Math.abs(menu.end) > 0.5) off.push(`${tag} narrow-language-menu: its end ${menu.end.toFixed(1)} px off its button's`)
      if (menu.left < 0 || menu.right < 0 || menu.bottom < 0) off.push(`${tag} narrow-language-menu: past the window (${menu.left.toFixed(1)} left, ${menu.right.toFixed(1)} right, ${menu.bottom.toFixed(1)} below)`)
    }
    await page.screenshot({ path: `${OUT}${tag}-narrow-language-menu.png` })
    await page.keyboard.press('Escape')
    await sleep(200)
    if (lang === 'zh-CN') {
      // the helper's own path, from the title row; the next pass seeds the language it measures again
      await chooseUiLanguage(page, 'Interface language', 'English')
      let now = ''
      for (let i = 0; i < 20 && now !== 'en'; i++) { now = await page.evaluate(() => document.documentElement.lang).catch(() => ''); if (now !== 'en') await sleep(150) }
      if (now !== 'en') off.push(`${tag} narrow: English chosen from the title row, the page reads "${now}"`)
    }
    await page.close()
  }
}
await context.close()
server.close()
console.log(off.length ? off.join('\n') : 'every row on its lines, in both themes and both languages')
console.log(`screenshots in ${OUT}`)
process.exit(off.length ? 1 : 0)
