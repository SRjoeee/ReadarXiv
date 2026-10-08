// The reader's interface in a real browser (the reader's design §4–§8, §13), on a demo paper, grown task by task in Part
// 3 of plans/2026-09-25-reader-interface.md. Exits non-zero on a failure or a page error; screenshots in out/reader-ui/.
// Build first; the demo papers made (spikes/reader-papers.mjs).
//   node lab/pdf/spikes/reader-ui.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from '../../../tests/e2e/lib/extension.mjs'
import { openOptions, openSection } from '../../../tests/e2e/options-page.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-ui')
mkdirSync(out, { recursive: true })
const paper = '2608.02163'
const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-ui', demos: true, viewport: { width: 1440, height: 900 } })
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
  await patch(page, { theme: 'dark', pdfReader: { swapped: false, dimPages: true } })
  await page.waitForTimeout(600)
  const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, dim: document.documentElement.hasAttribute('data-axt-dim'), filter: getComputedStyle(document.querySelector('#left .page canvas')).filter, blend: (() => { window.__reader.debug.light(3); const b = document.querySelector('.axt-hl'); return b && getComputedStyle(b).mixBlendMode })() }))
  check('dark: the theme, the canvas inverted, the band screened', dark.theme === 'dark' && dark.dim && /invert/.test(dark.filter) && dark.blend === 'screen', JSON.stringify(dark))
  await shot(page, '13-dark-bilingual')
  await patch(page, { theme: 'system', pdfReader: { dimPages: true } })
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
      // the operator list a drawn page was drawn by, held on its proxy (the floats read it, session.mjs drawnList)
      drawnList: [...(pv.pdfPage?._intentStates?.values() ?? [])].some(st => st.displayReadyCapability && st.operatorList?.lastChunk && Array.isArray(st.operatorList.fnArray) && st.operatorList.fnArray.length > 0),
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
  // the one capsule of the extension and the website (Capsule.tsx): its words drawn in a cell hidden from assistive
  // technology, told whole in a line of its own, which names the group the keyboard stops at
  const shared = await page.evaluate(() => {
    const c = document.querySelector('.capsule[data-kind="narrow"]:not([data-out])'), cell = c?.querySelector('.words')
    if (!c || !cell) return null
    const lines = [...cell.querySelectorAll('.line')], told = document.getElementById(c.getAttribute('aria-labelledby') ?? '')
    return { height: c.getBoundingClientRect().height, hidden: cell.getAttribute('aria-hidden'), lines: lines.length, lineHeight: lines[0]?.getBoundingClientRect().height, drawn: cell.textContent, told: told?.textContent ?? null, toldApart: !!told && c.contains(told) && !cell.contains(told) }
  })
  const named = shared?.told ? await page.getByRole('group', { name: shared.told, exact: true }).count() : 0
  check('the shared capsule: one line, hidden words, named, 34 px', !!shared && shared.height === 34 && shared.hidden === 'true' && shared.lines === 1 && shared.lineHeight === 17 && shared.drawn === shared.told && shared.toldApart && named === 1, JSON.stringify({ shared, named }))
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

