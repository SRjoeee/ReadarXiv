// The reader's click alignment in Chromium: a paragraph put at a chosen height of its view, clicked, and the gap
// between the two sides' first lines on the screen read back (the owner, 2026-09-22: they should be on one horizontal
// line). Then the same after scrolling on, and for clicks on headings, figures and captions. Demo mode by default;
// LIVE=1 runs the live mode on an arXiv id (the TeX Live server on :8070 must be running).
//   node spikes/reader-click.mjs [id]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper = '2608.04322'] = process.argv.slice(2)
const { context, readerUrl } = await launchWithReader({ profile: 'reader-click', demos: true })
const page = await context.newPage()
page.on('pageerror', e => console.error('pageerror', e.message))
page.on('console', m => { if (m.text().startsWith('[who]')) console.log(m.text().slice(0, 600)) })
let site = null
const query = { paper }
if (process.env.LIVE) { site = await serveSite(); Object.assign(query, { live: '1', site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070' }) }
await page.goto(readerUrl(query))
await page.waitForFunction(() => (window.__reader?.live ? window.__reader.live.done : window.__reader?.ready), null, { timeout: 900_000, polling: 500 })
await page.waitForTimeout(1500)
const sleep = ms => page.waitForTimeout(ms)

/** put unit `id`'s first line of side `from` at share `h` of its view, click its line `line`, and read both sides */
async function clickUnit(from, id, h, line = 0) {
  return page.evaluate(async ([from, id, h, line]) => {
    const d = window.__reader.debug, f = d[from]
    const c = f.container
    c.scrollTop = d.unitDocTop(f, id) - c.clientHeight * h
    await new Promise(r => setTimeout(r, 400))
    const a = f.anchors.get(id), r = a.rects[Math.min(line, a.rects.length - 1)]
    const pv = d.pageView(f, r.page), pr = pv.div.getBoundingClientRect(), box = d.toPageBox(f, r)
    const x = pr.left + pv.div.clientLeft + box.left + box.width * 0.3, y = pr.top + pv.div.clientTop + box.top + box.height * 0.5
    return { x, y }
  }, [from, id, h, line])
}
const screenY = (side, id) => page.evaluate(([side, id]) => { const d = window.__reader.debug, s = d[side]; return s.container.getBoundingClientRect().top + d.unitDocTop(s, id) - s.container.scrollTop }, [side, id])
const units = await page.evaluate(() => {
  const d = window.__reader.debug
  const kinds = d.unitKind
  return [...d.left.anchors.keys()].filter(id => d.left.anchors.get(id) && d.right.anchors.get(id)).map(id => ({ id, kind: kinds.get(id), lines: d.left.anchors.get(id).rects.length, rlines: d.right.anchors.get(id).rects.length }))
})
const results = { paper, linked: units.length, byKind: {}, paragraphs: [], scrolled: [], figures: [] }
for (const u of units) results.byKind[u.kind] = (results.byKind[u.kind] ?? 0) + 1
// paragraphs: at five heights, from both sides
const paras = units.filter(u => u.kind === 'para' && u.lines >= 2)
for (let k = 0; k < Math.min(24, paras.length); k++) {
  const u = paras[Math.floor((k * paras.length) / Math.min(24, paras.length))]
  const from = k % 2 ? 'right' : 'left', to = from === 'left' ? 'right' : 'left', h = [0.1, 0.3, 0.5, 0.65, 0.8][k % 5]
  const { x, y } = await clickUnit(from, u.id, h)
  await page.mouse.click(x, y)
  await sleep(300)
  const a = await screenY(from, u.id), b = await screenY(to, u.id)
  results.paragraphs.push({ id: u.id, from, h, gap: Math.round(b - a), at: Math.round(a) })
}
// scrolling on after a click: the paragraph at the reading line stays level, line for line (settle), where the
// reading line now is — the height of the click
for (const u of paras.slice(3, 15)) {
  const { x, y } = await clickUnit('left', u.id, 0.55)
  await page.mouse.click(x, y)
  await sleep(300)
  const before = await page.evaluate(() => Math.round(window.__reader.debug.right.container.scrollTop))
  await page.mouse.move(400, 500)
  await page.mouse.wheel(0, 60)
  await sleep(1000)
  results.scrolled.push(await page.evaluate(before => {
    const d = window.__reader.debug, L = d.left, R = d.right, y = L.container.scrollTop + L.container.clientHeight * d.readingLine
    // the line of a linked unit at the reading line on the left, and where its place is on the right
    let hit = null
    for (const [id, a] of L.anchors) {
      if (!a || !R.anchors.get(id)) continue
      a.rects.forEach((r, li) => { const box = d.toPageBox(L, r), top = d.pageTop(L, r.page) + box.top; if (y >= top - 1 && y <= top + box.height + 1) hit = { id, li, n: a.rects.length, f: (y - top) / Math.max(1, box.height) } })
    }
    if (!hit) return { gap: null, note: 'no linked line at the reading line', moved: Math.round(R.container.scrollTop) - before }
    const b = R.anchors.get(hit.id), pos = ((hit.li + Math.min(1, Math.max(0, hit.f))) / hit.n) * b.rects.length, lj = Math.min(b.rects.length - 1, Math.floor(pos)), r = b.rects[lj], box = d.toPageBox(R, r)
    const there = d.pageTop(R, r.page) + box.top + (pos - lj) * box.height - R.container.scrollTop + R.container.getBoundingClientRect().top
    const here = y - L.container.scrollTop + L.container.getBoundingClientRect().top
    return { id: hit.id, kind: d.unitKind.get(hit.id), gap: Math.round(there - here), moved: Math.round(R.container.scrollTop) - before }
  }, before))
}
// headings (linked now) and captions: levelled like paragraphs
for (const kind of ['heading', 'caption']) {
  results[kind] = []
  for (const u of units.filter(v => v.kind === kind).slice(0, process.env.ALL ? 1e9 : 8)) {
    const { x, y } = await clickUnit('left', u.id, 0.45)
    const pre = await page.evaluate(() => [window.__reader.debug.left.container.scrollTop, window.__reader.debug.right.container.scrollTop].map(Math.round))
    if (process.env.WHO && u.id === Number(process.env.WHO)) await page.evaluate(() => {
      const el = window.__reader.debug.right.container, desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
      Object.defineProperty(el, 'scrollTop', { configurable: true, get() { return desc.get.call(this) }, set(v) { console.log('[who] scrollTop =', Math.round(v), new Error().stack.split('\n').slice(2, 6).join(' | ')); desc.set.call(this, v) } })
      for (const f of ['scrollTo', 'scrollBy']) { const orig = el[f].bind(el); el[f] = (...a) => { console.log('[who]', f, JSON.stringify(a), new Error().stack.split('\n').slice(2, 6).join(' | ')); orig(...a) } }
      el.addEventListener('scroll', () => console.log('[who] scroll event at', Math.round(desc.get.call(el))))
    })
    await page.mouse.click(x, y)
    const at0 = await page.evaluate(() => [window.__reader.debug.left.container.scrollTop, window.__reader.debug.right.container.scrollTop].map(Math.round))
    const gap0 = Math.round((await screenY('right', u.id)) - (await screenY('left', u.id)))
    await sleep(300)
    const at1 = await page.evaluate(() => [window.__reader.debug.left.container.scrollTop, window.__reader.debug.right.container.scrollTop].map(Math.round))
    results[kind].push({ pre, at0, gap0, at1, align: await page.evaluate(() => JSON.stringify(window.__reader.debug.lastAlign)) })
    results[kind].at(-1).id = u.id
    Object.assign(results[kind].at(-1), { gap: Math.round((await screenY('right', u.id)) - (await screenY('left', u.id))), way: await page.evaluate(() => window.__reader.debug.lastAlign?.way) })
  }
}
// figures: an image region on the left clicked; its twin on the right should stand at the same height
const figs = await page.evaluate(async () => {
  const d = window.__reader.debug, out = []
  for (let p = 1; p <= d.left.doc.numPages; p++) for (const r of await d.regionsOf(d.left, p)) out.push({ page: p, r })
  return out
})
for (const f of figs.slice(0, process.env.ALL ? 1e9 : 10)) {
  const pos = await page.evaluate(async ([p, r]) => {
    const d = window.__reader.debug, c = d.left.container
    const box = d.regionBox(d.left, p, r)
    c.scrollTop = box.top - c.clientHeight * 0.3
    await new Promise(res => setTimeout(res, 400))
    const pv = d.pageView(d.left, p), pr = pv.div.getBoundingClientRect(), b = d.toPageBox(d.left, { page: p, ...r })
    return { x: pr.left + pv.div.clientLeft + b.left + b.width / 2, y: pr.top + pv.div.clientTop + b.top + Math.min(b.height / 2, 60), top: c.getBoundingClientRect().top + box.top - c.scrollTop, scrollBefore: Math.round(c.scrollTop) }
  }, [f.page, f.r])
  const beforeAlign = await page.evaluate(() => JSON.stringify(window.__reader.debug.lastAlign))
  if (process.env.FIGDEBUG) console.log('under', await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return `${el?.tagName}.${el?.className} inLeft=${!!el?.closest('#left')} sel=${JSON.stringify(String(getSelection()))}` }, [pos.x, pos.y]))
  await page.mouse.click(pos.x, pos.y)
  await sleep(500)
  if (process.env.FIGDEBUG) console.log('fig', f.page, JSON.stringify(f.r), 'click', Math.round(pos.x), Math.round(pos.y), '| after', await page.evaluate(() => JSON.stringify(window.__reader.debug.lastAlign)), '| before', beforeAlign.slice(0, 80), '| at', await page.evaluate(() => JSON.stringify(window.__lastAt)), '| scroll before click', pos.scrollBefore)
  // the left figure where it is now (the left takes up what the right cannot scroll), and the right's of the same size nearest that height
  pos.top = await page.evaluate(([p, r]) => { const d = window.__reader.debug, c = d.left.container; return c.getBoundingClientRect().top + d.regionBox(d.left, p, r).top - c.scrollTop }, [f.page, f.r])
  const got = await page.evaluate(async ([p, r, top]) => {
    const d = window.__reader.debug, c = d.right.container, w = r.x1 - r.x0, h = r.y1 - r.y0
    let best = null
    for (let q = 1; q <= d.right.doc.numPages; q++) for (const s of await d.regionsOf(d.right, q)) {
      if (Math.abs(s.x1 - s.x0 - w) > 2 || Math.abs(s.y1 - s.y0 - h) > 2) continue
      const y = c.getBoundingClientRect().top + d.regionBox(d.right, q, s).top - c.scrollTop
      if (!best || Math.abs(y - top) < Math.abs(best - top)) best = y
    }
    return best
  }, [f.page, f.r, pos.top])
  results.figures.push({ page: f.page, kind: f.r.kind, gap: got == null ? null : Math.round(got - pos.top), way: await page.evaluate(() => JSON.stringify(window.__reader.debug.lastAlign)) })
}
results.headings = await page.evaluate(() => { const d = window.__reader.debug; return (d.units ?? []).filter(u => u.kind === 'heading').map(u => ({ text: u.text, left: !!d.left.anchors.get(u.i), right: !!d.right.anchors.get(u.i) })) })
writeFileSync(join(root, `out/reader-click-${paper}.json`), JSON.stringify(results, null, 1))
const worst = xs => xs.map(x => Math.abs(x.gap ?? 1e9)).sort((a, b) => b - a).slice(0, 3)
console.log(JSON.stringify({ paper, linked: results.linked, byKind: results.byKind }))
results.figures = results.figures.filter(f => f.gap != null) // no figure of that size on the other side: arXiv's stamp in the margin
for (const key of ['paragraphs', 'scrolled', 'heading', 'caption', 'figures']) console.log(key.padEnd(10), 'n', results[key].length, 'within 2 px', results[key].filter(x => x.gap != null && Math.abs(x.gap) <= 2).length, 'worst', worst(results[key]))
for (const key of ['heading', 'caption', 'figures']) console.log(key, JSON.stringify(results[key]))
await context.close(); site?.close()
