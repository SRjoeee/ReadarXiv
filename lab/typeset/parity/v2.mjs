// lab/typeset/parity/v2.mjs --out=<dir> <pair>…: v2's side of the parity check, the typesetter's half. For each pair, every
// page of the paper's part laid by the reader's own lay (packages/reader/src/compose/typeset.ts `typesetLay`: design-a's
// `layPage` under the rules, toggles and options the reader passes, its toggles the defaults) over the pair's door rows (the
// rows today's reader laid: packages/typeset/tests/replay/rows.ts) and the layered metrics, the served hyphenation patterns
// read as the reader's served.ts reads them; driven page by page by gate-l1.ts's gateL1Pair as lab/typeset/checkpoint/laid.mjs
// `--entry` drives the checkpoint's (the reading from the part; hook.mjs puts the reader's lay in place of its entry call,
// items-hook.mjs hands each page over), on whole pages: `<dir>/<pair>.json` holds each page's `Page` whole (its members and
// its links), the join of each member of those Pages to today's unit (today's ord, by its unit's id and rank: the baseline's
// rule, join.mjs; never the runner's, whose stops leave a member the entry lays unrecorded), and
// the facts of the part's members the measures read (kind, the TeX-stated alignment, the lines on A, the style, the text's
// id) and the page's size ties. Lab-data only: the pages hold licensed papers' text. Heavy: run through heavy-slot.sh test.
// A member no stored row serves, or whose stored row answered another unit than v2's, is laid with a fresh row (fresh.mjs: the
// translate package's chain over Microsoft's keyless adapter, through lab-data's cache), recorded as `fresh`. --fresh=cache (the
// default) reads the cache alone and names the rows it lacks; --fresh=off withholds every fresh row (the sheet as before this
// lane); --fresh=fill asks the endpoint for the rows the cache lacks, slowly, records them and writes no page: its own step,
// never a gate's.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { join } from 'node:path'

register('../checkpoint/items-hook.mjs', import.meta.url)
register('./hook.mjs', import.meta.url)
const { gateL1Pair } = await import('../../../packages/typeset/tests/replay/gate-l1.ts')
const { ledger, readGz, TAP } = await import('../../../packages/typeset/tests/replay/tap.ts')
const { l1Paper, todayPrepared } = await import('../../../packages/typeset/tests/replay/l1.ts')
const { paperOf } = await import('../../../packages/typeset/tests/replay/today.ts')
const { tableMetrics } = await import('../../../packages/typeset/src/metrics/table.ts')
const { layered, servedMetrics } = await import('../served-metrics.mjs')
const { typesetLay } = await import('../../../packages/reader/src/compose/typeset.ts')
const { hyphenationOf } = await import('../../../packages/typeset/src/index.ts')
const { hyphFileOf } = await import('./inputs.mjs')
const { candidateKept, candidateKeptElements, candidateKeptToday, candidateStated, heldJoin, joinedJoin, todayJoin } = await import('./join.mjs')
const { readAsChain } = await import('./rows.mjs')
const { fillTarget } = await import('../../../packages/typeset/src/shared/fill-target.ts')
const { partsIn, UNJOINED, unjoinedOf, withUnjoined } = await import('./unjoin.mjs')
const { FRESH_ROWS, freshNeeds, freshRowsOf, freshTranslator, KEYLESS_LOCK, keylessLock, withFresh } = await import('./fresh.mjs')
const { doorRows } = await import('../../../packages/typeset/tests/replay/rows.ts')

