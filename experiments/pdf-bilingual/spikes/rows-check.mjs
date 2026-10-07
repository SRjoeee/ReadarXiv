// experiments/pdf-bilingual/spikes/rows-check.mjs
// The rows on the made fixtures (the layer-only plan §4.1; A2's E6, its proof "rowOf then unitOf gives v0's unit, and the
// hybrid's pieces are the ones the result gave"). For the five papers' zh outputs and 1706.03762v7's de and ja, from this
// machine's data (the papers' sources at data/layout/<id>/source.gz, the made fixtures' records and units files at
// out/layer-gate/fixtures/41795914c3c84238/<id>-<target>/):
//   1. the source units: sourceUnitsOf(bundle), the bundle's units rebuilt, are the paper's own units (kind, flags, depth,
//      cell, edges, every piece, a nested piece's unit) and give the wires openPaper's units give (markers and tags);
//   2. each record unit's translation, its JSON pieces matched to the unit's source pieces by kOfSource's key rule (a text
//      the record keeps untranslated to the unit's own text piece), is a result: rowOf, then unitOf gives v0's unit whose
//      kind, src, title, group and state equal the record row's, whose engine and sentences are the row's, whose pieces
//      are the record's pieces, and whose trPiecesOf(…, p => p.k) equals the units file's pieces, and the result's own
//      (trPiecesOf(result.pieces, kOfSource(source.pieces))); 2608.04322v1's cells 111 and 164 (an open that no piece of
//      the cell closes) among them;
//   3. toTranslate(bundle, lang) is the complement of keptFor(paper, lang), for every language;
//   4. batchesOf(bundle, lang) is runLive's batches in source order: its batches as the real runLive cuts them (a failing
//      compiler and a translator that gives the wire back), and as the rule stood inline there before it was shared;
//   5. layerRows over the record's results gives each unit its row, and keeps whole and holds the table cells groups.mjs
//      decideGroups does over the paper's own units and the same results (the records carry no group decision: they
//      predate it, every translated cell whole; the groups decided now otherwise are listed);
//   6. runRows over a send that gives the wire back runs the paper to its end: its rows are layerRows' over the results
//      asked for at once, and what onRows was given put together.
// The bundle is the units alone (the rows read nothing else of it), as a reader holds them: bundleUnitsOf's, through JSON.
// Prints each paper's line and the rows' size against the record's. Exits 1 where a check fails.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/rows-check.mjs [--no-runlive]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const ROOT = new URL('..', import.meta.url).pathname, REPO = new URL('../../..', import.meta.url).pathname
const ENGINE = join(REPO, 'src/pdf-reader/engine')
const { bundleUnitsOf } = await import(join(ENGINE, 'layer-proto/bundle.mjs'))
const { batchesOf, FIRST_BATCH, layerRows, NEXT_BATCH, rowOf, runRows, sourceUnitsOf, toTranslate, unitOf } = await import(join(ENGINE, 'layer-proto/rows.mjs'))
const { kOfSource, trPiecesOf } = await import(join(ENGINE, 'layer/pieces.mjs'))
const { keptFor, openPaper, runLive } = await import(join(ENGINE, 'live.mjs'))
const { plainSource, serialize, serializeTags, translateUnits } = await import(join(ENGINE, 'mt.mjs'))
const { decideGroups, groupOf } = await import(join(ENGINE, 'groups.mjs'))
const { unpackSource } = await import(join(ENGINE, 'tar.mjs'))

const FIXTURES = join(ROOT, 'out/layer-gate/fixtures/41795914c3c84238')
const CASES = [['1512.03385v1', 'zh'], ['1706.03762v7', 'zh'], ['1810.04805v2', 'zh'], ['2307.16209v1', 'zh'], ['2608.04322v1', 'zh'], ['1706.03762v7', 'de'], ['1706.03762v7', 'ja']]
const LANGS = ['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru']
const RUNLIVE = !process.argv.includes('--no-runlive')
const J = JSON.stringify

let failed = 0
const problems = []
const note = (id, why) => problems.push(`${id}: ${why}`)

