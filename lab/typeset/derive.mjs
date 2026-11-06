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
// - `U.elements`: for the same rounds, each placeholder's reading whatever the row (readingsOf): what today's resolution sets
//   it to in each case the row decides, by today's own renderings and drawnAs, unbracketed, displayLines, leadMark (L1: El).
// - `U.admit`: for every sampled verdict, each row piece's class as locatedWhole reads it (phClassProven: L1's El.kind).
// - `rules`: each target's rules as the run resolved them (resolveRules: the fit's P, the patterns, the labels).
// - `B.tokens`: for every sampled round of tokensOf2 (B.tokens' sample and U.marks'), the faces today's faceOf gave (B.faces' answers), each face's own small capitals,
//   each rendering's runs of one fill and its faked small capitals (El.style per run), whether the source writes CJK spaced.
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
const SYM = await import(`${E}../rules/text-symbols.mjs`), { PH_FLAG: PH } = await import(`${E}../layout/file.mjs`)
const FONTS = await import(`${E}fonts.mjs`), FR = await import(`${E}../rules/font-roles.mjs`), SCRIPT = await import(`${E}../rules/script.mjs`)
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

/** today's reading run again on a round's recorded inputs, its parts' calls watched: the piece lines `breaks` is handed, and
 *  the renderings of the last reading (prepareUnit reads a unit twice where a display's lines are denied: its answer is the
 *  last's), with the cite map and the macros as its resolution reads them */
function reread(x) {
  const i = unser(x.inn), want = unser(x.out)
  const parts = TEX.texParts(i.lu, i.kOf, { lines: i.lines, extents: i.extents, shown: i.shown, lineskip: i.lineskip })
  const seen = { pieceLines: null, renderings: null }
  const breaks = parts.breaks, renderings = parts.renderings
  parts.breaks = (unit, pieceLines) => { seen.pieceLines = pieceLines; return breaks(unit, pieceLines) }
  parts.renderings = ctx => {
    const macros0 = new Map(ctx.citeMap?.macros ?? [])
    const r = renderings(ctx)
    seen.renderings = { r, ctx, macros0, citeMap: ctx.citeMap ? new Map(ctx.citeMap) : null, citeText: ctx.citeMap?.text ? new Map(ctx.citeMap.text) : null }
    return r
  }
  const citeMap = i.phMode === 'source' ? null : new Map()
  const got = L2.prepareUnit(i.unit, i.rects, i.local, citeMap, null, parts)
  return { i, want, got, seen, equal: norm(got) === norm(want) }
}

const real = c => !c.sep && !c.space && /\S/.test(c.ch)
/** a rendering as U.elements reads it: its text, the lines its glyphs stand on (today's `${page}|${rect}` keys), whether a glyph
 *  of it no Unicode stands for (`nu`), and what the resolution carries of it (unbracketed, proof, box, a joined display's
 *  held lines, how many characters) */
