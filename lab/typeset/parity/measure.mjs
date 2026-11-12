// lab/typeset/parity/measure.mjs --work=<dir> --out=<dir> [<pair>…]: the display gate's verdict, "display ≥ today": no page of
// v2 worse than today's, a difference allowed only where v2 is nearer the original, over the whole of what the run asked. Reads
// the drawing's manifest (<work>/raw/run.json: the pairs asked, the pages each was to draw, those it could not draw and why),
// what render.mjs drew and read back (<work>/raw/<pair>.json, this run's alone), the entry's Pages and the part's facts
// (<work>/v2/<pair>.json, the file the drawing drew from), today's prepare dump (baseline/prepare/<paper>.prepare.json: the
// original's lines of today's units) and the part's turned members (the L1 bundle); the measures are verdict.mjs's. Writes
// <out>/parity.json and <out>/index.html (the sheet: arXiv's page, today's and v2's side by side, the pages v2 makes worse
// first, each difference with the original's value, both sides' and which is nearer). Exits 1 where any page is worse than
// today's, or where the run is not judged whole (an asked pair or page not drawn, a page that failed, a raw file of another
// run, no page at all): a cut-over blocker (lab/release-check/CI.md). The pairs named (run.mjs names them) must be the
// drawing's.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rowLinesOf } from '../../../packages/typeset/src/index.ts'
import { L1_BUNDLES_DIR, l1Paper } from '../../../packages/typeset/tests/replay/l1.ts'
import { bundlesLine, headsFor } from '../../../packages/typeset/tests/replay/bundles.ts'
import { doorRows } from '../../../packages/typeset/tests/replay/rows.ts'
import { LAB, ledger } from '../../../packages/typeset/tests/replay/tap.ts'
import { keptFacts, originalFacts, scriptsPass } from './blind.mjs'
import { frameOf, labelsPass } from './fidelity.mjs'
import { bundleCheck, bundleOf, pdfOf, whyNot } from './inputs.mjs'
import { FIRST } from './pairs.mjs'
import { coverageOf, FLAGS, freshOf, freshResolve, judgedChanged, linksPass, measurePage, offOriginalOf, tagFresh, NEAR, BOUNDS, pastRoomPass, recount, SAYS, sharePass, staleOf, stylePass, summaryOf, unmeasuredOf, verdictOf } from './verdict.mjs'

/** why a unit is laid with a fresh row (fresh.mjs freshNeeds' causes), as the sheet says it (lane parity-fresh) */
const FRESH_CAUSE = {
  'no-row': 'no stored row serves its unit',
  'today-kept': "kept by today's name/code rule, sent by v2",
  group: "a cell today's group decision kept (its reply not stored)",
  unit: "its stored row answered another unit",
}
/** the sheet's look of a fresh unit (lane parity-fresh), written only where the run has one: a tint over its drawn lines on
 *  v2's pane, its unjudged differences neutral */
const FRESH_CSS = `
<style>
:root { --fresh: rgba(230, 160, 0, 0.28); --freshbg: #fff7e0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --freshbg: #3a3320; } }
:root[data-theme="dark"] { --freshbg: #3a3320; }
.diffs tr.fresh { background: var(--freshbg); }
.panes .tint { position: relative; }
.panes .tint i.fresh { position: absolute; background: var(--fresh); pointer-events: none; }
.freshlist { margin: 0 0 6px; padding-left: 20px; font-size: 13px; }
</style>`
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const WORK = arg('work')
/** the review mode's gate sheet (--gate=<its parity.json>, the gate mode's sheet at the same head): each unit whose fresh text
 *  changed a judged measure listed on its page (verdict.mjs judgedChanged) */
const GATE = arg('gate')
const gateOf = new Map()
if (GATE) for (const p of JSON.parse(readFileSync(GATE, 'utf8')).pages) gateOf.set(`${p.pair}|${p.page}`, p)
const OUT = arg('out')
if (!WORK || !OUT) throw new Error('measure.mjs: --work=<dir> and --out=<dir> are required')
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// (the bundles read, named in the log; a pair asked that a named folder lacks is an error, bundles.ts)
console.log(bundlesLine(L1_BUNDLES_DIR))
headsFor(asked, L1_BUNDLES_DIR)
const PREPARE = join(LAB, 'refactor-2026-11', 'baseline', 'prepare')
const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

// ---------------------------------------------------------------- reading: the run's own drawing, nothing else
const runFile = join(WORK, 'raw', 'run.json')
const run = existsSync(runFile) ? json(runFile) : null
const notMeasured = new Map()
const drawn = new Map()
for (const pair of run?.pairs ?? []) {
  const rawFile = join(WORK, 'raw', `${pair}.json`),
    v2File = join(WORK, 'v2', `${pair}.json`)
  const raw = existsSync(rawFile) ? json(rawFile) : null
  const why = staleOf(run, pair, raw, existsSync(v2File) ? sha(v2File) : null)
  if (why) notMeasured.set(pair, why)
  else drawn.set(pair, raw)
}
// (each v2 file against the bundles this verdict reads, before anything is measured: one laid over others refused, naming both,
// and the run stopped; one of before the guard measured with a warning, in the log and in parity.json: inputs.mjs bundleCheck)
const warnings = [...(run?.warnings ?? [])]
const refusedBundles = []
for (const [pair, raw] of drawn) {
  const chk = bundleCheck({ pair, ...json(join(WORK, 'v2', `${pair}.json`)) }, bundleOf(raw.paper))
  if (!chk.ok) refusedBundles.push(chk.why)
  else if (chk.warning && !warnings.includes(chk.warning)) warnings.push(chk.warning)
}
if (refusedBundles.length) {
  for (const w of refusedBundles) console.error(`measure.mjs: refused, ${w}`)
  console.error('measure.mjs: a v2 file is measured only against the bundles it was laid over (AXT_L1_BUNDLES): nothing written')
  process.exit(2)
}
for (const w of warnings) console.warn(`WARNING ${w}`)
const pairs = [...drawn.keys()]
// (the pairs the sheet names not drawn: the run's asked ones that were not, and the maintainer's first ones not asked)
const missing = [...notMeasured].map(([pair, why]) => ({ pair, why, asked: true }))
for (const p of FIRST) if (!run?.pairs.includes(p)) missing.push({ pair: p, why: whyNot(p, WORK) ?? 'not asked of this run', asked: false })