/** a piece by what it is (t, text, source, pair; a nested piece's brackets and its unit's kind: a record holds the unit whole) */
const shape = p => (p.t === 'nested' ? { t: p.t, pre: p.pre, post: p.post, unit: p.unit?.kind } : { t: p.t, ...(p.s !== undefined ? { s: p.s } : {}), ...(p.src !== undefined ? { src: p.src } : {}), ...(p.id !== undefined ? { id: p.id } : {}) })
const unitShape = u => ({
  kind: u.kind, title: !!u.title, front: !!u.front, bracketed: !!u.bracketed, depth: u.depth ?? null, cell: u.cell ?? null,
  lead: u.lead ?? null, trail: u.trail ?? null, inner: u.inner ?? null, pieces: u.pieces.map(shape),
})

/** a record piece as a result's piece: a text it translated stays itself, one it left (the unit's own text piece, by
 *  its text and source) is that object, white space the wire cut off stays a piece of its own; any other piece is the
 *  unit's source piece the key rule finds (kOfSource), else it stays what it is (a piece with no source) */
function resultOf(rec, src) {
  const kOf = kOfSource(src.pieces), used = new Set()
  const pieces = rec.pieces.map(p => {
    if (p.t === 'text') {
      if (p.tr) return { ...p }
      const k = src.pieces.findIndex((q, i) => q.t === 'text' && q.s === p.s && (q.src ?? null) === (p.src ?? null) && !used.has(i))
      if (k >= 0) { used.add(k); return src.pieces[k] }
      return { ...p }
    }
    const k = kOf(p)
    return k >= 0 ? src.pieces[k] : p
  })
  return { pieces, state: rec.state, by: rec.by, ...(rec.sentences ? { sentences: rec.sentences } : {}) }
}

/** runLive's rule for a batch as it stood inline there (the unit nearest the reader first, here the source's order) */
function inlineBatches(paper, lang) {
  const kept = keptFor(paper, lang), todo = new Set(paper.units.map((u, i) => i).filter(i => !kept.has(paper.units[i])))
  const out = []
  for (let first = true; todo.size; first = false) {
    const order = [...todo].sort((a, b) => a - b), batch = []
    let chars = 0
    for (const i of order) { const n = plainSource(paper.units[i]).length; if (batch.length && chars + n > (first ? 2500 : 12000)) break; batch.push(i); chars += n }
    batch.forEach(i => todo.delete(i))
    out.push(batch)
  }
  return out
}
/** the batches the real runLive cuts, over a compiler that fails and a translator that gives the wire back */
async function runLiveBatches(paper, lang) {
  const batches = []
  const compile = async () => ({ ok: false, pdf: null, log: '! LaTeX Error: a failure.', ms: 1 })
  await runLive(paper, { lang, compile, previews: false, format: 'markers', translate: async texts => texts.map(text => ({ text, by: 'B' })), onBatch: r => { if (!r.seeded) batches.push(r.units.map(u => u.id)) } })
  return batches
}

const papers = new Map()
async function paperOf(name) {
  if (papers.has(name)) return papers.get(name)
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(ROOT, 'data/layout', name, 'source.gz'))))
  const paper = openPaper(files)
  const bundle = { units: JSON.parse(J(bundleUnitsOf(paper))) }
  const v = { paper, bundle }
  papers.set(name, v)
  return v
}

