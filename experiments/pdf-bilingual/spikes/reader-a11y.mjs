// The reader's accessibility audit (the reader's design, §13; Part 6, Task 45), in a real browser: axe on every state a
// static page never shows — each display, each menu open, the reading options, the contents, dark, narrow — on a demo
// paper; and on a live run, the failure card, the capsule of a language the reader cannot typeset, the greyed displays.
// What PDF.js draws inside its viewers (the pages' text layers, its annotation layers) is counted apart: the gate is
// no serious or critical violation in the reader's own interface. Beside it, the keyboard (Escape out of every menu,
// the focus back on its trigger) and reduced motion (nothing of ours moving for longer than 10 ms).
// Build first; the demo papers made (spikes/reader-papers.mjs); for the live part the TeX Live file server on :8070.
//   node experiments/pdf-bilingual/spikes/reader-a11y.mjs        AXT_LIVE=0: the demo paper alone
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions, setSwitch } from '../../../tests/e2e/options-page.mjs'

const REPO = new URL('../../../', import.meta.url).pathname
const { default: AxeBuilder } = await import(createRequire(REPO).resolve('@axe-core/playwright'))
const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-a11y')
mkdirSync(out, { recursive: true })
const paper = '2608.02163'
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }

/** Axe on the page as it is: the violations in the reader's own interface, and the count inside PDF.js's viewers */
async function audit(page, name) {
  // the pointer off the chrome: a tooltip caught fading in reads as low contrast (a tooltip shown is audited on its own)
  await page.mouse.move(720, 700)
  await page.waitForTimeout(300)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const ours = [], theirs = []
  for (const v of violations) {
    const inViewer = await Promise.all(v.nodes.map(n => page.evaluate(sel => { const el = document.querySelector(sel); return !!el?.closest('.pdfViewer') }, n.target.join(' ')).catch(() => false)))
    const mine = v.nodes.filter((n, i) => !inViewer[i])
    if (mine.length) ours.push({ id: v.id, impact: v.impact, nodes: mine.slice(0, 3).map(n => n.target.join(' ')), n: mine.length })
    if (mine.length < v.nodes.length) theirs.push(`${v.id}×${v.nodes.length - mine.length}`)
  }
  const serious = ours.filter(v => v.impact === 'serious' || v.impact === 'critical')
  check(`${name}: no serious or critical violation in the reader's interface`, serious.length === 0, JSON.stringify({ ours: ours.map(v => `${v.impact}:${v.id}×${v.n} ${v.nodes[0]}`), pdfjs: theirs }))
  return ours
}