const pages = []
// (the fresh rule's second look, each pair's: the re-lay's time in v2.mjs and in render.mjs, and how many pages it changed)
const relayTimes = []
// (each paper's facts of the classes the toggles keep, read off the original (blind.mjs): what arXiv's metadata and hyperref's
// anchors name, and the units of each reader they fall in)
const facts = {}
// (what v2.mjs says of a pair's lay it could not do as the verdict reads it: `notes`, url-join's ruling not applied (unjoin.mjs))
const notes = []
// (lane parity-fresh: each pair's units v2 is laid with a fresh row of (v2.mjs `fresh`), by page and kind, and those it sends
// that today never had; each page's fresh units tinted on v2's pane: their drawn lines' boxes as shares of the page)
const freshes = []
/** the drawn lines of v2's units `ords` on a page record, each [left, top, width, height] as shares of the page's view */
const tintOf = (rec, ords) => {
  const [x0, y0, x1, y1] = rec.view ?? [0, 0, 612, 792]
  const W = x1 - x0,
    H = y1 - y0
  const r4 = (v) => Math.round(v * 10000) / 10000
  return (rec.v2?.units ?? [])
    .filter((u) => ords.has(u.id))
    .flatMap((u) => u.lines.filter((l) => l.n > 0 && !l.rot && l.x0 !== null))
    .map((l) => [r4((l.x0 - x0) / W), r4((y1 - l.y1) / H), r4((l.x1 - l.x0) / W), r4((l.y1 - l.y0) / H)])
}
for (const [pair, raw] of drawn) {
  const v2 = json(join(WORK, 'v2', `${pair}.json`))
  for (const x of v2.notes ?? []) notes.push(`${pair}: ${x}`)
  const prep = json(join(PREPARE, `${raw.paper}.prepare.json`))
  const prepByOrd = new Map(prep.units.map((u) => [u.ord, u]))
  // (part ord -> today's ord)
  const todayOf = new Map(Object.entries(v2.today).map(([o, t]) => [Number(o), t.today]))
  // (the part's members set turned on A (a figure's rotated text: Placed.dir), whose lines are no horizontal band; and its
  // run-ins, follower -> leader: a member it joins to the one before it in its flow (Placed.join), the member a bound name
  // leads (Placed.bound, the next in its flow); its title and front matter, anchored at their first line)
  const turned = new Set()
  const led = new Map()
  const top = new Set()
  // (the page numbers of each page, the owner's ruling 6: a running head or foot whose text holds the page's number, or a note
  // that does on the page's first or last row (a first page's folio is read as a note, 2609.36054 p1))
  const folios = new Map()
  const bundle = l1Paper(raw.paper)
  const rowsOf = new Map()
  for (const [pg, part] of bundle?.parts ?? []) {
    const ys = part.flows.flat().flatMap((m) => m.lines.filter((l) => l[0] === pg).map((l) => l[4]))
    if (ys.length) rowsOf.set(pg, [Math.min(...ys), Math.max(...ys)])
  }
  const edgeRow = (m, pg) => m.lines.some((l) => l[0] === pg && rowsOf.get(pg)?.some((y) => Math.abs(l[4] - y) <= 0.5))
  // (the lines of TeX's several members share whole, set centred or flush right: the typesetter's own predicate over the part's
  // flows, the lay's facts, so that the measure judges by the line exactly the lines the lay sets as one run)
  const rows = new Map()
  for (const [, part] of bundle?.parts ?? []) for (const [o, line] of rowLinesOf(part.flows)) rows.set(o, line)
  for (const [pg, part] of bundle?.parts ?? [])
    for (const f of part.flows)
      f.forEach((m, k) => {
        if (m.dir && (Math.abs(m.dir[1]) > 1e-3 || m.dir[0] < 0)) turned.add(m.ord)
        if (m.title || m.front) top.add(m.ord)
        const b = f[k - 1]
        if (b && (m.join || (b.kind === 'name' && b.bound)) && !led.has(m.ord)) led.set(m.ord, b.ord)
        const text = typeof m.text === 'string' ? (bundle.units.get(m.text)?.content ?? []).map((x) => (x.t === 'text' ? x.s : ' ')).join('') : ''
        const page = m.kind === 'inkheads' ? m.lines.some((l) => l[0] === pg) : m.kind === 'inknotes' && edgeRow(m, pg)
        if (page && new RegExp(`(^|\\D)${pg}(\\D|$)`).test(text)) {
          if (!folios.has(pg)) folios.set(pg, [])
          folios.get(pg).push(m.ord)
        }
      })
  // (the paper's text frame, read off its own lines (frameOf); its tables' grid groups, TeX's grid as today's front end reads it
  // (today's ledger); the cells whose door row today's group decision kept, whose translator's answer v2 is never handed)
  const frame = frameOf(v2.facts)
  const groups = (ledger(pair)?.tables ?? []).map((t) => ({ group: t.group, ids: t.ids }))
  const keptByGroup = new Set([...(doorRows(pair)?.values() ?? [])].filter((r) => r[2] === 'kept' && (r[5] === 'whole' || r[5] === 'partial')).map((r) => r[0]))
  // (lane parity-fresh: a cell handed a fresh row, v2's own decision run on it, is no longer undecided)
  for (const o of v2.fresh ?? []) if (todayOf.has(o)) keptByGroup.delete(todayOf.get(o))
  // (arXiv's metadata authors and hyperref's cite.* anchors, off arXiv's PDF; placed in today's units (its prepare dump's lines)
  // and the part's members (their lines on A), the drawing's glyphs in its text content's order)
  const pdf = pdfOf.get(raw.paper)
  const told = pdf && existsSync(pdf) ? await originalFacts(readFileSync(pdf)) : null
  const linesOf = (ls) => ls.map((l) => ({ page: l.page, x0: l.x0, x1: l.x1, y: l.baseline, top: Math.max(l.top, l.bottom), bottom: Math.min(l.top, l.bottom), size: l.size }))
  const members = new Map()
  for (const [, part] of bundle?.parts ?? [])
    for (const f of part.flows)
      for (const m of f)
        if (!turned.has(m.ord) && !members.has(m.ord))
          members.set(m.ord, { ord: m.ord, lines: m.lines.map((l) => ({ page: l[0], x0: l[2], x1: l[3], y: l[4], top: Math.max(l[5], l[6]), bottom: Math.min(l[5], l[6]), size: l[10] ?? m.style?.size })) })
  const kept = told
    ? keptFacts({
        ...told,
        pages: raw.pages.map((p) => ({ page: p.page, runs: p.original?.runs ?? [] })),
        today: prep.units.map((u) => ({ ord: u.ord, lines: linesOf((u.lines ?? []).filter((l) => !l.rot)) })),
        part: [...members.values()],
      })
    : null
  facts[pair] = kept
    ? {
        authors: told.authors.length,
        found: kept.found.length,
        cites: told.cites.length,
        names: { today: [...kept.names.today.keys()], part: [...kept.names.part.keys()] },
        references: { today: kept.references.today.size, part: kept.references.part.size },
      }
    : null
  const mine = []
  const ctxOf = (rec) => ({ prepByOrd, todayOf, turned, led, top, frame, groups, keptByGroup, folios: folios.get(rec.page) ?? [], kept, rows })
  for (const rec of raw.pages) mine.push(measurePage(pair, v2, rec, ctxOf(rec)))
  // (a unit's size and line count today bought with a line past TeX's room on one of its pages: today's fault on each)
  pastRoomPass(
    mine.filter((p) => !p.error),
    recount,
  )
  // (a line count v2 splits as TeX's share, the same lines in all: the ruling of 2026-11-10's, verdict.mjs sharePass)
  sharePass(
    mine.filter((p) => !p.error),
    recount,
  )
  // (a unit's links counted over the pages it spans, its text and its links moved over a page break by a translation: verdict.mjs
  // linksPass; the pages' owners of links dropped once counted)
  linksPass(
    mine.filter((p) => !p.error),
    recount,
  )
  // (a unit's bold and slanted shares read over the pages it spans: a translation moves words across a page break, verdict.mjs
  // stylePass)
  stylePass(
    mine.filter((p) => !p.error),
    recount,
  )
  // (the paper's labels in one form, the owner's ruling 4: judged over the paper's pages)
  labelsPass(
    mine.filter((p) => !p.error),
    recount,
  )
  // (the original's scripts judged over the paper: a translation's text and crops flow over a page break, blind.mjs; the pages'
  // records of it dropped once judged)
  scriptsPass(
    mine.filter((p) => !p.error),
    recount,
  )
  for (const p of mine) delete p.blind
  // (the fresh rule's second look, the coordinator's ruling of 2026-11-12: every page measured again on the drawing of v2 laid with
  // today's own text in v2's unit (v2.mjs's `relay`, relay.mjs; render.mjs's `relay` on the pages it changed, every other page as
  // drawn), the members whose text of today's was laid no longer fresh, the paper's passes run on it; each difference the fresh
  // rule set aside judged again there, verdict.mjs freshResolve: following from the different text, judged (worse where v2 is
  // farther), or not comparable with its reason, each counted apart. Not in the review mode, every unit fresh there)
  if (v2.relay && v2.freshMode !== 'all') {
    const still = new Set(Object.keys(v2.relay.incomparable ?? {}).map(Number))
    const relayV2 = {
      ...v2,
      pages: { ...v2.pages, ...v2.relay.pages },
      fresh: (v2.fresh ?? []).filter((o) => still.has(o)),
      freshCause: Object.fromEntries(Object.entries(v2.freshCause ?? {}).filter(([o]) => still.has(Number(o)))),
    }
    const keyOf = (o) => (todayOf.has(o) ? `t${todayOf.get(o)}` : `p${o}`)
    // (by both keys a difference may name a member by: today's ord where it has one, and its part ord, as a figure text's and a
    // name's are named, fidelity.mjs judgeJoined)
    const incomparable = new Map(Object.entries(v2.relay.incomparable ?? {}).flatMap(([o, why]) => [[keyOf(Number(o)), why], [`p${o}`, why]]))
    const unsentenced = new Set((v2.relay.unsentenced ?? []).flatMap((o) => [keyOf(o), `p${o}`]))
    const again = raw.pages.map((rec) => {
      if (rec.error) return null
      if (!v2.relay.pages[rec.page]) return measurePage(pair, relayV2, rec, ctxOf(rec))
      if (!rec.relay || rec.relay.error) return null
      return measurePage(pair, relayV2, { ...rec, v2: { ...rec.v2, ...rec.relay } }, ctxOf(rec))
    })
    const drawnAgain = again.filter((q) => q && !q.error)
    pastRoomPass(drawnAgain, recount)
    sharePass(drawnAgain, recount)
    linksPass(drawnAgain, recount)
    stylePass(drawnAgain, recount)
    labelsPass(drawnAgain, recount)
    scriptsPass(drawnAgain, recount)
    for (const p of mine) freshResolve(p, again.find((q) => q?.page === p.page) ?? null, { incomparable, unsentenced })
    relayTimes.push({ pair, lay: v2.relay.ms ?? null, drawing: raw.relayMs ?? null, pages: Object.keys(v2.relay.pages).length })
  }
  // (lane parity-fresh: each page's fresh units, tinted on v2's pane, with v2's size and line count against the original's (the
  // coordinator's ruling of 2026-11-11: stated though not judged against today's); every difference that touches one tagged)
  if (v2.fresh?.length) {
    const fr = freshOf(pair, v2)
    freshes.push(fr)
    const ords = new Set(v2.fresh)
    for (const p of mine) {
      tagFresh(p, v2, todayOf)
      const at = fr.pages.find((x) => x.page === p.page)
      const rec = raw.pages.find((r) => r.page === p.page)
      // (the review mode, every unit fresh: no tint, no fresh list; the units off the original's size or line count, and, against
      // the gate sheet, those whose fresh text changed a judged measure, each with the text each side drew)
      if (v2.freshMode === 'all') {
        const off = offOriginalOf(p)
        const texts = (key) => {
          const ord = key.startsWith('p') ? Number(key.slice(1)) : [...todayOf].find(([, t]) => `t${t}` === key)?.[0]
          const said = (us, id) => (us ?? []).filter((u) => u.id === id).flatMap((u) => u.lines.map((l) => l.text)).join(' ').slice(0, 300)
          return { today: key.startsWith('t') ? said(rec?.today?.units, Number(key.slice(1))) : '', v2: said(rec?.v2?.units, ord) }
        }
        const changed = GATE ? judgedChanged(gateOf.get(`${p.pair}|${p.page}`), p).map((c) => ({ ...c, ...texts(String(c.unit).split(' ')[0]) })) : null
        if (off.length || changed?.length) p.review = { off, ...(changed ? { changed } : {}) }
        continue
      }
      const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null)
      // (each size tie of the page holding a fresh unit: its other members' size as v2 drew them, against the original's, the
      // median share, stated though not judged (the coordinator's ruling of 2026-11-11 on the tie rule))
      const factOf = new Map((v2.facts?.[p.page]?.members ?? []).map((m) => [m.ord, m]))
      const kindOf = new Map([...factOf].map(([o, m]) => [o, m.kind]))
      const keyOf = (o) => (todayOf.has(o) ? `t${todayOf.get(o)}` : `p${o}`)
      // (a member's drawn size, its lines' median as v2 drew them, turned ones too, against the original's: the unit measure's
      // where it read one, else TeX's size the part states)
      const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1]
      const shareOf = (o) => {
        const ls = (rec?.v2?.units ?? []).find((u) => u.id === o)?.lines.filter((l) => l.n > 0) ?? []
        const os = p.units?.find((x) => x.key === keyOf(o))?.sides?.v2?.osize ?? factOf.get(o)?.style?.size
        return ls.length && os ? med(ls.map((l) => l.size)) / os : null
      }
      const ties = (v2.facts?.[p.page]?.ties ?? [])
        .filter((t) => t.some((o) => ords.has(o)))
        .map((t) => {
          const shares = t
            .filter((o) => !ords.has(o))
            .map(shareOf)
            .filter((x) => x !== null)
            .sort((a, b) => a - b)
          return { kind: kindOf.get(t[0]) ?? null, members: t.length, fresh: t.filter((o) => ords.has(o)).length, drawn: shares.length, share: shares.length ? r2(shares[shares.length >> 1]) : null }
        })
        .filter((x) => x.drawn)
      if (!at && !ties.length) continue
      const said = (at?.units ?? []).map((key) => {
        const u = p.units?.find((x) => x.key === key)
        const v = u?.sides?.v2,
          t = u?.sides?.today
        const ord = at.ords[at.units.indexOf(key)]
        return { unit: key, kind: u?.kind ?? null, cause: v2.freshCause?.[ord] ?? 'no-row', lines: v?.lines ?? null, olines: v?.olines ?? null, size: r2(v?.size), osize: r2(v?.osize), today: t ? { lines: t.lines, size: r2(t.size) } : null }
      })
      p.fresh = { units: at?.units ?? [], causes: at?.causes ?? {}, said, ...(ties.length ? { ties } : {}), tint: rec ? tintOf(rec, ords) : [] }
    }
  }
  pages.push(...mine)
}
const incomplete = coverageOf(run, { asked: asked.length ? asked : null, notMeasured, drawn, pages })
const verdict = verdictOf(incomplete, pages)

