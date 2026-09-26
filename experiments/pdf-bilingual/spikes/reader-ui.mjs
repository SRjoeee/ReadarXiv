// The reader's interface in a real browser (the reader's design §4–§8, §13), on a demo paper, grown task by task in Part
// 3 of plans/2026-09-25-reader-interface.md. Exits non-zero on a failure or a page error; screenshots in out/reader-ui/.
// Build first; the demo papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-ui.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-ui')
mkdirSync(out, { recursive: true })
const paper = '2608.02163'
const { context, readerUrl } = await launchWithReader({ profile: 'reader-ui', demos: true, viewport: { width: 1440, height: 900 } })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
async function open(query = {}, viewport) {
  const page = await context.newPage()
  if (viewport) await page.setViewportSize(viewport)
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({ paper, ...query }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  await page.waitForTimeout(600)
  return page
}
const state = page => page.evaluate(() => window.__reader.controller.getState())
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) })
/** a change of the settings, as a plain object merged one group deep (the extension's policy refuses eval) */
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const next = { ...c }
  for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return next
}), change)
const box = (page, selector) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, selector)

// ---------------------------------------------------------------- Task 13: the frame
{
  const page = await open({ mode: 'bilingual' })
  const bar = await box(page, 'header'), doc = await box(page, '.doc')
  check('the toolbar is 44 px, the document area under it', bar?.h === 44 && doc?.y === 44, JSON.stringify({ bar, doc }))
  const [l, r] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('side by side: two panes, an 8 px gutter', l && r && Math.round(r.x - (l.x + l.w)) === 8, JSON.stringify({ l, r }))
  // the viewers keep the browser's defaults: canvas, text layer and highlight layer share one rectangle in every page
  // a band lit on the first page, so that its highlight layer is there to be measured
  const layers = await page.evaluate(() => {
    const { debug } = window.__reader, id = [...debug.left.anchors.keys()].find(k => debug.left.anchors.get(k)?.rects?.[0]?.page === 1)
    debug.light(id)
    const p = document.querySelector('#left .page')
    return ['.canvasWrapper', '.textLayer', '.axt-hl-layer'].map(s => { const r = p.querySelector(s)?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : null })
  })
  check('the page layers share one rectangle: canvas, text, highlight', layers.every(x => x !== null && x === layers[0]), JSON.stringify(layers))
  await page.evaluate(() => window.__reader.debug.light(null))
  await patch(page, { pdfReader: { swapped: true } })
  await page.waitForTimeout(400)
  const [l2, r2] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('swapped: the translation on the left', !!(l2 && r2) && r2.x < l2.x, JSON.stringify({ l2, r2 }))
  await patch(page, { pdfReader: { swapped: false, appearance: 'dark', dimPages: true } })
  await page.waitForTimeout(600)
  const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, dim: document.documentElement.hasAttribute('data-axt-dim'), filter: getComputedStyle(document.querySelector('#left .page canvas')).filter, blend: (() => { window.__reader.debug.light(3); const b = document.querySelector('.axt-hl'); return b && getComputedStyle(b).mixBlendMode })() }))
  check('dark: the theme, the canvas inverted, the band screened', dark.theme === 'dark' && dark.dim && /invert/.test(dark.filter) && dark.blend === 'screen', JSON.stringify(dark))
  await shot(page, '13-dark-bilingual')
  await patch(page, { pdfReader: { appearance: 'system', dimPages: true } })
  await page.close()
}
{
  const page = await open({ mode: 'translation' })
  const pane = await box(page, '.pane[data-side="right"]'), pg = await box(page, '#right .page')
  check('one display: the pane spans the window', pane?.w === 1440, JSON.stringify(pane))
  check('one display: fit width stops at a reading width', pg && pg.w <= 1062 && pg.w >= 1000, JSON.stringify(pg))
  await shot(page, '13-translation')
  await page.close()
}