// the arXiv link's words on the bar's centre line (within 0.5 px), beside the title and alone, as the website also draws
// it: on the 16.8 px line it inherited, Chromium set them 0.91 px off when alone (the web's wave 2, Task 16)
{
  const page = await open({ mode: 'bilingual' })
  const off = () => page.evaluate(() => {
    const bar = document.querySelector('header.bar').getBoundingClientRect(), link = document.querySelector('.arxiv-id')
    const texts = [...link.childNodes].filter(n => n.nodeType === 3), range = document.createRange()
    range.setStart(texts[0], 0)
    range.setEnd(texts.at(-1), texts.at(-1).length)
    const rects = [...range.getClientRects()].filter(r => r.width > 0)
    return (Math.min(...rects.map(r => r.top)) + Math.max(...rects.map(r => r.bottom))) / 2 - (bar.top + bar.bottom) / 2
  })
  const beside = await off()
  await page.evaluate(() => { document.querySelector('.paper-title [data-title]').style.display = 'none' })
  const alone = await off()
  check('the arXiv link\'s words on the bar\'s centre line, beside the title and alone', Math.abs(beside) <= 0.5 && Math.abs(alone) <= 0.5, JSON.stringify({ beside, alone }))
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
    await patch(page, { theme: dark ? 'dark' : 'light' })
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
  await patch(page, { theme: 'system' })
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
  await patch(page, { theme: 'dark', pdfReader: { sync: true } })
  await page.waitForTimeout(700)
  const ratios = await page.evaluate(() => {
    const px = color => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a, b) => { const [x, y] = [lum(px(a)), lum(px(b))].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
    const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor
    return { thumb: ratio(bg('.seg .thumb'), bg('.seg')), pressed: ratio(bg('header .tbtn[aria-pressed="true"]'), bg('header')) }
  })
  check('dark: the chosen segment\'s thumb and a pressed button stand out from what they sit on', ratios.thumb >= 1.5 && ratios.pressed >= 1.15, JSON.stringify(ratios))
  await patch(page, { theme: 'system' })
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
  // the reading options' appearance: system, light, dark, as icons in equal thirds, the thumb on the chosen one; a
  // chosen swatch's line a step lighter than the focus's ring; a tooltip on an icon inside the popover; a theme's flip
  // with no element fading on its own (the maintainer, 2026-09-26: the words ran off the thumb, the pressed buttons flashed)
  await patch(page, { theme: 'system', pdfReader: { sync: true } })
  await page.waitForTimeout(500)
  await page.locator('header button[aria-label="阅读选项"]').click(); await page.waitForTimeout(400)
  const seg = await page.evaluate(() => {
    const radios = [...document.querySelectorAll('.pop:popover-open [aria-label="外观"] [role="radio"]')]
    const thumb = document.querySelector('.pop:popover-open [aria-label="外观"] .thumb').getBoundingClientRect()
    const chosen = radios.find(r => r.getAttribute('aria-checked') === 'true').getBoundingClientRect()
    const icon = radios.map(r => { const b = r.getBoundingClientRect(), i = r.querySelector('svg').getBoundingClientRect(); return Math.round((i.x + i.width / 2 - (b.x + b.width / 2)) * 10) / 10 })
    return { names: radios.map(r => r.getAttribute('aria-label')), widths: radios.map(r => Math.round(r.getBoundingClientRect().width * 10) / 10), thumbOff: Math.round(Math.abs(thumb.x - chosen.x) * 10) / 10, thumbWidth: Math.round(Math.abs(thumb.width - chosen.width) * 10) / 10, iconOff: icon }
  })
  check('the appearance: system, light, dark, in equal thirds, each icon centred, the thumb on the chosen one', JSON.stringify(seg.names) === JSON.stringify(['跟随系统', '浅色', '深色']) && new Set(seg.widths).size === 1 && seg.thumbOff <= 0.5 && seg.thumbWidth <= 0.5 && seg.iconOff.every(o => Math.abs(o) <= 0.5), JSON.stringify(seg))
  await page.locator('.pop:popover-open [role="radio"][aria-label="浅色"]').hover(); await page.waitForTimeout(700)
  const iconTip = await page.evaluate(() => [...document.querySelectorAll('.tip')].find(t => t.matches(':popover-open'))?.textContent ?? null)
  check('…its icons named in a tooltip, inside the popover', iconTip === '浅色', String(iconTip))
  const swatchRings = await page.evaluate(() => {
    const px = color => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const ratio = (a, b) => { const [x, y] = [lum(px(a)), lum(px(b))].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
    const chosen = getComputedStyle(document.querySelector('.pop:popover-open .swatch[aria-pressed="true"]')).outlineColor
    const focus = getComputedStyle(document.documentElement).getPropertyValue('--focus').trim(), chrome = getComputedStyle(document.querySelector('.pop:popover-open')).backgroundColor
    const token = n => { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c }
    return { chosen, focus: token('--focus'), chosenOnChrome: ratio(chosen, chrome), focusOnChrome: ratio(token('--focus'), chrome) }
  })
  check('…a chosen swatch\'s line apart from the focus\'s ring, and 3:1 on the popover', swatchRings.chosen !== swatchRings.focus && swatchRings.chosenOnChrome >= 3, JSON.stringify(swatchRings))
  // the pointer away first: with the icon's tooltip up, Escape closes the tooltip, the topmost, and leaves the options open
  await page.mouse.move(700, 600); await page.waitForTimeout(200)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // the appearance's thumb slides as the display switch's does, while the theme it picks snaps (the maintainer,
  // 2026-09-26: holding every transition for the flip had stopped the thumb too)
  await page.locator('header button[aria-label="阅读选项"]').click(); await page.waitForTimeout(400)
  const thumbAt = () => page.evaluate(() => { const t = document.querySelector('.pop:popover-open [aria-label="外观"] .thumb'), r = t.getBoundingClientRect(), p = t.parentElement.getBoundingClientRect(); return Math.round((r.x - p.x) * 10) / 10 })
  await page.locator('.pop:popover-open [role="radio"][aria-label="浅色"]').click(); await page.waitForTimeout(500)
  const from = await thumbAt()
  await page.locator('.pop:popover-open [role="radio"][aria-label="深色"]').click()
  const mid = await page.evaluate(() => new Promise(r => setTimeout(() => r(null), 60))).then(thumbAt)
  await page.waitForTimeout(500)
  const to = await thumbAt()
  await page.mouse.move(700, 600); await page.waitForTimeout(200)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check('the appearance\'s thumb slides to the one chosen, as the display switch\'s does, the theme snapping', to > from && mid > from && mid < to, JSON.stringify({ from, mid, to }))
  // the flip: the pressed sync button's fill is the new theme's at the next frame, not a fade toward it
  const bgNow = () => page.evaluate(() => getComputedStyle(document.querySelector('header button[aria-label="同步滚动"]')).backgroundColor)
  const flips = []
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => window.__reader.controller.patchSettings(c => ({ ...c, theme: t })), theme)
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme, { timeout: 5000 })
    const early = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(getComputedStyle(document.querySelector('header button[aria-label="同步滚动"]')).backgroundColor))))
    await page.waitForTimeout(600)
    flips.push({ theme, early, settled: await bgNow() })
  }
  check('a theme\'s flip: a pressed button\'s fill is the new one at the next frame, no fade of its own (better-ui)', flips.every(f => f.early === f.settled), JSON.stringify(flips))
  await patch(page, { theme: 'system' })
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

