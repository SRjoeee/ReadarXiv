// lab/pdf/prepare-back/display-pieces.mjs <run> [<other run>] [--list=<n>]: the hover pieces of each display TeX set that no
// unit owns (PDF-READER §18.57). A run's prepare dumps state the lines on arXiv's page the engine reads as a display's formula,
// each with its display's number on its page (Located.displays, ink.ts DisplayLine); its bundles hold the members each lit
// whole (a kept block: Laid.lit, one entry). Each display's part on a page is lit as the members whose lines on that page stand
// on one of its lines (the baseline within 0.01 pt, meeting it across); a line no member holds lights nothing. Read in <run>'s
// bundles and, where given, in <other run>'s (the same papers made otherwise: the round's head, whose dumps may state no
// display's number), by <run>'s displays: per paper and in all, the displays lit as more than one piece by cause (one row: ink
// off its baseline, a fraction's, a radical's, a big operator's limits; rows: an alignment's or a broken formula's, a piece per
// row or a row cut too), a member lighting several displays, lines lit by nothing, and the lines a display's member holds that
// are none of its formula's (its number), each with what held it in the other run. Then whether the two runs' bundles differ
// anywhere else: each page's members but the kept blocks, their ties and links, read with the ords renumbered (a kept block
// merged moves the ords of the units made after it). Lab data alone: reads lab-data's runs, writes nothing.
//   node lab/pdf/prepare-back/display-pieces.mjs <run dir> [<other run dir>] [--list=<n>]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const [RUN, OTHER] = args.filter(a => !a.startsWith('--'))
const LIST = Number(args.find(a => a.startsWith('--list='))?.slice(7) ?? 8)
const ON = 0.01 + 1e-9

/** a run's bundle of a paper: each page's members (Placed, by ord), the units' kept flags, the parts as read */
function bundleOf(dir, id) {
  const d = join(dir, 'bundles', id)
  if (!existsSync(join(d, 'head.json'))) return null
  const head = JSON.parse(readFileSync(join(d, 'head.json'), 'utf8'))
  const units = new Map()
  for (const u of head.units ?? []) for (const x of JSON.parse(readFileSync(join(d, `${u}.units`), 'utf8')).units) units.set(x.id, x)
  // (a page with no part, null in the head: arXiv's page as it is)
  const parts = head.parts.filter(Boolean).map(p => JSON.parse(readFileSync(join(d, `${p}.part`), 'utf8')))
  return { parts, kept: m => !!units.get(m.text)?.kept }
}
/** the members of a part whose line boxes on a display line's page hold its baseline's middle (a kept block's rows join the
 *  lines they stand on together: one box over a fraction's numerator, radical and denominator): their ords */
