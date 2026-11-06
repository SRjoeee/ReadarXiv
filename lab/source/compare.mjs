// lab/source/compare.mjs: today's units against readSource's, paper by paper, joined by content id.
//
// "Today" is twofold: the baseline's prepare dumps (baseline/prepare/<id>.prepare.json: the units the bundle held, the
// contract's measure), and today's front end run here on the same tree as readSource (loadProject of
// src/pdf-reader/engine/source/latex-front.mjs), which has each unit's place, so that a difference is paired with the new
// unit standing where it stood. Each side's units are joined by id (the k-th of an id with the k-th); what is left is
// `changed` where a unit of the other side stands at the same place (the first piece that differs told), else `only today`
// or `only new`. Every difference gets a signature (what the first differing piece is on each side) so that its class can be
// counted, with three examples each.
//   node --experimental-strip-types lab/source/compare.mjs --papers=<papers.json> --set=87 --defs=<dir> --baseline=<dir>
//        [--only=id,…] [--out=<file.json>] [--examples=3] [--classes]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { analyze } from '../../src/pdf-reader/engine/source/paper-meta.mjs'
import { inMemory, loadProject } from '../../src/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const only = arg('only')?.split(',')
const DEFS = arg('defs')
const BASE = arg('baseline')
const EXAMPLES = Number(arg('examples') ?? 3)
const SOURCE_KINDS = new Set('para heading caption footnote cell abstract theorem figure author affiliation reference'.split(' '))
const UTF8 = new TextDecoder()
const enc = new TextEncoder()

// ---------------------------------------------------------------- today's units, identified as FORMAT.md §2 says
const { createHash } = await import('node:crypto')
const decode = s => {
  if (typeof s !== 'string') return ''
  let ascii = true
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7f) { ascii = false; break }
  if (ascii) return s
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
  return UTF8.decode(b)
}
const idOf = (kind, tagged) => createHash('sha256').update(JSON.stringify([kind, tagged]), 'utf8').digest('hex')
function todayUnits(project) {
  const ids = new Map()
  const tag = u => {
    if (ids.has(u)) return ids.get(u)
    const t = u.pieces.map(p => (p.t === 'text' ? ['t', decode(p.s)] : p.t === 'ph' ? ['p', decode(p.src)] : p.t === 'open' ? ['o', decode(p.src)] : p.t === 'close' ? ['c', decode(p.src)] : ['n', decode(p.pre), tag(p.unit), decode(p.post)]))
    const id = idOf(u.kind, t)
    ids.set(u, id)
    u.tagged = t
    return id
  }
  return project.units.map(u => ({ id: tag(u), kind: u.kind, file: u.file, start: u.start, end: u.end, tagged: u.tagged }))
}
/** a new unit's pieces as the id's hash reads them */
function flat(content, out = []) {
  for (const p of content) {
    if (p.t === 'text') out.push(['t', p.s])
    else if (p.t === 'el') out.push(['p', p.src])
    else if (p.t === 'span') { if (p.open !== undefined) out.push(['o', p.open]); flat(p.content, out); if (p.close !== undefined) out.push(['c', p.close]) }
    else out.push(['n', p.pre, p.unit, p.post])
  }
  return out
}
/** today's offsets are a file's latin1 bytes; the new reader's its UTF-16 text: both made byte offsets */
function byteOffsets(text) {
  const out = new Uint32Array(text.length + 1)
  let b = 0
  for (let i = 0; i < text.length; i++) {
    out[i] = b
    const c = text.charCodeAt(i)
    b += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3
  }
  out[text.length] = b
  return out
}

/** a multiset join by id: [pairs, leftA, leftB] */
function join2(a, b) {
  const byId = new Map()
  for (const x of b) (byId.get(x.id) ?? byId.set(x.id, []).get(x.id)).push(x)
  const left = []
  const used = new Set()
  for (const x of a) {
    const list = byId.get(x.id)
    const y = list?.shift()
    if (y) used.add(y)
    else left.push(x)
  }
  return [left, b.filter(y => !used.has(y))]
}
const short = s => JSON.stringify(s.length > 60 ? `${s.slice(0, 57)}…` : s)
const shape = p => (!p ? 'end' : p[0] === 't' ? `text` : p[0] === 'p' ? `el ${/^\\[A-Za-z@]+|^\\.|^./.exec(p[1])?.[0] ?? ''}` : p[0] === 'o' ? `open ${/^\\[A-Za-z@]+|^./.exec(p[1])?.[0] ?? ''}` : p[0] === 'c' ? 'close' : 'nested')
/** where two pieces lists first differ, and its signature */
function firstDiff(x, y) {
  let k = 0
  while (k < x.length && k < y.length && JSON.stringify(x[k].slice(0, 4)) === JSON.stringify(y[k].slice(0, 4))) k++
  const a = x[k], b = y[k]
  let sig = `${shape(a)} | ${shape(b)}`
  if (a && b && a[0] === 't' && b[0] === 't') {
    // two texts: where they part
    let j = 0
    while (j < a[1].length && a[1][j] === b[1][j]) j++
    sig = `text parts at ${short(a[1].slice(j, j + 12))} | ${short(b[1].slice(j, j + 12))}`.replace(/"[^"]*"/g, m => (m.length > 8 ? `"${m.slice(1, 7).replace(/\w/g, 'a')}…"` : m))
  }
  return { k, sig, today: a ? `${a[0]}:${short(a[1] ?? '')}` : 'end', mine: b ? `${b[0]}:${short(b[1] ?? '')}` : 'end' }
}