// ---------------------------------------------------------------- stage 5, Task 13: the open interface rows (#299)
// Controls are found by their place and their roles, not by the pack's words, which the unit tests hold (tests/pdf-reader/ui)
/** storage that does not answer until released (window.__release), as the first read of the settings meets it */
const HANG_STORAGE = `(() => {
  const area = chrome.storage.local, get = area.get.bind(area), held = []
  window.__hold = true
  area.get = (...args) => (window.__hold ? new Promise(resolve => held.push(() => resolve(get(...args)))) : get(...args))
  window.__release = () => { window.__hold = false; for (const go of held.splice(0)) go() }
})()`
const ofHost = (page, event) => page.evaluate(e => window.__reader.host.emit(e), event)
const OPTIONS_BUTTON = 'header button[aria-haspopup="dialog"]'

// D1: an address with no paper shows a card with a link to arXiv, and the phase leaves loading
{
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({}))
  await page.waitForSelector('.card a', { timeout: 15000 })
  await page.waitForTimeout(400)
  const s = await state(page)
  const card = await page.evaluate(() => {
    const c = document.querySelector('.card'), a = c.querySelector('a'), r = c.getBoundingClientRect(), d = document.querySelector('.doc').getBoundingClientRect()
    return { parent: c.parentElement.tagName, reason: c.querySelector('p').textContent, link: a.textContent, href: a.href, target: a.target, centre: [Math.round(r.x + r.width / 2 - (d.x + d.width / 2)), Math.round(r.y + r.height / 2 - (d.y + d.height * 0.42))], inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, translated: [...document.querySelectorAll('.seg.display [role="radio"]')].map(b => b.getAttribute('aria-disabled')) }
  })
  check('no paper: the phase leaves loading, and the reader is ready', s.phase === 'ready' && s.noPaper && (await page.evaluate(() => window.__reader.ready)), JSON.stringify({ phase: s.phase, noPaper: s.noPaper }))
  check('no paper: a card in the document area with a link to arXiv, centred, inside the window', card.parent === 'MAIN' && card.reason.length > 0 && card.href === 'https://arxiv.org/' && card.target === '_blank' && card.centre.every(v => Math.abs(v) <= 1) && card.inside, JSON.stringify(card))
  check('no paper: the translated displays are out of reach, the original is not', JSON.stringify(card.translated) === '[null,"true","true"]', JSON.stringify(card.translated))
  await shot(page, 's5-13-no-paper')
  await page.close()
}

// D1b (Devin on #329): with the saved display a translated one, an address with no paper still shows the original: no
// translated display is there to be had, and its radio was left selected, its pane's mate hidden
{
  const setup = await open({ mode: 'original' })
  const was = await setup.evaluate(() => { const c = window.__reader.controller.getState().settings; return { mode: c.mode, original: c.pdfReader.original } })
  await patch(setup, { mode: 'only', pdfReader: { original: false } })
  await setup.waitForTimeout(800)
  await setup.close()
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({}))
  await page.waitForSelector('.card a', { timeout: 15000 })
  await page.waitForTimeout(600)
  const shown = await page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-axt-pdf-mode'), state: window.__reader.controller.getState().display, checked: [...document.querySelectorAll('.seg.display [role="radio"]')].map(b => b.getAttribute('aria-checked')), left: getComputedStyle(document.querySelector('.pane[data-side="left"]')).display }))
  check('no paper, a translated display saved: the original is shown and selected, its pane not hidden', shown.mode === 'original' && shown.state === 'original' && JSON.stringify(shown.checked) === '["true","false","false"]' && shown.left !== 'none', JSON.stringify(shown))
  await page.close()
  const restore = await open({ mode: 'original' })
  await patch(restore, was)
  await restore.waitForTimeout(800)
  await restore.close()
}