function holders(part, [page, x0, , x1, , y]) {
  const out = new Set()
  const x = (x0 + x1) / 2
  for (const m of part.flows.flat())
    for (const l of m.lines) if (l[0] === page && l[2] - ON <= x && x <= l[3] + ON && l[6] - ON <= y && y <= l[5] + ON) out.add(m.ord)
  return out
}
/** a display's lines in rows: lines whose extents up and down meet, chained */
function rowsOf(lines) {
  const row = lines.map((_, i) => i)
  const find = i => (row[i] === i ? i : (row[i] = find(row[i])))
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) if (Math.min(lines[i][4], lines[j][4]) > Math.max(lines[i][2], lines[j][2])) row[find(i)] = find(j)
  return lines.map((_, i) => find(i))
}
/** each display of a dump on its page, `${page}:${n}` → its lines */
function displaysOf(dump) {
  const out = new Map()
  for (const d of dump.displays ?? []) {
    if (d.length < 7) throw new Error('a dump of displays with no display number: made before ink.ts stated it')
    const k = `${d[0]}:${d[6]}`
    out.set(k, [...(out.get(k) ?? []), d])
  }
  return out
}
/** the pieces each display is lit as in a bundle, and what else its members hold */
function read(b, displays) {
  const partOf = new Map(b.parts.map(p => [p.page, p]))
  const res = new Map()
  /** each member's displays */
  const shown = new Map()
  for (const [k, lines] of displays) {
    const part = partOf.get(lines[0][0])
    const by = lines.map(l => (part ? holders(part, l) : new Set()))
    const pieces = new Set(by.flatMap(s => [...s]))
    for (const o of pieces) shown.set(o, new Set([...(shown.get(o) ?? []), k]))
    res.set(k, { lines, by, pieces, unlit: by.filter(s => !s.size).length })
  }
  return { res, shown, partOf }
}
/** a display part's cause of more than one piece: its rows, and whether each piece stands in one */
function causeOf(r) {
  const row = rowsOf(r.lines)
  const rows = new Set(row).size
  if (rows === 1) return 'one row: ink off its baseline (a fraction, a radical, limits, a script)'
  const pieceRows = new Map()
  r.by.forEach((s, i) => { for (const o of s) pieceRows.set(o, new Set([...(pieceRows.get(o) ?? []), row[i]])) })
  const rowPieces = new Map()
  r.by.forEach((s, i) => { for (const o of s) rowPieces.set(row[i], new Set([...(rowPieces.get(row[i]) ?? []), o])) })
  if ([...rowPieces.values()].some(s => s.size > 1)) return 'rows: a row cut into pieces too'
  if ([...pieceRows.values()].every(s => s.size === 1)) return 'rows: a piece a row (an alignment, a broken formula)'
  return 'rows: pieces over some rows'
}
/** a member's JSON with its lines' column (Line[1]) read as 0 */
const noColumn = v => { const m = JSON.parse(v); m.lines = m.lines.map(l => [l[0], 0, ...l.slice(2)]); return JSON.stringify(m) }
const fmt = l => `[${l.slice(1, 6).map(v => Math.round(v * 10) / 10).join(', ')}]`

