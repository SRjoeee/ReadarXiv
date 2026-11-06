// lab/typeset/move-fit.mjs [--check]: moves today's breaker and fit (engine 065c1d973 layer-proto/layer2.mjs L2:3112-4424,
// read-only at AXT_TODAY) into packages/typeset as JavaScript, each top-level declaration whole, with its comment, into the
// file of the rule that owns it (the registry, src/rules.ts), and the changes listed below made, each asserted to occur as
// often as it is named. Nothing else of today's text changes: the moved files are today's code, typed by their
// `.types.ts` beside them (lane L1's pattern for a module moved before its port). With --check it writes nothing and exits 1
// where a moved file differs from what it would write.
//
// The changes (inputs made explicit, no behaviour): the canvas's measures (w100, ink100, tokenInk, inkRight100) read from the
// measure the call is given (`P.measure`, or `m` where no P reaches: a line's extent, a line's ink end), built from Metrics
// (fit/measure.ts); a language's hyphenation patterns from `P.patterns` (today's module map, hyphenData); the work counters
// (work.mjs, a probe's) dropped; the declarations another file of the package now holds imported from it (evenGridOf and
// measureOf, measureOn in unit/blocks.ts; originalLines in unit/decor.ts; noStart, keptPair, kinsokuOf in breaker/script.ts;
// breakPoints in breaker/hyph.ts). The fill's reuse of a layout (today's module WeakMap fillLaid) a field of the unit; the
// fill's decisions told to an optional `trace` where the tap's probes read them.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
const SOURCES = {
  layer2: readFileSync(join(TODAY, 'src/pdf-reader/engine/layer-proto/layer2.mjs'), 'utf8').split('\n'),
  run: readFileSync(join(TODAY, 'src/pdf-reader/engine/layer-proto/run.mjs'), 'utf8').split('\n'),
}
let SRC = SOURCES.layer2
const PKG = join(import.meta.dirname, '../../packages/typeset/src')
const check = process.argv.includes('--check')

/** each top-level declaration of today's file: its name, its first line (its comment's) and its last, 1-based */
function declarations(from, to, src = SRC) {
  const out = []
  for (let n = from; n <= to; n++) {
    const m = /^(?:export )?(?:function\*? |const |let )([A-Za-z_$][\w$]*)/.exec(src[n - 1])
    if (!m) continue
    let start = n
    while (start > 1 && /^(\/\*\*|\s\*|\s\*\/|\/\/)/.test(src[start - 2])) start--
    out.push({ name: m[1], start, decl: n })
  }
  for (let k = 0; k < out.length; k++) {
    let end = (out[k + 1]?.start ?? to + 1) - 1
    while (end > out[k].decl && !src[end - 1].trim()) end--
    // (a section's heading comment between two declarations stays out of either)
    while (end > out[k].decl && /^\/\/ ----/.test(src[end - 1])) { end--; while (end > out[k].decl && !src[end - 1].trim()) end-- }
    out[k].end = end
  }
  return out
}
const DECL = new Map([...declarations(3112, 4425), ...declarations(300, 320), ...declarations(595, 611), ...declarations(2428, 2437), ...declarations(3058, 3062)].map(d => [d.name, d]))
SRC = SOURCES.run
// (run.mjs's top-level functions of the fill: fillLeadsOf, closerLead, guessCloser, RUN:494-595; fillLeadsOf's comment,
// RUN:494-505, stands over fillLaid's, which is not moved)
// (and the page's fill, fillUnitsOf and fillPage, RUN:319-492; fillUnitsOf's own comment is RUN:319-324, pageTarget's above
// it stays with its port, shared/fill-target.ts)
const DECL_RUN = new Map([...declarations(505, 596, SOURCES.run), ...declarations(325, 492, SOURCES.run)].map(d => [d.name, d]))
DECL_RUN.get('fillUnitsOf').start = 319
SRC = SOURCES.layer2
const COMMENTS = { run: { fillLeadsOf: [494, 505] } }
const text = (name, from = 'layer2') => {
  const d = (from === 'run' ? DECL_RUN : DECL).get(name)
  if (!d) throw new Error(`move-fit: no declaration ${name} in today's ${from}.mjs`)
  const c = COMMENTS[from]?.[name]
  return [...(c ? SOURCES[from].slice(c[0] - 1, c[1]) : []), ...SOURCES[from].slice(d.start - 1, d.end)].join('\n')
}