// ---------------------------------------------------------------- Task 27: the PDF.js internals the engine reads
// session.mjs reads these; an upgrade of pdfjs-dist that changes them fails here (tests/pdf-reader/pdfjs-pin.test.ts)
{
  const page = await open({ mode: 'bilingual' })
  const internals = await page.evaluate(() => {
    const v = window.__reader.debug.left.viewer, pv = v.getPageView(0), visible = v._getVisiblePages()
    return {
      pages: Array.isArray(v._pages) && v._pages.length === v.pagesCount && v._pages[0] === pv,
      visible: Array.isArray(visible?.views) && visible.views.length > 0 && visible.views.every(x => x.view && typeof x.id === 'number'),
      drawn: !!visible?.views?.some(x => x.view.renderingState === 3),
      page: Array.isArray(pv.pdfPage?.view) && pv.pdfPage.view.length === 4 && pv.div instanceof HTMLElement && pv.id === 1,
      viewport: typeof pv.viewport?.convertToPdfPoint === 'function' && pv.viewport.scale > 0,
      scale: getComputedStyle(pv.div).getPropertyValue('--total-scale-factor').trim() !== '',
    }
  })
  check('the PDF.js internals the engine reads are there', Object.values(internals).every(Boolean), JSON.stringify(internals))
  // a form that is a transparency group: PDF.js gives its box to the group it begins just before the form, and the
  // form none (figures.mjs figureRegions reads it there; 1706.03762's attention figures as the translation sets them)
  const group = await page.evaluate(async () => {
    const pdf = ['%PDF-1.4', '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj', '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /XObject /Subtype /Form /BBox [0 0 200 100] /Group << /S /Transparency >> /Length 24 >> stream', '0 0 1 rg 0 0 200 100 re f', 'endstream endobj',
      '5 0 obj << /Length 27 >> stream', 'q 1 0 0 1 50 60 cm /F1 Do Q', 'endstream endobj', 'trailer << /Root 1 0 R >>', '%%EOF'].join('\n')
    const lib = window.pdfjsLib ?? (await import('/pdf-reader/pdfjs/pdf.mjs'))
    const task = lib.getDocument({ data: new TextEncoder().encode(pdf) }), doc = await task.promise
    const { fnArray, argsArray } = await (await doc.getPage(1)).getOperatorList()
    const k = fnArray.indexOf(lib.OPS.paintFormXObjectBegin)
    const out = { form: k >= 0, own: argsArray[k]?.[1] ?? null, before: fnArray[k - 1] === lib.OPS.beginGroup, bbox: argsArray[k - 1]?.[0]?.bbox ? Array.from(argsArray[k - 1][0].bbox) : null }
    await task.destroy()
    return out
  })
  check('a transparency group form: its box on the group PDF.js begins before it, none on the form', group.form && group.own === null && group.before && JSON.stringify(group.bbox) === '[0,0,200,100]', JSON.stringify(group))
  await page.close()
}

// ---------------------------------------------------------------- Task 28: a replaced viewer lets go of its pages
// three swaps of the right side, then the text layers and pages still alive off the page (the heap, by CDP; the query's
// own array released, or it would keep what it found) and the document's selection listeners (the reader's design, §10.4)
{
  const page = await open({ mode: 'bilingual' })
  const cdp = await context.newCDPSession(page)
  const offPage = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    const { result: proto } = await cdp.send('Runtime.evaluate', { expression: 'HTMLDivElement.prototype', objectGroup: 'axt-count' })
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId, objectGroup: 'axt-count' })
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId, returnByValue: true, functionDeclaration: 'function () { const off = this.filter(d => !d.isConnected); return off.filter(d => d.classList.contains("textLayer") || d.classList.contains("page")).length }' })
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'axt-count' })
    return result.value
  }
  const selection = async () => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document' })
    return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.filter(l => l.type === 'selectionchange').length
  }
  const before = { layers: await offPage(), selection: await selection() }
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__reader.debug.swapRight())
  await page.waitForTimeout(500)
  const after = { layers: await offPage(), selection: await selection() }
  check('a replaced viewer lets go of its pages and text layers', after.layers === 0, JSON.stringify({ before, after }))
  check('the document\'s selection listeners do not grow with the swaps, and are there', after.selection >= 1 && after.selection <= before.selection, JSON.stringify({ before, after }))
  await page.close()
}

// ---------------------------------------------------------------- Task 30: overlays kept across a redraw
// a page PDF.js drops from its buffer when it is scrolled far away, and draws again on the way back: its overlays kept,
// not laid again, not doubled (§10.2)
{
  const page = await open({ mode: 'bilingual' })
  const at = () => page.evaluate(() => ({ bands: document.querySelectorAll('#right .page[data-page-number="1"] > .axt-hl-layer').length, paints: window.__reader.debug.paintsOf(1), drawn: window.__reader.debug.right.viewer.getPageView(0).renderingState }))
  await page.evaluate(() => { const d = window.__reader.debug, id = [...d.right.anchors.keys()].find(k => d.right.anchors.get(k)?.rects?.[0]?.page === 1); d.light(id) })
  const before = await at()
  // every page in turn: PDF.js keeps ten page views drawn, so page 1 is dropped on the way (its renderingState back to 0)
  const pages = await page.evaluate(() => window.__reader.debug.right.viewer.pagesCount)
  let dropped = false
  for (let n = 2; n <= pages; n++) {
    await page.evaluate(n => { window.__reader.debug.right.viewer.currentPageNumber = n }, n)
    await page.waitForTimeout(150)
    dropped ||= (await at()).drawn === 0
  }
  await page.evaluate(() => { window.__reader.debug.right.viewer.currentPageNumber = 1 })
  await page.waitForTimeout(1500)
  const after = await at()
  check('a page dropped by PDF.js and drawn again keeps one highlight layer, its figures not laid again', dropped && after.drawn === 3 && after.bands === 1 && after.paints === before.paints, JSON.stringify({ before, after, dropped }))
  // the figure-text switch changed while page 1 is dropped: it is laid again when drawn again, in the new state (Part 4's
  // final review: a page already laid kept what it had)
  for (let n = 2; n <= pages; n++) { await page.evaluate(n => { window.__reader.debug.right.viewer.currentPageNumber = n }, n); await page.waitForTimeout(100) }
  const away = await at()
  await page.evaluate(() => window.__reader.controller.setFigures(false))
  await page.waitForTimeout(600)
  await page.evaluate(() => { window.__reader.debug.right.viewer.currentPageNumber = 1 })
  await page.waitForTimeout(1500)
  const back = await at()
  check('the figure-text switch reaches a page PDF.js had dropped, when it is drawn again', away.drawn === 0 && back.paints === away.paints + 1, JSON.stringify({ away, back }))
  await page.evaluate(() => window.__reader.controller.setFigures(true))
  await page.close()
}

