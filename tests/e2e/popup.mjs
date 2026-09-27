// The popup in a real browser (the redesign's design, §5): P0's search and open over a page that is not arXiv's, the
// checks of a paper counted, the group's menus under their rows with the popup growing to hold them, the Manage… rows'
// deep links, the style menu over the foot, a switch's words flipping it, an abstract page's two entries alone, and the
// floating button's panel growing with a menu. The alignment of every state is the probe's
// (tests/e2e/probes/popup-align.mjs). Needs the network: arXiv.
//   pnpm build && pnpm e2e:popup
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const SHOTS = fileURLToPath(new URL('./.shots/popup/', import.meta.url))
const PAPER = process.env.AXT_PAPER ?? '1706.03762'
/** a paper old enough to have no HTML version (pdf-entry.mjs's) */
const WITHOUT_HTML = 'hep-th/9711200'
/** an LLM service for the prompt row; its key is a placeholder no request is sent with */
const SVC = { id: 'svc-e2e00001', kind: 'openai-compat', name: 'e2e', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-e2e-placeholder', model: 'x/y', thinking: 'disabled' }
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const near = (a, b) => Math.abs(a - b) <= 0.5

const profile = mkdtempSync(join(tmpdir(), 'popup-e2e-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 800 },
})
context.setDefaultNavigationTimeout(90_000)
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const extId = new URL(worker.url()).host

/** The stored configuration patched, once the extension has written its own at install */
async function patchConfig(patch) {
  await worker.evaluate(async patch => {
    for (let i = 0; i < 50 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
    const { config } = await chrome.storage.local.get('config')
    if (!config) throw new Error('the extension wrote no configuration at install')
    await chrome.storage.local.set({ config: { ...config, ...patch } })
  }, patch)
}
/** The popup as the toolbar opens it over `tab`: its own page at the toolbar popup's width, the tab then in front */
async function popupOver(tab, settle = 2000) {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 320, height: 600 })
  await popup.goto(`chrome-extension://${extId}/popup.html`)
  await tab.bringToFront()
  await sleep(settle)
  return popup
}
/** The next tab the popup opens, and its address as it commits */
async function nextTab(act) {
  const opened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
  // the popup closes itself once it has opened the tab (openLink): a press still resolving then meets a closed page,
  // which is the popup doing its job (measured in the pre-flight: one run in three)
  await act().catch(e => { if (!/has been closed/.test(String(e))) throw e })
  const tab = await opened
  await tab?.waitForURL(url => url.protocol !== 'about:', { timeout: 30_000 }).catch(() => undefined)
  const url = tab?.url() ?? null
  await tab?.close()
  return url
}
/**
 * The open menu of a popup page against its row (or button) and the popup. The trigger is a button: the language menu's
 * search field is a combobox with aria-expanded too, in the page whether its menu is open or not (Part 3's MenuList)
 */
const menuPlace = popup => popup.evaluate(() => {
  const main = document.querySelector('main'), pop = document.querySelector('.pop.menu:popover-open'), row = document.querySelector('main button[aria-expanded="true"]')
  if (!pop || !row) return null
  const m = main.getBoundingClientRect(), p = pop.getBoundingClientRect(), r = row.getBoundingClientRect()
  return { left: p.left - m.left, right: m.right - p.right, below: p.top - r.bottom, above: r.top - p.bottom, top: p.top - m.top, room: m.bottom - p.bottom, up: pop.classList.contains('up'), minHeight: main.style.minHeight }
})

// the words this suite finds the controls by
await patchConfig({ uiLanguage: 'zh-CN' })