/** the changes, each [find, replace, times] */
const W100 = ['w100(', 'P.measure.w100(']
const FILES = {
  'breaker/slots.mjs': {
    rule: 'B.slots',
    head: ['// B.slots (design-b §1.5): the slots (lines) a unit\'s blocks hold at a state of the fit, and the floor a paragraph\'s last line',
      '// keeps over the next line of its column. Today\'s code (layer2.mjs L2:3118-3281, flowMeasureAt L2:597-610, inFlow L2:3061),',
      '// moved by lab/typeset/move-fit.mjs; typed by slots.types.ts.'],
    imports: ["import { measureOf, measureOn } from '../unit/blocks.ts'"],
    names: ['inFlow', 'lowOf', 'footFloorAt', 'footFloorOf', 'SHORT_SKIP', 'PREDISPLAY', 'ON_LINE', 'texRoomOf', 'flowMeasureAt', 'slotsAt'],
    exports: ['inFlow', 'slotsAt'],
    changes: [],
  },
  'breaker/break.mjs': {
    rule: 'B.break',
    head: ['// B.break (design-b §1.5, T22): a unit\'s tokens broken into the slots of a state, TeX\'s \\lineskip rule settled between',
      '// lines, a word cut or hyphenated where it must be, a CJK line squeezed to take its group. Today\'s code (layer2.mjs',
      '// L2:3283-3893, graphemesOf L2:316-317, headOfCut L2:2431-2436), moved by lab/typeset/move-fit.mjs; typed by',
      '// break.types.ts. Its measures are the call\'s (`P.measure`, `m`), its patterns `P.patterns`.'],
    imports: ["import { textless } from './cuts.mjs'", "import { breakPoints } from './hyph.ts'", "import { keptPair, kinsokuOf, noStart } from './script.ts'", "import { inFlow, texRoomOf } from './slots.mjs'"],
    names: ['GRAPHEMES', 'graphemesOf', 'headOfCut', 'cropExtent', 'lineExtent', 'kernOf', 'tokW', 'SQUEEZE', 'STRETCH_MIN', 'SQUEEZE_MARKS', 'latinishOf', 'squeezable', 'breakLines'],
    exports: ['breakLines', 'latinishOf', 'squeezable'],
    changes: [
      ['export function lineExtent(line, f, scale) {', 'export function lineExtent(line, f, scale, m) {', 1],
      ['const m = tokenInk(t), k =', 'const ink = m.ink100(t.s, t.face), k =', 1],
      ['ta = Math.max(ta, up + (m.a * k * f) / 100)', 'ta = Math.max(ta, up + (ink.a * k * f) / 100)', 1],
      ['td = Math.max(td, (m.d * k * f) / 100 - up)', 'td = Math.max(td, (ink.d * k * f) / 100 - up)', 1],
      ['  work.breaks++\n', '', 1],
      ['lineExtent(l, f, scale)', 'lineExtent(l, f, scale, P.measure)', 1],
      [...W100, 6],
      ['hyphenData.get(t0.hyph)', 'P.patterns?.[t0.hyph] ?? null', 1],
    ],
  },
  'breaker/cuts.mjs': {
    rule: 'B.cuts',
    head: ['// B.cuts (design-b §1.5, T23): a unit over its frame breaks cut at its frames\' shares (the ruling of 2026-10-30: frames fill',
      '// as TeX does), and the page-break tokens set before the cuts. Today\'s code (layer2.mjs L2:3881-3974, textless',
      '// L2:4161-4162), moved by lab/typeset/move-fit.mjs; typed by cuts.types.ts.'],
    imports: ["import { kinsokuOf, noStart } from './script.ts'", "import { originalLines } from '../unit/decor.ts'"],
    names: ['textless', 'pageCutsOf', 'withPageBreaks'],
    exports: ['textless'],
    changes: [],
  },
  'breaker/place.mjs': {
    rule: 'B.place',
    head: ['// B.place (design-b §1.5, G1): each line\'s items placed (justified within the caps, ragged, centred, flush), and a fit\'s',
      '// breaking made a layout (laidOut). Today\'s code (layer2.mjs L2:3976-4038, L2:4136-4157), moved by',
      '// lab/typeset/move-fit.mjs; typed by place.types.ts.'],
    imports: ["import { latinishOf, lineExtent, squeezable } from './break.mjs'", "import { inFlow, slotsAt } from './slots.mjs'", "import { toLastLines } from '../fit/last-lines.ts'"],
    names: ['placeItems', 'laidOut'],
    exports: ['laidOut'],
    changes: [
      ['lineExtent(a, f, st.scale)', 'lineExtent(a, f, st.scale, P.measure)', 1],
      ['lineExtent(b, f, st.scale)', 'lineExtent(b, f, st.scale, P.measure)', 1],
    ],
  },
  'shared/fill-leads.mjs': {
    rule: 'S.fill.leads',
    from: 'run',
    head: ['// S.fill.leads (design-b §1.5, E30): a unit\'s fill leadings as its lay ends: the loosest leading from its fitted one up to',
      '// its top at which its fitted state still sets it whole as the page fill lays it, else the loosest closer one. Today\'s code',
      '// (run.mjs RUN:494-595: fillLeadsOf, closerLead, guessCloser), moved by lab/typeset/move-fit.mjs; typed by',
      '// fill-leads.types.ts. The layout found, which the page\'s fill reuses (today\'s fillLaid, a module WeakMap), is a field of',
      '// the unit, `fillLaid` (design-b §1.5: FillLeads.laid).'],
    imports: ["import { footFloorOf } from '../breaker/slots.mjs'", "import { layoutAt } from '../fit/at.ts'", "import { keepsPages } from '../fit/runs.ts'"],
    names: ['fillLeadsOf', 'closerLead', 'guessCloser'],
    exports: ['fillLeadsOf', 'closerLead', 'guessCloser'],
    changes: [
      ['L2.layoutAt(', 'layoutAt(', 1],
      ['L2.keepsPages(', 'keepsPages(', 1],
      ['L2.footFloorOf(', 'footFloorOf(', 1],
      ['  fillLaid.delete(p)\n', '  delete p.fillLaid\n', 1],
      ['    fillLaid.set(p, { state: st, lead: p.fillLead, l: laid })\n', '    p.fillLaid = { state: st, lead: p.fillLead, l: laid }\n', 1],
    ],
  },
  'shared/fill-page.mjs': {
    rule: 'S.fill.page',
    from: 'run',
    head: ['// S.fill.page (design-b §1.5, T33): a page\'s fill over the units begun on it, each spread over its frame at the page\'s target',
      '// leading, tracked where it stays short, and the page\'s one size where every body unit is short. Today\'s code (run.mjs',
      '// RUN:319-492: fillUnitsOf, fillPage), moved by lab/typeset/move-fit.mjs; typed by fill-page.types.ts. Its target is',
      '// S.fill.target\'s port, its settling S.settle\'s, the layout S.fill.leads found the unit\'s field `fillLaid` (today\'s module',
      '// WeakMap), the shared row\'s ink ends measured by the unit\'s own measure (`p.P.measure`); an optional `trace` is told what the',
      '// tap read inside it, at its probes\' places (baseline/tap/engine.diff): each unit\'s decision, the page\'s size, each unit filled.'],
    imports: ["import { footFloorOf } from '../breaker/slots.mjs'", "import { layoutAt } from '../fit/at.ts'", "import { keepsPages } from '../fit/runs.ts'",
      "import { closerLead, fillLeadsOf, guessCloser } from './fill-leads.mjs'", "import { BODY_KINDS, fillTarget } from './fill-target.ts'", "import { keepsShare } from './share.ts'",
      "import { settleLayout } from './settle.ts'", '', '/** a unit as S.fill.target reads it */', 'const voterOf = p => ({ kind: p.unit.kind, refused: p.refused, fillLead: p.fillLead, fitLines: p.fitLines })'],
    names: ['fillUnitsOf', 'fillPage'],
    exports: [],
    changes: [
      ['L2.layoutAt(', 'layoutAt(', 1],
      ['L2.keepsPages(', 'keepsPages(', 1],
      ['L2.footFloorOf(', 'footFloorOf(', 1],
      ['L2.keepsShare(p.share, l)', 'keepsShare(p.share, l, p.P.measure)', 2],
      ['L2.keepsShare(f.p.share, best[i])', 'keepsShare(f.p.share, best[i], f.p.P.measure)', 1],
      ['const told = pageTarget(voters ?? units, continuing, band)', 'const told = fillTarget((voters ?? units).map(voterOf), continuing.map(voterOf), band)', 1],
      ['BODY_KINDS.has(', 'BODY_KINDS.includes(', 1],
      ['    const kept = fillLaid.get(p)\n    fillLaid.delete(p)\n', '    const kept = p.fillLaid\n    delete p.fillLaid\n', 1],
      // (the trace: what the tap read inside fillPage, its probes' places and values, handed to an optional `trace`)
      ['onFilled = () => {}, { continuing = [], voters = null } = {}) {', 'onFilled = () => {}, { continuing = [], voters = null, trace = null } = {}) {', 1],
      ['    if (p.fillLead === null) continue\n', "    if (p.fillLead === null) { trace?.unit(p, { skip: 'no fill leading' }); continue }\n", 1],
      ['    if (!l) continue\n', "    if (!l) { trace?.unit(p, { skip: 'not set', lead, next }); continue }\n", 1],
      ['    filled.push({ p, st, l, full, tracked, untracked })\n', '    filled.push({ p, st, l, full, tracked, untracked })\n    trace?.unit(p, { lead, next, same: !!same, closer, short, full, tracked })\n', 1],
      ["f.l = best[i] })\n", "f.l = best[i] })\n    trace?.size(ok, scaleOf(ok), grown.map(f => [f.p.id, f.p.run ?? null, f.st.knob === 'grow']))\n", 1],
      ['    onFilled(p, target)\n', '    trace?.filled(p, st, l, target)\n    onFilled(p, target)\n', 1],
    ],
  },
}

