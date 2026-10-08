// A side read before the pair is located (the website's early-scroll defect, readarxiv-web PR #23, in the shared
// reader): the sync follows nothing until both sides are anchored (syncFrom, alignTop and arm go by the anchors), so a
// scroll whose every step and whose rest came before that had nothing to level the pair by, and the pair stood apart
// until the next scroll's rest. Once located, the pair is levelled by the side read, as at a rest (session.mjs
// levelLocated), by the side of the reader's last input (a wheel, a touch, a key, a press, the page pill, the contents;
// never a hover) that scrolled. The reader in the extension, live, in bilingual; rows 1–3 and 8 with the follower on the
// compositor and by script, the rest on the compositor, where a hover makes a side the driver:
//   1. a first visit, the source held back 3 s (the right shows the original until the source is read and both sides
//      are anchored by it): the right read in the frame after its first page is drawn — a wheel event, which makes it
//      the side read, then 0.3 of its range —, then the left so;
//   2. the same visit, a side read by the wheel itself, five turns, its scroll and its rest over before the pair is
//      located: the right; then the left, the pointer then moved over the right (on the compositor a pointer moved over
//      a side binds the follower to it ahead of its scroll: the side read is still the one scrolled);
//   3. this machine's copy, nothing held back (the demo paper's translation and units, every unit kept, so current
//      under any service; no marks kept: the right's are read from its PDF after its pages show, as a copy stored without
//      them is): the right read in the frame after its first page is drawn, then the left;
//   4. the same copy on a machine four times slower (the CPU throttled), where the copy opens a second or more after
//      the original's first page: the left read in the frame after its own first page is drawn, the pointer moved over
//      the right once the scroll's rest has passed, before the copy opens (compositor only: by script a pointer moved
//      takes no side). The copy opens where the left is read (readAt): PDF.js's scroll there is the reader's own put,
//      not the side read, though the right is the driver by then;
//   5. a first visit, the source late: the left read by the wheel, then the right, the pointer then over the left (the
//      driver, by a hover), then the toolbar's zoom (compositor). PDF.js scrolls the left by itself to keep its place:
//      only a scroll of the side of the reader's last input is the reader's, and the right, read last, stays;
//   6. this machine's copy, no input at all, the pointer resting over the left from the start (compositor): PDF.js lays
//      the original's pages out a margin down by itself (0 to 14 px); nothing is noted as read (the harness's
//      lastLocated), and nothing moves once the pair is located;
//   7. a guard: this machine's copy located, the right read, the pointer then over the left, then a swap (compositor).
//      The website's swap levelled the incoming right by the driver, and a hover threw the right back (3,745 to 12 px);
//      this one keeps the right's own place (replaceRight: placeOf, scrollFor), which the row holds;
//   8. a first visit, the source late, a side's page pill, which scrolls its pane with no event on the pane (goToPage):
//      alone, its page typed then Enter, and after a wheel on the other side, its next button pressed three times; on
//      either side, by script and on the compositor. The side the pill moved is the side read;
//   9. this machine's copy located, a side read by the wheel (the driver), then the other side's page pill, page 8
//      typed, by script and on the compositor: the side the pill moved becomes the driver (goToPage), stays where the
//      jump put it, and the other side follows to its matching place, within 2 px of level;
//  10. the probes' Current mode (?sync=current, which the interface does not offer: the other side settled at the
//      reading line's place after a scroll): a first visit, the source late, either side read early, as in row 1; once
//      located, the other side is settled by it (both sides the original: level is the same place).
// Rows 1–5, 8 and 10 pass when the side was read before the pair was located, and once located and still for 700 ms: the side
// read stands where the reader put it, and the pair is within 2 px of level by it (the sync's own tolerance,
// level-on-screen.mjs). No TeX page is needed (a first visit stops at its compile, after its row is read), and nothing
// leaves this machine: every request off it is stopped, and named at the end.
// Build first (`pnpm build`); the paper in data/corpus, and its demo (poc-reader/papers, spikes/reader-papers.mjs) for
// the copy. Exits non-zero on a FAIL.
//   node lab/pdf/spikes/early-scroll.mjs [id]      BUILD=<dir> another build; LATE=<ms> the source's delay;
//   ONLY=<rows' numbers, by commas> those rows alone
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD, launchWithReader } from '../../../tests/e2e/lib/extension.mjs'