const args = process.argv.slice(2)
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6)
if (!OUT) throw new Error('v2.mjs: --out=<dir> is required')
const pairs = args.filter((a) => !a.startsWith('--'))
/** the fresh rows: 'cache' (offline, the default), 'off' (none), 'fill' (the cache filled from the endpoint, no page laid) */
/** and 'all' (the review mode: every unit v2 sends laid with its own fresh row, offline) or 'fill-all' (its fill) */
const FRESH = args.find((a) => a.startsWith('--fresh='))?.slice(8) ?? 'cache'
if (!['cache', 'off', 'fill', 'all', 'fill-all'].includes(FRESH)) throw new Error(`v2.mjs: --fresh=${FRESH}: cache, off, fill, all or fill-all`)
const ALL = FRESH === 'all' || FRESH === 'fill-all'
const FILL = FRESH === 'fill' || FRESH === 'fill-all'
// (a fill sends to the keyless endpoint: one sender at a time on this machine, every lane honouring the lock; one translator, so
// one pace and one stop on the first 429, for the whole run)
let translator = null
if (FILL) {
  const lock = await keylessLock(KEYLESS_LOCK, { lane: 'parity-fresh' })
  if (!lock.ok) throw new Error(`v2.mjs: the keyless lock stays another's: ${lock.owner}`)
  if (lock.tookFrom) console.log(`the keyless lock's owner was dead, the lock taken: ${lock.tookFrom}`)
  process.on('exit', lock.release)
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(sig === 'SIGINT' ? 130 : 143))
  translator = freshTranslator(FRESH_ROWS, { fill: true })
}
/** the reader's toggles the pages are laid under: the defaults, or (--toggles=on) every switch of "What to translate" on (figure
 *  and table text, headers and footers, references, the author block: docs/PDF-READER.md §15), so that what a reader turns on
 *  is judged too */
export const TOGGLES = args.find((a) => a.startsWith('--toggles='))?.slice(10) === 'on' ? 'on' : 'defaults'
const classes = TOGGLES === 'on' ? { figures: true, tables: true, heads: true, references: true, names: true } : null
mkdirSync(OUT, { recursive: true })
const served = servedMetrics()
const metricsOf = (pair) => layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served)
/** a language's patterns as the reader's served.ts reads GET /hyph/<lang>.json: hyphenationOf over its patterns and exceptions;
 *  null where none is served (that language hyphenates nothing) */
const patternsOf = (lang) => {
  const f = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(lang) ? hyphFileOf(lang) : null
  if (!f) return null
  const v = JSON.parse(readFileSync(f, 'utf8'))
  if (!Array.isArray(v.patterns)) throw new Error(`the patterns of ${lang} are of another shape`)
  return hyphenationOf({ patterns: v.patterns.filter((x) => typeof x === 'string'), exceptions: Array.isArray(v.exceptions) ? v.exceptions.filter((x) => typeof x === 'string') : [] })
}
const hyph = new Map()
const patterns = (lang) => {
  if (!hyph.has(lang)) hyph.set(lang, patternsOf(lang))
  return hyph.get(lang)
}

