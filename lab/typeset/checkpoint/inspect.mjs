// lab/typeset/checkpoint/inspect.mjs --examples=<pick.mjs's file> <example id>[,<id>…]: for each example, its member as the paper's
// part holds it (the elements it keeps, their text and ink, its label) and the unit of each variant's dump (lines with the crop
// marker shown as «E», the crops), the triage's evidence for what is kept, what is turned off and what a line says. --near=<x0,y0,
// x1,y1>: the members of the page whose lines meet that box (who owns the ink there).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { read } from '../../../packages/format/src/index.ts'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const sheet = JSON.parse(readFileSync(arg('examples'), 'utf8'))
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--')).flatMap((a) => a.split(','))
const all = sheet.corrections.flatMap((c) => c.examples)
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)
for (const id of ids) {
  const e = all.find((x) => x.id === id)
  if (!e) { console.log(`${id}: no such example`); continue }
  console.log(`=== ${id} ${e.paper}-${e.target} p${e.page} ord ${e.ord} ${e.kind} (${e.cls})`)
  const files = readdirSync(e.bundle).filter((f) => f.endsWith('.part'))
  // (an example's ord is its dump unit's, today's numbering: its member is the k-th of the part's members with the unit's id, k
  // its rank among the dump's units of that id, the converter's join, packages/reader/e2e/page/convert.ts)
  const dumps = Object.fromEntries(['b', 'c', 'd'].map((v) => [v, JSON.parse(readFileSync(e.dumps[v], 'utf8'))]))
  const unit = ['c', 'd', 'b'].map((v) => dumps[v].units.find((u) => u.ord === e.ord)).find(Boolean)
  const v0 = ['c', 'd', 'b'].find((v) => dumps[v].units.some((u) => u.ord === e.ord))
  const k = unit ? dumps[v0].units.filter((u) => u.id === unit.id && u.ord < e.ord).length : 0
  const members = new Map()
  for (const f of files) {
    const part = read('part', new Uint8Array(readFileSync(join(e.bundle, f))), f.split('.')[0])
    for (const flow of part.flows) for (const x of flow) if (!members.has(x.ord)) members.set(x.ord, x)
  }
  const m = unit ? ([...members.values()].filter((x) => x.text === unit.id).sort((a, b) => a.ord - b.ord)[k] ?? null) : null
  if (!m) { console.log('  member not found: no part member joins the unit'); continue }
  console.log(`  member ord ${m.ord} (the dumps' ord ${e.ord})`)
  console.log(`  member lines: ${JSON.stringify(m.lines.map((l) => l.map(r2)))}`)
  console.log(`  member: text id ${String(m.text).slice(0, 12)} why ${m.why ?? '-'} fixed ${m.fixed ?? 0} lead ${r2(m.lead)} lines ${m.lines.length} label ${m.label ? JSON.stringify(m.label.ink.map(r2)) : '-'}`)
  for (const [id2, el] of m.els ?? []) console.log(`  el ${id2}: keep ${el.keep} text ${JSON.stringify(el.text)} ink ${JSON.stringify((el.ink ?? []).map((i) => i.map(r2)))}`)
  const near = arg('near')?.split(',').map(Number)
  if (near) {
    // (the members of the page whose lines meet the box [x0,y0,x1,y1]: who owns the ink there)
    for (const f of files) {
      const part = read('part', new Uint8Array(readFileSync(join(e.bundle, f))), f.split('.')[0])
      if (part.page !== e.page) continue
      const seen = new Set()
      for (const flow of part.flows) for (const x of flow) {
        if (seen.has(x.ord)) continue
        seen.add(x.ord)
        const hit = x.lines.filter((l) => l[0] === e.page && l[2] < near[2] && l[3] > near[0] && l[6] < near[3] && l[5] > near[1])
        if (hit.length) console.log(`  near: ord ${x.ord} ${x.kind ?? ''} why ${x.why ?? '-'} fixed ${x.fixed ?? 0} text ${String(x.text).slice(0, 8)} lines ${JSON.stringify(hit.map((l) => l.map(r2)))} els ${(x.els ?? []).map(([i, el]) => `${i}:${el.kind}:${JSON.stringify(el.text)}`).join(' ')}`)
      }
    }
  }
  for (const v of ['b', 'c', 'd']) {
    const dump = dumps[v]
    const us = dump.units.filter((u) => u.ord === e.ord)
    for (const u of us) {
      console.log(`  [${v}] unit ${u.id.slice(0, 8)} size ${r2(u.size)} lead ${r2(u.leading)} lines ${u.lines.length} elements ${(u.elements ?? []).length}`)
      for (const l of u.lines) console.log(`     p${l.page} y${r2(l.baseline)} ${r2(l.x0)}-${r2(l.x1)} ${JSON.stringify((l.text ?? '').replaceAll('￼', '«E»'))}`)
      for (const el of u.elements ?? []) console.log(`     crop k${el.k} p${el.page} x${r2(el.x0)}-${r2(el.x1)} top ${r2(el.top)} bottom ${r2(el.bottom)}`)
    }
    if (!us.length) console.log(`  [${v}] no unit of ord ${e.ord}${(dump.notLaid ?? []).filter((n) => n.ord === e.ord).map((n) => ` notLaid ${n.why}`).join('')}`)
  }
}