const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.02163'
const extension = process.env.BUILD ?? BUILD
// the source's answer held back this long on a first visit (LATE=<ms> another): the pair is located after it
const SOURCE_LATE = Number(process.env.LATE ?? 3000)
// where a side is read, a share of its range: on 2608.02163, a page with prose to level by (0.4 is a page of figures)
const SHARE = 0.3
// (the pipeline's in versions.mjs, which live.mjs re-exports; the typesetting's in live.mjs)
const [PIPELINE, TYPESETTING] = [['pipeline/versions.mjs', 'PIPELINE_VERSION'], ['pipeline/live.mjs', 'TYPESETTING_VERSION']].map(([file, name]) => readFileSync(join(root, '../../src/pdf-reader/engine', file), 'utf8').match(new RegExp(`export const ${name} = '([^']+)'`))[1])
// ONLY=<rows' numbers, by commas> runs those alone
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null
const wanted = n => !only || only.includes(n)
let failed = 0, ran = 0
const row = (ok, name, detail) => { ran++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); if (!ok) failed++ }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// arXiv's two paths, /src/<id> and /pdf/<id>, from the corpus, the source `late` ms late; /demo/<id>/<file>, the demo's
let late = 0
const corpus = await new Promise(r => {
  const s = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const path = decodeURIComponent(req.url.split('?')[0])
    const [, kind, id] = path.match(/^\/(src|pdf)\/(.+)$/) ?? []
    const demo = path.match(/^\/demo\/([^/]+)\/(translation\.pdf|units\.json)$/)
    let body
    try { body = readFileSync(demo ? join(root, 'poc-reader/papers', demo[1], demo[2]) : join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf')) } catch { res.statusCode = 404; res.end(); return }
    setTimeout(() => res.end(body), kind === 'src' ? late : 0)
  }).listen(0, '127.0.0.1', () => r(s))
})
const at = `http://127.0.0.1:${corpus.address().port}`
const { context, readerUrl } = await launchWithReader({ profile: 'early-scroll', extension, viewport: { width: 1440, height: 900 } })
// the TeX page's address is the corpus's, which has none: a first visit stops at its compile
const away = []
await context.route(url => !/^(chrome-extension:|data:|blob:|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(url.href), r => { away.push(r.request().url()); return r.abort() })
const urlOf = (compositor, sync = null) => readerUrl({ paper, live: '1', mode: 'bilingual', site: at, endpoint: at, src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}`, ...(compositor ? {} : { compositor: '0' }), ...(sync ? { sync } : {}) })

/** in the page before its own code: `side` read in the frame after a first page is drawn (`first`: the right's, or the
 *  left's) — a wheel event, then `share` of its range —, or, with no share, only the time of that frame; the pointer then
 *  moved over `pointerTo`. Where the side was put, whether the pair was located then, and whether the right was open
 *  when the pointer came over it */
function readEarly([side, share, first, pointerTo]) {
  const early = { side, top: null, located: null, at: null, rightOpen: null }
  window.__early = early
  const watch = () => {
    if (window.__reader?.timing?.[first] == null) return requestAnimationFrame(watch)
    early.at = performance.now() - window.__reader.live.t0
    if (share == null) return
    const c = document.getElementById(side)
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true }))
    c.scrollTop = share * (c.scrollHeight - c.clientHeight)
    Object.assign(early, { top: c.scrollTop, located: !!window.__reader.ready })
    if (!pointerTo) return
    // once the scroll has ended and its rest has passed (scrollend, then 150 ms): a pointer moved over a side then makes
    // it the driver (the session's pointermove)
    c.addEventListener('scrollend', () => setTimeout(() => {
      const el = document.getElementById(pointerTo), to = el.getBoundingClientRect()
      for (let i = 1; i <= 4; i++) el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: to.left + to.width * 0.2 * i, clientY: to.top + to.height / 2 }))
      early.rightOpen = document.querySelectorAll('#right .page').length > 0
      early.pointerAt = performance.now() - window.__reader.live.t0
    }, 200), { once: true })
  }
  requestAnimationFrame(watch)
}
/** in the page before its own code: where both sides are shown in the first frame after the pair is located, before
 *  anything levels it (levelLocated's frame comes after this one's, asked for later) */
function noteLocate() {
  const watch = () => {
    const d = window.__reader?.ready ? window.__reader.debug : null
    if (!d?.left.anchors.size || !d.right.anchors.size) return requestAnimationFrame(watch)
    window.__atLocate = { left: d.shownAt(d.left), right: d.shownAt(d.right) }
  }
  requestAnimationFrame(watch)
}
/** where both sides are shown once both have been still for 700 ms */
async function still(page) {
  let last = null, n = 0
  for (let i = 0; i < 100 && n < 7; i++) {
    await sleep(100)
    const now = await page.evaluate(() => { const d = window.__reader.debug; return [d.shownAt(d.left), d.shownAt(d.right)] })
    n = last && Math.abs(now[0] - last[0]) < 0.5 && Math.abs(now[1] - last[1]) < 0.5 ? n + 1 : 0
    last = now
  }
  return last
}
/** a visit, `side` read early in the frame after the right's first page, or by the wheel (`wheel`, after `before` read
 *  so), the pointer then moved over `pointerTo`, then a zoom (`zoom`): once the pair is located and both sides still for 700 ms, where the side
 *  read stands against where the reader put it (after the zoom), and how far the pair is from level by it */
async function visit(side, compositor, { wheel = false, pill = null, pointerTo = null, zoom = false, before = null, first = 'rightFirstPage', slower = 0, sync = null } = {}) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  if (slower) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slower })
  await page.addInitScript(readEarly, [side, wheel || pill ? null : SHARE, first, wheel || pill ? null : pointerTo])
  await page.goto(urlOf(compositor, sync))
  if (wheel || pill) {
    await page.waitForFunction(() => window.__early?.at != null, null, { timeout: 60_000, polling: 'raf' })
    if (before) {
      const b = await page.locator(`#${before}`).boundingBox()
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5)
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 400); await sleep(60) }
      await sleep(400)
    }
    if (pill === 'typed') {
      // the side's page pill, by the keyboard: its page typed, then Enter (the pill shows while focused)
      const field = page.locator(`section.pane[data-side="${side}"] .pill input`)
      await field.fill('5')
      await field.press('Enter')
    } else if (pill === 'next') {
      // the side's page pill, by the pointer: focused, which shows it, then its next button pressed three times
      await page.locator(`section.pane[data-side="${side}"] .pill input`).focus()
      for (let i = 0; i < 3; i++) { await page.locator(`section.pane[data-side="${side}"] .pill button`).nth(1).click(); await sleep(150) }
    } else {
      const box = await page.locator(`#${side}`).boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
      for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 400); await sleep(60) }
    }
    // the scroll and its rest over (scrollend, then 150 ms), before the pair is located
    await sleep(400)
    if (pointerTo) {
      const to = await page.locator(`#${pointerTo}`).boundingBox()
      for (let i = 1; i <= 4; i++) { await page.mouse.move(to.x + to.width * 0.2 * i, to.y + to.height * 0.5); await sleep(20) }
    }
    // the toolbar's zoom (its buttons call the session's zoomBy): PDF.js scrolls each side by itself to keep its place
    if (zoom) { await page.evaluate(() => window.__reader.session.zoomBy(1.1)); await sleep(400) }
    await page.evaluate(side => Object.assign(window.__early, { top: document.getElementById(side).scrollTop, located: !!window.__reader.ready, at: performance.now() - window.__reader.live.t0 }), side)
  }
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug?.left.anchors.size && window.__reader.debug.right.anchors.size && window.__early?.top !== null, null, { timeout: 60_000, polling: 50 })
  let last = null, still = 0
  for (let i = 0; i < 100 && still < 7; i++) {
    await sleep(100)
    const now = await page.evaluate(() => { const d = window.__reader.debug; return `${Math.round(d.shownAt(d.left))},${Math.round(d.shownAt(d.right))}` })
    still = now === last ? still + 1 : 0
    last = now
  }
  const end = await page.evaluate(() => {
    const d = window.__reader.debug, e = window.__early, s = e.side === 'left' ? d.left : d.right
    const anchored = window.__reader.live.events.filter(x => /anchored$/.test(x.event)).map(x => x.t)
    return { ...e, now: s.container.scrollTop, level: d.levelOf(s)?.error ?? null, locatedAt: Math.max(...anchored), shownCached: window.__reader.live.events.some(x => x.event === 'shown cached') }
  })
  await page.close()
  return { ...end, errors }
}
const show = e => `read at ${Math.round(e.top)} px ${Math.round(e.locatedAt - e.at)} ms before the pair was located (${e.located ? 'already located' : 'not yet'}), now at ${Math.round(e.now)}; ${e.level == null ? 'no unit to level by' : `${e.level.toFixed(1)} px from level`}${e.errors.length ? `; page errors: ${e.errors.slice(0, 2).join(' | ')}` : ''}`
const passes = e => e.located === false && Math.abs(e.now - e.top) <= 1 && e.level != null && Math.abs(e.level) <= 2 && !e.errors.length
const followers = [[true, 'compositor'], [false, 'script']]