// ---------------------------------------------------------------- the papers, once each: source units, languages, batches
for (const name of [...new Set(CASES.map(c => c[0]))]) {
  const { paper, bundle } = await paperOf(name)
  const mine = []
  const units = sourceUnitsOf(bundle)
  if (units.length !== paper.units.length) mine.push(`${units.length} source units, the paper has ${paper.units.length}`)
  let wires = 0, opens = []
  units.forEach((u, i) => {
    const real = paper.units[i]
    if (!u) { mine.push(`unit ${i} null`); return }
    if (!isDeepStrictEqual(unitShape(u), unitShape(real)) || u.pieces.some((p, k) => p.t === 'nested' && units.indexOf(p.unit) !== paper.units.indexOf(real.pieces[k].unit))) mine.push(`unit ${i} is not the paper's`)
    else if (plainSource(u) !== plainSource(real) || serialize(u).wire !== serialize(real).wire || serializeTags(u).wire !== serializeTags(real).wire) mine.push(`unit ${i}'s wire is not the paper's`)
    else wires++
    const closes = new Set(u.pieces.filter(p => p.t === 'close').map(p => p.id))
    for (const p of u.pieces) if (p.t === 'open' && !closes.has(p.id)) opens.push(i)
  })
  for (const lang of LANGS) {
    const kept = keptFor(paper, lang), want = paper.units.map((u, i) => (kept.has(u) ? -1 : i)).filter(i => i >= 0)
    if (!isDeepStrictEqual(toTranslate(bundle, lang), want)) mine.push(`toTranslate(${lang}) is not the complement of keptFor`)
  }
  const langs = [...new Set(CASES.filter(c => c[0] === name).map(c => c[1]))]
  for (const lang of new Set([...langs, 'zh', 'de'])) {
    const got = batchesOf(bundle, lang), inline = inlineBatches(paper, lang)
    if (!isDeepStrictEqual(got, inline)) mine.push(`batchesOf(${lang}) is not the inline rule's`)
    if (RUNLIVE) {
      const live = await runLiveBatches(paper, lang)
      if (!isDeepStrictEqual(got, live)) mine.push(`batchesOf(${lang}) is not runLive's (${got.length} batches, runLive ${live.length})`)
    }
    if (got.flat().length && got[0] && got[0].reduce((a, i) => a + plainSource(paper.units[i]).length, 0) > FIRST_BATCH && got[0].length > 1) mine.push(`${lang}: the first batch is past ${FIRST_BATCH}`)
    for (const b of got.slice(1)) if (b.length > 1 && b.reduce((a, i) => a + plainSource(paper.units[i]).length, 0) > NEXT_BATCH) mine.push(`${lang}: a batch is past ${NEXT_BATCH}`)
  }
  if (mine.length) { failed++; for (const m of mine) note(name, m) }
  console.log(`${mine.length ? 'FAIL' : 'ok  '} ${name}: ${units.length} source units the paper's (${wires} wires equal), toTranslate the complement of keptFor in ${LANGS.length} languages, batchesOf the inline rule's${RUNLIVE ? ' and runLive\'s' : ''} (zh ${batchesOf(bundle, 'zh').length} batches, de ${batchesOf(bundle, 'de').length}); opens no piece of their unit closes: ${opens.length ? opens.join(' ') : 'none'}`)
  if (name === '2608.04322v1' && !(opens.includes(111) && opens.includes(164))) { failed++; note(name, `cells 111 and 164 are not units with an open of their own: ${opens.join(' ')}`) }
}