// ---------------------------------------------------------------- Task 17: the toolbar
{
  const page = await open({ mode: 'bilingual' })
  const s = await state(page)
  check('the title is known, from the PDF or its first heading', s.paper.title.length > 10, JSON.stringify(s.paper))
  check('the tab carries the title', (await page.title()) === s.paper.title)
  await page.getByRole('radio', { name: '译文' }).click()
  await page.waitForTimeout(500)
  check('the display switch changes the display', (await state(page)).display === 'translation')
  check('sync and swap grey out in a single display', await page.evaluate(() => ['同步滚动', '交换左右'].every(n => document.querySelector(`button[aria-label="${n}"]`)?.getAttribute('aria-disabled') === 'true')))
  // no single key chooses a display (WCAG 2.1.4; the maintainer, 2026-09-26); the switch's arrows do, as a radio group's
  for (const k of ['1', '2', '3']) await page.keyboard.press(k)
  await page.waitForTimeout(400)
  const digits = (await state(page)).display
  await page.getByRole('radio', { name: '译文' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(400)
  const left = await page.evaluate(() => ({ display: window.__reader.controller.getState().display, focus: document.activeElement?.getAttribute('aria-label') }))
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  const right = (await state(page)).display
  check('a digit chooses no display; the switch\'s arrows move its choice and its focus', digits === 'translation' && left.display === 'bilingual' && left.focus === '对照' && right === 'translation', JSON.stringify({ digits, left, right }))
  await page.getByRole('radio', { name: '对照' }).click()
  await page.waitForTimeout(400)
  const before = (await state(page)).scale
  await page.getByRole('button', { name: '放大' }).click()
  await page.waitForTimeout(300)
  check('zooming in scales both sides by a tenth', Math.abs((await state(page)).scale - before * 1.1) < 0.01, `${before} → ${(await state(page)).scale}`)
  // the pointer comes onto the button from elsewhere: the press above left it there, and a pressed button shows no tip
  await page.mouse.move(700, 400)
  await page.getByRole('button', { name: '放大' }).hover()
  await page.waitForTimeout(700)
  const tip = await page.evaluate(() => { const t = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')); const r = t?.getBoundingClientRect(); return r && { text: t.textContent, h: r.height, left: r.left, right: r.right } })
  check('a tooltip after the hover, one line, inside the window', !!tip && tip.h < 30 && tip.left >= 0 && tip.right <= 1440, JSON.stringify(tip))
  await shot(page, '17-toolbar')
  await page.close()
}

// ---------------------------------------------------------------- Task 19: the menus
{
  const page = await open({ mode: 'bilingual' })
  await page.getByRole('button', { name: '缩放比例' }).click()
  await page.getByRole('menuitemradio', { name: '适合页面' }).click()
  await page.waitForTimeout(500)
  check('the zoom menu fits the page, and closes', (await state(page)).zoom === 'page-fit' && !(await page.evaluate(() => !!document.querySelector('.pop:popover-open'))))
  await page.getByRole('button', { name: '目标语言' }).click()
  await page.keyboard.type('fra')
  check('the language menu searches as it is typed', (await page.getByRole('option').count()) === 1)
  await page.keyboard.press('Escape')
  check('Escape closes it, the focus back on its button', await page.evaluate(() => !!(a => a && (a.getAttribute('aria-labelledby')?.split(' ').map(i => document.getElementById(i)?.textContent).join(' ') ?? a.getAttribute('aria-label')))(document.activeElement)?.includes('目标语言')))
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.getByRole('button', { name: '下载' }).click(); await page.getByRole('menuitem', { name: '原文 PDF' }).click() })()])
  check('the original downloads, named by the paper', download.suggestedFilename() === `${paper}.pdf`, download.suggestedFilename())
  await page.getByRole('button', { name: '翻译服务' }).click()
  await page.waitForTimeout(300) // past the popover's 150 ms entrance
  await shot(page, '19-service-menu')
  await page.keyboard.press('Escape')
  await page.close()
}

// ---------------------------------------------------------------- Task 20: the reading options
{
  const page = await open({ mode: 'bilingual' })
  await page.getByRole('button', { name: '阅读选项' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: '深色' }).click()
  await page.waitForTimeout(600)
  check('the appearance chosen in the options applies at once', await page.evaluate(() => document.documentElement.dataset.theme === 'dark'))
  check('a wide window keeps the language and service menus in the bar, not in the options', await page.evaluate(() => [...document.querySelectorAll('.pop:popover-open .narrow-only')].every(el => getComputedStyle(el).display === 'none')))
  await shot(page, '20-options-dark')
  await page.getByRole('radio', { name: '跟随系统' }).click()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 880, height: 900 })
  await page.waitForTimeout(400)
  const inBar = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('[data-zone="trail"] > button')].find(b => b.textContent.includes('目标语言'))).display)
  await page.getByRole('button', { name: '阅读选项' }).click()
  await page.waitForTimeout(300)
  const inOptions = await page.evaluate(() => { const b = [...document.querySelectorAll('.pop:popover-open .narrow-only button')].find(x => x.textContent.includes('目标语言')); return !!b && b.getBoundingClientRect().width > 0 })
  check('under 900 px the language menu leaves the bar for the options', inBar === 'none' && inOptions, JSON.stringify({ inBar, inOptions }))
  await shot(page, '20-options-narrow')
  await page.close()
}