// 1–2: a first visit, the source late
late = SOURCE_LATE
for (const [compositor, by] of followers) {
  if (wanted(1)) for (const side of ['right', 'left']) { const e = await visit(side, compositor); row(passes(e), `1. a first visit, the source late, the ${side} read early (${by})`, show(e)) }
  if (wanted(2)) for (const [side, pointerTo] of [['right', null], ['left', 'right']]) {
    const e = await visit(side, compositor, { wheel: true, pointerTo })
    row(passes(e) && e.top > 0, `2. a first visit, the source late, the ${side} read by the wheel, its rest before the pair is located${pointerTo ? `, the pointer then over the ${pointerTo}` : ''} (${by})`, show(e))
  }
}
// 5: the left read by the wheel, then the right, the pointer then over the left (the driver, by a hover), then the
// toolbar's zoom, all before the pair is located: PDF.js's own scroll of the left, which keeps its place, is not the
// reader's, and the right, read last, stays where it was read
if (wanted(5)) {
  const e = await visit('right', true, { wheel: true, before: 'left', pointerTo: 'left', zoom: true })
  row(passes(e) && e.top > 0, '5. a first visit, the source late, the left then the right read by the wheel, the pointer then over the left, then a zoom, before the pair is located (compositor)', show(e))
}

// 8: the page pill, which scrolls its pane with no event on the pane: a side's pill alone (its page typed, then Enter),
// and a side's pill (its next button) after a wheel on the other side, all before the pair is located; the side the
// pill moved is the side read
if (wanted(8)) {
  for (const [compositor, by] of followers) {
    for (const side of ['left', 'right']) {
      const other = side === 'left' ? 'right' : 'left'
      const alone = await visit(side, compositor, { pill: 'typed' })
      row(passes(alone) && alone.top > 0, `8. a first visit, the source late, the ${side}'s page pill alone, a page typed (${by})`, show(alone))
      const after = await visit(side, compositor, { pill: 'next', before: other })
      row(passes(after) && after.top > 0, `8. a first visit, the source late, a wheel on the ${other}, then the ${side}'s page pill, its next button (${by})`, show(after))
    }
  }
}

