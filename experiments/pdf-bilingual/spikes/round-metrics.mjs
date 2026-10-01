// experiments/pdf-bilingual/spikes/round-metrics.mjs
// The evaluation round's numbers, column by column, from the PDFs themselves — each unit's marks against the
// original's — and, for a flow column, from the leading and face each unit was set at: pages, drift, block sizes,
// floats, evenness. Writes numbers only, no paper's text, and prints them by language.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/round-metrics.mjs <out.json> <key>...
// Metrics (records/typesetting.md has why each is there):
//   pages      the translation's pages less the original's
//   drift      each unit's start against its original's, in columns (alignment.mjs): median, p90, share within 0.1
//   blocks     each unit's height against its original's: share within 15 %, p10 and p90 of the ratio
//   floats     each caption on the original's page, column, and slot (top, bottom, amid the text, a page of floats),
//              and within 30 pt of the original's place
//   standing   units whose leading (× their face) parts by more than 8 % from the median of the three before and the
//              three after — a paragraph a reader sees set looser or tighter than those around it; the flow's columns
//   faces      units set at a smaller face (flowType's shrink), and the smallest
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { marksOf, readLines } from './lock.mjs'
import { alignment } from './alignment.mjs'

const root = new URL('..', import.meta.url).pathname
const V = join(root, 'data/runs/visual-eval'), round = JSON.parse(readFileSync(join(V, 'round.json'), 'utf8'))
const [out, ...keys] = process.argv.slice(2)
if (!out || !keys.length) { console.error('usage: round-metrics.mjs <out.json> <key>...'); process.exit(2) }
const pdfIn = d => existsSync(d) && join(d, readdirSync(d).find(x => x.endsWith('.pdf') && readdirSync(d).includes(x.replace(/pdf$/, 'log'))) ?? '')
const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** where the original set a float: on a page of floats, at the top or the bottom of its column, or amid the text */
const slot = (m, units, n) => {
  const c = m.marks.get(n), col = mk => (m.twoColumn && mk.x >= m.width / 2 ? 1 : 0)
  const text = [...m.marks].filter(([k, v]) => k.endsWith('s') && units[Number(k.slice(0, -1))]?.kind !== 'caption' && v.page === c.page && col(v) === col(c))
  if (!text.length) return 'p'
  const above = text.some(([, v]) => v.y > c.y + 2), below = text.some(([, v]) => v.y < c.y - 2)
  return above && below ? 'h' : below ? 't' : 'b'
}
function floats(om, tm, units) {
  const col = (m, mk) => (m.twoColumn && mk.x >= m.width / 2 ? 1 : 0)
  const r = { n: 0, page: 0, column: 0, slot: 0, near: 0 }
  units.forEach((u, i) => {
    const n = `${i}s`, o = om.marks.get(n), t = tm.marks.get(n)
    if (u.kind !== 'caption' || !o || !t) return
    r.n++
    if (o.page !== t.page) return
    r.page++
    if (col(om, o) !== col(tm, t)) return
    r.column++
    if (slot(om, units, n) === slot(tm, units, n)) r.slot++
    if (Math.abs(o.y - t.y) <= 30) r.near++
  })
  return r
}
/** the leading each unit of a flow column was set at, × its face, against the original's; and its faces. A flow's
 *  final is its second compile (visual-eval.mjs addFlow); the other columns' last compiles are others */