// D3b (Devin on #329): an address with no paper and settings that do not answer: the note and its link stand beside the
// card, so that the greyed controls keep their reason
{
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.addInitScript(HANG_STORAGE)
  await page.goto(readerUrl({}), { waitUntil: 'commit' })
  await page.waitForSelector('.card a', { timeout: 15000 })
  await page.waitForSelector('.capsule[data-kind="unreadable"]:not([data-out])', { timeout: 10000 })
  const both = await page.evaluate(() => ({ card: document.querySelector('main .card p')?.textContent.length > 0, note: document.querySelector('.capsule[data-kind="unreadable"] a')?.href.endsWith('/options.html#reading/pdf'), greyed: [...document.querySelectorAll('header .menu-btn')].every(b => b.getAttribute('aria-disabled') === 'true') }))
  check('no paper, settings that do not answer: the card and the note with its link, the menus greyed', both.card && both.note && both.greyed, JSON.stringify(both))
  await page.evaluate(() => window.__release())
  await page.close()
}

// D6: a healthy read draws the chrome with the settings from its first frame, before the session (a heavy module) has loaded:
// the language and service menus are in reach, with their own values, the first time they are drawn
{
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({ paper, mode: 'bilingual' }), { waitUntil: 'commit' })
  await page.waitForSelector('header .menu-btn', { timeout: 15000 })
  const early = await page.evaluate(() => ({ menus: [...document.querySelectorAll('header .menu-btn')].map(b => [b.getAttribute('aria-disabled'), b.hasAttribute('popovertarget'), b.querySelector('[data-value]')?.textContent.length > 0]), sessionLoaded: window.__reader !== undefined, note: document.querySelector('.capsule[data-kind="unreadable"]') !== null }))
  check('the chrome is drawn from the first read of the settings: the menus in reach with their values at their first frame, no note', early.menus.length >= 2 && early.menus.every(m => m[0] === null && m[1] === true && m[2] === true) && !early.note, JSON.stringify(early))
  await page.close()
}

