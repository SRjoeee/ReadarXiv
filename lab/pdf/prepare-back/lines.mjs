// lab/pdf/prepare-back/lines.mjs: the differential gate's lines (stage 1a's exit): for every unit the baseline draws and the
// candidate draws, joined as the baseline's comparator joins them (by id, the k-th of an id with the k-th), and standing on
// arXiv's page exactly as on our compile (the candidate's `same`), whether its lines equal the baseline's to 0.01 pt (page, x0,
// x1, baseline, the count); every other one classed, with the first examples of each class rendered: arXiv's page cropped to
// the unit, the baseline's lines in red and the candidate's in blue.
//   node lab/pdf/prepare-back/lines.mjs <baseline dir> <candidate dir> <papers.tsv> [--render=<n>]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as PL from '@cantoo/pdf-lib'

const [BASE, CAND, LIST] = process.argv.slice(2)
const RENDER = Number(process.argv.find(a => a.startsWith('--render='))?.slice(9) ?? 5)
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')))
const TOL = 0.01 + 1e-9
const near = (a, b) => Math.abs(a - b) <= TOL
const sameLine = (x, y) => x.page === y.page && near(x.x0, y.x0) && near(x.x1, y.x1) && near(x.baseline, y.baseline)

/** a difference's class: what differs between the baseline's lines and the candidate's */
function classOf(a, b) {
  if (a.length !== b.length) {
    const pa = new Set(a.map(l => l.page)), pb = new Set(b.map(l => l.page))
    return `${a.length > b.length ? 'fewer' : 'more'} lines${[...pa].join() !== [...pb].join() ? ', other pages' : ''}`
  }
  const what = new Set()
  a.forEach((x, i) => {
    const y = b[i]
    if (x.page !== y.page) what.add('page')
    if (!near(x.baseline, y.baseline)) what.add('baseline')
    if (!near(x.x0, y.x0)) what.add(y.x0 < x.x0 ? 'x0 left' : 'x0 right')
    if (!near(x.x1, y.x1)) what.add(y.x1 > x.x1 ? 'x1 right' : 'x1 left')
  })
  return [...what].sort().join(', ')
}