// ---------------------------------------------------------------- the fixtures' records
let rowBytes = 0, recordBytes = 0
for (const [name, lang] of CASES) {
  const label = `${name}-${lang}`, dir = join(FIXTURES, label)
  const { paper, bundle } = await paperOf(name)
  const units = sourceUnitsOf(bundle)
  const recordFile = readFileSync(join(dir, 'record.json'), 'utf8'), record = JSON.parse(recordFile), unitsFile = JSON.parse(readFileSync(join(dir, 'units.json'), 'utf8'))
  const mine = []
  const hybrid = new Map(unitsFile.units.map(u => [u.id, u]))
  if (record.units.length !== paper.units.length) { failed++; note(label, `the record has ${record.units.length} units, the paper ${paper.units.length}`); console.log(`FAIL ${label}: not the paper's units`); continue }
  const wanted = new Set(toTranslate(bundle, lang))
  const results = new Map()
  const tally = { whole: 0, partial: 0, none: 0, lost: 0, kept: 0, hybrid: 0, grouped: 0 }
  let nonText = 0
  record.units.forEach((rec, id) => {
    const src = units[id]
    if (rec.state === 'kept' && !rec.translation) {
      // a name the pipeline keeps (or the author block): no row
      if (wanted.has(id)) mine.push(`unit ${id}: kept in the record, and toTranslate asks for it`)
      tally.kept++
      return
    }
    if (!wanted.has(id)) { mine.push(`unit ${id}: ${rec.state} in the record, and toTranslate keeps it`); return }
    const state = rec.state === 'kept' ? rec.translation : rec.state
    const result = state === 'whole' || state === 'partial' ? resultOf({ ...rec, state }, src) : { state }
    results.set(id, result)
    const row = rowOf(bundle, id, result), unit = unitOf(bundle, row)
    if (!unit) { mine.push(`unit ${id}: no unit of row ${J(row).slice(0, 80)}`); return }
    if (row[2] !== state) mine.push(`unit ${id}: the row is ${row[2]}, the result ${state}`)
    if (unit.kind !== rec.kind) mine.push(`unit ${id}: kind ${unit.kind}, the record's ${rec.kind}`)
    if (unit.src !== rec.src) mine.push(`unit ${id}: src is not the record's`)
    if (!!unit.title !== !!rec.title) mine.push(`unit ${id}: title ${unit.title}, the record's ${rec.title}`)
    if ((unit.group ?? null) !== (rec.group ?? null) || (unit.group ?? null) !== groupOf(paper.units[id])) mine.push(`unit ${id}: group ${unit.group}, the record's ${rec.group}`)
    if (unit.state !== state) mine.push(`unit ${id}: state ${unit.state}, the record's ${state}`)
    if ((row[3] ?? null) !== (rec.by ?? null)) mine.push(`unit ${id}: engine ${row[3]}, the record's ${rec.by}`)
    if (!isDeepStrictEqual(row[4], rec.sentences ?? null)) mine.push(`unit ${id}: sentences are not the record's`)
    if (state === 'whole' || state === 'partial') {
      const got = trPiecesOf(unit.pieces, p => p.k)
      if (!got) { mine.push(`unit ${id}: no hybrid pieces`); return }
      if (!isDeepStrictEqual(got, trPiecesOf(result.pieces, kOfSource(src.pieces)))) mine.push(`unit ${id}: the hybrid's pieces are not the result's`)
      const file = hybrid.get(id)
      if (file) { tally.hybrid++; if (!isDeepStrictEqual(got, file.pieces)) mine.push(`unit ${id}: the hybrid's pieces are not the units file's`) }
      // the pieces themselves: the record's, but for a text's flag
      const plain = unit.pieces.map(shape), want = rec.pieces.map(shape)
      if (!isDeepStrictEqual(plain, want)) mine.push(`unit ${id}: the pieces are not the record's`)
      nonText += unit.pieces.filter(p => p.t !== 'text').length
    } else if (unit.pieces) mine.push(`unit ${id}: pieces in a ${state} unit`)
    tally[state]++
    if (rec.group) tally.grouped++
  })
  // the cells with an open of their own (2608.04322v1's 111 and 164) are among the checked
  if (name === '2608.04322v1') for (const id of [111, 164]) if (!results.has(id) || units[id].pieces.every(p => p.t !== 'open')) mine.push(`cell ${id} is not among the rows checked, or holds no open`)

  // the rows the results allow: a cell of a group only once decided
  const { rows, held } = layerRows(bundle, results, lang)
  const byId = new Map(rows.map(r => [r[0], r]))
  if (held.length) mine.push(`${held.length} cells held with every result in`)
  if (rows.length !== results.size) mine.push(`${rows.length} rows for ${results.size} results`)
  // the groups decided as runLive decides them: groups.mjs over the paper's own units and these results
  const idOf = new Map(paper.units.map((u, i) => [u, i]))
  const oracle = decideGroups(paper.units, u => { const r = results.get(idOf.get(u)); return r && { state: r.state, pieces: r.pieces } }, keptFor(paper, lang))
  const keepIds = [...oracle.keep].map(u => idOf.get(u)).filter(id => results.has(id)).sort((a, b) => a - b)
  if (!isDeepStrictEqual(rows.filter(r => r[2] === 'kept').map(r => r[0]), keepIds)) mine.push('the cells kept whole are not the ones groups.mjs keeps')
  if (!isDeepStrictEqual(held, [...oracle.wait].map(u => idOf.get(u)).sort((a, b) => a - b))) mine.push('the cells held are not the ones groups.mjs waits on')
  let keptWhole = 0
  const flipped = new Set()
  for (const [id, result] of results) {
    const row = byId.get(id), unit = paper.units[id]
    if (!row) { mine.push(`unit ${id}: no row`); continue }
    if (row[2] === 'kept') {
      keptWhole++
      if (row[5] !== result.state || row[1].length) mine.push(`unit ${id}: a kept row ${J(row).slice(0, 80)}`)
    } else if (!isDeepStrictEqual(row, rowOf(bundle, id, result))) mine.push(`unit ${id}: its row is not rowOf's`)
    // a group decided otherwise than the record has it: the record was made under another share (groups.mjs NAMES_SHARE)
    if (groupOf(unit) && (row[2] === 'kept') !== (record.units[id].state === 'kept')) flipped.add(groupOf(unit))
  }
  const flips = [...flipped].map(g => { const d = oracle.groups.get(g); return `${g} ${d.decision} ${d.same}/${d.cells}` })
  if (rows.some((r, i) => i && rows[i - 1][0] >= r[0])) mine.push('rows not rising')
  rowBytes += J(rows).length
  recordBytes += recordFile.length

  // the whole loop over a send that gives the wire back: every unit is asked, and what onRows was given is the rows
  const given = new Map(), calls = []
  const send = async texts => { calls.push(texts); return texts.map(text => ({ text, by: 'echo' })) }
  const ran = await runRows(bundle, { lang, send, onRows: r => { for (const row of r) given.set(row[0], row) } })
  // (the results of the same send asked for at once)
  const echoes = new Map()
  {
    const { results: r } = await translateUnits(toTranslate(bundle, lang).map(id => units[id]), async texts => texts.map(text => ({ text, by: 'echo' })))
    for (const [u, v] of r) echoes.set(units.indexOf(u), v)
  }
  const want = layerRows(bundle, echoes, lang).rows
  if (!isDeepStrictEqual([...ran.rows.values()], want)) mine.push('runRows\' rows are not layerRows\' over the results asked for at once')
  if (!isDeepStrictEqual([...given.values()].sort((a, b) => a[0] - b[0]), want)) mine.push('what onRows was given is not the rows')
  // (a unit that cannot be read back is asked again as its runs, in a call of its own: the open with no close)
  const wires = batchesOf(bundle, lang).map(b => b.map(id => serialize(units[id]).wire))
  if (!isDeepStrictEqual(calls.filter(c => wires.some(w => isDeepStrictEqual(c, w))), wires)) mine.push('runRows asked other batches than batchesOf')
  if (ran.stopped !== null || ran.lost !== 0) mine.push(`runRows stopped ${ran.stopped}, lost ${ran.lost}`)

  if (mine.length) { failed++; for (const m of mine.slice(0, 12)) note(label, m); if (mine.length > 12) note(label, `… and ${mine.length - 12} more`) }
  console.log(`${mine.length ? 'FAIL' : 'ok  '} ${label}: ${record.units.length} units, ${results.size} with rows (${tally.whole} whole, ${tally.partial} partial, ${tally.none} none, ${tally.lost} lost; ${tally.kept} names kept; ${tally.grouped} in table groups; ${keptWhole} kept whole by layerRows), ${tally.hybrid} hybrid pieces equal the units file's, ${nonText} non-text pieces by k; runRows in ${wires.length} batches (${calls.length - wires.length} calls more for runs), ${ran.rows.size} rows${flips.length ? `; ${flips.length} table groups decided now otherwise than the record has them: ${flips.slice(0, 5).join(', ')}` : ''}`)
}
console.log(`rows ${(rowBytes / 1024).toFixed(0)} KB of JSON for the ${CASES.length} outputs, their records ${(recordBytes / 1024).toFixed(0)} KB (${(100 * rowBytes / recordBytes).toFixed(1)} %)`)
for (const p of problems) console.log(`  ${p}`)
console.log(failed ? `FAIL ${failed} checks failed` : 'ok   all checks hold')
process.exit(failed ? 1 : 0)