// ---------------------------------------------------------------- the summary, the file and the sheet
const isFirst = (p) => (p.pair === '1706.03762v7-zh' && p.page === 10) || (p.pair === '2303.11366v4-zh' && p.page === 1)
const order = [...pages].sort(
  (a, b) => Number(isFirst(b)) - Number(isFirst(a)) || Number(b.worse > 0) - Number(a.worse > 0) || b.score - a.score || a.pair.localeCompare(b.pair) || a.page - b.page,
)
const { summary, worst } = summaryOf(pages)
// (the fresh rule's second look over the run: the differences it set aside, by what each came to (verdict.mjs freshResolve), the
// reasons of those not comparable, the pages a judged one makes worse, the time the re-lay took. No list of acceptances and no
// list carried from a round before is read)
const setAside = pages.flatMap((p) => p.diffs.filter((d) => d.nearer === 'text' || d.nearer === 'incomparable' || d.relaid).map((d) => ({ p, d })))
const relaySummary = relayTimes.length
  ? {
      text: setAside.filter((x) => x.d.nearer === 'text').length,
      judged: setAside.filter((x) => x.d.relaid).length,
      worse: setAside.filter((x) => x.d.relaid && x.d.worse).length,
      worsePages: [...new Set(setAside.filter((x) => x.d.relaid && x.d.worse).map((x) => `${x.p.pair} p${x.p.page}`))],
      incomparable: setAside.filter((x) => x.d.nearer === 'incomparable').length,
      why: setAside
        .filter((x) => x.d.nearer === 'incomparable')
        .reduce((o, x) => {
          o[x.d.why] = (o[x.d.why] ?? 0) + 1
          return o
        }, {}),
      ms: { lay: relayTimes.reduce((n, x) => n + (x.lay ?? 0), 0), drawing: relayTimes.reduce((n, x) => n + (x.drawing ?? 0), 0) },
      pages: relayTimes.reduce((n, x) => n + x.pages, 0),
    }
  : null