// ---------------------------------------------------------------- Task 21: the contents
{
  const page = await open({ mode: 'bilingual' })
  const widthBefore = await box(page, '#right .page')
  await page.getByRole('button', { name: '目录' }).click()
  await page.waitForTimeout(700)
  const entries = (await state(page)).outline
  check('the contents list the headings with levels', entries.length > 5 && entries.some(e => e.level === 2), `${entries.length} entries`)
  const widthAfter = await box(page, '#right .page')
  check('opening the contents refits the pages to the narrower panes', widthAfter.w < widthBefore.w, `${widthBefore.w} → ${widthAfter.w}`)
  const target = entries.find(e => e.page >= 3)
  await page.locator(`[data-entry="${target.id}"] a`).click()
  await page.waitForTimeout(800)
  // the heading put at the top of the translation's side, a line of room above it (goToUnit's 28 px)
  const at = await page.evaluate(id => { const { debug } = window.__reader, r = debug.right; return Math.round(debug.unitDocTop(r, id) - r.container.scrollTop) }, target.id)
  check('a row jumps to its heading on the translation\'s side', Math.abs(at - 28) <= 4, `${JSON.stringify(target)}: ${at} px from the top`)
  check('…and the original follows it there', (await state(page)).sides.left.page > 1, JSON.stringify((await state(page)).sides))
  check('the row is marked as the section being read', await page.evaluate(id => document.querySelector(`[data-entry="${id}"] .entry`)?.getAttribute('aria-current') === 'true', target.id))
  await shot(page, '21-contents')
  await page.close()
}

// ---------------------------------------------------------------- Task 22: the pills and the indicators
{
  const page = await open({ mode: 'bilingual' })
  const opacity = s => page.evaluate(sel => getComputedStyle(document.querySelector(sel)).opacity, s)
  await page.waitForTimeout(3000) // past the 2.5 s the pill stays after PDF.js's own scroll as the pages are laid
  check('the pill and the indicator are hidden at rest', (await opacity('.pane[data-side="left"] .pill')) === '0' && (await opacity('.pane[data-side="left"] .indicator')) === '0')
  await page.mouse.move(300, 500)
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(250)
  check('scrolling shows the pane\'s pill and indicator', (await opacity('.pane[data-side="left"] .pill')) === '1' && (await opacity('.pane[data-side="left"] .indicator')) === '1')
  await page.waitForTimeout(2800)
  check('both fade after their delays', (await opacity('.pane[data-side="left"] .pill')) === '0')
  const pill = page.getByRole('textbox', { name: '原文页码' })
  await pill.focus()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check('a page typed in the pill is gone to', (await state(page)).sides.left.page === 5, JSON.stringify((await state(page)).sides))
  // a drag of the right indicator's thumb moves the right side, and the left follows through the sync
  const leftTop = await page.evaluate(() => window.__reader.debug.left.container.scrollTop)
  const thumb = await page.evaluate(() => { const r = document.querySelector('.pane[data-side="right"] .indicator i').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 10 } })
  await page.mouse.move(thumb.x, thumb.y)
  await page.mouse.down()
  await page.mouse.move(thumb.x, thumb.y + 120, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => ({ left: window.__reader.debug.left.container.scrollTop, right: window.__reader.debug.right.container.scrollTop }))
  check('dragging an indicator moves its side, the other following', after.right > 0 && after.left !== leftTop, JSON.stringify({ leftTop, after }))
  await shot(page, '22-pills')
  await page.close()
}

// ---------------------------------------------------------------- Task 23: the states
{
  const page = await open({ mode: 'bilingual' }, { width: 800, height: 900 })
  const s = await state(page)
  const leftShown = () => page.evaluate(() => getComputedStyle(document.querySelector('.pane[data-side="left"]')).display !== 'none')
  check('a narrow window: 对照 kept, the translation alone', s.display === 'bilingual' && s.narrow && !(await leftShown()), JSON.stringify({ display: s.display, narrow: s.narrow }))
  check('…and the capsule says so', (await page.getByRole('status').textContent()).includes('窗口较窄'))
  await shot(page, '23-narrow')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(600)
  check('wide again: both sides', !(await state(page)).narrow && (await leftShown()))
  await page.close()
}
// the capsule in the narrowest window, in the longer pack: inside the window, its words whole, nothing of it cut (Part
// 6's interface review: at 320 px the English capsules ran past both edges of the window, their action with them)
{
  const setup = await open({ mode: 'original' })
  await patch(setup, { uiLanguage: 'en' })
  await setup.waitForTimeout(800)
  await setup.close()
  const page = await open({ mode: 'bilingual' }, { width: 320, height: 800 })
  const cap = await page.evaluate(() => {
    const c = document.querySelector('.capsule'), w = c?.querySelector('.words')
    if (!c || !w) return null
    const r = c.getBoundingClientRect(), t = w.getBoundingClientRect()
    return { text: w.textContent, capsule: [r.left, r.right].map(Math.round), words: [t.left, t.right].map(Math.round), vw: innerWidth }
  })
  check('the narrowest window, in English: the capsule inside the window and its words inside it', !!cap && cap.capsule[0] >= 0 && cap.capsule[1] <= cap.vw && cap.words[0] >= cap.capsule[0] && cap.words[1] <= cap.capsule[1], JSON.stringify(cap))
  await shot(page, '23-narrow-320-en')
  await patch(page, { uiLanguage: 'auto' })
  await page.waitForTimeout(800)
  await page.close()
}

