// lab/rules/report.mjs: the rule ledger's report (design-reduction-2026-11-13.md §3c, R4; amendment 8.9), by area (R5a-d,
// areas.mjs) and by file. Per area: the yield table (every verdict's count; the rules to remove, the sites to fold in
// rules that stay, the list entries to remove); every flagged citation with its whole comment, for the coordinator to
// confirm or strike before a removal lane acts on the area; BY NAME, the rules the ledger marks as deciding nothing (file,
// line, the constant or list, what was recorded): the list an area whose removals are scheduled shows; the magnitudes with
// no stated source beside the census's unmeasured budgets; the lists whose entries are not judged. Read from the full
// record (ledger.mjs ledgerOf): the names it prints are not in the tracked ledger. Pure. Not shipped.
import { AREAS, areaOf } from './areas.mjs'
import { marginOf, readsOf, recordedOf, VERDICTS } from './ledger.mjs'

const AREA_IDS = [...AREAS.map(a => a.id), 'other']
const saysOf = id => AREAS.find(a => a.id === id)?.says ?? 'in no area'
const nameOf = r => (r.kind === 'list' ? (r.name ?? `[${r.entries.slice(0, 3).join(', ')}${r.entries.length > 3 ? ', …' : ''}]`) : (r.name ?? `${r.raw} (${r.context})`))
const cell = s => String(s ?? '').replace(/\|/g, '\\|')

/** the report of a ledger: `{ byArea, byFile, counts }`, two markdown texts and the counts. `budgets`: the census's
 *  budgets (census.json AFTER debt.thresholds.list, class budget) for the unmeasured beside the magnitudes; `profile`: the
 *  recording is of a few inputs, not the yield (said at the top); `deferred`: areas whose removals are scheduled, not
 *  done (their by-name lists headed so) */
