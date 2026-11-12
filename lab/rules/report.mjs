// lab/rules/report.mjs: the rule ledger's report (design-reduction-2026-11-13.md §3c, R4; amendment 8.9), by area (R5a-d,
// areas.mjs) and by file. Per area: the yield table (every verdict's count; the rules to remove, the sites to fold in
// rules that stay, the list entries to remove); every flagged citation with its whole comment, for the coordinator to
// confirm or strike before a removal lane acts on the area; BY NAME, the rules the ledger marks as deciding nothing (file,
// line, the constant or list, what was recorded): the list an area whose removals are scheduled shows; the magnitudes with
// no stated source beside the census's unmeasured budgets; the lists whose entries are not judged. Pure. Not shipped.
import { AREAS, areaOf } from './areas.mjs'
import { readsOf, recordedOf, VERDICTS } from './ledger.mjs'

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
  const V = ['decides', 'test', 'definition', 'cited paper', 'measurement', 'value', 'magnitude', 'not judged', 'cited paper silent', 'remove']
  L.push(`| Area | Rules (thresholds, lists) | ${V.join(' | ')} | Sites to fold | Entries to remove |`, `|---|---|${V.map(() => '---').join('|')}|---|---|`)
  for (const id of AREA_IDS) {
    const c = counts[id]
    if (!c.rules) continue
    L.push(`| ${id}${deferred.includes(id) ? ' (removal scheduled)' : ''} | ${c.rules} (${c.thresholds}, ${c.lists}) | ${V.map(v => c.verdicts[v] ?? 0).join(' | ')} | ${c.folds} | ${c.entries} |`)
  }
  L.push('', ...Object.entries(VERDICTS).map(([v, x]) => `- **${v}**: ${x.says}`), '')
  if (ledger.holdoutAdds?.length) L.push(`Papers the rules' comments cite, to join the holdout beyond its 30: ${ledger.holdoutAdds.join(', ')}.`, '')

  // the flagged citations, whole
  L.push('## Citations to confirm or strike (each before a removal lane acts on its area)', '')
  for (const id of AREA_IDS) {
    const flagged = rows.filter(r => r.area === id && r.citation.flag).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    if (!flagged.length) continue
    L.push(`### Area ${id}: ${flagged.length}`, '')
    for (const r of flagged) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key}): flag **${r.citation.flag}**${r.citation.papers.length ? ` (${r.citation.papers.join(', ')})` : r.citation.definition ? ` (${r.citation.definition})` : r.citation.section ? ` (${r.citation.section})` : ''}; verdict ${r.verdict}${r.citation.flag === 'tuned' ? ' (no exemption)' : ''}; recorded: ${recordedOf(r)}.`, `  Comment: ${r.comment || '(none)'}`)
    L.push('')
  }

  // by name: what decides nothing
  for (const id of AREA_IDS) {
    const gone = rows.filter(r => r.area === id && (r.verdict === 'remove' || r.verdict === 'cited paper silent')).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    if (!gone.length) continue
    L.push(`## Area ${id}${deferred.includes(id) ? ', removal scheduled' : ''}: the rules that decide nothing, by name (${gone.length})`, '', `${saysOf(id)}.`, '')
    for (const r of gone) L.push(`- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key})${r.verdict === 'cited paper silent' ? ' [cited paper silent: confirm]' : ''}: ${recordedOf(r)}`)
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
  for (const b of budgets ?? []) if (b.class === 'budget' && !b.source) (unmeasured[areaOf(b.file)] ??= []).push(b)
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
  L.push("## Lists whose entries are not judged (R6's)", '')
  for (const id of AREA_IDS) {
    const n = rows.filter(r => r.area === id && r.verdict === 'not judged')
    if (!n.length) continue
    L.push(`### Area ${id}: ${n.length}`, '', ...n.map(r => `- ${r.file}:${r.line} \`${cell(nameOf(r))}\` (${r.key}): ${Object.entries(readsOf(r.sites)).map(([k, v]) => `${k} ${v}`).join(', ')}`), '')
  }

  // by file: every row
  const F = ['# The rule ledger, by file', '']
  if (profile) F.push(`> **A PROFILE, NOT THE YIELD.** ${profile}`, '')
  const byFile = {}
  for (const r of rows) (byFile[r.file] ??= []).push(r)
  for (const [file, rs] of Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0]))) {
    F.push(`## ${file} (area ${areaOf(file)})`, '')
    for (const r of rs.sort((a, b) => a.line - b.line)) {
      const margin = r.sites.find(s => s.margin)?.margin
      const m = margin ? `; nearest: ${margin.false ? `false at ${round(margin.false.eff)}` : '—'} / ${margin.true ? `true at ${round(margin.true.eff)}` : '—'}${margin.units === 'slack' ? ' (slack)' : ''}` : ''
      F.push(`- line ${r.line} \`${cell(nameOf(r))}\` (${r.key}): **${r.verdict}**${r.folds.length && r.verdict !== 'remove' ? `, ${r.folds.length} site(s) to fold` : ''}${r.removeEntries?.length ? `, ${r.removeEntries.length} entries to remove` : ''}; ${recordedOf(r)}${m}`)
    }
    F.push('')
  }
  return { byArea: `${L.join('\n')}\n`, byFile: `${F.join('\n')}\n`, counts }
}
const round = x => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)