const gapOf = g => (g ? {
  text: g.text,
  lines: g.chars.filter(c => !c.sep && !c.space).map(c => `${c.page}|${c.rect.join()}`),
  nu: g.chars.some(c => c.nu),
  ...(g.unbracketed ? { unbracketed: true } : {}),
  ...(g.proof ? { proof: true } : {}),
  ...(g.box ? { box: g.box } : {}),
  ...(g.held ? { held: g.held } : {}),
  n: g.chars.length,
} : null)
/** a resolution as JSON holds it, its rendering as gapOf's */
const resOf = r => (r ? { ...r, ...('gap' in r ? { gap: gapOf(r.gap) } : {}) } : null)
/** each placeholder's reading, whatever the row: what today's resolution would set it to in each case the row decides */
function readingsOf(r) {
  const { r: rs, ctx, macros0, citeMap, citeText } = r.seen.renderings
  const lineInfo = r.got.lineInfo, uc = r.got.uc, out = {}
  const lu = r.i.lu, kOf = r.i.kOf
  for (const p of ctx.phs) {
    const cls = L2.renderingClass(p.cls)
    const g = p.cls === 'zero' || p.cls === 'symbol' ? null : rs.gapFor(p, cls)
    const supSrc = !!p.nested || /^\\footnotemark/.test(p.src)
    let symbol = null
    if (p.cls === 'symbol') {
      const own = SYM.symbolText(p.src), text = own ?? L2.texToText2(p.src)
      symbol = {
        leads: !!L2.leadMark(r.i.rects, r.i.local, own ?? text.replace(/^\^/, '')),
        res: own !== null ? { mode: 'symbol', text: own, math: true, sup: false } : { mode: 'symbol', text: text.replace(/^\^\(?|\)$/g, ''), math: true, sup: /^\$?\^/.test(p.src.replace(/^\$/, '')) || /^\^/.test(text) },
      }
    }
    const drawn = g ? L2.drawnAs(p, g, cls, supSrc, lineInfo) : null
    let inner = null
    if (g && /^[([]/.test(g.text) && /[)\]]$/.test(g.text)) {
      const rl = g.chars.filter(real), inn = g.chars.slice(g.chars.indexOf(rl[0]) + 1, g.chars.indexOf(rl.at(-1)))
      if (inn.some(c => /[\p{L}\p{N}]/u.test(c.ch))) {
        const ng = L2.unbracketed(g, rl, inn), cls2 = p.cls === 'cite' ? 'cite' : p.cls === 'num' ? 'num' : 'other'
        inner = { gap: gapOf(ng), drawn1: resOf(L2.drawnAs(p, ng, cls, supSrc, lineInfo)), drawn2: drawn && (drawn.mode === 'crop' || drawn.mode === 'orig-text') ? resOf(L2.drawnAs(p, ng, cls2, drawn.sup, lineInfo)) : null }
      }
    }
    const keys = p.cls === 'cite' ? L2.citeKeys(p.src) : []
    const cite = !g && cls === 'cite' && citeMap && keys.length && keys.every(k => citeMap.has(k))
      ? { mode: 'cite-map', text: keys.every(k => citeText?.has(k)) ? keys.map(k => citeText.get(k)).join('; ') : `[${keys.map(k => citeMap.get(k)).join(', ')}]` }
      : null
    const row = lu.ph.get(kOf[p.k])
    const S = row && !(row.flags & (PH.LOST | PH.EMPTY | PH.JOINED)) ? [...row.segs] : []
    out[p.k] = {
      src: p.src, cls: p.cls, ...(p.unknown ? { unknown: true } : {}), ...(p.nested ? { nested: true } : {}),
      fixed: resOf(rs.fixed?.(p) ?? null), inked: !!rs.inked?.(p), symbol, supSrc,
      source: { mode: 'source', text: p.nested ? '*' : L2.texToText2(p.src), math: p.cls === 'other', sup: supSrc },
      srcText: L2.texToText2(p.src ?? '') || '',
      gap: gapOf(g), drawn: resOf(drawn), inner,
      display: p.cls === 'display' && g ? L2.displayLines(g, uc) : null,
      cite, segs: S, rowText: row?.text ?? null, found: !!row,
    }
  }
  return { readings: out, macros0: [...macros0], held: (r.i.lines.held ?? []).map(q => `${q[0]}|${q.slice(1).join()}`), touched: [...L2.displayTouched(r.got, uc)], shown: r.i.shown }
}