// ---------------------------------------------------------------- Task 24: pinch zoom
{
  const page = await open({ mode: 'bilingual' })
  const before = (await state(page)).scale
  await page.mouse.move(400, 500)
  await page.keyboard.down('Control')
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -8)
  await page.keyboard.up('Control')
  await page.waitForTimeout(900)
  const after = await state(page)
  const widths = await page.evaluate(() => [...document.querySelectorAll('.pane .page')].slice(0, 1).map(p => p.getBoundingClientRect().width))
  check('a pinch zooms both sides together', after.scale > before * 1.05 && after.zoom === null, `${before} → ${after.scale}`)
  check('…the page drawn at the new scale', widths[0] > 0)
  const s0 = after.scale
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+=' : 'Control+=')
  await page.waitForTimeout(400)
  check('⌘+ (or Ctrl+) zooms in by a tenth', (await state(page)).scale > s0 * 1.05)
  await page.close()
}

// ---------------------------------------------------------------- Part 3's final review
{
  const page = await open({ mode: 'bilingual' })
  // the progress line (the maintainer, 2026-09-25): there, along the toolbar's foot, and out of sight while reading
  const line = await page.evaluate(() => { const l = document.querySelector('header .progress-line'); return l && { on: l.hasAttribute('data-on'), opacity: getComputedStyle(l).opacity } })
  check('the progress line is out of sight while reading', !!line && !line.on && line.opacity === '0', JSON.stringify(line))
  // I5: the offline service's language pack is looked up after the settings land, and the service menu follows it
  const pack = await page.waitForFunction(() => window.__reader.controller.getState().pack, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null)
  check('the service menu learns the offline pack\'s state', pack !== null, String(pack))
  // I10: the contents slide the document area, and each side is refitted once, not on every frame of the slide
  await page.evaluate(() => { window.__scales = 0; for (const s of [window.__reader.debug.left, window.__reader.debug.right]) s.eventBus.on('scalechanging', () => { window.__scales++ }) })
  await page.getByRole('button', { name: '目录' }).click()
  await page.waitForTimeout(700)
  const opened = await page.evaluate(() => window.__scales)
  await page.getByRole('button', { name: '目录' }).click()
  await page.waitForTimeout(700)
  const closed = await page.evaluate(() => window.__scales) - opened
  check('the contents open and close with one refit of each side', opened <= 2 && closed <= 2, `${opened} scale changes opening, ${closed} closing`)
  await page.close()
}