// D2a: a first read of the settings that does not answer is given 1,500 ms, then the defaults are painted with the note
// that they could not be read; the controls that write them are greyed with the reason; the bar does not move when the
// real settings come (P3-M16). The popup and the settings page are painted by then too (R100, P2)
{
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.addInitScript(HANG_STORAGE)
  const t0 = Date.now()
  await page.goto(readerUrl({ paper, mode: 'bilingual' }), { waitUntil: 'commit' })
  await page.waitForSelector('.capsule[data-kind="unreadable"]', { timeout: 10000 })
  const painted = Date.now() - t0
  await page.waitForTimeout(500)
  const geometry = () => page.evaluate(() => ({ trail: Math.round(document.querySelector('[data-zone="trail"]').getBoundingClientRect().left * 10) / 10, lead: Math.round(document.querySelector('[data-zone="lead"]').getBoundingClientRect().width * 10) / 10 }))
  const during = await geometry()
  const unread = await page.evaluate(() => {
    // the menus and swap, which write the settings; not sync, which a visit can apply without them (its write is refused)
    const need = [...document.querySelectorAll('header .menu-btn'), document.querySelector('header button[data-side-by-side]')]
    return { settings: document.querySelector('.capsule[data-kind="unreadable"]') !== null, disabled: need.map(b => b.getAttribute('aria-disabled')), opens: need.map(b => b.hasAttribute('popovertarget')), options: document.querySelector('header button[aria-haspopup="dialog"]')?.hasAttribute('popovertarget'), link: document.querySelector('.capsule[data-kind="unreadable"] a')?.href }
  })
  check('a first read that does not answer: the defaults and the note by 1,500 ms (+ the page\'s own start)', painted >= 1400 && painted < 3500, `${painted} ms`)
  check('…the controls that write the settings greyed and opening nothing, the reading options still opening, the note linking to the settings page', unread.settings && unread.disabled.length >= 3 && unread.disabled.every(v => v === 'true') && unread.opens.every(v => v === false) && unread.options === true && /options\.html#reading\/pdf$/.test(unread.link ?? ''), JSON.stringify(unread))
  // the tip of a greyed control says why
  await page.locator('header .menu-btn').first().hover()
  await page.waitForTimeout(800)
  const tip = await page.evaluate(() => { const t = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')); const r = t?.getBoundingClientRect(); return t && { text: t.textContent, kbd: t.querySelector('kbd')?.textContent, oneLine: r.height < 30, inside: r.left >= 0 && r.right <= innerWidth } })
  check('…and its tooltip names the reason', !!tip && !!tip.kbd && tip.oneLine && tip.inside, JSON.stringify(tip))
  await shot(page, 's5-13-unreadable')
  // the settings come at last: the note goes, the controls are in reach, and the bar moved by nothing
  await page.evaluate(() => window.__release())
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settingsUnreadable === false, null, { timeout: 90000 })
  await page.waitForTimeout(700)
  const after = await geometry()
  const back = await page.evaluate(() => ({ note: document.querySelector('.capsule[data-kind="unreadable"]:not([data-out])') !== null, disabled: [...document.querySelectorAll('header .menu-btn, header button[data-side-by-side]')].filter(b => b.getAttribute('aria-disabled') === 'true').length, opens: [...document.querySelectorAll('header .menu-btn')].every(b => b.hasAttribute('popovertarget')) }))
  check('…the real settings replace them: the note gone, the menus open again', !back.note && back.opens, JSON.stringify(back))
  check('…and the bar does not reflow when they come (defaults stood in their places)', Math.abs(during.trail - after.trail) <= 0.5 && Math.abs(during.lead - after.lead) <= 0.5, JSON.stringify({ during, after }))
  await page.close()
  // the other two pages meet the same silence and still paint
  for (const name of ['popup', 'options']) {
    const other = await context.newPage()
    await other.addInitScript(HANG_STORAGE)
    const t = Date.now()
    await other.goto(`chrome-extension://${id}/${name}.html`, { waitUntil: 'commit' })
    await other.waitForFunction(() => document.getElementById('root')?.childElementCount > 0 && document.documentElement.lang, null, { timeout: 10000 })
    check(`the ${name} page paints without the settings that do not answer`, true, `${Date.now() - t} ms`)
    await other.close()
  }
}

// a storage that never answers does not hold the PDF (Codex on #329): the session opens it on the defaults at once the
// page has given up, and the answer that comes at last is followed as a change of the settings, not dropped for being
// the first. A stored language that is not the defaults' tells the two apart
{
  const setup = await open({ mode: 'original' })
  const wasLanguage = await setup.evaluate(() => window.__reader.controller.getState().settings.targetLanguage)
  await patch(setup, { targetLanguage: wasLanguage === 'jpn' ? 'kor' : 'jpn' })
  await setup.waitForTimeout(800)
  const storedLanguage = await setup.evaluate(() => window.__reader.controller.getState().settings.targetLanguage)
  await setup.close()
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.addInitScript(HANG_STORAGE)
  await page.goto(readerUrl({ paper, mode: 'bilingual' }), { waitUntil: 'commit' })
  await page.waitForSelector('.capsule[data-kind="unreadable"]', { timeout: 10000 })
  const opened = await page.waitForFunction(() => window.__reader?.ready && window.__reader.controller.getState().sides.left.pages > 0, null, { timeout: 20000 }).then(() => true, () => false)
  const meanwhile = opened ? await page.evaluate(() => ({ pages: window.__reader.controller.getState().sides.left.pages, language: window.__reader.controller.getState().settings.targetLanguage, note: document.querySelector('.capsule[data-kind="unreadable"]:not([data-out])') !== null })) : null
  check('a storage that never answers: the PDF opens on the defaults, with the note still said', opened && meanwhile.pages > 0 && meanwhile.note && meanwhile.language !== storedLanguage, JSON.stringify(meanwhile))
  await page.evaluate(() => window.__release())
  await page.waitForFunction(() => window.__reader?.controller?.getState().settingsUnreadable === false, null, { timeout: 90000 })
  await page.waitForTimeout(700)
  const late = await page.evaluate(() => ({ language: window.__reader.controller.getState().settings.targetLanguage, button: [...document.querySelectorAll('header .menu-btn [data-value]')][0]?.getAttribute('lang') }))
  check('…and the late answer is followed: the stored language is the one in the state and on the bar', late.language === storedLanguage && !!late.button, JSON.stringify(late))
  await page.close()
  const unset = await open({ mode: 'original' })
  await patch(unset, { targetLanguage: wasLanguage })
  await unset.waitForTimeout(800)
  await unset.close()
}

// a storage that refuses its reads (an invalidated extension context): the note at once, and the PDF opens on the defaults
{
  const page = await context.newPage()
  // WXT's storage items read the store as they are defined and leave a refused read unhandled, on any page that has one
  // (the library's, not the reader's): the injected refusal is not counted, any other error is
  page.on('pageerror', e => { if (!/Extension context invalidated\./.test(e.message)) check('no page error', false, e.message) })
  await page.addInitScript(`(() => { chrome.storage.local.get = () => Promise.reject(new Error('Extension context invalidated.')) })()`)
  await page.goto(readerUrl({ paper, mode: 'bilingual' }), { waitUntil: 'commit' })
  await page.waitForSelector('.capsule[data-kind="unreadable"]', { timeout: 10000 })
  const opened = await page.waitForFunction(() => window.__reader?.ready && window.__reader.controller.getState().sides.left.pages > 0, null, { timeout: 20000 }).then(() => true, () => false)
  check('a storage that refuses its reads: the note, and the PDF open on the defaults', opened && (await page.evaluate(() => window.__reader.controller.getState().settingsUnreadable)))
  await page.close()
}

// D2b: a write storage refuses says so in the reader, in the settings page's sentence, until it is closed or a later write
// lands, and the control keeps its value
{
  const page = await open({ mode: 'bilingual' })
  await page.evaluate(() => { window.__set = chrome.storage.local.set; chrome.storage.local.set = () => Promise.reject(new Error('quota')) })
  await page.click(OPTIONS_BUTTON)
  await page.waitForTimeout(400)
  const images = page.locator('.pop [role="switch"]').nth(1)
  const was = await images.getAttribute('aria-checked')
  await images.click()
  await page.waitForSelector('.capsule[data-kind="saveFailed"]', { timeout: 5000 })
  const told = await page.evaluate(() => ({ refusals: window.__reader.controller.getState().refusals, text: document.querySelector('.capsule[data-kind="saveFailed"] .sr-only').textContent, close: document.querySelector('.capsule[data-kind="saveFailed"] .close') !== null }))
  await page.keyboard.press('Escape')
  check('a write refused: counted, the settings page\'s sentence in a capsule with a close', told.refusals === 1 && told.text.length > 0 && told.close, JSON.stringify(told))
  check('…the switch still shows the value stored', (await images.getAttribute('aria-checked')) === was)
  // the settings shown again (a pack that came, a read) are no write that went through (Devin on #329)
  await page.evaluate(() => { const s = window.__reader.controller.getState(); window.__reader.host.emit({ type: 'settings', config: s.settings, pack: s.pack }) })
  await page.waitForTimeout(400)
  check('…the settings shown again do not mend it', (await page.locator('.capsule[data-kind="saveFailed"]:not([data-out])').count()) === 1)
  await page.waitForTimeout(6500)
  check('…the error is not timed out: it stands 6.5 s later', (await page.locator('.capsule[data-kind="saveFailed"]:not([data-out])').count()) === 1)
  await page.locator('.capsule[data-kind="saveFailed"] .close').click()
  await page.waitForTimeout(500)
  check('…its close closes it', (await page.locator('.capsule:not([data-out])').count()) === 0)
  // refused again, then storage takes a write: the sentence goes with no word of its own
  await page.click(OPTIONS_BUTTON)
  await page.waitForTimeout(400)
  await images.click()
  await page.waitForSelector('.capsule[data-kind="saveFailed"]', { timeout: 5000 })
  await page.evaluate(() => { chrome.storage.local.set = window.__set })
  await images.click()
  await page.waitForFunction(() => !document.querySelector('.capsule[data-kind="saveFailed"]:not([data-out])'), null, { timeout: 5000 })
  check('…and a later write that lands mends it', (await page.evaluate(() => window.__reader.controller.getState().refusals)) === 2)
  await images.click()
  await page.keyboard.press('Escape')
  await page.close()
}

// D3: the page's heading at every width, the arXiv link's purpose, the landmarks, the contents' languages
{
  const page = await open({ mode: 'bilingual' })
  const h1 = () => page.evaluate(() => { const h = document.querySelector('h1'), r = h.getBoundingClientRect(); return { count: document.querySelectorAll('h1').length, w: Math.round(r.width), text: h.textContent.length, lead: Math.round(document.querySelector('[data-zone="lead"]').getBoundingClientRect().width) } })
  const wide = await h1()
  check('the title is the page\'s heading, drawn at 1440 px', wide.count === 1 && wide.w > 100 && wide.text > 10, JSON.stringify(wide))
  const seen = {}
  for (const w of [1300, 1250, 1200, 1150, 1100, 1050, 1000, 800, 500, 320]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(350)
    seen[w] = await h1()
  }
  const found = await page.getByRole('heading', { level: 1 }).count()
  check('…and in the page at every width, drawn or not: one heading in the accessibility tree at 320 px', found === 1 && Object.values(seen).every(x => x.count === 1), JSON.stringify(seen))
  const hiddenBelow = Object.entries(seen).filter(([, x]) => x.w <= 1).map(([w]) => Number(w)).sort((a, b) => b - a)[0]
  const drawnAbove = Object.entries(seen).filter(([, x]) => x.w > 1).map(([w]) => Number(w)).sort((a, b) => a - b)[0]
  console.log(`     the title leaves the eye between ${drawnAbove} px (drawn) and ${hiddenBelow} px (hidden)`)
  // the lead's room decides, not the window's width alone (a longer language or service name narrows it): the title is
  // drawn while the lead holds 320 px, which this bar (the Chinese pack, bilingual) reaches between 1,000 and 1,050 px
  check('…hidden to the eye once the lead is under 320 px: drawn at 1,050 px and above, hidden at 1,000 px and below', drawnAbove >= 1000 && drawnAbove <= 1150 && hiddenBelow < drawnAbove && seen[drawnAbove].lead >= 320 && seen[hiddenBelow].lead < 320, `${drawnAbove} / ${hiddenBelow}`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
  const names = await page.evaluate(() => {
    const a = document.querySelector('a[data-arxiv]'), ids = a.getAttribute('aria-labelledby').split(' ')
    return { name: ids.map(i => document.getElementById(i).textContent).join(' '), seen: a.textContent, banner: document.querySelectorAll('header').length, tipHidden: a.parentElement.querySelector('.tip').getAttribute('aria-hidden') }
  })
  check('the arXiv link\'s name starts with what is seen and says what it does', names.name.startsWith(names.seen) && names.name.length > names.seen.length + 4 && names.tipHidden === 'true', JSON.stringify(names))
  check('the toolbar is the page\'s banner and the document area its main', (await page.getByRole('banner').count()) === 1 && (await page.getByRole('main').count()) === 1)
  // the browser's own computation of the link's name (Playwright's role query): what is seen, then what it does
  check('the arXiv link is found by its name, what is seen first and then what it does', (await page.getByRole('link', { name: /^arXiv:2608\.02163\s.+/ }).count()) === 1 && (await page.getByRole('link', { name: 'arXiv:2608.02163', exact: true }).count()) === 0)
  // the contents: each title in the language it is in; the folds tipped
  await page.click('header button[aria-controls="axt-contents"]')
  await page.waitForTimeout(600)
  const langs = await page.evaluate(() => [...document.querySelectorAll('.toc .t')].map(t => t.getAttribute('lang')))
  check('the contents\' titles carry the language they are in: the target\'s tag, or the paper\'s for a heading not yet translated', langs.length > 0 && langs.every(l => l === 'zh' || l === 'en'), JSON.stringify(langs.slice(0, 6)))
  const fold = page.locator('.toc .fold:not(.leaf)').first()
  if (await fold.count()) {
    await fold.hover()
    await page.waitForTimeout(800)
    const t = await page.evaluate(() => { const f = document.querySelector('.toc .fold:not(.leaf)'), tip = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')), a = f.getBoundingClientRect(), b = tip?.getBoundingClientRect(); return tip && { text: tip.textContent, right: b.left >= a.right, midline: Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) } })
    check('a fold\'s tooltip says what a press does, to its right, on its midline (≤ 0.5 px)', !!t && t.text.length > 0 && t.right && t.midline <= 0.5, JSON.stringify(t))
  }
  await page.click('header button[aria-controls="axt-contents"]')
  await page.mouse.move(700, 500)
  // the pill's arrows: shown while the pane scrolls, their tooltips above them
  await page.evaluate(() => document.querySelector('#right').scrollBy(0, 40))
  await page.waitForTimeout(300)
  const arrow = page.locator('.pane[data-side="right"] .pill > button').first()
  await arrow.hover()
  await page.waitForTimeout(800)
  const pill = await page.evaluate(() => { const b = document.querySelector('.pane[data-side="right"] .pill > button'), tip = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')), a = b.getBoundingClientRect(), r = tip?.getBoundingClientRect(); return tip && { text: tip.textContent, above: r.bottom <= a.top, centre: Math.abs((r.left + r.right) / 2 - (a.left + a.right) / 2), inside: r.top >= 0 } })
  check('a page arrow\'s tooltip stands above it, centred on it (≤ 0.5 px)', !!pill && pill.text.length > 0 && pill.above && pill.centre <= 0.5 && pill.inside, JSON.stringify(pill))
  await shot(page, 's5-13-pill-tip')
  await page.close()
}

// the new notes in the narrowest window, in the longer pack: inside the window, their words whole, their chip and close in
{
  const setup = await open({ mode: 'original' })
  await patch(setup, { uiLanguage: 'en' })
  await setup.waitForTimeout(800)
  await setup.close()
  const page = await open({ mode: 'bilingual' }, { width: 320, height: 800 })
  const inside = () => page.evaluate(() => {
    const c = document.querySelector('.capsule:not([data-out])'), w = c?.querySelector('.words')
    if (!c || !w) return null
    const r = c.getBoundingClientRect(), t = w.getBoundingClientRect(), tail = [...c.querySelectorAll('.after > *')].map(e => e.getBoundingClientRect()).filter(x => x.width > 0)
    return { kind: c.dataset.kind, text: w.textContent, capsule: [r.left, r.right].map(Math.round), words: [t.left, t.right].map(Math.round), tail: tail.map(x => [x.left, x.right].map(Math.round)), vw: innerWidth, lines: w.querySelectorAll('.line').length }
  })
  const fits = x => !!x && x.capsule[0] >= 0 && x.capsule[1] <= x.vw && x.words[0] >= x.capsule[0] && x.words[1] <= x.capsule[1] && x.tail.every(t => t[0] >= x.capsule[0] && t[1] <= x.capsule[1])
  await ofHost(page, { type: 'notice', why: { kind: 'unknown' } })
  await page.waitForSelector('.capsule[data-kind="unreadable"]:not([data-out])')
  await page.waitForTimeout(700)
  const unreadable = await inside()
  check('the unreadable-settings note in the narrowest window, in English: inside the window, its words and its link inside it', fits(unreadable) && unreadable.kind === 'unreadable', JSON.stringify(unreadable))
  await shot(page, 's5-13-unreadable-320-en')
  await ofHost(page, { type: 'notice', why: null })
  await page.waitForTimeout(600)
  await ofHost(page, { type: 'refused' })
  await page.waitForSelector('.capsule[data-kind="saveFailed"]:not([data-out])')
  await page.waitForTimeout(700)
  const refused = await inside()
  check('the refused-write sentence in the narrowest window, in English: inside the window, its words and its close inside it', fits(refused) && refused.kind === 'saveFailed', JSON.stringify(refused))
  await shot(page, 's5-13-refused-320-en')
  await patch(page, { uiLanguage: 'auto' })
  await page.waitForTimeout(800)
  await page.close()
}

// D3/D4: the notices — a close's tooltip above it; each notice closed apart (#314)
{
  const page = await open({ mode: 'bilingual' })
  await ofHost(page, { type: 'fail', event: 'shown in part', text: '' })
  await ofHost(page, { type: 'note', event: 'shown cached', data: {}, got: 0, total: 0, lost: 2, again: false })
  await page.waitForSelector('.capsule[data-kind="partial"]:not([data-out])', { timeout: 5000 })
  await page.waitForTimeout(600)
  await shot(page, 's5-13-partial')
  await page.locator('.capsule[data-kind="partial"] .close').hover()
  await page.waitForTimeout(800)
  const close = await page.evaluate(() => { const b = document.querySelector('.capsule[data-kind="partial"] .close'), tip = [...document.querySelectorAll('.tip')].find(x => x.matches(':popover-open')), a = b.getBoundingClientRect(), r = tip?.getBoundingClientRect(); return tip && { text: tip.textContent, above: r.bottom <= a.top, centre: Math.abs((r.left + r.right) / 2 - (a.left + a.right) / 2), inside: r.top >= 0 && r.right <= innerWidth } })
  check('a notice\'s close: its tooltip above it, centred on it (≤ 0.5 px), inside the window', !!close && close.text.length > 0 && close.above && close.centre <= 0.5 && close.inside, JSON.stringify(close))
  await page.locator('.capsule[data-kind="partial"] .close').click()
  await page.waitForSelector('.capsule[data-kind="notice"]:not([data-out])', { timeout: 5000 })
  const counted = await page.evaluate(() => document.querySelector('.capsule[data-kind="notice"] .sr-only').textContent)
  check('closing the partial notice tells the count of failed passages it stood before (#314)', /2/.test(counted), counted)
  await page.locator('.capsule[data-kind="notice"] .close').click()
  await page.waitForTimeout(500)
  check('…whose close is its own', (await page.locator('.capsule:not([data-out])').count()) === 0)
  await page.close()
}

// D3: the narrow window's words: 5 s of being read, waiting while the pointer is over them (S-R-14)
{
  const page = await open({ mode: 'bilingual' }, { width: 800, height: 900 })
  const here = () => page.locator('.capsule[data-kind="narrow"]:not([data-out])').count()
  const t0 = Date.now()
  check('the narrow window\'s capsule is shown', (await here()) === 1)
  const box = await page.locator('.capsule[data-kind="narrow"]').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(6500)
  check('…it waits while the pointer is over it (6.5 s)', (await here()) === 1)
  await page.mouse.move(10, 300)
  const left = Date.now()
  await page.waitForFunction(() => !document.querySelector('.capsule[data-kind="narrow"]:not([data-out])'), null, { timeout: 8000 })
  const ran = Date.now() - left
  console.log(`     it ran out ${ran} ms after the pointer left (${Math.round((Date.now() - t0) / 100) / 10} s after it came)`)
  check('…and runs out the rest of its 5 s once the pointer leaves', ran > 800 && ran < 5500, `${ran} ms`)
  await page.close()
}

// D4: Escape turns an armed confirm back (R82), on the settings page
{
  const options = await openOptions(context, id)
  await openSection(options, 'data')
  const confirm = options.locator('.o-confirm').first()
  await confirm.click()
  await options.waitForTimeout(150)
  const armed = await confirm.getAttribute('data-armed')
  await options.keyboard.press('Escape')
  await options.waitForTimeout(150)
  check('Escape turns an armed confirm back at once', armed !== null && (await confirm.getAttribute('data-armed')) === null)
  await options.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