const I10 = { pieces: 0, faults: new Map() }
for (const pair of pairs) {
  const t0 = performance.now()
  const pages = {}
  globalThis.__ckPage = (p, pg, page) => {
    if (p === pair)
      pages[pg] = { members: page.members.filter((m) => m.page === pg), links: page.links, wait: page.wait, ...(page.inks ? { inks: page.inks } : {}) }
  }
  // (each fill pass's target, with each unit begun on the page, its fill leading and whether it borrows room under its lines (a
  // state, or a run's, that took the borrow knob); and `before`, the pair laid first with option (i)'s line of slots.mjs skipped
  // (hook.mjs): each page's target and each member's line count there, the owner's ruling of 2026-11-10's counterfactual, the
  // page before (i) moved the borrowing paragraphs' fill leadings, which still vote. The verdict's leadRuling reads them. A
  // page's pass is run again by each page laid after it, alike: the last kept)
  const fills = {}
  const targets = (into) => (pg, begun, continuing, P) => {
    const borrows = (p) => (p.layout?.state?.borrow ?? 0) > 0 || (p.runs ?? []).some((q) => (q.layout?.state?.borrow ?? 0) > 0)
    const voter = (p) => ({ kind: p.unit.kind, refused: p.refused, fillLead: p.fillLead, fitLines: p.fitLines ?? 0 })
    const band = P.adaptiveFill?.band ?? 0
    const told = fillTarget(begun.map(voter), continuing.map(voter), band)
    into[pg] = { target: told?.target ?? null, band, units: Object.fromEntries(begun.map((p) => [p.id, [p.fillLead ?? null, borrows(p) ? 1 : 0]])) }
  }
  // (the reader's lay of the pair, as openReader binds it once the head is read: its target the pair's, as render.mjs opens
  // the reader on it, its toggles TOGGLES's, its metrics the layered ones, its patterns the served ones)
  const target = /-([a-z]{2,3})$/.exec(pair)?.[1]
  if (!target) throw new Error(`v2.mjs: ${pair} names no target`)
  const metrics = metricsOf(pair)
  // (stage 1a's statements of today's units the candidate makes otherwise: a member no id joined is today's unit its own holds
  // whole, join.mjs heldJoin; the lay is given today's row of it where the two units' contents are one, the coordinator's ruling
  // of 2026-11-10, so that a unit whose kind moved, its id with it, is drawn translated as today's was)
  const stated = candidateStated(paperOf(pair))
  const prepared0 = todayPrepared(paperOf(pair))
  const heldRows = { joined: 0, laid: 0 }
  const held = (members, today) => {
    const out = new Map()
    for (const [ord, { today: t, same }] of heldJoin(members, l1Paper(paperOf(pair))?.units ?? new Map(), stated, today, prepared0)) {
      heldRows.joined++
      if (same) out.set(ord, t)
    }
    heldRows.laid = out.size
    return out
  }
  // (the members holding several of today's units whole, their text today's in order (join.mjs joinedJoin, lane fig-text): each
  // given a row said by today's rows in that order, its elements its own; the verdict counts today's units each holds)
  const joinedAll = new Map()
  const joined = (members, today) => {
    const j = joinedJoin(members, l1Paper(paperOf(pair))?.units ?? new Map(), stated, today, prepared0)
    for (const [o, x] of j) joinedAll.set(o, x.todays)
    return j
  }
  // (the rows as the chain reads a reply, rows.mjs: the door's stored replies, each group they did not bring back placed where
  // the translation states it)
  const units = l1Paper(paperOf(pair))?.units ?? new Map()
  const lay = await typesetLay({
    served: {
      metrics,
      hyph: async (langs) => Object.fromEntries(langs.map((l) => [l, patterns(l)])),
      hyphNow: (lang) => patterns(lang),
    },
    target: () => target,
    classes: () => classes,
  })
  // (and each member the pair's fixed rows hold no row of, nor keep: its text a rule changed (an identifier now an element), so
  // that today's stored replies cannot say it; v2 leaves it the original's for want of one, which the verdict reads as
  // unmeasured, never worse, the coordinator's ruling of 2026-11-10. A member the prepare states a reason for has none to read)
  // (lane parity-fresh: the members laid with a fresh row, found over the entry's rows of a first pass cut at its first page's
  // lay (the rows are whole by then), then read from the cache through the chain, fresh.mjs. Each member of the paper's parts;
  // a cell today's group decision kept (its door row `kept`, the reply not stored) among them, so that v2's own decision runs)
  let fresh = null
  const freshAt = { cause: {}, refused: [], missing: [], newer: [] }
  if (FRESH !== 'off') {
    const bundle0 = l1Paper(paperOf(pair))
    const all = new Map()
    for (const part of bundle0?.parts.values() ?? []) for (const flow of part.flows) for (const m of flow) if (!all.has(m.ord)) all.set(m.ord, m)
    const joinedAll0 = todayJoin({ 0: { members: [...all.values()] } }, bundle0, ledger(pair).units, prepared0, stated)
    const doors = doorRows(pair)
    const decided = (m) => {
      const t = joinedAll0[m.ord]?.today
      return t !== undefined && doors?.get(t)?.[2] === 'kept'
    }
    // (today's prepare kept its unit, never sending it: a figure text of names or code, its figureUnits' isName/isCode)
    const todayKept = (m) => {
      const t = joinedAll0[m.ord]?.today
      return t !== undefined && prepared0?.get(t)?.kept === true
    }
    let needs = new Map()
    const CUT = Symbol('cut')
    globalThis.__parityLay = (_part, rows) => {
      if (rows) needs = freshNeeds([...all.values()], rows, units, { decided, todayKept, all: ALL })
      throw CUT
    }
    const page0 = globalThis.__ckPage
    globalThis.__ckPage = undefined
    try {
      gateL1Pair(pair, { metricsOf, reading: 'part', entry: true, held, joined })
    } catch (e) {
      if (e !== CUT) throw e
    } finally {
      globalThis.__ckPage = page0
    }
    const ids = [...new Set([...needs.values()].map((x) => x.id))]
    const got = await freshRowsOf(
      ids.map((id) => units.get(id)),
      target,
      { translator: translator ?? freshTranslator(FRESH_ROWS) },
    )
    fresh = got.rows
    for (const [ord, { id, cause }] of needs) {
      const r = fresh.get(id)
      if (r?.ok) freshAt.cause[ord] = cause
      else if (r?.why.kind === 'unavailable') freshAt.missing.push(ord)
      else freshAt.refused.push(ord)
      // (today never had it: no unit of today's joined to it, nor several joined as one, B6's joinedJoin)
      if (!joinedAll0[ord] && !joinedAll.has(ord)) freshAt.newer.push(ord)
    }
    const n = (c) => Object.values(freshAt.cause).filter((x) => x === c).length
    console.log(`${pair}: fresh ${Object.keys(freshAt.cause).length} members (no row ${n('no-row')}, kept by today's name/code rule ${n('today-kept')}, a cell today's group kept ${n('group')}, another unit's row ${n('unit')}${ALL ? `, served by a stored row ${n('served')}` : ''}) of ${needs.size} asked in ${ids.length} units; refused ${freshAt.refused.length}; not in the cache ${freshAt.missing.length}; ${freshAt.newer.length} today never had${got.asked ? `; ${got.asked} wires asked of the endpoint` : ''}`)
    if (translator?.throttled()) {
      console.log(`${pair}: the endpoint answered 429: the fill stops here (the cache keeps every reply so far; a later fill resumes)`)
      process.exit(3)
    }
    if (FILL) continue
  }
  const noRow = new Set()
  globalThis.__parityLay = (part, rows0) => {
    const rows = withFresh(rows0, fresh)
    if (rows)
      for (const flow of part.flows)
        for (const m of flow) if (typeof m.text === 'string' && !m.why && !rows.kept?.(m.text) && !rows.get(m.text)) noRow.add(m.ord)
    // (a fresh row is the chain's own Result, its groups placed already: read as it is)
    return lay(part, withFresh(readAsChain(rows0, units), fresh))
  }
  // (first without option (i): each pass's target and each member's line count on each page alone)
  const before = {},
    offTargets = {}
  const keep = globalThis.__ckPage
  globalThis.__ckPage = (p, pg, page) => {
    if (p === pair) before[pg] = { lines: Object.fromEntries(page.members.filter((m) => m.page === pg).map((m) => [m.ord, m.lines?.length ?? 0])) }
  }
  globalThis.__parityFill = targets(offTargets)
  globalThis.__parityNoOptionI = true
  try {
    gateL1Pair(pair, { metricsOf, reading: 'part', entry: true, held, joined })
  } finally {
    globalThis.__parityNoOptionI = undefined
  }
  // (then with the spaces beside a full-width mark put back, hook.mjs: each member's line count on each page of that lay, its pages
  // not kept, nor its passes' targets; the verdict's markSpaceRuling reads it, the coordinator's ruling of 2026-11-10)
  globalThis.__parityFill = undefined
  const spaced = {}
  globalThis.__ckPage = (p, pg, page) => {
    if (p === pair) spaced[pg] = Object.fromEntries(page.members.filter((m) => m.page === pg).map((m) => [m.ord, m.lines?.length ?? 0]))
  }
  globalThis.__parityMarkSpaces = true
  try {
    gateL1Pair(pair, { metricsOf, reading: 'part', entry: true, held, joined })
  } finally {
    globalThis.__parityMarkSpaces = undefined
  }
  globalThis.__ckPage = keep
  globalThis.__parityFill = targets(fills)
  heldRows.joined = 0
  const got = gateL1Pair(pair, { metricsOf, reading: 'part', entry: true, held, joined })
  for (const [pg, f] of Object.entries(offTargets)) (before[pg] ??= { lines: {} }).target = f.target
  // (lane url-join: the pair laid once more with the line ends of each word TeX set as written read as spaces again, as a run
  // without the rule read them (unjoin.mjs, AXT_PARITY_UNJOINED), its pages not kept nor its passes' targets: each line count on
  // each page of a member holding one, `unjoined`, the counterfactual the verdict's urlJoinRuling reads, the coordinator's ruling
  // of 2026-11-10. With no unjoined bundle of a paper holding such a word, said in the log and, through `notes`, on the sheet)
  const unjoined = {}
  const { words, missing } = unjoinedOf(l1Paper(paperOf(pair))?.parts ?? new Map(), partsIn(UNJOINED, paperOf(pair)))
  if (missing) console.log(`${pair}: ${missing} (${join(UNJOINED, paperOf(pair))})`)
  if (words.length) {
    const ords = new Set(words.map((w) => w.ord))
    const kept = { page: globalThis.__ckPage, fill: globalThis.__parityFill, held: { ...heldRows } }
    globalThis.__ckPage = (p, pg, page) => {
      if (p === pair) for (const m of page.members) if (m.page === pg && ords.has(m.ord)) (unjoined[pg] ??= {})[m.ord] = m.lines?.length ?? 0
    }
    globalThis.__parityFill = undefined
    try {
      withUnjoined(words, () => gateL1Pair(pair, { metricsOf, reading: 'part', entry: true, held, joined }))
    } finally {
      globalThis.__ckPage = kept.page
      globalThis.__parityFill = kept.fill
      Object.assign(heldRows, kept.held)
    }
  }
  globalThis.__ckPage = undefined
  globalThis.__parityLay = undefined
  globalThis.__parityFill = undefined
  // (the part's facts of every member with a line on a page, by page: what the measures read of the original)
  const bundle = l1Paper(paperOf(pair))
  // (each member of the entry's Pages joined to today's unit, laid or not: the part's and today's units', join.mjs; by the
  // glyphs too, where v2's unit holds as elements the addresses today's held as text, over today's prepare dump)
  const today = bundle ? todayJoin(pages, bundle, ledger(pair).units, todayPrepared(paperOf(pair)), stated) : {}
  const facts = {}
  for (const [pg, part] of bundle?.parts ?? []) {
    const list = []
    for (const flow of part.flows)
      for (const m of flow) {
        if (!m.lines.some((l) => l[0] === pg)) continue
        list.push({
          ord: m.ord,
          kind: m.kind,
          text: typeof m.text === 'string' ? m.text : null,
          align: m.align,
          style: m.style,
          lines: m.lines,
          // (TeX's \baselineskip where the part states it, Placed.lead with no 'lead' read: the original's leading, which the lead
          // measure reads)
          ...(!(m.read ?? []).includes('lead') ? { pitch: m.lead } : {}),
          ...(m.label ? { label: m.label } : {}),
          // (TeX's room under each run of its lines and its paragraph separation, where the part states them: the block measure's)
          ...(m.room?.runs || m.room?.sep !== undefined
            ? { room: { ...(m.room.runs ? { runs: m.room.runs } : {}), ...(m.room.sep !== undefined ? { sep: m.room.sep } : {}) } }
            : {}),
          // (its elements: each [piece, kind, its ink's boxes on this page [x0, y0, x1, y1, base], how many boxes its ink has on
          // every page, its text (1 stated: its glyphs' reading; 2 stated empty: TeX set nothing; 0 none; a symbol is drawn from
          // its source's name, by its kind), raised (a mark, a raised symbol), kept, literal (a URL, a code mark: El.literal))
          ...(m.els?.length
            ? {
                els: m.els.map(([k, e]) => [
                  k,
                  e.kind,
                  e.ink.filter((i) => i[0] === pg).map((i) => [i[1], i[2], i[3], i[4], i[5]]),
                  e.ink.length,
                  e.text === '' ? 2 : e.text ? 1 : 0,
                  e.mark || e.sym?.[1] ? 1 : 0,
                  e.keep ? 1 : 0,
                  e.literal ? 1 : 0,
                ]),
              }
            : {}),
        })
      }
    // (and the page's size ties, each the part ords of one paragraph's members laid at one scale)
    const ties = (part.ties ?? []).filter((t) => t.rule === 'size').map((t) => t.ords)
    facts[pg] = { members: list, links: part.links?.length ?? 0, ties }
  }
  // (the members the candidate's prepare keeps by a rule's mark, by ord: text set wholly in a face of one pitch (Rule 1, the
  // owner's ruling of 2026-11-10), a line of e-mail addresses, a figure text kept for an identifier (the coordinator's rulings of
  // 2026-11-10); and today's units its prepare states kept by a mark, by today's ord (a cell of identifiers alone, no unit of
  // v2's): the verdict's `shown`, `figures` and `groups` read them as the original's)
  const pitch = candidateKept(paperOf(pair), 'pitch')
  const address = candidateKept(paperOf(pair), 'address')
  const identifier = candidateKept(paperOf(pair), 'identifier')
  const keptToday = candidateKeptToday(paperOf(pair))
  // (the ink of the elements its prepare keeps as the original's, by member: F0's run of one pitch, a stretch a decoration holds;
  // the verdict reads the original's style without it, the coordinator's ruling 1 on F0)
  const keptEls = candidateKeptElements(paperOf(pair))
  // (I10, the sentence cover over the pair's Pages as the reader lays them, the entry's: each piece drawn of a member lit in
  // exactly one of its sentences on each pane, the panes' sentences the same; packages/typeset/tests/replay/cover.ts)
  const c = got.entry?.cover
  const cover = c ? { members: c.members, pieces: c.pieces, faults: Object.fromEntries(c.faults), ex: Object.fromEntries(c.ex) } : null
  if (cover) {
    I10.pieces += cover.pieces
    for (const [k, n] of c.faults) I10.faults.set(k, (I10.faults.get(k) ?? 0) + n)
  }
  const out = {
    pair,
    paper: paperOf(pair),
    toggles: TOGGLES,
    pages,
    today,
    facts,
    fills,
    before,
    spaced,
    unjoined,
    ...(missing ? { notes: [missing] } : {}),
    ...(pitch.length ? { pitch } : {}),
    ...(address.length ? { address } : {}),
    ...(identifier.length ? { identifier } : {}),
    ...(keptToday.length ? { keptToday } : {}),
    ...(keptEls.length ? { keptEls } : {}),
    ...(noRow.size ? { noRow: [...noRow].sort((a, b) => a - b) } : {}),
    ...(joinedAll.size ? { joined: Object.fromEntries(joinedAll) } : {}),
    // (lane parity-fresh: the members laid with a fresh row and why, those the translator refused or the cache lacks (left as
    // before: no row, or their stored row), and those sent that today never had a unit of)
    ...(Object.keys(freshAt.cause).length ? { fresh: Object.keys(freshAt.cause).map(Number).sort((a, b) => a - b), freshCause: freshAt.cause } : {}),
    ...(freshAt.refused.length ? { freshRefused: freshAt.refused.sort((a, b) => a - b) } : {}),
    ...(freshAt.missing.length ? { freshMissing: freshAt.missing.sort((a, b) => a - b) } : {}),
    ...(freshAt.newer.length ? { freshNew: freshAt.newer.sort((a, b) => a - b) } : {}),
    ...(ALL ? { freshMode: 'all' } : {}),
    held: heldRows,
    threw: got.threw,
    laidPages: Object.keys(pages).length,
    cover,
  }
  writeFileSync(join(OUT, `${pair}.json`), `${JSON.stringify(out)}\n`)
  const laid = Object.values(pages).reduce((n, p) => n + p.members.filter((m) => m.state === 'laid').length, 0)
  const faults = cover ? Object.values(cover.faults).reduce((a, b) => a + b, 0) : 0
  console.log(`${pair}: ${Object.keys(pages).length} pages, ${laid} members laid, ${(performance.now() - t0).toFixed(0)} ms${heldRows.joined ? `; held: ${heldRows.joined} joined, ${heldRows.laid} given today's row` : ''}; I10 ${faults} faults${faults ? ` (${Object.entries(cover.faults).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}`)
}
const I10faults = [...I10.faults.values()].reduce((a, b) => a + b, 0)
console.log(`I10, the sentence cover (cover.ts): ${I10.pieces} pieces; ${I10faults} faults${I10faults ? `: ${[...I10.faults].map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}`)
