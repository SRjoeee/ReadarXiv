// lab/marks/probe-check.mjs: the mark probe as packages/engine/src/marks/probe.ts asks it, against today's (layout/marks.mjs),
// no TeX. For each paper of the corpus, over the reading the first pass's samples come from (readSource with no definitions):
// the asked commands', the look-ahead pairs', the ink and the leads' samples equal today's functions' over the same units; the
// paper's own macros' samples (every macro of its own its units call: today asks the complete ones') listed; and each
// section's TeX equal to today's for the same samples. With --first=<dir> (the first pass's outputs, lab/source/definitions.mjs
// --probe): the answers read from its logs against today's probe answers (lab/marks/answers.json): the switches by command and
// pair, the inkless, apart and text samples; the papers whose pass states a lineskip. Not shipped.
//   node --import tsx lab/marks/probe-check.mjs --papers=<papers.json> --set=87 --bbl=<dir> [--first=<dir>] [--answers=<json>]
//        [--only=…]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as P from '../../packages/engine/src/marks/probe.ts'
import { NO_DEFINITIONS } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import * as T from '../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper } from '../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'
import { answersOf } from './answers-of.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const papers = JSON.parse(readFileSync(arg('papers'), 'utf8')).papers.filter(p => !arg('set') || p.sets.includes(arg('set')))
const only = arg('only')?.split(',')
const FIRST = arg('first')
const TODAY = arg('answers') ? JSON.parse(readFileSync(arg('answers'), 'utf8')) : null
const t = { papers: 0, samples: { asked: 0, ahead: 0, ink: 0, leads: 0, own: 0, differ: [] }, tex: { same: 0, differ: [] }, answers: null }
const A = { papers: 0, switches: { same: 0, differ: [], onlyToday: [], onlyFirst: 0 }, inkless: { same: 0, onlyToday: [], onlyFirst: [] }, apart: { same: 0, onlyToday: [], onlyFirst: [] }, texts: { same: 0, differ: [], onlyToday: [], onlyFirst: 0 }, lineskip: { stated: 0, none: [] } }
const ex = (list, x) => { list.push(x) }
for (const p of papers) {
  if (only && !only.includes(p.id)) continue
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(p.dir, 'source.gz'))))
  const main = openPaper(files).project.main
  const stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  const tree = new Map(files)
  const bp = join(arg('bbl'), `${p.id}.bbl`)
  if (!tree.has(`${stem}.bbl`) && existsSync(bp)) tree.set(`${stem}.bbl`, new Uint8Array(readFileSync(bp)))
  const pre = readSource({ main, files: tree }, NO_DEFINITIONS)
  const s = P.probeSamples(pre)
  t.papers++
  // (the samples: today's functions over the same units)
  const asked = s.punct.filter(x => !x.own), own = s.punct.filter(x => x.own)
  const tAsked = T.probeSamples(pre.units, null).filter(x => !x.ahead && !x.own).map(x => ({ command: x.command, src: x.src, ...(x.call ? { call: true } : {}) }))
  const tAhead = T.aheadSamples(pre.units).map(({ key, src, gap, follows, math }) => ({ key, src, gap, follows, math }))
  const tInk = T.inkSamples(pre.units), tLeads = T.leadSamples(pre.units, tInk)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  for (const [k, a, b] of [['asked', asked, tAsked], ['ahead', s.ahead, tAhead], ['ink', s.ink, tInk], ['leads', s.leads, tLeads]]) {
    if (same(a, b)) t.samples[k]++
    else ex(t.samples.differ, `${p.id} ${k}`)
  }
  t.samples.own += own.length
  // (the sections' TeX for these samples)
  const tSamples = s.punct.map(x => ({ ...x }))
  const n = s.punct.findIndex(x => x.own)
  const mine = [P.punctuationSection(n < 0 ? s.punct : s.punct.slice(0, n)), P.inkSection(s.ink), P.skipSection(), ...(n < 0 ? [] : [P.punctuationSection(s.punct.slice(n), n)]), P.inkSection(s.leads, s.ink.length), P.aheadSection(s.ahead)]
  const today = [T.punctuationSection(n < 0 ? tSamples : tSamples.slice(0, n)), T.inkSection(s.ink), T.skipSection(), ...(n < 0 ? [] : [T.punctuationSection(tSamples.slice(n), n)]), T.inkSection(s.leads, s.ink.length), T.aheadSection(s.ahead)]
  // (mine with its per-box reset of TeX's error count taken out (probe.ts BOX_RESET), and each own sample's guard by TeX's
  // meaning (ownGuard): its test and the braces around its tests; `@` made a letter again around each box (AT_LETTER))
  const plain = x => x.replaceAll(`${P.AT_LETTER}\\typeout`, '\\typeout').replaceAll(`\\unskip${P.AT_LETTER}`, '\\unskip').replaceAll(`}${P.AT_LETTER}\\axt@unwind`, '}\\axt@unwind').replaceAll(`/\\axt@qn}${P.BOX_RESET}`, '/\\axt@qn}').replace('\\newif\\ifaxt@qok', '').replace(/\\axt@qoktrue\\edef\\axt@qm\{[^{}]*\}(?:\\edef\\axt@qt\{\\noexpand\\in@\{\\detokenize\{(?:\\[a-z]+ |\\\\|&)\}\}\{\\axt@qm\}\}\\axt@qt\\ifin@\\axt@qokfalse\\fi)+\\ifaxt@qok\\expandafter\\@firstofone\\else\\expandafter\\@gobble\\fi\{([\s\S]*?)\\noindent\\par\}(?=\n|\\endgroup$)/g, '$1\\noindent\\par')
  if (same(mine.map(plain), today)) t.tex.same++
  else ex(t.tex.differ, p.id)
  // (the answers the first pass's log holds, against today's probe's)
  if (FIRST && TODAY?.[p.id] && existsSync(join(FIRST, `${p.id}.log`)) && existsSync(join(FIRST, `${p.id}.probe.json`))) {
    A.papers++
    const log = readFileSync(join(FIRST, `${p.id}.log`), 'latin1')
    const samples = JSON.parse(readFileSync(join(FIRST, `${p.id}.probe.json`), 'utf8'))
    const a = P.readAnswers(log, samples)
    const d = answersOf(TODAY[p.id])
    const sw = d.switches ?? {}
    for (const [k, v] of Object.entries(sw)) {
      if (!(k in a.switches)) ex(A.switches.onlyToday, `${p.id} ${k.slice(0, 70)} ${v}`)
      else if (a.switches[k] === v) A.switches.same++
      else ex(A.switches.differ, `${p.id} ${k.slice(0, 70)} today ${v} first ${a.switches[k]}`)
    }
    for (const k of Object.keys(a.switches)) if (!(k in sw)) A.switches.onlyFirst++
    for (const [name, mineL, todayL] of [['inkless', a.inkless, d.inkless ?? []], ['apart', a.apart, d.apart ?? []]]) {
      const M = new Set(mineL), D = new Set(todayL)
      for (const x of D) if (M.has(x)) A[name].same++; else ex(A[name].onlyToday, `${p.id} ${x.slice(0, 70)}`)
      for (const x of M) if (!D.has(x)) ex(A[name].onlyFirst, `${p.id} ${x.slice(0, 70)}`)
    }
    const tm = new Map(a.texts), dm = d.texts ?? new Map()
    for (const [k, v] of dm) { if (!tm.has(k)) ex(A.texts.onlyToday, `${p.id} ${k.slice(0, 60)}`); else if (tm.get(k) === v) A.texts.same++; else ex(A.texts.differ, `${p.id} ${k.slice(0, 50)} ${v} | ${tm.get(k)}`) }
    for (const k of tm.keys()) if (!dm.has(k)) A.texts.onlyFirst++
    // (today's kept answers hold no lineskip: the papers whose first pass states one)
    if (a.lineskip) A.lineskip.stated++
    else ex(A.lineskip.none, p.id)
  }
}
const cut = l => [l.length, ...l.slice(0, 20)]
const cutAll = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? cut(v) : v && typeof v === 'object' ? cutAll(v) : v]))
console.log(JSON.stringify(cutAll({ ...t, answers: FIRST ? A : null }), null, 1))