// 10: the probes' Current mode (?sync=current: the other side put at the reading line's place, by a settle after the
// scroll): a side read early, on a first visit with the source late; once located, the other side is settled by it
if (wanted(10)) {
  for (const side of ['right', 'left']) {
    const e = await visit(side, false, { sync: 'current' })
    row(passes(e), `10. a first visit, the source late, the ${side} read early, Current mode`, show(e))
  }
}

// the copy row 3 opens: the demo's translation, its units with their translations as pieces (cache.mjs copyTexts makes
// the right's texts from them), every unit kept (current under any service), written from a first visit's page, which
// has the paper's cache key
const writer = [3, 4, 6, 7, 9].some(wanted) ? await context.newPage() : null
await writer?.goto(urlOf(true))
await writer?.waitForFunction(() => window.__reader?.ready && window.__reader.debug, null, { timeout: 60_000, polling: 50 })
const copied = writer && await writer.evaluate(async ({ paper, demo, pipeline, typesetting }) => {
  const d = window.__reader.debug, key = d.cacheKey()
  if (!key) return false
  const [pdf, demoUnits] = await Promise.all([fetch(`${demo}/translation.pdf`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)), fetch(`${demo}/units.json`).then(r => r.json())])
  const units = demoUnits.map(u => ({ kind: u.kind, src: u.src, hash: '', state: 'kept', ...(u.tr ? { tr: u.tr, pieces: [{ t: 'text', tr: true, s: u.tr }] } : {}) }))
  const record = { digest: key.digest, lang: key.lang, paper, engine: 'early-scroll', format: 'markers', pipeline, typesetting, context: {}, units, marks: [], rightMarks: [], figures: [] }
  return d.pdfCache.put({ ...record, pdf }, { identity: 'early-scroll', pipeline, typesetting })
}, { paper, demo: `${at}/demo/${paper}`, pipeline: PIPELINE, typesetting: TYPESETTING })
await writer?.close()