const ids = readdirSync(join(RUN, 'prepare')).filter(f => f.endsWith('.prepare.json')).map(f => f.replace(/\.prepare\.json$/, '')).sort()
const sum = { papers: 0, displays: 0, lines: 0 }
const tally = (t, key, ex) => { const x = t.get(key) ?? { n: 0, papers: new Set(), ex: [] }; x.n++; x.papers.add(ex.split(' ')[0]); if (x.ex.length < LIST) x.ex.push(ex); t.set(key, x) }
const sides = { run: new Map(), other: new Map() }
const numbers = new Map()
const diffs = []
/** each paper whose parts' faces differ: the other run's and the run's */
const faced = new Map()
/** the members whose lines differ by their column alone, and their pages */
const columns = { members: 0, pages: new Set() }
let unchanged = 0
for (const id of ids) {
  const dump = JSON.parse(readFileSync(join(RUN, 'prepare', `${id}.prepare.json`), 'utf8'))
  const displays = displaysOf(dump)
  const b = bundleOf(RUN, id)
  if (!b) continue
  sum.papers++
  sum.displays += displays.size
  sum.lines += [...displays.values()].reduce((n, l) => n + l.length, 0)
  const o = OTHER ? bundleOf(OTHER, id) : null
  const runs = [['run', b], ...(o ? [['other', o]] : [])]
  const reads = {}
  for (const [side, bb] of runs) {
    const { res, shown } = (reads[side] = read(bb, displays))
    const t = sides[side]
    for (const [k, r] of res) {
      const ex = `${id} p${k.replace(':', ' d')} ${r.lines.length} lines, pieces ${[...r.pieces].join('+') || '-'}`
      tally(t, 'display parts', ex)
      if (r.pieces.size > 1) tally(t, `more than one piece: ${causeOf(r)}`, ex)
      if (r.unlit) tally(t, 'a line of it lit by nothing', `${ex}, ${r.unlit} unlit`)
      if (r.pieces.size === 1 && !r.unlit) tally(t, 'one piece', ex)
    }
    for (const [ord, ks] of shown) if (ks.size > 1) tally(t, 'a member lighting several displays', `${id} ord ${ord}: displays ${[...ks].join(', ')}`)
  }
  // (what a display's one member lights in <run> past what the members that held its lines in <other run> lit (past its
  // formula's lines where no other run is given): its number, beside it or under it; and what lit that place there)
  const { res, partOf } = reads.run
  /** a member's boxes on a page, as one extent: [x0, bottom, x1, top] */
  const extentOf = (part, ords, page) => {
    const ls = part.flows.flat().filter(x => ords.includes(x.ord)).flatMap(x => x.lines.filter(l => l[0] === page))
    return ls.length ? [Math.min(...ls.map(l => l[2])), Math.min(...ls.map(l => l[6])), Math.max(...ls.map(l => l[3])), Math.max(...ls.map(l => l[5]))] : null
  }
  for (const [k, r] of res) {
    if (r.pieces.size !== 1) continue
    const page = r.lines[0][0]
    const U = extentOf(partOf.get(page), [...r.pieces], page)
    const was = o ? reads.other.res.get(k) : null
    const B = (was && extentOf(reads.other.partOf.get(page) ?? { flows: [] }, [...was.pieces], page)) ??
      [Math.min(...r.lines.map(l => l[1])), Math.min(...r.lines.map(l => l[2])), Math.max(...r.lines.map(l => l[3])), Math.max(...r.lines.map(l => l[4]))]
    const last = r.lines.reduce((a, l) => (l[5] < a[5] ? l : a))
    const past = []
    if (U[2] > B[2] + 0.5) past.push(['right of it', [(U[2] + B[2]) / 2, last[5]]])
    if (U[0] < B[0] - 0.5) past.push(['left of it', [(U[0] + B[0]) / 2, last[5]]])
    if (U[1] < B[1] - 0.5) past.push(['under it', [U[2] - 1, (U[1] + B[1]) / 2]])
    if (U[3] > B[3] + 0.5) past.push(['over it', [U[2] - 1, (U[3] + B[3]) / 2]])
    for (const [where, [px, py]] of past) {
      const before = o ? [...holders(reads.other.partOf.get(page) ?? { flows: [] }, [page, px, 0, px, 0, py])] : []
      tally(numbers, `its member lights ink ${where} (its number); in the other run ${before.length ? 'lit with a member' : 'lit by nothing'}`, `${id} p${k.replace(':', ' d')} before ${fmt([0, ...B, 0]).replace(/, 0\]$/, ']')}, now ${fmt([0, ...U, 0]).replace(/, 0\]$/, ']')}${before.length ? ` (ord ${before.join('+')})` : ''}`)
    }
  }
  // (the bundles alike but the kept blocks: each page's other members with no ord, their ties and links by those members)
  if (o) {
    const pages = new Set([...b.parts.map(p => p.page), ...o.parts.map(p => p.page)])
    for (const page of [...pages].sort((x, y) => x - y)) {
      const sideOf = bb => {
        const part = bb.parts.find(p => p.page === page)
        if (!part) return null
        const key = new Map()
        const members = []
        for (const m of part.flows.flat()) {
          if (bb.kept(m)) { key.set(m.ord, 'kept'); continue }
          const { ord: _, ...rest } = m
          const s = JSON.stringify(rest)
          // (its ties and links read by it, its lines' columns aside: counted below)
          key.set(m.ord, noColumn(s))
          members.push(s)
        }
        const ref = x => key.get(x) ?? `ord ${x}`
        // (a tie's members: its `ords`, a table's `cells`)
        const ordsOf = t => [...(t.ords ?? []), ...(t.cells ?? []).flat()]
        const deep = v => (Array.isArray(v) ? v.map(deep) : ref(v))
        const ties = (part.ties ?? []).filter(t => !ordsOf(t).some(x => key.get(x) === 'kept')).map(t => JSON.stringify({ ...t, ...(t.ords ? { ords: deep(t.ords) } : {}), ...(t.cells ? { cells: deep(t.cells) } : {}) }))
        const links = (part.links ?? []).map(l => JSON.stringify({ ...l, ...(l.owner ? { owner: [ref(l.owner[0]), l.owner[1]] } : {}) }))
        const { flows: _f, ties: _t, links: _l, paper, ...rest } = part
        const { faces, ...more } = paper ?? {}
        return { members: members.sort(), ties: ties.sort(), links: links.sort(), rest: JSON.stringify({ ...rest, paper: more }), faces: JSON.stringify(faces) }
      }
      const x = sideOf(b), y = sideOf(o)
      if (x && y && x.faces !== y.faces && !faced.has(id)) faced.set(id, `${y.faces} -> ${x.faces}`)
      const fields = !x || !y ? ['a part on one side alone'] : ['members', 'ties', 'links', 'rest'].filter(f => JSON.stringify(x[f]) !== JSON.stringify(y[f]))
      if (!fields.length) { unchanged++; continue }
      const mark = diffs.length
      diffs.push(`${id} p${page}: ${fields.join(', ')}`)
      if (x && y && fields.includes('members')) {
        const only = (p, q) => { const c = new Map(); for (const v of q) c.set(v, (c.get(v) ?? 0) + 1); return p.filter(v => { const n = c.get(v) ?? 0; if (n) { c.set(v, n - 1); return false } return true }) }
        // (a member whose lines differ by their column alone (Line[1]: locate's two-column reading of the page, which every
        // member's lines on it count): counted; any other difference listed)
        const a = only(y.members, x.members), c = only(x.members, y.members)
        const rest = only(a.map(noColumn), c.map(noColumn))
        columns.members += a.length - rest.length
        if (a.length > rest.length) columns.pages.add(`${id} p${page}`)
        for (const v of rest) diffs.push(`    other run alone: ${v.slice(0, 400)}`)
        for (const v of only(c.map(noColumn), a.map(noColumn))) diffs.push(`    run alone:       ${v.slice(0, 400)}`)
        // (a page whose members differ by their columns alone and nothing else: no difference of its own)
        if (fields.length === 1 && diffs.length === mark + 1) diffs.pop()
      }
    }
  }
}
console.log(`display-pieces: ${RUN}${OTHER ? ` against ${OTHER}` : ''}: ${sum.papers} papers, ${sum.displays} displays' parts on a page no unit owns, ${sum.lines} formula lines`)
for (const [side, t] of Object.entries(sides)) {
  if (!t.size) continue
  console.log(`\n${side === 'run' ? RUN : OTHER}:`)
  for (const [k, v] of [...t].sort()) {
    console.log(`  ${k}: ${v.n} (${v.papers.size} papers)`)
    if (k !== 'display parts' && k !== 'one piece') for (const e of v.ex) console.log(`    ${e}`)
  }
}
if (numbers.size) {
  console.log(`\nwhat a display's one member lights in ${RUN} past its formula's lines:`)
  for (const [k, v] of [...numbers].sort()) {
    console.log(`  ${k}: ${v.n} (${v.papers.size} papers)`)
    for (const e of v.ex) console.log(`    ${e}`)
  }
}
if (OTHER) {
  console.log(`\npages whose members but the kept blocks, ties, links and the rest of the part but the paper's faces are alike (ords renumbered, lines' columns aside): ${unchanged + columns.pages.size - diffs.filter(d => !d.startsWith('    ') && columns.pages.has(d.split(':')[0])).length}; differing otherwise: ${diffs.filter(d => !d.startsWith('    ')).length}`)
  for (const d of diffs.slice(0, 60)) console.log(`  ${d}`)
  console.log(`\nmembers whose lines differ by their column alone (locate's reading of a page as two columns): ${columns.members} on ${columns.pages.size} pages: ${[...columns.pages].join(', ')}`)
  console.log(`\npapers whose faces (Part.paper.faces: the members' faces by their glyphs) differ: ${faced.size}`)
  for (const [id, f] of faced) console.log(`  ${id}: ${f}`)
}
