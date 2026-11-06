// lab/typeset/derive.mjs [<tap dir>] [<out dir>]: the inputs of lane L3's replays that the tap does not record as such, derived
// from its recorded inputs with today's own code (engine 065c1d973, read-only; its private functions by hook.mjs). Run:
//   node --import ./lab/typeset/register.mjs lab/typeset/derive.mjs
// Each is a value today's reader works out from the page's characters before it typesets, which lane L1 is moving into the part
// (stage1a2-facts.md); a port takes it from here until the part states it, and the file says which field will. Written to
// lab-data (`lanes/L3/replay/<name>.json.gz`): they hold licensed papers' text, and are never committed.
//
// - `U.breaks`: for every sampled round with a reading (U.elements:in), the lines each source piece's words stand on as the
//   alignment found them (prepareUnit's `pieceLines`, read once by paragraphBreaks: L1's El.opens / SpanAt.opens) and each
//   piece's class (phClass2: L1's El.kind). Today's reading is run again on the recorded inputs, its answer checked equal to the
//   recorded one, and the `pieceLines` it hands its parts' `breaks` taken.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const LAB = process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data'
const TAP = process.argv[2] ?? join(LAB, 'refactor-2026-11/baseline/tap')
const OUT = process.argv[3] ?? join(LAB, 'refactor-2026-11/lanes/L3/replay')
const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => { throw new Error('no measuring in a derivation') }, font: '' } } }
const E = `${TODAY}/src/pdf-reader/engine/layer-proto/`
const L2 = await import(`${E}layer2.mjs`), TEX = await import(`${E}tex.mjs`)
const { unser } = await import(join(TAP, 'tools/samples.mjs'))
const read = f => JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'))
const gz = (f, v) => writeFileSync(f, gzipSync(Buffer.from(JSON.stringify(v), 'utf8'), { level: 9 }))
mkdirSync(OUT, { recursive: true })

/** a value with Maps and Sets as their entries, functions as one: equal values compare equal (the tap's replay-check norm) */
const norm = v => JSON.stringify(v, (k, x) => (x instanceof Map ? { $map: [...x], $props: { ...x } } : x instanceof Set ? { $set: [...x] } : typeof x === 'function' || (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && 'fn' in x) ? { fn: 1 } : x))

/** every sampled round that holds a reading's inputs and output (U.elements:in, :out), once, from every rule's sample file */
function readings() {
  const seen = new Map()
  for (const f of readdirSync(join(TAP, 'samples')).filter(f => f.endsWith('.json.gz') && (f.startsWith('U.') || f.startsWith('B.')))) {
    const s = read(join(TAP, 'samples', f))
    for (const e of s.entries ?? []) {
      const byRound = new Map()
      for (const c of e.captures ?? []) (byRound.get(c.round) ?? byRound.set(c.round, {}).get(c.round))[c.rule] = c.value
      for (const [round, c] of byRound) {
        const key = `${e.pair}|${e.ord}|${round}`
        if (c['U.elements:in'] && c['U.elements:out'] && !seen.has(key)) seen.set(key, { pair: e.pair, ord: e.ord, round, rule: s.rule, inn: c['U.elements:in'], out: c['U.elements:out'] })
      }
    }
  }
  return [...seen.values()]
}

/** today's reading run again on a round's recorded inputs, its parts' calls watched */
function reread(x) {
  const i = unser(x.inn), want = unser(x.out)
  const parts = TEX.texParts(i.lu, i.kOf, { lines: i.lines, extents: i.extents, shown: i.shown, lineskip: i.lineskip })
  const seen = { pieceLines: null }
  const breaks = parts.breaks
  parts.breaks = (unit, pieceLines) => { seen.pieceLines = pieceLines; return breaks(unit, pieceLines) }
  const got = L2.prepareUnit(i.unit, i.rects, i.local, i.phMode === 'source' ? null : new Map(), null, parts)
  return { i, want, got, seen, equal: norm(got) === norm(want) }
}

const breaks = { format: 'readarxiv-L3/derived 1', rule: 'U.breaks', note: 'per sampled round (pair|ord|round): pieceLines, the lines each source piece\'s words stand on (prepareUnit\'s, read by paragraphBreaks; L1 states it as El.opens / SpanAt.opens), and cls2, each row piece\'s phClass2 class (L1: El.kind)', cases: {} }
let n = 0, unequal = 0
for (const x of readings()) {
  const r = reread(x)
  n++
  if (!r.equal) { unequal++; continue }
  breaks.cases[`${x.pair}|${x.ord}|${x.round}`] = {
    from: x.rule,
    pieceLines: r.seen.pieceLines ? [...r.seen.pieceLines] : null,
    cls2: r.i.unit.pieces.map(p => (p.t === 'ph' ? L2.phClass2(p.src).cls : null)),
  }
}
gz(join(OUT, 'U.breaks.json.gz'), breaks)
console.log(`derive: ${n} readings re-read, ${n - unequal} equal to the recorded (${unequal} not, left out); U.breaks ${Object.keys(breaks.cases).length} cases`)
process.exit(unequal ? 1 : 0)
