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
// breakPoints in breaker/hyph.ts).
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
const DECL_RUN = new Map(declarations(505, 596, SOURCES.run).map(d => [d.name, d]))
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
    imports: ["import { latinishOf, lineExtent, squeezable } from './break.mjs'", "import { inFlow, slotsAt } from './slots.mjs'", "import { toLastLines } from '../fit/last-lines.mjs'"],
    names: ['placeItems', 'laidOut'],
    exports: ['laidOut'],
    changes: [
      ['lineExtent(a, f, st.scale)', 'lineExtent(a, f, st.scale, P.measure)', 1],
      ['lineExtent(b, f, st.scale)', 'lineExtent(b, f, st.scale, P.measure)', 1],
    ],
  },
  'fit/walk.mjs': {
    rule: 'X.walk',
    head: ['// X.walk (design-b §1.5, T31): the fit\'s states, from the most natural, each knob taken to its bound before the next, and',
      '// a unit laid at the first state at which every token is placed. Today\'s code (layer2.mjs L2:4040-4134), moved by',
      '// lab/typeset/move-fit.mjs; typed by walk.types.ts.'],
    imports: ["import { breakLines } from '../breaker/break.mjs'", "import { laidOut } from '../breaker/place.mjs'", "import { slotsAt } from '../breaker/slots.mjs'"],
    names: ['statesOf', 'sameState', 'sharedStates', 'layoutUnit2'],
    exports: ['statesOf'],
    changes: [['    work.fit++\n', '', 1]],
  },
  'fit/cut.mjs': {
    rule: 'X.cut',
    head: ['// X.cut (design-b §1.5): a unit laid over its frame breaks, kept where it fits at its plain layout\'s state. Today\'s',
      '// code (layer2.mjs L2:3944-3962), moved by lab/typeset/move-fit.mjs; typed by cut.types.ts.'],
    imports: ["import { pageCutsOf, withPageBreaks } from '../breaker/cuts.mjs'", "import { layoutAt } from './at.mjs'", "import { layoutUnit2 } from './walk.mjs'"],
    names: ['layoutCut'],
    exports: [],
    changes: [],
  },
  'fit/at.mjs': {
    rule: 'X.at',
    head: ['// X.at (design-b §1.5): a unit laid at one state of the fit, with no search (the page fill\'s). Today\'s code',
      '// (layer2.mjs L2:4259-4267), moved by lab/typeset/move-fit.mjs; typed by at.types.ts.'],
    imports: ["import { breakLines } from '../breaker/break.mjs'", "import { laidOut } from '../breaker/place.mjs'", "import { slotsAt } from '../breaker/slots.mjs'"],
    names: ['layoutAt'],
    exports: [],
    changes: [['  work.fit++\n', '', 1]],
  },
  'fit/last-lines.mjs': {
    rule: 'X.lastLines',
    head: ['// X.lastLines (design-b §1.5, T25; the ruling of 2026-10-19: a heading on the original\'s last baseline): a heading set in',
      '// fewer lines than the original\'s stands on its last ones. Today\'s code (layer2.mjs L2:4268-4314), moved by',
      '// lab/typeset/move-fit.mjs; typed by last-lines.types.ts.'],
    imports: ["import { originalLines } from '../unit/decor.ts'"],
    names: ['toLastLines'],
    exports: ['toLastLines'],
    changes: [],
  },
  'fit/runs.mjs': {
    rule: 'X.runs',
    head: ['// X.runs (design-b §1.5, T6, T32, E28; the ruling of 2026-10-09: sizes per unit): a unit\'s runs between its displays,',
      '// each laid as its own text block, joined as one layout; and whether a layout keeps the pages its fit set its lines on.',
      '// Today\'s code (layer2.mjs L2:4163-4257, L2:4379-4400), moved by lab/typeset/move-fit.mjs; typed by runs.types.ts.'],
    imports: ["import { textless } from '../breaker/cuts.mjs'", "import { layoutUnit2 } from './walk.mjs'"],
    names: ['runsOf', 'runParams', 'layoutRuns', 'joinRuns', 'keepsPages'],
    exports: [],
    changes: [],
  },
  'shared/fill-leads.mjs': {
    rule: 'S.fill.leads',
    from: 'run',
    head: ['// S.fill.leads (design-b §1.5, E30): a unit\'s fill leadings as its lay ends: the loosest leading from its fitted one up to',
      '// its top at which its fitted state still sets it whole as the page fill lays it, else the loosest closer one. Today\'s code',
      '// (run.mjs RUN:494-595: fillLeadsOf, closerLead, guessCloser), moved by lab/typeset/move-fit.mjs; typed by',
      '// fill-leads.types.ts. The fill\'s reuse of the layout found (today\'s fillLaid, module state) is dropped: S.fill.page lays',
      '// the unit at that state again, the same layout.'],
    imports: ["import { footFloorOf } from '../breaker/slots.mjs'", "import { layoutAt } from '../fit/at.mjs'", "import { keepsPages } from '../fit/runs.mjs'"],
    names: ['fillLeadsOf', 'closerLead', 'guessCloser'],
    exports: ['fillLeadsOf', 'closerLead', 'guessCloser'],
    changes: [
      ['L2.layoutAt(', 'layoutAt(', 1],
      ['L2.keepsPages(', 'keepsPages(', 1],
      ['L2.footFloorOf(', 'footFloorOf(', 1],
      ['  fillLaid.delete(p)\n', '', 1],
      ['    fillLaid.set(p, { state: st, lead: p.fillLead, l: laid })\n', '', 1],
    ],
  },
  'shared/share.mjs': {
    rule: 'S.share',
    head: ['// S.share (design-b §1.5, E29): the shared row as a unit\'s layout leaves it (where its text and its ink end there), and',
      '// whether a layout keeps it (keepsShare, read by S.fill.page). Today\'s code (layer2.mjs L2:4321-4424), moved by',
      '// lab/typeset/move-fit.mjs; typed by share.types.ts. Its ink measures are the call\'s (`m`).'],
    imports: [],
    names: ['onShare', 'inkEndOf', 'shareOf', 'keepsShare'],
    exports: [],
    changes: [
      ['function inkEndOf(line, L) {', 'function inkEndOf(line, L, m) {', 1],
      ['const r = inkRight100(t.s, t.face)', 'const r = m.inkRight100(t.s, t.face)', 1],
      ['(ink100(t.s, t.face).a * k * f)', '(m.ink100(t.s, t.face).a * k * f)', 1],
      ['export function shareOf(layout, blocks, row) {', 'export function shareOf(layout, blocks, row, m) {', 1],
      ['inkEndOf(l, layout)', 'inkEndOf(l, layout, m)', 2],
      ['inkEndOf(last, layout)', 'inkEndOf(last, layout, m)', 2],
      ['export function keepsShare(share, layout) {', 'export function keepsShare(share, layout, m) {', 1],
    ],
  },
}

let differ = 0
const moved = new Set()
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
console.log(`move-fit: ${Object.keys(FILES).length} files, ${moved.size} declarations moved; not moved: ${left.join(', ')}`)
if (check) process.exit(differ ? 1 : 0)
