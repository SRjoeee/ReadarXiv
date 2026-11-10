// lab/marks/writer-vs-today.mjs: the marks markSource writes against those today's marks writer writes (live.mjs originalFiles
// with the layout marking, as the marked original takes it), paper by paper, file by file: the sequence of marks each file
// receives (their names, in the file's order), with no TeX run. Today's units and SourceDoc's are each their own reader's, so
// a paper whose units differ (the stage 1c classes) differs here too. The probe's answers: none (`--answers=none`, the marks
// as with no probe run), or a JSON file of answers by paper id (`--answers=<file>`: { "<id>": { switches, inkless, complete,
// apart } }, as the marked original took them).
//   node --experimental-strip-types lab/marks/writer-vs-today.mjs --papers=<papers.json> --set=87 --defs=<dir> [--only=…]
//        [--answers=none|<file>] [--examples=3] [--out=<file.json>]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { markSource } from '../../packages/engine/src/marks/mark.ts'
import { LAYOUT_CLASSES } from '../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'
import { answersOf } from './answers-of.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const only = arg('only')?.split(',')
const ANSWERS = arg('answers') && arg('answers') !== 'none' ? JSON.parse(readFileSync(arg('answers'), 'utf8')) : {}
const EXAMPLES = Number(arg('examples') ?? 3)
/** our marks in a file's text, in order: the macro and its argument (a babel name's wrap by its key) */
const MARK = /\\(axtmark|axtend|axthmark|axtpma|axtpmm|axtpm|axthpk|axttg|axtcolour|axtlines|axtbrname|axtnma|axtnmb)\{([^{}]*)\}/g
const latin1 = b => Buffer.from(b).toString('latin1')
/** a mark's name with its unit's index made the unit's id (8 hex), so that two readers' numberings compare */
const named = (name, idOf) => name.replace(/^([thpnc]?)(\d+)(?=[se.]|$)/, (_, k, i) => `${k}${idOf[Number(i)]?.slice(0, 8) ?? `?${i}`}`)
const seqOf = (bytes, idOf) => [...latin1(bytes).matchAll(MARK)].map(m => `${m[1]}{${m[1].startsWith('axtnm') ? m[2] : named(m[2], idOf)}}`)
// (today's unit ids as FORMAT.md §2 states them: lab/source/compare.mjs's)
const { createHash } = await import('node:crypto')
const UTF8 = new TextDecoder()
const decode = s => { if (typeof s !== 'string') return ''; if (!/[\x80-\xff]/.test(s)) return s; return UTF8.decode(Uint8Array.from(s, c => c.charCodeAt(0) & 0xff)) }
function todayIds(units) {
  const ids = new Map()
  const tag = u => {
    if (ids.has(u)) return ids.get(u)
    const t = u.pieces.map(p => (p.t === 'text' ? ['t', decode(p.s)] : p.t === 'ph' ? ['p', decode(p.src)] : p.t === 'open' ? ['o', decode(p.src)] : p.t === 'close' ? ['c', decode(p.src)] : ['n', decode(p.pre), tag(p.unit), decode(p.post)]))
    const id = createHash('sha256').update(JSON.stringify([u.kind, t]), 'utf8').digest('hex')
    ids.set(u, id)
    return id
  }
  return units.map(tag)
}
const tot = { papers: 0, files: 0, same: 0, differ: 0, marksToday: 0, marksMine: 0, units: { both: 0, same: 0, differ: 0 }, spans: { today: 0, mine: 0, units: 0, alike: 0, differ: [] }, failed: [] }
/** a unit's span marks (a head macro's \\axthpk, a trailing macro's \\axttg), which the two writers must write alike */
const spanMarks = list => list.filter(m => /^axt(?:hpk|tg)\{/.test(m))
/** a file's marks by the unit they name (its id's 8 hex), in order */
const byUnit = (seq, into) => { for (const m of seq) { const k = /\{[thpnc]?([0-9a-f]{8}|\?\d+)/.exec(m)?.[1]; if (k) (into.get(k) ?? into.set(k, []).get(k)).push(m) } return into }
const unitDiffs = []
const per = []
const ex = []
for (const p of papers) {
  if (only && !only.includes(p.id)) continue
  try {
    const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
    const paper = openPaper(files)
    const main = paper.project.main
    const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
    const bbl = (() => { try { return new Uint8Array(readFileSync(join(arg('defs'), `${p.id}.bbl`))) } catch { return null } })()
    const tree = new Map(files)
    if (bbl && !tree.has(`${stem}.bbl`)) tree.set(`${stem}.bbl`, bbl)
    const a = ANSWERS[p.id] ?? {}
    const today = originalFiles(bbl && !files.has(`${stem}.bbl`) ? openPaper(tree) : paper, { lines: true, layout: LAYOUT_CLASSES, switches: a.switches ?? null, inkless: a.inkless ?? null, complete: a.complete ?? null, apart: a.apart ?? null })
    const doc = readSource({ main, files: tree }, readDefinitions(readFileSync(join(arg('defs'), `${p.id}.axtdefs`), 'utf8')))
    const mine = markSource({ main, files: tree }, doc, { compiler: paper.meta.compiler ?? 'pdflatex', answers: answersOf(a) })
    const tIds = todayIds((bbl && !files.has(`${stem}.bbl`) ? openPaper(tree) : paper).units), mIds = doc.units.map(u => u.id)
    let same = 0, differ = 0
    const tU = new Map(), mU = new Map()
    for (const path of new Set([...today.keys(), ...mine.tree.files.keys()])) {
      if (!/\.(?:tex|sty|cls|bbl|ltx)$/i.test(path)) continue
      const t = seqOf(today.get(path) ?? tree.get(path), tIds), m = seqOf(mine.tree.files.get(path) ?? tree.get(path), mIds)
      if (!t.length && !m.length) continue
      byUnit(t, tU)
      byUnit(m, mU)
      tot.files++
      tot.marksToday += t.length
      tot.marksMine += m.length
      if (t.join('\n') === m.join('\n')) { same++; continue }
      differ++
      let k = 0
      while (k < t.length && t[k] === m[k]) k++
      if (ex.length < 200) ex.push({ id: p.id, path, at: k, today: t.slice(k, k + EXAMPLES), mine: m.slice(k, k + EXAMPLES), counts: [t.length, m.length] })
    }
    tot.same += same
    tot.differ += differ
    for (const [k, list] of tU) {
      if (!mU.has(k)) continue
      const st = spanMarks(list), sm = spanMarks(mU.get(k))
      tot.spans.today += st.length
      tot.spans.mine += sm.length
      if (st.length || sm.length) {
        tot.spans.units++
        if (st.join(' ') === sm.join(' ')) tot.spans.alike++
        else if (tot.spans.differ.length < 40) tot.spans.differ.push(`${p.id} ${k}: today ${st.join(' ')} | mine ${sm.join(' ')}`)
      }
      tot.units.both++
      if (list.join(' ') === mU.get(k).join(' ')) tot.units.same++
      else { tot.units.differ++; if (unitDiffs.length < 40) unitDiffs.push({ id: p.id, unit: k, today: list.join(' ').slice(0, 300), mine: mU.get(k).join(' ').slice(0, 300) }) }
    }
    tot.papers++
    per.push({ id: p.id, same, differ, units: doc.units.length, todayUnits: paper.units.length })
  } catch (e) {
    tot.failed.push(`${p.id}: ${e?.stack?.split('\n').slice(0, 3).join(' / ') ?? e}`)
  }
}
console.log(JSON.stringify(tot, null, 1))
for (const x of ex.slice(0, 40)) console.log(x.id, x.path, `@${x.at}`, x.counts.join('/'), 'today', x.today.join(' '), '| mine', x.mine.join(' '))
for (const x of unitDiffs) console.log('UNIT', x.id, x.unit, '\n  today', x.today, '\n  mine ', x.mine)
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ tot, per, ex, unitDiffs }, null, 1))