// 3: this machine's copy
late = 0
if (writer && !copied) row(false, '3. a copy written', 'the reader had no cache key, or the store refused the copy')
if (copied && wanted(3)) {
  for (const [compositor, by] of followers) {
    for (const side of ['right', 'left']) {
      const e = await visit(side, compositor)
      row(e.shownCached && passes(e), `3. this machine's copy, the ${side} read early (${by})`, `${e.shownCached ? '' : 'no copy shown; '}${show(e)}`)
    }
  }
}
if (copied && wanted(4)) {
  const e = await visit('left', true, { first: 'leftFirstPage', pointerTo: 'right', slower: 4 })
  row(e.shownCached && e.rightOpen === false && passes(e), "4. this machine's copy, the left read before the copy opens, the pointer then over the right (compositor)", `${e.shownCached ? '' : 'no copy shown; '}${e.rightOpen ? 'the copy already open; ' : ''}${show(e)}`)
}
// 6: no input at all, the pointer resting over the left from the start (on the compositor a pointer moved over a side
// makes it the driver): PDF.js's own scrolls of a side (its pages laid out, the copy put where the original is read) are
// not the reader's, and once the pair is located nothing moves
if (copied && wanted(6)) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(noteLocate)
  await page.goto(urlOf(true), { waitUntil: 'commit' })
  const box = { x: 1440 * 0.25, y: 900 * 0.5 }
  for (let i = 0; !(await page.evaluate(() => !!window.__atLocate).catch(() => false)) && i < 600; i++) { await page.mouse.move(box.x + (i % 2), box.y); await sleep(30) }
  const end = await still(page)
  const at = await page.evaluate(() => window.__atLocate)
  // what the locate levelled by (the harness's lastLocated): nothing, with no input; undefined where the build has no such record
  const by = await page.evaluate(() => window.__reader.debug.lastLocated)
  const moved = at ? [end[0] - at.left, end[1] - at.right].map(x => Math.round(x * 10) / 10) : null
  row(!!at && by === null && moved.every(x => Math.abs(x) <= 1) && !errors.length, "6. this machine's copy, no input, the pointer resting over the left from the start (compositor): once located, nothing noted as read and nothing moves", at ? `levelled by ${by === undefined ? '(no record in this build)' : by ?? 'nothing'}; at the locate left ${Math.round(at.left)}, right ${Math.round(at.right)}; moved since ${moved.join(' / ')} px${errors.length ? `; page errors: ${errors.slice(0, 2).join(' | ')}` : ''}` : 'never located')
  await page.close()
}