export function reportOf(ledger, { budgets = null, profile = null, deferred = [] } = {}) {
  const rows = Object.values(ledger.rules).filter(r => r.after !== false)
  const cut = Object.values(ledger.rules).length - rows.length
  const counts = {}
  for (const id of AREA_IDS) counts[id] = { rules: 0, thresholds: 0, lists: 0, verdicts: {}, folds: 0, entries: 0 }
  for (const r of rows) {
    const c = counts[r.area]
    c.rules++
    c[r.kind === 'list' ? 'lists' : 'thresholds']++
    c.verdicts[r.verdict] = (c.verdicts[r.verdict] ?? 0) + 1
    if (r.verdict !== 'remove' && r.verdict !== 'cited paper silent') c.folds += r.folds.length
    c.entries += r.removeEntries?.length ?? 0
  }
  const inputs = Object.entries(ledger.recorded.inputs ?? {})
    .map(([k, v]) => `${k} (${v.records} records${v.papers?.length ? `, ${v.papers.length} papers` : ''})`)
    .join(', ')
  const L = ['# The rule ledger, by area', '']
  if (profile) L.push(`> **A PROFILE, NOT THE YIELD.** ${profile}`, '')
  L.push(`Recorded at ${ledger.recorded.commit ?? 'an unknown commit'} over the site map ${ledger.recorded.sites}; inputs: ${inputs || 'none'}. Rows: the census's rules of the rule areas the cut-over keeps (${rows.length}; ${cut} more in modules the cut-over deletes, not reported). A margin never decides a removal: removal follows from one outcome or never run alone (lab/rules/ledger.mjs).`, '')
  L.push('## The yield', '', 'Per area: the rules, then each verdict\'s count; to remove: the rules that go whole; sites to fold: the comparisons of rules that stay that saw one outcome or never ran; entries: list entries with no hit.', '')
  const V = ['decides', 'test', 'definition', 'cited paper', 'measurement', 'value', 'magnitude', 'not judged', 'not exercised', 'cited paper silent', 'remove']
  L.push(`| Area | Rules (thresholds, lists) | ${V.join(' | ')} | Sites to fold | Entries to remove |`, `|---|---|${V.map(() => '---').join('|')}|---|---|`)
  for (const id of AREA_IDS) {
    const c = counts[id]
    if (!c.rules) continue
    L.push(`| ${id}${deferred.includes(id) ? ' (removal scheduled)' : ''} | ${c.rules} (${c.thresholds}, ${c.lists}) | ${V.map(v => c.verdicts[v] ?? 0).join(' | ')} | ${c.folds} | ${c.entries} |`)
  }
  L.push('', ...Object.entries(VERDICTS).map(([v, x]) => `- **${v}**: ${x.says}`), '')
  if (ledger.holdoutAdds?.length) L.push(`Papers the rules' comments cite, to join the holdout beyond its 30: ${ledger.holdoutAdds.join(', ')}.`, '')

  // the flagged citations, whole: first those whose flag makes the verdict, then those that decide or go whatever they cite
  L.push('## Citations to confirm or strike (each before a removal lane acts on its area)', '', 'First, per area, the rows whose verdict the flag makes (kept by it, or sent to the holdout, or a tuned flag that exempts nothing); then the flagged rows whose verdict the recording makes alone.', '')
  const byFlag = r => r.verdict === 'definition' || r.verdict === 'measurement' || r.verdict === 'value' || r.verdict.startsWith('cited paper') || (r.citation.flag === 'tuned' && r.verdict === 'remove')
  for (const [id, first] of AREA_IDS.flatMap(a => [[a, true], [a, false]])) {
    const flagged = rows.filter(r => r.area === id && r.citation.flag && byFlag(r) === first).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    if (!flagged.length) continue
    L.push(`### Area ${id}: ${flagged.length} ${first ? 'whose verdict the flag makes' : 'whose verdict the recording makes'}`, '')
    for (const r of flagged) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key}): flag **${r.citation.flag}**${r.citation.papers.length ? ` (${r.citation.papers.join(', ')})` : r.citation.definition ? ` (${r.citation.definition})` : r.citation.section ? ` (${r.citation.section})` : ''}; verdict ${r.verdict}${r.citation.flag === 'tuned' ? ' (no exemption)' : ''}; recorded: ${recordedOf(r)}.`, `  Comment: ${r.comment || '(none)'}`)
    L.push('')
  }

  // by name: what decides nothing; first the order the removal lanes keep for lists (the coordinator's, 2026-11-13)
  const listsGone = rows.filter(r => r.kind === 'list' && (r.verdict === 'remove' || r.verdict === 'cited paper silent'))
  const listFiles = Object.entries(listsGone.reduce((o, r) => ((o[r.file] = (o[r.file] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1])
  L.push('## The rules that decide nothing', '', `**Lists: no removal lane acts on a list in a file before R6 has finished that file, and the ledger is recorded again after R6** (a list that mirrors an external definition is exempt from the hit rule once its header cites the definition; until then it reads as its comment reads). ${listsGone.length} lists read so here, by file: ${listFiles.map(([f, n]) => `${f} ${n}`).join(', ') || 'none'}.`, '')
  for (const id of AREA_IDS) {
    const gone = rows.filter(r => r.area === id && (r.verdict === 'remove' || r.verdict === 'cited paper silent')).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    if (!gone.length) continue
    L.push(`## Area ${id}${deferred.includes(id) ? ', removal scheduled' : ''}: the rules that decide nothing, by name (${gone.length})`, '', `${saysOf(id)}.`, '')
    for (const r of gone) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key})${r.verdict === 'cited paper silent' ? ` [cited paper silent: confirm; before it is folded, the removal lane says which rule now takes the case its comment describes on ${r.citation.papers.join(', ')}, from that paper's record: a case merely not reached is not a case handled]` : ''}: ${recordedOf(r)}`)
    L.push('')
  }
  // the sites to fold in rules that stay, and the entries to remove
  for (const id of AREA_IDS) {
    const kept = rows.filter(r => r.area === id && r.verdict !== 'remove' && r.verdict !== 'cited paper silent' && r.folds.length)
    const entries = rows.filter(r => r.area === id && r.removeEntries?.length)
    if (!kept.length && !entries.length) continue
    L.push(`## Area ${id}: sites to fold in rules that stay (${kept.reduce((n, r) => n + r.folds.length, 0)}), entries to remove (${entries.reduce((n, r) => n + r.removeEntries.length, 0)})`, '')
    for (const r of kept)
      for (const sid of r.folds) {
        const s = r.sites.find(x => x.id === sid)
        L.push(`- ${s.file}:${s.line} ${s.fn || '(top)'} ${s.kind}${s.op ? ` ${s.op}` : ''} of \`${cell(nameOf(r))}\` (${r.key}): ${s.state === 'never' ? 'never ran' : `one outcome, ${s.outcome}`}`)
      }
    for (const r of entries) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key}): ${r.removeEntries.length} of ${r.entries.length} entries with no hit: ${r.removeEntries.join(', ')}`)
    L.push('')
  }
  // the magnitudes, beside the unmeasured budgets
  const unmeasured = {}
  // (the budgets of the four areas: the rest of product code is no area of the reduction)
  for (const b of budgets ?? []) if (b.class === 'budget' && !b.source && areaOf(b.file) !== 'other') (unmeasured[areaOf(b.file)] ??= []).push(b)
  L.push('## Magnitudes with no stated source, beside the unmeasured budgets (reported, not counted as decisions)', '')
  for (const id of AREA_IDS) {
    const m = rows.filter(r => r.area === id && r.verdict === 'magnitude')
    const u = unmeasured[id] ?? []
    if (!m.length && !u.length) continue
    L.push(`### Area ${id}: ${m.length} magnitudes${budgets ? `, ${u.length} unmeasured budgets` : ''}`, '')
    for (const r of m) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` = ${r.value}${r.handedWhole ? ' (its table handed whole)' : r.foldedToValue ? ' (its comparisons folded; still read)' : ''}: ${recordedOf(r)}`)
    for (const b of u) L.push(`- budget ${b.file}:${b.line} \`${b.name}\` = ${b.value} (${b.unit}), unmeasured`)
    L.push('')
  }
  // the modules no input exercised: what would exercise each
  const quiet = rows.filter(r => r.verdict === 'not exercised')
  const quietBy = {}
  for (const r of quiet) (quietBy[r.file] ??= []).push(r)
  L.push('## Rules in modules no input exercised (not exercised: never a removal)', '', 'A module where no site ran on any input: the inputs neither import nor call it. Each with whether a record says it was loaded and the product modules that import it (what would exercise it).', '')
  for (const [f, rs] of Object.entries(quietBy).sort((a, b) => b[1].length - a[1].length)) {
    const m = rs[0].module ?? {}
    L.push(`- ${f} (area ${areaOf(f)}): ${rs.length} rule${rs.length === 1 ? '' : 's'} (${rs.map(nameOf).map(cell).join(', ')}); loaded: ${m.loaded == null ? 'not told by these records' : m.loaded ? 'yes, no site ran' : 'no'}; imported by: ${m.importers?.length ? m.importers.join(', ') : 'no product module'}`)
  }
  L.push('')
  // the tests that a rule's reason rests on: where a removal lane reads the test before believing the rule decides
  const tested = rows.filter(r => r.kind === 'threshold' && r.verdict === 'test')
  const testedBy = Object.entries(tested.reduce((o, r) => ((o[r.file] = (o[r.file] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).slice(0, 10)
  L.push('## The ten files with the most thresholds a test alone decides (verdict test)', '', 'One outcome on the corpus; a test of our own takes the other side, and is the rule\'s reason (3c). A removal lane reads the test before believing the rule decides.', '', ...testedBy.map(([f, n]) => `- ${f}: ${n}`), '')
  L.push("## Lists whose entries are not judged (R6's)", '')
  for (const id of AREA_IDS) {
    const n = rows.filter(r => r.area === id && r.verdict === 'not judged')
    if (!n.length) continue
    L.push(`### Area ${id}: ${n.length}`, '', ...n.map(r => `- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key}): ${Object.entries(readsOf(r.sites)).map(([k, v]) => `${k} ${v}`).join(', ')}${r.unseen?.length ? `${Object.keys(readsOf(r.sites)).length ? '; ' : ''}read where the recorder cannot see: ${r.unseen.join(', ')}` : ''}`), '')
  }

  // by file: every row
  const F = ['# The rule ledger, by file', '']
  if (profile) F.push(`> **A PROFILE, NOT THE YIELD.** ${profile}`, '')
  const byFile = {}
  for (const r of rows) (byFile[r.file] ??= []).push(r)
  for (const [file, rs] of Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0]))) {
    F.push(`## ${file} (area ${areaOf(file)})`, '')
    for (const r of rs.sort((a, b) => a.line - b.line)) {
      const margin = marginOf(r)
      const m = margin ? `; nearest: ${margin.false ? `false at ${round(margin.false.eff)}` : '—'} / ${margin.true ? `true at ${round(margin.true.eff)}` : '—'}${margin.units === 'slack' ? ' (slack)' : ''}` : ''
      F.push(`- line ${r.line} \`${cell(nameOf(r))}\` (${r.key}): **${r.verdict}**${r.folds.length && r.verdict !== 'remove' ? `, ${r.folds.length} site(s) to fold` : ''}${r.removeEntries?.length ? `, ${r.removeEntries.length} entries to remove` : ''}; ${recordedOf(r)}${m}`)
    }
    F.push('')
  }
  return { byArea: `${L.join('\n')}\n`, byFile: `${F.join('\n')}\n`, counts }
}
const round = x => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)