const result = {
  format: 'readarxiv-parity 3',
  verdict: 'display ≥ today: no page worse than today\'s, a difference only where nearer the original, over every page the run asked',
  pass: verdict.pass,
  run: run ? { id: run.id, at: run.at, pairs: run.pairs, pages: run.pages ?? null, toggles: run.toggles ?? 'defaults', done: run.done, stopped: run.stopped ?? null } : null,
  bounds: BOUNDS,
  near: NEAR,
  measures: SAYS,
  pairs,
  missing,
  incomplete,
  pagesDrawn: pages.length,
  pagesWorse: verdict.worse,
  // (the pages where both sides depart from the original alike, a defect the verdict of v2 against today cannot see: blind.mjs)
  pagesBoth: pages.filter((p) => p.both?.length).length,
  // (the units no row of the pair's fixed rows serves, not measured: each page with them and their count, the coordinator's
  // ruling of 2026-11-10; never worse, nothing hidden)
  unmeasured: unmeasuredOf(pages),
  // (the units drawn with a fresh row and those sent that today never had, lane parity-fresh; none where no pair was laid so)
  ...(freshes.length
    ? {
        fresh: {
          units: freshes.reduce((n, f) => n + f.units, 0),
          kinds: freshes.reduce((k, f) => {
            for (const [a, n] of Object.entries(f.kinds)) k[a] = (k[a] ?? 0) + n
            return k
          }, {}),
          causes: freshes.reduce((k, f) => {
            for (const [a, n] of Object.entries(f.causes)) k[a] = (k[a] ?? 0) + n
            return k
          }, {}),
          pages: freshes.flatMap((f) => f.pages),
          never: freshes.flatMap((f) => f.never),
          unjudged: pages.reduce((n, p) => n + p.diffs.filter((d) => d.nearer === 'fresh').length, 0),
          ...(relaySummary ? { relay: relaySummary } : {}),
          // (the review mode: every unit v2 sends laid fresh; against the gate sheet, the units whose fresh text changed a judged
          // measure; the units off the original's size or line count)
          ...(pages.some((p) => p.review) || GATE
            ? {
                mode: 'all',
                ...(GATE ? { gate: GATE, changed: pages.reduce((n, p) => n + (p.review?.changed?.length ?? 0), 0), changedPages: pages.filter((p) => p.review?.changed?.length).length } : {}),
                off: pages.reduce((n, p) => n + (p.review?.off?.length ?? 0), 0),
                offBy: Object.fromEntries(['smaller', 'larger', 'more lines'].map((k) => [k, pages.reduce((n, p) => n + (p.review?.off ?? []).filter((x) => x.off.includes(k)).length, 0)])),
              }
            : {}),
        },
      }
    : {}),
  facts,
  errors: pages.filter((p) => p.error).map((p) => `${p.pair} p${p.page}: ${p.error}`),
  notes,
  // (the v2 files read unchecked: laid before the bundles guard, inputs.mjs bundleCheck)
  ...(warnings.length ? { warnings } : {}),
  summary,
  worst,
  pages: order,
}
writeFileSync(join(OUT, 'parity.json'), `${JSON.stringify(result)}\n`)
writeFileSync(join(OUT, 'index.html'), sheet(result))
console.log(`parity: ${pages.length} pages of ${pairs.length} pairs; ${result.pagesWorse} worse than today; missing ${missing.map((m) => m.pair).join(', ') || 'none'}`)
for (const x of notes) console.log(x)
if (result.fresh) {
  const f = result.fresh
  console.log(`fresh: ${f.units} units drawn with a fresh translation on ${f.pages.length} pages (${Object.entries(f.kinds).map(([k, n]) => `${k} ${n}`).join(', ')}); ${f.unjudged} differences read as fresh, unjudged`)
  if (f.relay)
    console.log(
      `the fresh rule's second look (v2 laid again with today's own text in v2's unit, ${f.relay.pages} pages changed; the lay ${(f.relay.ms.lay / 1000).toFixed(1)} s, its drawing ${(f.relay.ms.drawing / 1000).toFixed(0)} s): ${f.relay.text} follow from the different text, ${f.relay.judged} judged (${f.relay.worse} worse, on ${f.relay.worsePages.length} pages: ${f.relay.worsePages.join(', ') || 'none'}), ${f.relay.incomparable} not comparable (${Object.entries(f.relay.why).map(([w, n]) => `${w} ${n}`).join('; ')})`,
    )
  console.log(`sent by v2, never by today: ${f.never.length} (${f.never.map((x) => `${x.pair} p${x.page} ${x.unit}${x.drawn ? '' : ' (not drawn)'}`).join('; ')})`)
}
console.log(`unmeasured: ${result.unmeasured.units} units on ${result.unmeasured.pages.length} pages (${result.fresh ? 'neither a stored row nor a fresh one serves them: the translator refused them or the cache lacks them' : "no row of the pair's serves them"})`)
for (const u of result.unmeasured.pages) console.log(`  ${u.pair} p${u.page}: ${u.units.length} (${u.units.join(', ')})${u.judgements > u.units.length ? `; ${u.judgements - u.units.length} judgements beside them` : ''}`)
console.log(`incomplete: ${incomplete.length}${incomplete.length ? ` (${incomplete.slice(0, 5).join('; ')}${incomplete.length > 5 ? '; …' : ''})` : ''}`)
for (const f of FLAGS) {
  const x = summary[f]
  console.log(`  ${f.padEnd(11)} ${String(x.worsePages).padStart(4)} pages worse (${x.worseUnits} differences), ${x.nearerPages} nearer; faults: v2 ${x.v2FaultPages} pages, today ${x.todayFaultPages}${x.bothUnits ? `; both depart ${x.bothPages} pages (${x.bothUnits})` : ''}`)
}
console.log('worst:')
for (const w of worst) console.log(`  ${w.pair} p${w.page} (${w.score}): ${Object.entries(w.worse).map(([f, x]) => `${f} ${x.units}`).join(', ')}`)
process.exitCode = verdict.pass ? 0 : 1