// 7: a swap while the right is read and the pointer rests on the left (the website's standing() levelled the incoming
// right by the driver, and a hover had made the left the driver: the right thrown from 3,745 to 12 px). Here the swap
// keeps the right's own place (replaceRight: placeOf, scrollFor)
if (copied && wanted(7)) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(urlOf(true))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug?.right.anchors.size, null, { timeout: 60_000, polling: 50 })
  await still(page)
  const r = await page.locator('#right').boundingBox(), l = await page.locator('#left').boundingBox()
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 600); await sleep(60) }
  await still(page)
  // the pointer over the left after the rest: the left is the driver, by a hover
  for (let i = 1; i <= 4; i++) { await page.mouse.move(l.x + l.width * 0.2 * i, l.y + l.height / 2); await sleep(30) }
  const before = await page.evaluate(() => window.__reader.debug.right.container.scrollTop)
  const swap = await page.evaluate(() => window.__reader.debug.swapRight(1500))
  await still(page)
  const after = await page.evaluate(() => { const d = window.__reader.debug; return { top: d.right.container.scrollTop, level: d.levelOf(d.right)?.error ?? null } })
  row(Math.abs(after.top - before) <= 1 && after.level != null && Math.abs(after.level) <= 2 && !swap.error && !errors.length, "7. this machine's copy, the right read, the pointer then over the left, a swap (compositor): the right stays where it was read", `the right ${Math.round(before)} -> ${Math.round(after.top)}; ${after.level == null ? 'no unit to level by' : `${after.level.toFixed(1)} px from level`}${swap.error ? `; swap failed: ${swap.error}` : ''}${errors.length ? `; page errors: ${errors.slice(0, 2).join(' | ')}` : ''}`)
  await page.close()
}
// 9: the pair located (this machine's copy), a side read by the wheel (the driver), then the other side's page pill, its
// page typed: the side the pill moved becomes the driver, and the other side follows it to its matching place
if (copied && wanted(9)) {
  for (const [compositor, by] of followers) {
    for (const side of ['right', 'left']) {
      const other = side === 'left' ? 'right' : 'left'
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(urlOf(compositor))
      await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug?.right.anchors.size, null, { timeout: 60_000, polling: 50 })
      await still(page)
      const o = await page.locator(`#${other}`).boundingBox()
      await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2)
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 400); await sleep(60) }
      await still(page)
      const field = page.locator(`section.pane[data-side="${side}"] .pill input`)
      await field.fill('8')
      await field.press('Enter')
      await sleep(300)
      const jumped = await page.evaluate(side => { const d = window.__reader.debug; return { top: d[side].container.scrollTop, other: d.shownAt(d[side === 'left' ? 'right' : 'left']) } }, side)
      await still(page)
      const end = await page.evaluate(side => { const d = window.__reader.debug, s = d[side], o = d[side === 'left' ? 'right' : 'left']; return { top: s.container.scrollTop, other: d.shownAt(o), level: d.levelOf(s)?.error ?? null } }, side)
      const ok = Math.abs(end.top - jumped.top) <= 1 && end.level != null && Math.abs(end.level) <= 2 && !errors.length
      row(ok, `9. this machine's copy located, the ${other} read, then the ${side}'s page pill, page 8 typed (${by}): the ${other} follows to its matching place`, `the ${side} jumped to ${Math.round(jumped.top)}, now ${Math.round(end.top)}; the ${other} ${Math.round(jumped.other)} -> ${Math.round(end.other)}; ${end.level == null ? 'no unit to level by' : `${end.level.toFixed(1)} px from level`}${errors.length ? `; page errors: ${errors.slice(0, 2).join(' | ')}` : ''}`)
      await page.close()
    }
  }
}
if (away.length) console.log(`stopped on their way off this machine: ${[...new Set(away.map(u => new URL(u).origin))].join(', ')}`)
await context.close()
corpus.close()
// a selection that ran nothing (a row's precondition skipped) is no pass (Codex and Devin on #322: ONLY=7 once ran nothing)
if (!ran) row(false, 'rows run', `none of ${only ? `ONLY=${only.join(',')}` : 'the rows'} ran`)
console.log(failed ? `${failed} FAIL` : `every row PASS (${ran})`)
process.exit(failed ? 1 : 0)