// ── P0 over a page that is not arXiv's (§5.4) ──────────────────────────────────────────────────────────────────────
const other = await context.newPage()
await other.goto('data:text/html,<title>elsewhere</title><p>not a paper</p>')
{
  const popup = await popupOver(other)
  const text = (await popup.locator('main').innerText()).replace(/\n+/g, ' | ')
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  check('P0: the sentence, the field and the help line, and no group', /打开 arXiv 论文（HTML 或 PDF）即可翻译/.test(text) && (await field.count()) === 1 && /按回车搜索 · 高级搜索/.test(text) && (await popup.locator('.group').count()) === 0, text.slice(0, 120))
  await popup.screenshot({ path: `${SHOTS}/p0.png` })

  // a paste is a paste: nothing opens until Enter
  let opened = 0
  const counting = () => { opened++ }
  context.on('page', counting)
  await field.fill(`https://arxiv.org/pdf/${PAPER}`)
  await sleep(1200)
  context.off('page', counting)
  const row = (await popup.locator('.go.brand').innerText().catch(() => '')).replace(/\s+/g, ' ')
  check('an arXiv PDF address: one brand row, its words and the paper, and the paste opens nothing by itself', /PDF 翻译/.test(row) && row.includes(`arXiv ${PAPER}`) && opened === 0, `“${row}”, ${opened} tab(s) opened`)
  const pdf = await nextTab(() => field.press('Enter'))
  check('Enter opens that PDF in a new tab', (pdf ?? '').startsWith(`https://arxiv.org/pdf/${PAPER}`), pdf ?? 'no tab')
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  await field.fill('attention is all you need')
  await sleep(300)
  const row = await popup.locator('.go:not(.brand)').innerText().catch(() => '')
  const found = await nextTab(() => field.press('Enter'))
  check('words: arXiv\'s own search, in a new tab', /在 arXiv 搜索「attention is all you need」/.test(row) && found === 'https://arxiv.org/search/?query=attention+is+all+you+need&searchtype=all&source=header', `“${row.trim()}” → ${found}`)
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  const heads = []
  context.on('request', r => { if (r.method() === 'HEAD' && /^https:\/\/arxiv\.org\/(html|src)\//.test(r.url())) heads.push(r.url()) })
  // typed key by key, 40 ms apart: the checks wait for the field to be still, and run once per paper
  await field.pressSequentially(`https://arxiv.org/abs/${PAPER}`, { delay: 40 })
  const line = await popup.locator('.paper').innerText().catch(() => '')
  await popup.waitForFunction(() => document.querySelectorAll('.found .twin > button').length === 2, null, { timeout: 8000 }).catch(() => undefined)
  const both = await popup.evaluate(() => [...document.querySelectorAll('.found .twin > button')].map(b => b.getAttribute('aria-disabled') === 'true'))
  check('a paper named: its line at once, both entries once its two checks are back, each check made once', line.includes(`arXiv ${PAPER}`) && JSON.stringify(both) === '[false,false]' && heads.length === 2, `line “${line}”, entries greyed ${JSON.stringify(both)}, HEADs ${heads.join(' ')}`)
  await field.fill('')
  await field.pressSequentially(PAPER, { delay: 40 })
  await sleep(1500)
  check('the same paper again: answered already, not checked again', heads.length === 2, `${heads.length} HEADs`)
  await field.fill(WITHOUT_HTML)
  await popup.waitForFunction(() => document.querySelectorAll('.found .twin > button').length === 2, null, { timeout: 8000 }).catch(() => undefined)
  await sleep(500)
  const none = await popup.evaluate(() => ({ greyed: [...document.querySelectorAll('.found .twin > button')].map(b => b.getAttribute('aria-disabled') === 'true'), said: document.querySelector('.found .line.mark')?.textContent ?? '' }))
  check('a paper with no HTML version: its HTML entry greyed, and why', JSON.stringify(none.greyed) === '[true,false]' && /没有这篇论文的 HTML 版本/.test(none.said), JSON.stringify(none))
  const html = await nextTab(() => popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' }).fill(`https://arxiv.org/abs/${PAPER}`).then(() => sleep(400)).then(() => popup.locator('.found .twin > button').first().click()))
  check('an entry opens the paper\'s HTML version, translating, in a new tab', (html ?? '').startsWith(`https://arxiv.org/html/${PAPER}`), html ?? 'no tab')
}
{
  const popup = await popupOver(other)
  const field = popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' })
  await field.fill('https://www.nature.com/articles/s41586-021-03819-2')
  await sleep(300)
  const said = await popup.locator('.found .line.mark').innerText().catch(() => '')
  let opened = 0
  const counting = () => { opened++ }
  context.on('page', counting)
  await field.press('Enter')
  await sleep(1500)
  context.off('page', counting)
  check('a link elsewhere: said, and Enter opens nothing', /只能打开 arXiv 的论文链接/.test(said) && opened === 0, `“${said}”, ${opened} tab(s)`)
  const advanced = await nextTab(() => popup.getByRole('textbox', { name: '按标题、作者、摘要或链接搜索论文' }).fill('').then(() => popup.getByRole('link', { name: '高级搜索' }).click()))
  check('the advanced search is arXiv\'s, in a new tab', advanced === 'https://arxiv.org/search/advanced', advanced ?? 'no tab')
}

// ── P1 over a paper's full text: the group, its menus, the foot (§5.1, §5.3) ────────────────────────────────────────
const paper = await context.newPage()
await paper.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
{
  const popup = await popupOver(paper, 2500)
  const g = await popup.evaluate(() => {
    const m = document.querySelector('main').getBoundingClientRect()
    const box = sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left - m.left, right: m.right - r.right, height: r.height } : null }
    return { width: m.width, brand: box('.brand-row'), group: box('.group'), row: box('.group-row'), primary: box('.stack button[aria-label]'), display: box('[role="radiogroup"]') }
  })
  check('P1: 320 wide, the brand row 44, the group 12 from both edges, its rows 36, the primary 36, the display 30',
    g.width === 320 && g.brand?.height === 44 && near(g.group?.left, 12) && near(g.group?.right, 12) && g.row?.height === 36 && g.primary?.height === 36 && g.display?.height === 30, JSON.stringify(g))
  await popup.screenshot({ path: `${SHOTS}/p1.png` })

  await popup.getByRole('button', { name: /翻译服务/ }).click()
  await sleep(500)
  const service = await menuPlace(popup)
  check('the service menu under its row: 8 px from the popup\'s edges, 4 px below the row, the popup grown to hold it with 8 to spare',
    service && !service.up && near(service.left, 8) && near(service.right, 8) && near(service.below, 4) && service.room >= 7.5 && service.minHeight !== '', JSON.stringify(service))
  await popup.screenshot({ path: `${SHOTS}/p1-services.png` })
  const manage = await nextTab(() => popup.getByRole('option', { name: /管理翻译服务…/ }).click())
  check('Manage services… opens the settings page at the services', manage === `chrome-extension://${extId}/options.html#translate/services`, manage ?? 'no tab')
}
{
  const popup = await popupOver(paper, 2500)
  await popup.getByRole('button', { name: /目标语言/ }).click()
  await sleep(500)
  await popup.keyboard.press('Escape')
  await sleep(400)
  const after = await popup.evaluate(() => ({ open: !!document.querySelector('.pop.menu:popover-open'), minHeight: document.querySelector('main').style.minHeight, focus: document.activeElement?.className ?? '' }))
  check('Escape shuts the menu, gives the popup its own height back and the focus back to its row', !after.open && after.minHeight === '' && /group-row/.test(after.focus), JSON.stringify(after))

  await popup.getByRole('button', { name: '译文样式' }).click()
  await sleep(500)
  const style = await menuPlace(popup)
  check('the style menu above its button, 6 px from it, 8 px from the popup\'s edges, inside the popup', style?.up && near(style.above, 6) && near(style.left, 8) && near(style.right, 8) && style.top >= 7.5, JSON.stringify(style))
  await popup.screenshot({ path: `${SHOTS}/p1-styles.png` })
  const styles = await nextTab(() => popup.getByRole('option', { name: /管理译文样式…/ }).click())
  check('Manage styles… opens the settings page at the styles', styles === `chrome-extension://${extId}/options.html#appearance/styles`, styles ?? 'no tab')
}
{
  const popup = await popupOver(paper, 2500)
  const switchOf = () => popup.getByRole('switch', { name: '对照高亮' })
  const before = await switchOf().getAttribute('aria-checked')
  // the words, not the track: a switch's whole row is its label (§9)
  const words = await popup.locator('.foot .toggle').first().boundingBox()
  await popup.mouse.click(words.x + words.width - 8, words.y + words.height / 2)
  await sleep(400)
  const after = await switchOf().getAttribute('aria-checked')
  await popup.mouse.click(words.x + words.width - 8, words.y + words.height / 2)
  // this popup's own write of the switch lands before the configuration is patched below: a write still out would
  // replace the patch with the configuration this popup holds
  await sleep(400)
  check('a click on a switch\'s words flips it', before !== after, `${before} → ${after}`)
}
await patchConfig({ services: [SVC], provider: SVC.id })
{
  const popup = await popupOver(paper, 2500)
  await popup.getByRole('button', { name: /提示词/ }).click()
  await sleep(500)
  const prompts = await nextTab(() => popup.getByRole('option', { name: /管理提示词…/ }).click())
  check('with an LLM service, the prompt menu ends with Manage prompts…, which opens the settings page at the prompts', prompts === `chrome-extension://${extId}/options.html#translate/prompts`, prompts ?? 'no tab')
}
await patchConfig({ services: [], provider: 'microsoft' })

// ── P17: an abstract page, and the panel on it (§5.5; the floating button's panel, embedded.ts) ────────────────────
const abs = await context.newPage()
await abs.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
await sleep(2000)
{
  const popup = await popupOver(abs)
  const seen = await popup.evaluate(() => ({
    entries: [...document.querySelectorAll('.twin > button')].map(b => ({ words: b.textContent?.trim(), icon: !!b.querySelector('svg') })),
    display: !!document.querySelector('[role="radiogroup"]'),
    foot: !!document.querySelector('.foot'),
  }))
  check('P17: the two entries with their icons, and nothing of a translated page', JSON.stringify(seen.entries) === JSON.stringify([{ words: 'HTML 翻译', icon: true }, { words: 'PDF 翻译', icon: true }]) && !seen.display && !seen.foot, JSON.stringify(seen))
  await popup.screenshot({ path: `${SHOTS}/p17.png` })
  await popup.close()
}
{
  // A tab of its own: once popupOver has sized a popup's page (setViewportSize, a device-metrics emulation), the frames
  // of the tab under it hear no pointer in Playwright's Chromium (measured in the pre-flight: no pointerdown reached the
  // panel's popup; entries.mjs meets the same with the reader's frame)
  const tab = await context.newPage()
  await tab.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
  await sleep(2000)
  const at = await tab.evaluate(() => { const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
  await tab.mouse.click(at.x, at.y)
  await sleep(2500)
  const panelHeight = () => tab.evaluate(() => Math.round(document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-panel-box').getBoundingClientRect().height))
  const frame = tab.frames().find(f => f.url().includes('/popup.html'))
  const before = await panelHeight()
  await frame.locator('button.group-row').first().click()
  await sleep(800)
  const grown = await panelHeight()
  const inside = await frame.evaluate(() => { const p = document.querySelector('.pop.menu:popover-open')?.getBoundingClientRect(); return p ? p.bottom <= innerHeight : false })
  await tab.screenshot({ path: `${SHOTS}/panel-menu.png` })
  // Escape where the focus is, the menu's list: the menu takes it, and the panel stays (embedded.ts hands over only an
  // Escape nothing took)
  await tab.keyboard.press('Escape')
  await sleep(500)
  const stillOpen = await tab.evaluate(() => !document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-panel-box').hidden)
  check('in the floating button\'s panel a menu grows the frame to hold it, and Escape shuts the menu, not the panel', grown > before && inside && stillOpen, `panel ${before} → ${grown} px, menu inside ${inside}, panel open after Escape ${stillOpen}`)
}

await context.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(failed.length ? 1 : 0)