// ---------------------------------------------------------------- the demo paper: displays, menus, dark, narrow
{
  const { context, readerUrl } = await launchWithReader({ profile: 'reader-a11y', demos: true, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', e => check('no page error', false, e.message))
  const open = async query => {
    await page.goto(readerUrl({ paper, ...query }))
    await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90_000 })
    await page.waitForTimeout(600)
  }
  const patch = change => page.evaluate(p => window.__reader.controller.patchSettings(c => {
    const next = { ...c }
    for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
    return next
  }), change)
  const popOpen = () => page.evaluate(() => !!document.querySelector('.pop:popover-open, [role="dialog"]:popover-open'))
  await open({ mode: 'bilingual' })
  for (const display of ['原文', '对照', '译文']) {
    await page.getByRole('radio', { name: display }).click()
    await page.waitForTimeout(500)
    await audit(page, `the display ${display}`)
  }
  await page.getByRole('radio', { name: '对照' }).click()
  // each menu, opened from the keyboard: audited open, closed by Escape with the focus back on its trigger
  for (const name of ['缩放比例', '目标语言', '翻译服务', '下载', '阅读选项']) {
    // the bar's own, named by its words and what it shows (WCAG 2.5.3); the reading options hold copies for a narrow window
    const trigger = page.locator(`[data-zone="trail"] > :is(button, a)[aria-label^="${name}"], [data-zoom] > button[aria-label^="${name}"]`)
    await trigger.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const opened = await popOpen()
    await audit(page, `the ${name} menu open`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const back = await page.evaluate(n => !!document.activeElement?.getAttribute('aria-label')?.startsWith(n), name)
    check(`the ${name} menu: opened from the keyboard, Escape closes it and the focus is back on its trigger`, opened && !(await popOpen()) && back)
  }
  // a tooltip, shown in full: hovered, past its delay and its fade
  await page.getByRole('button', { name: '放大' }).hover()
  await page.waitForTimeout(1200)
  {
    const { violations } = await new AxeBuilder({ page }).include('.tip').analyze()
    const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    check('a tooltip shown: no serious or critical violation', serious.length === 0, JSON.stringify(serious.map(v => `${v.id}: ${v.nodes[0]?.failureSummary?.slice(0, 160)}`)))
  }
  await page.getByRole('button', { name: '目录' }).click()
  await page.waitForTimeout(500)
  await audit(page, 'the contents open')
  await page.getByRole('button', { name: '目录' }).click()
  await patch({ pdfReader: { appearance: 'dark', dimPages: true } })
  await page.waitForTimeout(700)
  await audit(page, 'dark')
  await page.screenshot({ path: join(out, 'dark.png') })
  await patch({ pdfReader: { appearance: 'system' } })
  await page.setViewportSize({ width: 760, height: 900 })
  await page.waitForTimeout(800)
  await audit(page, 'narrow, the capsule saying so')
  await page.setViewportSize({ width: 1440, height: 900 })
  // reduced motion, set before the page loads as a reader's system has it: every movement of ours a fade or nothing
  // (the design, §4.2) — a fade may stay, and the scroll indicators' thumbs, which follow the scroll, are no motion.
  // Watched while a menu, the reading options and the contents open and close, and the display changes; and every
  // transition declared, pseudo-elements' too
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open({ mode: 'bilingual' })
  const moving = await page.evaluate(async () => {
    const MOTION = /^(transform|translate|scale|rotate|left|top|right|bottom|inset|width|height|margin)/
    const long = new Set()
    const name = el => `${el?.tagName?.toLowerCase?.() ?? '?'}.${el?.className?.toString?.().split(' ')[0] ?? ''}`
    const watch = () => {
      for (const a of document.getAnimations()) {
        const el = a.effect?.target
        if (el?.closest?.('.pdfViewer') || !(a.timeline instanceof DocumentTimeline)) continue
        const moves = (a.effect?.getKeyframes?.() ?? []).some(k => Object.keys(k).some(p => MOTION.test(p))) || (a.transitionProperty && MOTION.test(a.transitionProperty))
        if (moves && (Number(a.effect.getTiming().duration) || 0) > 10) long.add(`${name(el)}:${a.transitionProperty ?? a.animationName}`)
      }
    }
    const press = async label => { document.querySelector(`button[aria-label="${label}"]`)?.click(); await new Promise(r => setTimeout(r, 60)); watch(); document.querySelector(`button[aria-label="${label}"]`)?.click(); await new Promise(r => setTimeout(r, 60)); watch() }
    await press('阅读选项')
    await press('目录')
    document.querySelector('[role="radio"][aria-label="译文"]')?.click(); await new Promise(r => setTimeout(r, 60)); watch()
    const secs = v => v.split(',').map(x => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000) || 0)
    const css = new Set()
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.pdfViewer')) continue
      for (const pseudo of [null, '::before', '::after']) {
        const s = getComputedStyle(el, pseudo), props = s.transitionProperty.split(',').map(x => x.trim()), durs = secs(s.transitionDuration)
        props.forEach((p, i) => { if ((p === 'all' || MOTION.test(p)) && (durs[i] ?? durs[0]) > 10 && (pseudo === null || s.content !== 'none')) css.add(`${name(el)}${pseudo ?? ''}:${p}`) })
      }
    }
    return { animations: [...long], transitions: [...css].slice(0, 12) }
  })
  check('reduced motion: every movement of the reader\'s a fade or nothing', moving.animations.length === 0 && moving.transitions.length === 0, JSON.stringify(moving))
  await context.close()
}

// ---------------------------------------------------------------- a live run: the capsule, the greyed displays, the card
// (AXT_LIVE=0 leaves it out)
if (process.env.AXT_LIVE !== '0') {
  const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
  const site = await serveSite()
  const corpus = await serve((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
    try {
      const body = readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))
      res.setHeader('ETag', `"sha256:${createHash('sha256').update(body).digest('hex')}"`)
      res.end(body)
    } catch { res.statusCode = 404; res.end() }
  })
  const extension = join(root, 'data/ext-reader-a11y')
  copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*', 'https://example.invalid/*'] })
  const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-a11y-live', extension, viewport: { width: 1440, height: 900 } })
  const at = `http://127.0.0.1:${corpus.address().port}`
  const urlOf = mode => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
  const page = await context.newPage()
  const until = (test, timeout = 180_000) => page.waitForFunction(test, null, { timeout, polling: 200 }).then(() => true, () => false)
  const visit = async mode => { await page.goto(urlOf(mode)); await until(() => window.__reader?.controller?.getState().settings) }
  const patch = change => page.evaluate(p => window.__reader.controller.patchSettings(c => ({ ...c, ...p })), change)
  await visit('bilingual')
  await patch({ targetLanguage: 'arb' })
  await page.waitForTimeout(800)
  await visit('bilingual')
  check('a language the reader cannot typeset: reached', await until(() => window.__reader.controller.getState().languageSupported === false))
  await page.waitForTimeout(800)
  await audit(page, 'a language the reader cannot typeset: the capsule, the greyed displays')
  await patch({ targetLanguage: 'cmn' })
  await page.waitForTimeout(800)
  const options = await openOptions(context, id)
  await addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' })
  await setSwitch(options, '出问题时自动改用免费服务', false)
  await page.bringToFront()
  await page.evaluate(() => window.__reader.debug?.pdfCache?.clear())
  await visit('translation')
  check('nothing translated: the card, reached', await until(() => window.__reader.controller.getState().phase === 'failed'))
  await page.waitForTimeout(600)
  await audit(page, 'the failure card')
  await page.screenshot({ path: join(out, 'card.png') })
  await context.close(); site.close(); corpus.close()
}

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
