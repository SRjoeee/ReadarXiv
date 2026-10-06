// A side read before the pair is located (the website's early-scroll defect, readarxiv-web PR #23, in the shared
// reader): the sync follows nothing until both sides are anchored (syncFrom, alignTop and arm go by the anchors), so a
// scroll whose every step and whose rest came before that had nothing to level the pair by, and the pair stood apart
// until the next scroll's rest. Once located, the pair is levelled by the side read, as at a rest (session.mjs
// levelLocated). The reader in the extension, live, in bilingual, each row with the follower on the compositor and by
// script:
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
//      not the side read, though the right is the driver by then.
// A row passes when the side was read before the pair was located, and once located and still for 700 ms: the side
// read stands where the reader put it, and the pair is within 2 px of level by it (the sync's own tolerance,
// level-on-screen.mjs). No TeX page is needed (a first visit stops at its compile, after its row is read), and nothing
// leaves this machine: every request off it is stopped, and named at the end.
// Build first (`pnpm build`); the paper in data/corpus, and its demo (poc-reader/papers, spikes/reader-papers.mjs) for
// the copy. Exits non-zero on a FAIL.
//   node experiments/pdf-bilingual/spikes/early-scroll.mjs [id]      BUILD=<dir> another build; LATE=<ms> the source's delay
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD, launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.02163'
const extension = process.env.BUILD ?? BUILD
// the source's answer held back this long on a first visit (LATE=<ms> another): the pair is located after it
const SOURCE_LATE = Number(process.env.LATE ?? 3000)
// where a side is read, a share of its range: on 2608.02163, a page with prose to level by (0.4 is a page of figures)
const SHARE = 0.3
const live = readFileSync(join(root, '../../src/pdf-reader/engine/live.mjs'), 'utf8')
const [PIPELINE, TYPESETTING] = ['PIPELINE_VERSION', 'TYPESETTING_VERSION'].map(name => live.match(new RegExp(`export const ${name} = '([^']+)'`))[1])
let failed = 0
const row = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); if (!ok) failed++ }
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
const urlOf = compositor => readerUrl({ paper, live: '1', mode: 'bilingual', site: at, endpoint: at, src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}`, ...(compositor ? {} : { compositor: '0' }) })

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
/** a visit, `side` read early in the frame after the right's first page, or by the wheel (`wheel`), the pointer then
 *  moved over `pointerTo`: once the pair is located and both sides still for 700 ms, where the side read stands against
 *  where the reader put it, and how far the pair is from level by it */
async function visit(side, compositor, { wheel = false, pointerTo = null, first = 'rightFirstPage', slower = 0 } = {}) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  if (slower) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slower })
  await page.addInitScript(readEarly, [side, wheel ? null : SHARE, first, wheel ? null : pointerTo])
  await page.goto(urlOf(compositor))
  if (wheel) {
    await page.waitForFunction(() => window.__early?.at != null, null, { timeout: 60_000, polling: 'raf' })
    const box = await page.locator(`#${side}`).boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 400); await sleep(60) }
    // the scroll and its rest over (scrollend, then 150 ms), before the pair is located
    await sleep(400)
    if (pointerTo && wheel) {
      const to = await page.locator(`#${pointerTo}`).boundingBox()
      for (let i = 1; i <= 4; i++) { await page.mouse.move(to.x + to.width * 0.2 * i, to.y + to.height * 0.5); await sleep(20) }
    }
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
  for (const side of ['right', 'left']) { const e = await visit(side, compositor); row(passes(e), `1. a first visit, the source late, the ${side} read early (${by})`, show(e)) }
  for (const [side, pointerTo] of [['right', null], ['left', 'right']]) {
    const e = await visit(side, compositor, { wheel: true, pointerTo })
    row(passes(e) && e.top > 0, `2. a first visit, the source late, the ${side} read by the wheel, its rest before the pair is located${pointerTo ? `, the pointer then over the ${pointerTo}` : ''} (${by})`, show(e))
  }
}

// the copy row 3 opens: the demo's translation, its units with their translations as pieces (cache.mjs copyTexts makes
// the right's texts from them), every unit kept (current under any service), written from a first visit's page, which
// has the paper's cache key
const writer = await context.newPage()
await writer.goto(urlOf(true))
await writer.waitForFunction(() => window.__reader?.ready && window.__reader.debug, null, { timeout: 60_000, polling: 50 })
const copied = await writer.evaluate(async ({ paper, demo, pipeline, typesetting }) => {
  const d = window.__reader.debug, key = d.cacheKey()
  if (!key) return false
  const [pdf, demoUnits] = await Promise.all([fetch(`${demo}/translation.pdf`).then(r => r.arrayBuffer()).then(b => new Uint8Array(b)), fetch(`${demo}/units.json`).then(r => r.json())])
  const units = demoUnits.map(u => ({ kind: u.kind, src: u.src, hash: '', state: 'kept', ...(u.tr ? { tr: u.tr, pieces: [{ t: 'text', tr: true, s: u.tr }] } : {}) }))
  const record = { digest: key.digest, lang: key.lang, paper, engine: 'early-scroll', format: 'markers', pipeline, typesetting, context: {}, units, marks: [], rightMarks: [], figures: [] }
  return d.pdfCache.put({ ...record, pdf }, { identity: 'early-scroll', pipeline, typesetting })
}, { paper, demo: `${at}/demo/${paper}`, pipeline: PIPELINE, typesetting: TYPESETTING })
await writer.close()

// 3: this machine's copy
late = 0
if (!copied) row(false, '3. a copy written', 'the reader had no cache key, or the store refused the copy')
else {
  for (const [compositor, by] of followers) {
    for (const side of ['right', 'left']) {
      const e = await visit(side, compositor)
      row(e.shownCached && passes(e), `3. this machine's copy, the ${side} read early (${by})`, `${e.shownCached ? '' : 'no copy shown; '}${show(e)}`)
    }
  }
  const e = await visit('left', true, { first: 'leftFirstPage', pointerTo: 'right', slower: 4 })
  row(e.shownCached && e.rightOpen === false && passes(e), "4. this machine's copy, the left read before the copy opens, the pointer then over the right (compositor)", `${e.shownCached ? '' : 'no copy shown; '}${e.rightOpen ? 'the copy already open; ' : ''}${show(e)}`)
}
if (away.length) console.log(`stopped on their way off this machine: ${[...new Set(away.map(u => new URL(u).origin))].join(', ')}`)
await context.close()
corpus.close()
console.log(failed ? `${failed} FAIL` : 'every row PASS')
process.exit(failed ? 1 : 0)