function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function sheet(r) {
  const rows = FLAGS.map((f) => {
    const x = r.summary[f]
    return `<tr><th>${f}</th><td class="bad">${x.worsePages}</td><td>${x.worseUnits}</td><td class="good">${x.nearerPages}</td><td>${x.v2FaultPages}</td><td>${x.todayFaultPages}</td><td>${x.bothPages ?? 0}</td><td class="says">${esc(SAYS[f])}</td></tr>`
  }).join('')
  const miss = r.missing.map((m) => `<article class="card missing${m.asked ? ' flagged' : ''}"><h2>${esc(m.pair)}</h2><p>Not drawn: ${esc(m.why)}${m.asked ? ' (asked of this run: the gate fails)' : ''}.</p></article>`).join('')
  const inc = r.incomplete.length
    ? `<article class="card flagged"><h2>Not judged whole: the gate fails</h2><ul>${r.incomplete.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></article>`
    : ''
  const um = r.unmeasured ?? { units: 0, pages: [] }
  const unmeasured = um.pages.length
    ? `<article class="card"><h2>Unmeasured: ${um.units} units on ${um.pages.length} pages</h2><p>${r.fresh ? "Units neither a stored row nor a fresh one serves (the translator refused them, or the cache holds no reply: run v2.mjs --fresh=fill), which v2 leaves the original's here: never worse, not measured." : "Units no row of the pair's fixed rows serves (a rule changed their text: today's stored replies cannot say them), which v2 leaves the original's here: never worse, not measured."}</p><ul>${um.pages.map((u) => `<li><a href="#${esc(`${u.pair}-p${u.page}`)}">${esc(u.pair)} p${u.page}</a>: ${u.units.length} (${esc(u.units.join(', '))})${u.judgements > u.units.length ? `; ${u.judgements - u.units.length} judgements beside them` : ''}</li>`).join('')}</ul></article>`
    : ''
  const fr = r.fresh
  const freshCard = fr?.mode === 'all'
    ? `<article class="card flagged"><h2>Review mode: v2's side drawn entirely with fresh translations (${fr.units} units)</h2><p>Every unit v2 sends is laid with its own reply from the translate package's chain (Microsoft's keyless adapter, from lab-data's cache): v2 as a reader gets it, against the original. Today's side keeps its stored rows, so its measures against today compare two translations: line count, size, spacing and sentence pairing are not judged (listed "fresh"); the rest are. The worse count of this sheet is information, not the gate's (the gate sheet lays stored rows where they serve). Units off the original's size (either way) or taking more lines are listed on their page, the farthest first (${fr.off}: smaller ${fr.offBy?.smaller ?? 0}, larger ${fr.offBy?.larger ?? 0}, more lines ${fr.offBy?.['more lines'] ?? 0})${fr.gate ? `; units whose fresh text changed a judged measure against the gate sheet (${esc(fr.gate)}): ${fr.changed} on ${fr.changedPages} pages, listed on each` : ''}.</p></article>`
    : fr
    ? `<article class="card"><h2>Drawn with a fresh translation: ${fr.units} units on ${fr.pages.length} pages</h2><p>Units no stored row of the pair's serves, or whose stored row answered another unit than v2's, laid with the row a reader gets (the translate package's chain, Microsoft's keyless adapter, from lab-data's cache), tinted on v2's pane. Their line count, size, spacing and sentence pairing follow from the length of the text drawn: each such difference is judged again on v2 laid with today's own text in v2's unit${fr.relay ? ` (${fr.relay.pages} pages laid and drawn again)` : ''}: gone there, it follows from the different text (${fr.relay?.text ?? 0}, listed with the two texts' lengths); still there, it is judged as any (${fr.relay?.judged ?? 0}, ${fr.relay?.worse ?? 0} worse); where today's text cannot be laid in v2's unit, not comparable (${fr.relay?.incomparable ?? 0}, each with its reason)${fr.unjudged ? `; ${fr.unjudged} still unjudged` : ''}. Every other measure judges them. By kind: ${esc(Object.entries(fr.kinds).map(([k, n]) => `${k} ${n}`).join(', '))}. By cause: ${esc(Object.entries(fr.causes).map(([k, n]) => `${FRESH_CAUSE[k] ?? k} ${n}`).join(', '))}.</p><ul>${fr.pages.map((u) => `<li><a href="#${esc(`${u.pair}-p${u.page}`)}">${esc(u.pair)} p${u.page}</a>: ${u.units.length} (${esc(u.units.join(', '))})${u.causes.unit ? `; ${u.causes.unit} whose stored row answered another unit` : ''}</li>`).join('')}</ul></article><article class="card${fr.never.length ? ' flagged' : ''}"><h2>Sent by v2, never by today: ${fr.never.length} units</h2><p>Units v2 sends a translator that today had no unit of (nothing of today's to compare): each is v2's own decision to translate.</p><ul>${fr.never.map((x) => `<li><a href="#${esc(`${x.pair}-p${x.page}`)}">${esc(x.pair)} p${x.page}</a>: ${esc(x.unit)}${x.drawn ? '' : ' (not drawn: refused or not in the cache)'}</li>`).join('')}</ul></article>`
    : ''
  const said = r.notes?.length ? `<article class="card flagged"><h2>Not applied</h2><ul>${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></article>` : ''
  const side = (x) => `${x.value === null || x.value === undefined ? '' : `${esc(x.value)} `}${x.off === null || x.off === undefined ? '' : `<span class="off">off ${esc(x.off)}</span>`}`
  const cards = r.pages
    .map((p) => {
      const id = `${p.pair}-p${p.page}`
      const diffs = p.diffs.length
        ? `<table class="diffs"><thead><tr><th>measure</th><th>unit</th><th>what</th><th>original</th><th>today</th><th>v2</th><th>nearer</th></tr></thead><tbody>${p.diffs
            .map((d) => `<tr class="${d.worse ? 'worse' : d.nearer === 'fresh' || d.nearer === 'text' || d.nearer === 'incomparable' ? 'fresh' : 'better'}"><td><b>${d.flag}</b></td><td>${esc(d.unit ?? 'page')}</td><td>${esc(d.what)}</td><td>${esc(d.original)}</td><td>${side(d.today)}</td><td>${side(d.v2)}</td><td class="n">${d.nearer === 'v2' ? 'v2' : d.nearer === 'unexercised' ? 'not exercised' : d.nearer === 'unmeasured' ? 'unmeasured' : d.nearer === 'fresh' ? 'fresh (unjudged)' : d.nearer === 'text' ? `follows from the different text${d.chars ? ` (today ${d.chars.today} characters, v2 ${d.chars.v2})` : ''}` : d.nearer === 'incomparable' ? `not comparable: ${esc(d.why ?? '')}` : d.nearer === 'ruling' ? `<span title="${esc(d.ruling ?? '')}">the ruling's</span>` : 'today'}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="ok">no difference past a noise floor</p>'
      const shared = p.both?.length
        ? `<p class="h">Both depart from the original (a shared defect, no verdict):</p><table class="diffs"><thead><tr><th>measure</th><th>unit</th><th>what</th><th>original</th><th>today</th><th>v2</th></tr></thead><tbody>${p.both
            .map((d) => `<tr class="both"><td><b>${d.flag}</b></td><td>${esc(d.unit ?? 'page')}</td><td>${esc(d.what)}</td><td>${esc(d.original)}</td><td>${side(d.today)}</td><td>${side(d.v2)}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
      const fl = FLAGS.filter((f) => p.faults[f])
        .map((f) => {
          const x = p.faults[f]
          const list = [...x.v2Says.map((s) => `<li>v2: ${esc(s)}</li>`), ...x.todaySays.map((s) => `<li class="t">today: ${esc(s)}</li>`)].join('')
          return `<details class="fault"><summary>${f}: v2 ${x.v2}, today ${x.today}</summary><ul>${list}</ul></details>`
        })
        .join('')
      const m = p.measures ?? {}
      const nums = p.error
        ? `<p class="err">${esc(p.error)}</p>`
        : `<p class="nums">laid: today ${m.laid?.today}, v2 ${m.laid?.v2} · links: original ${m.links?.original}, today ${m.links?.today}, v2 ${m.links?.v2} · borders: original ${m.borders?.original ?? '–'}, today ${m.borders?.today ?? '–'}, v2 ${m.borders?.v2 ?? '–'} · sentence boxes: today ${m.highlight?.today}, v2 ${m.highlight?.v2} · darkness: original text ${m.darkness?.originalText?.mean ?? m.darkness?.original?.mean ?? '–'}, today ${m.darkness?.today?.mean ?? '–'}, v2 ${m.darkness?.v2?.mean ?? '–'} · off arXiv's page outside the units: today ${m.diff?.outsideToday ?? '–'}, v2 ${m.diff?.outside ?? '–'} px</p>`
      const tint = p.fresh?.tint.length ? p.fresh.tint.map((b) => `<i class="fresh" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%"></i>`).join('') : ''
      const img = (k, alt) => `<figure${k === 'v' && tint ? ' class="tinted"' : ''}><figcaption>${alt}${k === 'v' && p.fresh?.units.length ? ` (${p.fresh.units.length} units with a fresh translation, tinted)` : ''}</figcaption>${k === 'v' && tint ? `<div class="tint"><img loading="lazy" src="img/${id}-${k}.webp" alt="${esc(`${alt}, ${p.pair} page ${p.page}`)}">${tint}</div>` : `<img loading="lazy" src="img/${id}-${k}.webp" alt="${esc(`${alt}, ${p.pair} page ${p.page}`)}">`}</figure>`
      const freshLi = (x) => `<li>${esc(x.unit)} ${esc(x.kind ?? '')}: ${x.lines ?? '–'} lines (original ${x.olines ?? '–'}), size ${x.size ?? '–'} (original ${x.osize ?? '–'}${x.size && x.osize ? `, ${Math.round((x.size / x.osize) * 100)} %` : ''})${x.today ? `; today ${x.today.lines} lines, size ${x.today.size}` : '; today: not drawn'}</li>`
      const ruleKept = p.fresh?.said.filter((x) => x.cause === 'today-kept') ?? []
      const tieLi = (x) => `<li>${esc(x.kind ?? 'text')}s laid at one size with fresh ones: ${x.share} of the original's (the median of ${x.drawn} drawn), tied to ${x.fresh} fresh of ${x.members}</li>`
      const offLi = (x) => `<li>${esc(x.unit)} ${esc(x.kind ?? '')} (${esc(x.off.join(', '))}): ${x.lines ?? '–'} lines (original ${x.olines ?? '–'}), size ${x.size ?? '–'} (original ${x.osize ?? '–'}${x.size && x.osize ? `, ${Math.round((x.size / x.osize) * 100)} %` : ''})</li>`
      const chLi = (x) => `<li>${esc(x.unit)} <b>${esc(x.flag)}</b>: gate ${esc(x.gate ?? 'none')} → review ${esc(x.review ?? 'none')}</li>`
      const reviewList = p.review
        ? `${p.review.off.length ? `<p class="h">Off the original's size, or more lines (not judged against today's here; the farthest first):</p><ul class="freshlist">${p.review.off.map(offLi).join('')}</ul>` : ''}${p.review.changed?.length ? `<p class="h">The fresh text changed a judged measure (gate sheet → this sheet):</p><ul class="freshlist">${p.review.changed.map(chLi).join('')}</ul>` : ''}`
        : ''
      const freshList = p.review
        ? reviewList
        : p.fresh
        ? `<p class="h">Drawn with a fresh translation (tinted; size and lines against the original's, not judged against today's):</p><ul class="freshlist">${p.fresh.said.filter((x) => x.cause !== 'today-kept').map(freshLi).join('')}${(p.fresh.ties ?? []).map(tieLi).join('')}</ul>${ruleKept.length ? `<p class="h">Kept by today's name/code rule, sent by v2: ${ruleKept.length}</p><ul class="freshlist">${ruleKept.map(freshLi).join('')}</ul>` : ''}`
        : ''
      const verdict = p.error ? '' : p.worse ? `<span class="v bad">worse than today: ${p.worse}</span>` : '<span class="v good">not worse than today</span>'
      return `<article class="card${p.worse ? ' flagged' : ''}" id="${esc(id)}"><h2>${esc(p.pair)} · page ${p.page} ${verdict}</h2>${nums}${freshList}${diffs}${shared}${fl ? `<div class="faults"><p class="h">Faults against the bounds (each side's, shared ones no verdict):</p>${fl}</div>` : ''}<div class="panes">${img('a', 'original')}${img('t', 'today')}${img('v', 'v2')}<figure class="diff"><figcaption>v2 against today (red v2's ink alone, blue today's)</figcaption><img loading="lazy" src="img/${id}-d.webp" alt="${esc(`difference, ${p.pair} page ${p.page}`)}"></figure></div></article>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Display parity sheet</title>
<style>
:root { --bg: #f6f6f4; --card: #fff; --ink: #1b1b1b; --muted: #666; --line: #ddd; --bad: #c0392b; --good: #2e7d32; --today: #2e6db4; --badbg: #fbeaea; --goodbg: #eaf5ea; --bothbg: #fdf3e1; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161616; --card: #202020; --ink: #eee; --muted: #aaa; --line: #3a3a3a; --badbg: #3a2020; --goodbg: #1f331f; --bothbg: #3a3020; } }
:root[data-theme="dark"] { --bg: #161616; --card: #202020; --ink: #eee; --muted: #aaa; --line: #3a3a3a; --badbg: #3a2020; --goodbg: #1f331f; --bothbg: #3a3020; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
table { border-collapse: collapse; background: var(--card); }
.summary { margin: 12px 0 20px; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.summary td { text-align: right; } .summary td.says { text-align: left; color: var(--muted); max-width: 560px; }
td.bad, .v.bad { color: var(--bad); font-weight: 600; } td.good, .v.good { color: var(--good); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 0 0 16px; }
.card.flagged { border-left: 4px solid var(--bad); }
.card h2 { font-size: 16px; margin: 0 0 4px; }
.v { font-size: 13px; margin-left: 8px; }
.nums, .ok, .h { color: var(--muted); margin: 0 0 6px; font-size: 13px; }
.err { color: var(--bad); }
.diffs { font-size: 13px; margin: 6px 0; width: 100%; }
.diffs tr.worse { background: var(--badbg); } .diffs tr.better { background: var(--goodbg); } .diffs tr.both { background: var(--bothbg); }
.diffs td.n { font-weight: 600; } .diffs tr.worse td.n { color: var(--bad); } .diffs tr.better td.n { color: var(--good); }
.off { color: var(--muted); }
.fault summary { cursor: pointer; font-size: 13px; }
.fault ul { margin: 4px 0 8px; padding-left: 20px; font-size: 13px; }
.fault li.t { color: var(--today); }
.panes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.panes figure { margin: 0; }
.panes figcaption { font-size: 12px; color: var(--muted); }
.panes img { width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
.panes .diff { grid-column: 1 / -1; max-width: 33%; }
@media (max-width: 800px) { .panes { grid-template-columns: 1fr; } .panes .diff { max-width: none; } .diffs { display: block; overflow-x: auto; } }
</style>${r.fresh ? FRESH_CSS : ''}
</head>
<body>
<h1>Display ≥ today: v2 against today's output, judged against arXiv's page</h1>
<p>${r.pagesDrawn} pages of ${r.pairs.length} pairs drawn offline${r.run?.toggles === 'on' ? ', every switch of "What to translate" on (figure and table text, headers and footers, references, the author block) on both sides' : ', under the default toggles'}, with the same rows on both sides (today: the door over the release's bundle; v2: the reader drawing the entry's Page). A difference between the two passes only where v2 is nearer the original; <b>${r.pagesWorse} pages are worse than today's</b>${r.incomplete.length ? `, and the run is not judged whole (${r.incomplete.length})` : ''}: the gate ${r.pass ? 'passes' : 'fails'}. ${r.fresh ? `${r.fresh.units} units are drawn with a fresh translation where no stored row serves v2's unit (tinted, listed below). ` : ''}${(r.unmeasured?.units ?? 0) ? `${r.unmeasured.units} units on ${r.unmeasured.pages.length} pages are unmeasured: ${r.fresh ? 'neither a stored row nor a fresh one serves them' : "no row of the pair's serves them"} (listed below). ` : ''}On ${r.pagesBoth} pages both sides depart from the original alike (scripts drawn flat, a unit the toggles keep drawn translated): listed apart on each page, no verdict. Each difference below shows the original's value, both sides' and their distance from it (“off”), and which is nearer. Measures, noise floors and bounds: lab/typeset/parity/README.md.</p>
<table class="summary"><thead><tr><th>measure</th><th>pages worse</th><th>differences worse</th><th>pages v2 nearer</th><th>v2 faults (pages)</th><th>today faults (pages)</th><th>both depart (pages)</th><th>distance from the original</th></tr></thead><tbody>${rows}</tbody></table>
${inc}${said}${freshCard}${unmeasured}
${miss}
${cards}
</body>
</html>
`
}