// ---------------------------------------------------------------- Part 6: the interface review's findings
// (better-interface: controls drawn over each other, a menu's focus unseen, a name cut, the chosen swatch's ring)
// A. no two of the toolbar's controls drawn over each other, from Chrome's narrowest window up, in the arXiv frame too
for (const embedded of ['1', '0']) {
  const page = await open({ mode: 'bilingual', embedded })
  const hits = {}
  for (const w of [500, 640, 800, 960, 1100, 1210, 1280]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(500)
    const h = await page.evaluate(() => {
      const els = [...document.querySelector('header').querySelectorAll('button, a, [role="radiogroup"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== 'hidden' })
      const out = []
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect()
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${els[i].getAttribute('aria-label') ?? els[i].textContent.trim().slice(0, 10)}×${els[j].getAttribute('aria-label') ?? els[j].textContent.trim().slice(0, 10)}`)
      }
      const bar = document.querySelector('header').getBoundingClientRect()
      const out2 = els.filter(e => { const r = e.getBoundingClientRect(); return r.right > bar.right + 1 || r.left < bar.left - 1 }).map(e => e.getAttribute('aria-label'))
      return [...out, ...out2.map(n => `${n} outside`)]
    })
    if (h.length) hits[w] = h
  }
  check(`the toolbar's controls never drawn over each other, 500–1280 px${embedded === '1' ? ', in the arXiv frame' : ''}`, Object.keys(hits).length === 0, JSON.stringify(hits))
  await page.close()
}

// B. the menus' active item shows the focus ring when the keyboard moves it, light and dark
{
  const page = await open({ mode: 'bilingual' })
  for (const dark of [false, true]) {
    await patch(page, { pdfReader: { appearance: dark ? 'dark' : 'light' } })
    await page.waitForTimeout(500)
    const seen = {}
    for (const name of ['缩放比例', '目标语言']) {
      // the bar's own: named by its words and what it shows (WCAG 2.5.3)
      await page.locator('header').getByRole('button', { name }).focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(350)
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(150)
      seen[name] = await page.evaluate(() => { const a = document.querySelector('.pop:popover-open .item[data-active]'); return a ? getComputedStyle(a).outlineStyle : 'no active item' })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }
    check(`${dark ? 'dark' : 'light'}: a menu's active item, moved by the keyboard, shows the focus ring`, Object.values(seen).every(s => s === 'solid'), JSON.stringify(seen))
  }
  await patch(page, { pdfReader: { appearance: 'system' } })
  // C. every name in the service menu whole
  await page.locator('header').getByRole('button', { name: '翻译服务' }).click()
  await page.waitForTimeout(400)
  const cut = await page.evaluate(() => [...document.querySelectorAll('.pop:popover-open .item .truncate')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent))
  check('the service menu shows every name whole', cut.length === 0, JSON.stringify(cut))
  await page.keyboard.press('Escape')
  // D. the chosen highlight swatch, focused from the keyboard, carries the focus ring
  await page.getByRole('button', { name: '阅读选项', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  let ring = null
  for (let i = 0; i < 12 && !ring; i++) {
    await page.keyboard.press('Tab')
    ring = await page.evaluate(() => { const a = document.activeElement; if (!a?.matches('.swatch[aria-pressed="true"]')) return null; const s = getComputedStyle(a); return { color: s.outlineColor, width: s.outlineWidth, focus: getComputedStyle(document.documentElement).getPropertyValue('--focus') } })
  }
  const probe = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--focus)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c })
  check('the chosen highlight swatch, focused from the keyboard, carries the focus ring', !!ring && ring.color === probe && ring.width === '2px', JSON.stringify({ ring, focus: probe }))
  await page.close()
}

// dark: a chosen segment and a pressed button stand out from what they sit on (Part 6's interface review: 1.06:1; the
// maintainer adopted the raised thumb, 2026-09-26)
{
  const page = await open({ mode: 'bilingual' })
  await patch(page, { pdfReader: { appearance: 'dark', sync: true } })
  await page.waitForTimeout(700)
  const ratios = await page.evaluate(() => {
    const px = color => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a, b) => { const [x, y] = [lum(px(a)), lum(px(b))].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
    const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor
    return { thumb: ratio(bg('.seg .thumb'), bg('.seg')), pressed: ratio(bg('header .tbtn[aria-pressed="true"]'), bg('header')) }
  })
  check('dark: the chosen segment\'s thumb and a pressed button stand out from what they sit on', ratios.thumb >= 1.5 && ratios.pressed >= 1.15, JSON.stringify(ratios))
  await patch(page, { pdfReader: { appearance: 'system' } })
  await page.close()
}

// ---------------------------------------------------------------- the interface review's fixes (2026-09-26)
{
  const page = await open({ mode: 'bilingual' })
  // the bar at every width, in both languages and with a service's longest name (40 characters): no control drawn over
  // another or past the window's edges, and below 500 px what leaves the bar is in the reading options (§5)
  const layout = () => {
    const vw = innerWidth
    const els = [...document.querySelectorAll('header button, header a, header [role="radiogroup"]')].filter(e => !e.closest('[role="radiogroup"]') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' || e.matches('[role="radiogroup"]'))
    const rects = els.map(e => { const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 16), l: r.left, r: r.right } })
    const overlaps = []
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rects[i].l < rects[j].r - 0.5 && rects[j].l < rects[i].r - 0.5) overlaps.push(`${rects[i].name} × ${rects[j].name}`)
    return { overlaps, outside: rects.filter(r => r.r > vw + 0.5 || r.l < -0.5).map(r => r.name) }
  }
  const setLocale = async lang => {
    await Promise.all([page.waitForEvent('load', { timeout: 30000 }).catch(() => null), page.evaluate(l => { window.__reader.controller.patchSettings(c => ({ ...c, uiLanguage: l })) }, lang).catch(() => null)])
    await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
    await page.waitForTimeout(800)
  }
  const bad = []
  const sweep = async tag => {
    for (const w of [1440, 1100, 1024, 960, 900, 899, 640, 500, 499, 400, 320]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.waitForTimeout(300)
      const l = await page.evaluate(layout)
      if (l.overlaps.length || l.outside.length) bad.push(`${tag} ${w}: ${JSON.stringify(l)}`)
      await page.screenshot({ path: join(out, `review-bar-${tag}-${w}.png`), clip: { x: 0, y: 0, width: w, height: 48 } })
    }
  }
  await sweep('zh')
  await setLocale('en')
  await sweep('en')
  await setLocale('zh-CN')
  await page.evaluate(async () => {
    window.__reader.controller.patchSettings(c => ({ ...c, provider: 'svc-review01', services: [...c.services, { id: 'svc-review01', kind: 'openai-compat', name: 'OpenRouter · Claude Sonnet 5 (work acct)', baseURL: 'http://127.0.0.1:9/v1', apiKey: '', model: 'm', thinking: 'disabled' }] }))
    await new Promise(r => setTimeout(r, 800))
  })
  await sweep('long')
  check('the bar at every width, in both languages and with the longest service name: nothing drawn over another or past the window (the interface review)', bad.length === 0, bad.join(' | '))
  // below 500 px the download and the settings are the reading options' first rows
  await page.setViewportSize({ width: 400, height: 800 })
  await page.waitForTimeout(300)
  await page.click('header [aria-label="阅读选项"]')
  await page.waitForTimeout(400)
  const rows = await page.evaluate(() => [...document.querySelectorAll('.pop:popover-open .narrowest-only.row')].filter(r => r.getBoundingClientRect().height > 0).map(r => r.firstChild?.textContent))
  const firstFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  check('under 500 px: the download and the settings open from the reading options, which take the focus to the first of them', JSON.stringify(rows) === JSON.stringify(['下载', '设置']) && firstFocus === '下载', JSON.stringify({ rows, firstFocus }))
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    window.__reader.controller.patchSettings(c => ({ ...c, provider: 'microsoft', services: c.services.filter(s => s.id !== 'svc-review01') }))
    await new Promise(r => setTimeout(r, 600))
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
  check('the bar is the page\'s banner, not a toolbar it does not behave as', await page.evaluate(() => document.querySelector('header').getAttribute('role') === null))
  // the reading options put the focus in, at a width where their first rows are the highlight's
  await page.focus('header [aria-label="阅读选项"]')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const inside = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.press('Escape')
  check('the reading options take the focus to their first control that shows', inside === '对照高亮', String(inside))
  // a Tab out of an open menu closes it, and the focus goes on
  await page.locator('header').getByRole('button', { name: '缩放比例' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ open: [...document.querySelectorAll('.pop')].some(p => p.matches(':popover-open')), focus: document.activeElement?.getAttribute('aria-label') }))
  check('a Tab out of an open menu closes it, the focus going on to the next control', !after.open && after.focus === '放大', JSON.stringify(after))
  // every point of a control's drawn box is that control's (the zoom's three sit side by side)
  const stolen = await page.evaluate(() => {
    const out = []
    for (const b of document.querySelectorAll('header button, header a')) {
      const r = b.getBoundingClientRect()
      if (!r.width) continue
      for (let x = Math.ceil(r.left); x < Math.floor(r.right); x++) { const hit = document.elementFromPoint(x, r.top + r.height / 2)?.closest('header button, header a'); if (hit && hit !== b) { out.push(`${b.getAttribute('aria-label')} @${x}`); break } }
    }
    return out
  })
  check('every point of a control\'s drawn box is that control\'s: grown hit areas never overlap', stolen.length === 0, stolen.join(', '))
  // a press on an open popover's own button closes it: the button's click, not the focus it takes on mousedown (the
  // branch review: the press closed it and the click opened it again); a menu the reading options hold, likewise
  const shown = id => page.evaluate(i => !!document.getElementById(i)?.matches(':popover-open'), id)
  const zoomButton = page.locator('header').getByRole('button', { name: '缩放比例' })
  const zoomMenu = await zoomButton.getAttribute('popovertarget')
  await zoomButton.click(); await page.waitForTimeout(300)
  const zoomOpened = await shown(zoomMenu)
  await zoomButton.click(); await page.waitForTimeout(400)
  const zoomAfter = await shown(zoomMenu)
  await page.setViewportSize({ width: 800, height: 800 }); await page.waitForTimeout(300)
  const optionsButton = page.locator('header button[aria-label="阅读选项"]')
  await optionsButton.click(); await page.waitForTimeout(400)
  const inner = page.locator('#pop-options').getByRole('button', { name: '目标语言' })
  await inner.click(); await page.waitForTimeout(400)
  const innerOpened = await shown('pop-options-language')
  await inner.click(); await page.waitForTimeout(400)
  const innerAfter = { menu: await shown('pop-options-language'), options: await shown('pop-options') }
  await optionsButton.click(); await page.waitForTimeout(400)
  const optionsAfter = await shown('pop-options')
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300)
  check('a press on an open popover\'s own button closes it, the reading options\' menus too', zoomOpened && !zoomAfter && innerOpened && !innerAfter.menu && innerAfter.options && !optionsAfter, JSON.stringify({ zoomOpened, zoomAfter, innerOpened, innerAfter, optionsAfter }))
  // the zoom's value through its range: its button's width, and the − beside it, never move (better-typography: a
  // changing value shifts nothing; measured before, 60 → 63 px and 3.1 px at 99 % → 100 %)
  const across = []
  for (const s of [0.25, 0.83, 0.99, 1, 1.25, 4]) {
    await page.evaluate(v => window.__reader.controller.zoomTo(v), s)
    await page.waitForTimeout(400)
    across.push(await page.evaluate(() => { const v = document.querySelector('[data-zoom] .zoom-value'), m = document.querySelector('[data-zoom] > .tbtn:first-child'); return [v.querySelector('[data-value]').textContent, Math.round(v.getBoundingClientRect().width * 10) / 10, Math.round(m.getBoundingClientRect().left * 10) / 10] }))
  }
  await page.evaluate(() => window.__reader.controller.zoomTo('page-width'))
  check('the zoom\'s value from 25 % to 400 %: its button\'s width and the − beside it do not move (better-typography)', new Set(across.map(a => a[1])).size === 1 && new Set(across.map(a => a[2])).size === 1, JSON.stringify(across))
  // the focus rings are the keyboard's, in the ink, hugging a field (better-accessibility; the maintainer, 2026-09-26):
  // a click into the page's field or on the language menu shows the caret and the field's fill, no ring; Tab and the
  // arrows bring the rings back. Before, a click ringed the field and, in the menu, the search and its first option
  const look = sel => page.evaluate(s => { const e = document.querySelector(s), c = getComputedStyle(e); return { ring: c.outlineStyle === 'none' ? null : `${c.outlineWidth} +${c.outlineOffset} ${c.outlineColor}`, bg: c.backgroundColor } }, sel)
  const ink = await page.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--ink)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c })
  await page.mouse.move(320, 400); await page.mouse.wheel(0, 300); await page.waitForTimeout(300)
  await page.click('.pane[data-side="left"] .pill input'); await page.waitForTimeout(150)
  const pillClicked = await look('.pane[data-side="left"] .pill input')
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(150)
  const pillKeyed = await look('.pane[data-side="left"] .pill input')
  await page.keyboard.press('Escape'); await page.mouse.click(640, 400)
  await page.locator('header').getByRole('button', { name: '目标语言' }).click(); await page.waitForTimeout(400)
  const menuClicked = { search: await look('.pop:popover-open .search'), item: await look('.pop:popover-open .item[data-active]') }
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150)
  const menuKeyed = { search: await look('.pop:popover-open .search'), item: await look('.pop:popover-open .item[data-active]') }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  const rings = { ink, pillClicked, pillKeyed, menuClicked, menuKeyed }
  check('a click shows no ring, the keyboard does: in the ink, hugging a field (the maintainer, 2026-09-26)',
    !pillClicked.ring && pillClicked.bg !== 'rgba(0, 0, 0, 0)' && pillKeyed.ring === `2px +0px ${ink}` && !menuClicked.search.ring && !menuClicked.item.ring && menuKeyed.search.ring === `2px +0px ${ink}` && menuKeyed.item.ring?.endsWith(ink),
    JSON.stringify(rings))
  // a touch screen: no hover's look is left on a control once a tap has passed (the pointer 'hovers' there after it)
  const cdp = await page.context().newCDPSession(page)
  // touch emulation, which makes (hover: none) true; emulating the media feature alone did not reach the page
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  const swap = page.locator('header button[aria-label="交换左右"]')
  await swap.hover(); await page.waitForTimeout(250)
  const touched = await swap.evaluate(b => ({ pressed: b.getAttribute('aria-pressed'), bg: getComputedStyle(b).backgroundColor }))
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await page.mouse.move(700, 500)
  check('a touch screen: a control keeps no hover\'s look once the pointer is on it (the interface review)', touched.pressed === 'false' && /rgba\(0, 0, 0, 0\)|transparent/.test(touched.bg), JSON.stringify(touched))
  // forced colours: the chosen display, a pressed button and a switch that is on keep a mark of their own
  await patch(page, { pdfReader: { sync: true } })
  await page.waitForTimeout(400)
  await page.emulateMedia({ forcedColors: 'active' })
  await page.waitForTimeout(300)
  const forced = await page.evaluate(() => {
    const s = e => { const c = getComputedStyle(e); return [c.backgroundColor, c.borderTopStyle, c.borderTopColor, c.outlineStyle, c.color].join(' ') }
    const radios = [...document.querySelectorAll('.seg.display [role="radio"]')]
    const chosen = radios.find(r => r.getAttribute('aria-checked') === 'true'), other = radios.find(r => r.getAttribute('aria-checked') === 'false')
    return {
      segment: s(chosen) + ' / thumb ' + getComputedStyle(document.querySelector('.seg.display .thumb')).backgroundColor, otherSegment: s(other) + ' / well ' + getComputedStyle(document.querySelector('.seg.display')).backgroundColor,
      pressed: s(document.querySelector('header button[aria-label="同步滚动"]')), unpressed: s(document.querySelector('header button[aria-label="交换左右"]')),
    }
  })
  await page.click('header [aria-label="阅读选项"]')
  await page.waitForTimeout(400)
  // one switch off, so that both looks are there to compare; turned on again after
  const dim = page.locator('.pop:popover-open [role="switch"][aria-label="深色时调暗页面"]')
  await dim.click(); await page.waitForTimeout(400)
  const switches = await page.evaluate(() => [...document.querySelectorAll('.pop:popover-open [role="switch"]')].map(b => [b.getAttribute('aria-checked'), getComputedStyle(b).backgroundColor, getComputedStyle(b).borderTopStyle].join(' ')))
  await dim.click(); await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: join(out, 'review-forced-colors.png'), clip: { x: 0, y: 0, width: 1440, height: 48 } })
  await page.emulateMedia({ forcedColors: 'none' })
  const thumbDiffers = !forced.segment.endsWith(forced.otherSegment.split(' / well ')[1])
  check('forced colours: the chosen display, a pressed button and a switch that is on keep a mark of their own (the interface review)', thumbDiffers && forced.pressed !== forced.unpressed && new Set(switches.filter(x => x.startsWith('true')).map(x => x.slice(5))).size === 1 && !switches.filter(x => x.startsWith('false')).some(x => switches.find(y => y.startsWith('true'))?.slice(5) === x.slice(6)), JSON.stringify({ forced, switches }))
  // the contents: a row is its link, top to bottom
  await page.click('header [aria-label="目录"]')
  await page.waitForTimeout(500)
  const entry = await page.evaluate(() => { const e = document.querySelector('.toc .entry'), a = e.querySelector('a'); return { row: Math.round(e.getBoundingClientRect().height), link: Math.round(a.getBoundingClientRect().height) } })
  check('a contents row is its link from top to bottom: no dead band above and below', entry.link === entry.row, JSON.stringify(entry))
  await page.click('header [aria-label="目录"]')
  await page.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