const tally = new Map()
const add = (cls, sig, ex) => {
  const k = `${cls} :: ${sig}`
  const t = tally.get(k) ?? tally.set(k, { cls, sig, n: 0, papers: new Set(), ex: [] }).get(k)
  t.n++
  t.papers.add(ex.id)
  if (t.ex.length < EXAMPLES) t.ex.push(ex)
}
const totals = { papers: 0, baseline: 0, sameBaseline: 0, today: 0, mine: 0, same: 0, changed: 0, onlyToday: 0, onlyNew: 0, names: 0, failed: [] }
const perPaper = []
for (const p of papers) {
  if (only && !only.includes(p.id)) continue
  try {
    const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
    const meta = analyze(inMemory(files))
    const main = meta.main
    const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
    try { files.set(`${stem}.bbl`, new Uint8Array(readFileSync(join(DEFS, `${p.id}.bbl`)))) } catch {}
    const defs = readDefinitions(readFileSync(join(DEFS, `${p.id}.axtdefs`), 'utf8'))
    const t0 = performance.now()
    const doc = readSource({ main, files }, defs)
    const ms = performance.now() - t0
    const t1 = performance.now()
    const project = loadProject(inMemory(files), main, { tables: true })
    const todayMs = performance.now() - t1
    const today = todayUnits(project)
    const mine = doc.units.map(u => ({ id: u.id, kind: u.kind, file: u.file, start: u.start, end: u.end, tagged: flat(u.content) }))
    // the baseline's source units
    const dump = JSON.parse(readFileSync(join(BASE, `${p.id}.prepare.json`), 'utf8'))
    const base = dump.units.filter(u => SOURCE_KINDS.has(u.kind))
    totals.names += dump.units.filter(u => u.kind === 'name').length
    const [baseLeft] = join2(base, mine)
    totals.baseline += base.length
    totals.sameBaseline += base.length - baseLeft.length
    // today (run here) against new, paired by place
    const [tLeft, mLeft] = join2(today, mine)
    totals.papers++
    totals.today += today.length
    totals.mine += mine.length
    totals.same += today.length - tLeft.length
    const texts = new Map()
    const offsets = f => texts.get(f) ?? texts.set(f, byteOffsets(UTF8.decode(files.get(f)).replace(/\r\n?/g, '\n'))).get(f)
    const placed = mLeft.map(u => ({ ...u, b0: offsets(u.file)[u.start], b1: offsets(u.file)[u.end] }))
    const taken = new Set()
    for (const u of tLeft) {
      const v = placed.find(x => !taken.has(x) && x.file === u.file && x.b0 < u.end && u.start < x.b1 && x.kind === u.kind) ?? placed.find(x => !taken.has(x) && x.file === u.file && x.b0 < u.end && u.start < x.b1)
      if (v) {
        taken.add(v)
        totals.changed++
        const d = v.kind !== u.kind ? { sig: `kind ${u.kind} | ${v.kind}`, today: u.kind, mine: v.kind, k: 0 } : firstDiff(u.tagged, v.tagged)
        add('changed', d.sig, { id: p.id, kind: u.kind, at: `${u.file}:${u.start}`, today: d.today, mine: d.mine, piece: d.k })
      } else {
        totals.onlyToday++
        add('only today', `${u.kind} ${shape(u.tagged[0])}`, { id: p.id, kind: u.kind, at: `${u.file}:${u.start}`, today: u.tagged.slice(0, 3).map(x => `${x[0]}:${short(x[1] ?? '')}`).join(' ') })
      }
    }
    for (const v of placed) {
      if (taken.has(v)) continue
      totals.onlyNew++
      add('only new', `${v.kind} ${shape(v.tagged[0])}`, { id: p.id, kind: v.kind, at: `${v.file}:${v.b0}`, mine: v.tagged.slice(0, 3).map(x => `${x[0]}:${short(x[1] ?? '')}`).join(' ') })
    }
    perPaper.push({ id: p.id, baseline: base.length, sameBaseline: base.length - baseLeft.length, today: today.length, mine: mine.length, same: today.length - tLeft.length, ms: Math.round(ms * 10) / 10, todayMs: Math.round(todayMs * 10) / 10, bytes: [...files].filter(([f]) => doc.files.includes(f)).reduce((n, [, b]) => n + b.length, 0) })
  } catch (e) {
    totals.failed.push(`${p.id}: ${e?.stack?.split('\n').slice(0, 3).join(' / ') ?? e}`)
  }
}
console.log(JSON.stringify(totals, null, 1))
const rows = [...tally.values()].sort((a, b) => b.n - a.n)
for (const r of rows) {
  console.log(`${String(r.n).padStart(6)} ${String(r.papers.size).padStart(3)}p  ${r.cls} :: ${r.sig}`)
  if (process.argv.includes('--classes')) for (const x of r.ex) console.log(`           ${x.id} ${x.kind} ${x.at}  today ${x.today ?? '-'}  new ${x.mine ?? '-'}`)
}
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ totals, perPaper, classes: rows.map(r => ({ ...r, papers: r.papers.size })) }, null, 1))
void enc