const breaks = { format: 'readarxiv-L3/derived 1', rule: 'U.breaks', note: 'per sampled round (pair|ord|round): pieceLines, the lines each source piece\'s words stand on (prepareUnit\'s, read by paragraphBreaks; L1 states it as El.opens / SpanAt.opens), and cls2, each row piece\'s phClass2 class (L1: El.kind)', cases: {} }
const elements = { format: 'readarxiv-L3/derived 1', rule: 'U.elements', note: 'per sampled round (pair|ord|round): each placeholder\'s reading by its row piece index, what today\'s resolution sets it to in each case the row decides (fixed, a space\'s ink, a symbol and whether the page shows its mark before line 1, its rendering, drawn as text or crop, without its own brackets, a display\'s kept lines, a citation learnt, its row\'s segments); renderings by text, lines, nu and what a resolution carries. L1 states these as El (kind, ink, keep, text, style, brackets, leads)', cases: {} }
let n = 0, unequal = 0
for (const x of readings()) {
  const r = reread(x)
  n++
  if (!r.equal) { unequal++; continue }
  const key = `${x.pair}|${x.ord}|${x.round}`
  breaks.cases[key] = {
    from: x.rule,
    pieceLines: r.seen.pieceLines ? [...r.seen.pieceLines] : null,
    cls2: r.i.unit.pieces.map(p => (p.t === 'ph' ? L2.phClass2(p.src).cls : null)),
  }
  elements.cases[key] = { from: x.rule, ...readingsOf(r) }
}
// U.admit: each row piece's class as locatedWhole reads it (phClassProven: L1's El.kind), for every sampled verdict
const admit = { format: 'readarxiv-L3/derived 1', rule: 'U.admit', note: 'per sampled verdict (pair|ord|round): clsProven, each row piece\'s phClassProven class, null where it is no placeholder (L1: El.kind)', cases: {} }
for (const e of read(join(TAP, 'samples', 'U.admit.json.gz')).entries)
  for (const c of e.captures)
    if (c.rule === 'U.admit:in') admit.cases[`${e.pair}|${e.ord}|${c.round}`] = { clsProven: (unser(c.value).u?.pieces ?? []).map(p => (p.t === 'ph' ? L2.phClassProven(p.src).cls : null)) }
gz(join(OUT, 'U.admit.json.gz'), admit)

// B.tokens: for every sampled round, the faces today's faceOf gave the runs the unit's tokens are set in (B.faces' answers:
// rules/font-roles.mjs over the paper's role family), whether each face draws its own small capitals, each rendering's runs of
// one fill and its faked small capitals (fillRunsOf, smallCapsAt over its page characters: L1's El.style per run), and whether
// the unit's source writes CJK with spaces between (a source fact). Today's tokensOf2 run on the recorded inputs is checked
// equal to the recorded tokens, measured from the pair's metrics table (the tap's replay-check)
const faceKey = (st, cls) => `${st.fam}|${st.design}|${!!st.bold}|${!!st.italic}|${!!st.caps}|${cls}`
const CJK_SPACED = new RegExp(`${SCRIPT.SPACELESS.source}\\s+${SCRIPT.SPACELESS.source}`, 'u')
const tokens = { format: 'readarxiv-L3/derived 1', rule: 'B.tokens', note: 'per sampled round (pair|ord|round): faces (faceOf\'s answers by fam|design|bold|italic|caps|cls: B.faces), ownCaps (font-roles ownSmallCaps by face id), fills and smallCaps by resolution (fillRunsOf, smallCapsAt: El.style per run), spaced (the source writes CJK with spaces between)', cases: {} }
let tokOk = 0, tokAll = 0
const metricsOf = new Map(), ledgerOf = new Map()
// (every sampled round that captures tokensOf2's call: B.tokens' sample and U.marks', whose decisions are made inside it)
const tokenEntries = ['B.tokens', 'U.marks'].flatMap(rule => read(join(TAP, 'samples', `${rule}.json.gz`)).entries)
for (const e of tokenEntries) {
  const L = ledgerOf.get(e.pair) ?? ledgerOf.set(e.pair, read(join(TAP, 'ledgers', `${e.pair}.ledger.json.gz`))).get(e.pair)
  const widths = metricsOf.get(e.pair) ?? metricsOf.set(e.pair, new Map(read(join(TAP, 'metrics', `${e.pair}.metrics.json.gz`)).widths.map(([f, t, w]) => [`${f}|${t}`, w]))).get(e.pair)
  const byRound = new Map()
  for (const c of e.captures) (byRound.get(c.round) ?? byRound.set(c.round, {}).get(c.round))[c.rule] = c.value
  for (const [round, c] of byRound) {
    if (!c['B.tokens:in'] || !c['B.tokens:out'] || !c['U.elements:in'] || tokens.cases[`${e.pair}|${e.ord}|${round}`]) continue
    tokAll++
    const paper = L.info.paper
    FONTS.setRoleFaces(paper.to, paper.family, paper.cjkFaces)
    const i = unser(c['B.tokens:in']), want = unser(c['B.tokens:out']), e0 = unser(c['U.elements:in'])
    const parts = TEX.texParts(e0.lu, e0.kOf, { lines: e0.lines, extents: e0.extents, shown: e0.shown, lineskip: e0.lineskip })
    i.prep.fillOf = parts.fillOf
    i.prep.colourOf = parts.colourOf
    const faces = new Map()
    globalThis.__axtWatch = (f, [st, cls], v) => { if (f === 'faceOf') faces.set(faceKey(st, cls), v) }
    const got = L2.tokensOf2(i.unit, i.prep, i.to, i.base, i.designs, i.P, i.lead, null, true)
    globalThis.__axtWatch = null
    let missing = 0
    L2.measureTokens(got, (t, face) => { const w = widths.get(`${FONTS.fontString(face, 100)}|${t}`); if (w === undefined) { missing++; return NaN } return w })
    if (missing || norm(got) !== norm(want)) continue
    tokOk++
    const fills = {}, smallCaps = {}
    for (const [k, r] of i.prep) {
      if (r?.mode !== 'orig-text') continue
      fills[k] = L2.fillRunsOf(r.gap?.chars, r.text)
      const at = L2.smallCapsAt(r.gap?.chars, r.text, i.prep.orig?.size)
      smallCaps[k] = at ? Array.from({ length: r.text.length + 1 }, (_, q) => at(q)) : null
    }
    tokens.cases[`${e.pair}|${e.ord}|${round}`] = {
      faces: [...faces],
      ownCaps: Object.fromEntries([...faces.values()].filter(f => f.id).map(f => [f.id, FR.ownSmallCaps(f.id)])),
      fills, smallCaps,
      spaced: CJK_SPACED.test(i.unit.src ?? ''),
    }
  }
}
gz(join(OUT, 'B.tokens.json.gz'), tokens)