function evenness(dir, key, original, cjk) {
  const work = join(dir, 'work', `${key}-2`)
  if (!key.startsWith('flow') || !existsSync(work)) return null
  const tex = readdirSync(work).filter(f => f.endsWith('.tex')).map(f => readFileSync(join(work, f), 'latin1')).find(s => s.includes('axtlead@'))
  if (!tex) return null
  const defs = name => new Map([...tex.matchAll(new RegExp(`csname ${name}@(\\d+)\\\\endcsname\\{([\\d.]+)\\}`, 'g'))].map(m => [Number(m[1]), Number(m[2])]))
  const leads = defs('axtlead'), sizes = defs('axtsize')
  const v = [...leads].filter(([i]) => original.get(i)?.size).sort((a, b) => a[0] - b[0]).map(([i, l]) => (l * (sizes.get(i) ?? 1) * original.get(i).size) / original.get(i).bs)
  let standing = 0
  v.forEach((x, j) => { const nb = [...v.slice(Math.max(0, j - 3), j), ...v.slice(j + 1, j + 4)]; if (nb.length && Math.abs(x / median(nb) - 1) > 0.08) standing++ })
  // a face: a unit set smaller than the type — a CJK type's face is the CJK font's scale, on no unit; an alphabet's
  // type size is on every translated unit, and the largest of them
  const set = [...leads.keys()].map(i => sizes.get(i) ?? 1), type = cjk ? 1 : Math.max(...set), faces = set.filter(f => f < type - 1e-9)
  return { units: v.length, standing, faces: faces.length ? { n: faces.length, min: Number((Math.min(...faces) / type).toFixed(4)) } : null }
}

const result = { keys, round, papers: {} }
for (const [lang, ids] of Object.entries(round)) for (const id of ids) {
  const dir = join(V, lang, id), oPdf = pdfIn(join(dir, 'work/original'))
  if (!oPdf) continue
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const { units } = openPaper(files), om = await marksOf(oPdf), original = readLines(readFileSync(oPdf.replace(/pdf$/, 'log'), 'latin1'))
  const row = {}
  for (const key of keys) {
    const pdf = join(dir, `${key}.pdf`)
    if (!existsSync(pdf)) continue
    const tm = await marksOf(pdf), a = alignment(om, tm), r = (x, d = 3) => Number(x.toFixed(d))
    row[key] = {
      pages: a.pages, drift: { median: r(a.drift.median), p90: r(a.drift.p90), within: r(a.drift.within) },
      blocks: { within: r(a.size.within), p10: r(a.size.p10), p90: r(a.size.p90) }, floats: floats(om, tm, units), ...evenness(dir, key, original, ['zh', 'ja', 'ko'].includes(lang)),
    }
  }
  result.papers[`${lang}/${id}`] = row
}
writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`)

// the table: by language and over all, a column per row
const pct = x => `${Math.round(100 * x)} %`, mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
console.log('lang  column              n  pages =/+/-  drift med/p90   ≤0.1  blocks  floats≤30pt  standing  faces')
for (const lang of [...Object.keys(round), 'all']) for (const key of keys) {
  const rows = Object.entries(result.papers).filter(([p]) => lang === 'all' || p.startsWith(`${lang}/`)).map(([, r]) => r[key]).filter(Boolean)
  if (!rows.length) continue
  const fl = rows.reduce((s, x) => ({ n: s.n + x.floats.n, near: s.near + x.floats.near }), { n: 0, near: 0 })
  const st = rows.filter(x => x.standing != null)
  console.log(`${lang.padEnd(5)} ${key.padEnd(18)} ${String(rows.length).padStart(2)}  ${rows.filter(x => x.pages === 0).length}/${rows.filter(x => x.pages > 0).length}/${rows.filter(x => x.pages < 0).length}`.padEnd(44)
    + `${mean(rows.map(x => x.drift.median)).toFixed(3)}/${mean(rows.map(x => x.drift.p90)).toFixed(3)}  ${pct(mean(rows.map(x => x.drift.within))).padStart(5)}  ${pct(mean(rows.map(x => x.blocks.within))).padStart(5)}  ${fl.n ? pct(fl.near / fl.n) : '—'}`.padEnd(38)
    + `${st.length ? st.reduce((s, x) => s + x.standing, 0) : '—'}`.padEnd(10) + `${rows.filter(x => x.faces).length || '—'}`)
}