const out = { papers: 0, compared: 0, same: 0, equal: 0, other: 0, byPlace: {}, classes: {}, examples: {} }
for (const f of readdirSync(join(BASE, 'prepare')).filter(f => f.endsWith('.prepare.json')).sort()) {
  const id = f.slice(0, -'.prepare.json'.length)
  if (!existsSync(join(CAND, 'prepare', f))) continue
  out.papers++
  const a = JSON.parse(readFileSync(join(BASE, 'prepare', f), 'utf8')), b = JSON.parse(readFileSync(join(CAND, 'prepare', f), 'utf8'))
  const loc = JSON.parse(readFileSync(join(CAND, 'located', `${id}.json`), 'utf8'))
  const byId = d => { const m = new Map(); for (const u of d.units) if (u.id) (m.get(u.id) ?? m.set(u.id, []).get(u.id)).push(u); for (const l of m.values()) l.sort((x, y) => x.ord - y.ord); return m }
  const va = byId(a), vb = byId(b)
  for (const [uid, la] of va) {
    const lb = vb.get(uid) ?? []
    // (the candidate's place of each of its units of this id, in ord order)
    const places = (loc.places[uid] ?? []).sort((x, y) => x[0] - y[0]).map(x => x[1])
    la.forEach((ua, i) => {
      const ub = lb[i]
      if (!ub || ua.state !== 'drawn' || ub.state !== 'drawn' || !ua.lines || !ub.lines) return
      out.compared++
      const place = places[i] ?? 'none'
      const eq = ua.lines.length === ub.lines.length && ua.lines.every((x, q) => sameLine(x, ub.lines[q]))
      const P = (out.byPlace[place] ??= { units: 0, equal: 0 })
      P.units++
      if (eq) P.equal++
      if (place !== 'same') return
      out.same++
      if (eq) { out.equal++; return }
      out.other++
      // (a baseline line that is a display's row of the unit: the candidate states a display as an element kept in place, its
      // ink in no group, never a text line; the maker's rows held it as a line of the unit)
      const disp = (ub.elements ?? []).filter(e => e.kind === 'display').flatMap(e => e.segs)
      const extra = ua.lines.filter(x => !ub.lines.some(y => sameLine(x, y)))
      const rest = ub.lines.filter(y => !ua.lines.some(x => sameLine(x, y)))
      const displayRows = extra.length > 0 && rest.length === 0 && extra.every(x => disp.some(d => d.page === x.page && x.baseline >= d.bottom - 0.5 && x.baseline <= d.top + 0.5))
      const c = `${ua.kind}: ${displayRows ? 'the baseline holds a display\'s row as a line (here: an element kept)' : classOf(ua.lines, ub.lines)}`
      out.classes[c] = (out.classes[c] ?? 0) + 1
      const ex = (out.examples[c] ??= [])
      if (ex.length < RENDER) ex.push({ id, unit: uid.slice(0, 12), ord: ub.ord, text: ub.text.slice(0, 80), baseline: ua.lines, candidate: ub.lines })
    })
  }
}
// the classes, largest first (the kind first, as the comparator reports by kind)
out.classes = Object.fromEntries(Object.entries(out.classes).sort((x, y) => y[1] - x[1]))
// ---- the examples rendered: arXiv's page with both line sets drawn, cropped to the unit's lines
const R = join(CAND, 'lines-examples')
mkdirSync(R, { recursive: true })
let n = 0
for (const [c, list] of Object.entries(out.examples)) {
  for (const [q, e] of list.entries()) {
    const dir = dirs.get(e.id)
    if (!dir) continue
    const page = e.candidate[0].page
    const doc = await PL.PDFDocument.load(readFileSync(join(dir, 'arxiv.pdf')), { ignoreEncryption: true, updateMetadata: false })
    const pg = doc.getPage(page - 1)
    const draw = (lines, color) => { for (const l of lines) if (l.page === page) pg.drawRectangle({ x: l.x0, y: l.bottom ?? l.baseline - 2, width: l.x1 - l.x0, height: (l.top ?? l.baseline + 7) - (l.bottom ?? l.baseline - 2), borderColor: color, borderWidth: 0.4 }) }
    draw(e.baseline, PL.rgb(0.9, 0, 0))
    draw(e.candidate, PL.rgb(0, 0.2, 0.9))
    const one = await PL.PDFDocument.create()
    const [copy] = await one.copyPages(doc, [page - 1])
    one.addPage(copy)
    const file = join(R, `${String(n).padStart(3, '0')}.pdf`)
    writeFileSync(file, await one.save())
    const ls = [...e.baseline, ...e.candidate].filter(l => l.page === page)
    const [vx0, , , vy1] = copy.getMediaBox ? [copy.getMediaBox().x, 0, 0, copy.getMediaBox().y + copy.getMediaBox().height] : [0, 0, 0, 792]
    const x0 = Math.min(...ls.map(l => l.x0)) - 12, x1 = Math.max(...ls.map(l => l.x1)) + 12
    const y0 = Math.min(...ls.map(l => l.bottom ?? l.baseline - 3)) - 10, y1 = Math.max(...ls.map(l => l.top ?? l.baseline + 8)) + 10
    const s = 2
    // (the page rendered whole, then cropped by macOS's sips: this poppler's pdftoppm renders a whole page with -singlefile)
    const png = join(R, `${String(n).padStart(3, '0')}`)
    spawnSync('pdftoppm', ['-png', '-r', String(72 * s), '-singlefile', file, png])
    spawnSync('sips', ['-c', String(Math.round((y1 - y0) * s)), String(Math.round((x1 - x0) * s)), '--cropOffset', String(Math.max(0, Math.round((vy1 - y1) * s))), String(Math.max(0, Math.round((x0 - vx0) * s))), `${png}.png`])
    e.png = `lines-examples/${String(n).padStart(3, '0')}.png`
    n++
    void q
  }
}
writeFileSync(join(CAND, 'lines.json'), `${JSON.stringify(out, null, 1)}\n`)
const { examples: _e, ...brief } = out
console.log(JSON.stringify(brief, null, 1).slice(0, 4000))