// (the declarations moved first and since ported to TypeScript, each still today's: held by the same replays)
const PORTED = {
  'fit/at.ts': ['layoutAt'], 'fit/cut.ts': ['layoutCut'], 'fit/last-lines.ts': ['toLastLines'],
  'shared/share.ts': ['onShare', 'inkEndOf', 'shareOf', 'keepsShare'],
  'fit/runs.ts': ['runsOf', 'runParams', 'layoutRuns', 'joinRuns', 'keepsPages'],
  'fit/walk.ts': ['statesOf', 'sameState', 'sharedStates', 'layoutUnit2'],
}
let differ = 0
const moved = new Set()
for (const names of Object.values(PORTED)) for (const n of names) { text(n); moved.add(n) }
for (const [file, spec] of Object.entries(FILES)) {
  let body = spec.names.map(n => { moved.add(n); return text(n, spec.from) }).join('\n')
  for (const [find, repl, times] of spec.changes) {
    const n = body.split(find).length - 1
    if (n !== times) throw new Error(`move-fit: ${file}: "${find.trim()}" occurs ${n} times, not ${times}`)
    body = body.split(find).join(repl)
  }
  for (const n of ['work.', 'hyphenData', 'tokenInk(', 'inkRight100(', ' ink100(', ' w100(', '(w100(']) if (body.includes(n) && !body.includes(`m.${n.trim()}`) && !body.includes(`P.measure.${n.replace(/[(\s]/g, '')}`)) {
    const lines = body.split('\n').filter(l => l.includes(n) && !/^\s*(\/\/|\*|\/\*\*)/.test(l) && !l.includes(`measure.${n.replace(/[(\s]/g, '')}`) && !l.includes(`m.${n.replace(/[(\s]/g, '')}`))
    if (lines.length) throw new Error(`move-fit: ${file}: today's ${n} still read: ${lines[0].trim().slice(0, 100)}`)
  }
  const exp = spec.exports.length ? `\nexport { ${spec.exports.join(', ')} }\n` : '\n'
  const out = `${spec.head.join('\n')}\n${spec.imports.join('\n')}${spec.imports.length ? '\n' : ''}\n${body}\n${exp}`
  const path = join(PKG, file)
  if (check) { let cur = null; try { cur = readFileSync(path, 'utf8') } catch {} if (cur !== out) { differ++; console.log(`move-fit: ${file} differs`) } } else writeFileSync(path, out)
}
const left = [...DECL.keys()].filter(n => !moved.has(n) && DECL.get(n).decl >= 3112)
console.log(`move-fit: ${Object.keys(FILES).length} files, ${moved.size} declarations moved (${Object.values(PORTED).flat().length} since ported); not moved: ${left.join(', ')}`)
if (check) process.exit(differ ? 1 : 0)