// the target's rules as the run resolved them (resolveRules over the door's rule set, BUILTIN_RULES: R.params, the hyphenation
// patterns it loads, the float labels), by target; checked equal to every target P a sample captured (B.tokens:in's, which
// tokensOf2 is handed; U.params:in's, before the unit's own)
const LAYOUT = await import(`${E}../rules/layout.mjs`)
const targets = {}
for (const f of readdirSync(join(TAP, 'ledgers'))) {
  const to = read(join(TAP, 'ledgers', f)).target
  if (targets[to]) continue
  const R = LAYOUT.resolveRules(LAYOUT.BUILTIN_RULES, to)
  targets[to] = { params: R.params, patterns: R.patterns, labels: R.labels }
}
let pSeen = 0, pOff = 0
for (const rule of ['B.tokens', 'U.marks', 'U.params'])
  for (const e of read(join(TAP, 'samples', `${rule}.json.gz`)).entries)
    for (const c of e.captures) {
      if (c.rule !== 'B.tokens:in' && c.rule !== 'U.params:in') continue
      const P = unser(c.value).P, to = read(join(TAP, 'ledgers', `${e.pair}.ledger.json.gz`)).target
      pSeen++
      if (norm(P) !== norm(targets[to].params)) { pOff++; console.log(`derive: ${e.pair} ord ${e.ord}: the captured P is not resolveRules' for ${to}`) }
    }
gz(join(OUT, 'rules.json.gz'), { format: 'readarxiv-L3/derived 1', rule: 'rulesFor', note: "per target: today's resolveRules(BUILTIN_RULES, target): params (the fit's P before a unit's own), the hyphenation patterns it loads, the float labels", targets })
console.log(`derive: rules for ${Object.keys(targets).length} targets, equal to ${pSeen - pOff} of ${pSeen} captured target P`)
console.log(`derive: B.tokens ${tokOk} of ${tokAll} sampled rounds made again equal to the recorded`)
gz(join(OUT, 'U.breaks.json.gz'), breaks)
gz(join(OUT, 'U.elements.json.gz'), elements)
console.log(`derive: ${n} readings re-read, ${n - unequal} equal to the recorded (${unequal} not, left out); U.breaks ${Object.keys(breaks.cases).length} cases, U.elements ${Object.keys(elements.cases).length}`)
process.exit(unequal || tokOk !== tokAll || pOff ? 1 : 0)
