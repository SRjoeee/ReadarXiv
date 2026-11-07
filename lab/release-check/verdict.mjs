// lab/release-check/verdict.mjs: from the gates' results to the report: which gates a tier runs, each invariant's GO or
// NO-GO, the numbers against design §7's targets, and the verdict. Pure: no process is run and no file read here, so that
// tests/scripts/release-check.test.ts holds the rules. Not shipped.
import { STAGES, TARGETS, TIERS } from './gates.mjs'

/** the gates a tier runs: its own and every lower tier's, in design §4.9's order (unit, pipeline, reader, platform, box,
 *  corpus), the table's order within a stage */
export function gatesOf(gates, tier) {
  const top = TIERS.indexOf(tier)
  if (top < 0) throw new Error(`no tier ${tier}: ${TIERS.join(', ')}`)
  return gates
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => TIERS.indexOf(g.tier) <= top)
    .sort((a, b) => STAGES.indexOf(a.g.stage) - STAGES.indexOf(b.g.stage) || a.i - b.i)
    .map(({ g }) => g)
}

/** the lowest tier among some gates' */
const tierOfAll = gates => gates.map(g => g.tier).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0]

/**
 * One invariant's line in a tier. `results`: the gates' results by id (`{ status: 'pass'|'fail'|'skipped'|'private',
 * reason?, findings? }`). GO only where gates of this tier hold it, each passed (or, where it counts the invariant, counted
 * no breach of it), and no part of it is
 * left without a gate (`gap`); "GO in part" where gates of a higher tier hold it too; "beyond this tier" where only higher
 * tiers' gates hold it; NO-GO where no gate holds it.
 */
export function invariantLine(inv, gates, tier, results) {
  const all = gates.filter(g => g.holds.includes(inv.id))
  const here = gatesOf(all, tier)
  if (!all.length) return { id: inv.id, says: inv.says, status: 'NO-GO', gates: [], why: [`no gate holds it: ${inv.gap ?? 'none exists'}`] }
  if (!here.length) return { id: inv.id, says: inv.says, status: 'beyond this tier', gates: [], why: [`held in tier ${tierOfAll(all)} (${all.map(g => g.id).join(', ')})`] }
  const why = []
  for (const g of here) {
    const r = results[g.id] ?? { status: 'not run' }
    // (a gate that counts this invariant is read by its count, whatever else made it fail: the typeset runners' I4 is 0
    // though their differential loses units; a gate that states no count holds it by passing)
    const f = r.findings?.[inv.id]
    if (f) {
      if (!f.held) why.push(`${g.id} counts ${f.count} against it`)
    } else if (r.status !== 'pass') why.push(`${g.id}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`)
  }
  if (inv.gap) why.push(`no gate for the rest: ${inv.gap}`)
  // (an invariant a higher tier holds too is held here in part only: GO is said of the whole, at the tier that runs them all)
  const above = all.filter(g => !here.includes(g))
  if (!why.length && above.length) return { id: inv.id, says: inv.says, status: 'GO in part', gates: here.map(g => g.id), why: [`the rest in tier ${tierOfAll(above)} (${above.map(g => g.id).join(', ')})`] }
  return { id: inv.id, says: inv.says, status: why.length ? 'NO-GO' : 'GO', gates: here.map(g => g.id), why }
}

/** design §7's rows: the value a gate of this run gave, met or missed where the row says how to tell, else why not measured */
export function targetLines(results) {
  return TARGETS.map(t => {
    const base = { id: t.id, measure: t.measure, baseline: t.baseline, target: t.target }
    if (!t.from) return { ...base, status: 'not measured', value: null, why: t.why }
    const r = results[t.from]
    const value = r?.numbers && t.value ? t.value(r.numbers) : null
    if (!value) return { ...base, status: 'not measured', value: null, why: r ? `${t.from}: ${r.status}${r.reason ? ` (${r.reason})` : ''}` : t.why ?? `${t.from} not in this tier` }
    // (met: true, false, or null where the numbers cannot tell)
    const met = t.met ? t.met(r.numbers) : null
    return { ...base, status: met === true ? 'met' : met === false ? 'missed' : 'reported', value, from: t.from }
  })
}

/** the verdict: GO only when every gate of the tier passed (a skipped gate, a gate of the private repository with no
 *  result supplied and a failed one all stop it); at the release tier every invariant's line must be GO as well */
export function verdictOf(tier, gates, results, invariants) {
  const why = []
  for (const g of gates) {
    const r = results[g.id]
    if (r?.status !== 'pass') why.push(`${g.id}: ${r ? r.status : 'not run'}${r?.reason ? ` (${r.reason})` : ''}`)
  }
  if (tier === 'release') for (const i of invariants) if (i.status !== 'GO') why.push(`${i.id}: ${i.status}`)
  return { verdict: why.length ? 'NO-GO' : 'GO', why }
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const numbersOf = n =>
  Object.entries(n ?? {})
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ')

/** release-check.md from the report */
export function markdownOf(report) {
  const L = []
  L.push(`# release-check: tier ${report.tier}, ${report.verdict}`, '')
  L.push(`Commit \`${report.commit}\`${report.dirty ? ' (with changes not committed)' : ''}, ${report.started} to ${report.ended}; ${report.machine}.`)
  L.push(`Lab data: ${report.labData ?? 'none on this machine'}. Outputs: \`${report.work}\`.`, '')
  const which = report.only ? `of this run (--only ${report.only.join(',')})` : `of tier ${report.tier}`
  L.push(`**Verdict: ${report.verdict}.** ${report.verdict === 'GO' ? `Every gate ${which} passed.` : `Not every gate ${which} passed:`}`)
  for (const w of report.why) L.push(`- ${w}`)
  const held = report.invariants.filter(i => i.status === 'GO').length
  L.push('', `Invariants held whole in this tier: ${held} of ${report.invariants.length}${report.tier === 'release' ? '' : ' (the release tier\'s verdict needs every one)'}.`, '')
  L.push('## Gates', '', '| Gate | Stage | Holds | Result | Time | Numbers |', '|---|---|---|---|---|---|')
  for (const g of report.gates) {
    const res = g.status === 'private' ? `the private repository's: ${g.command ? `\`${g.command}\`` : 'its command in the private gates file'}; not run here` : `${g.status}${g.reason ? `: ${g.reason}` : ''}`
    L.push(`| \`${g.id}\` ${cell(g.title)} | ${g.stage} | ${g.holds.join(', ')} | ${cell(res)}${g.note ? ` — ${cell(g.note)}` : ''} | ${g.ms != null ? `${Math.round(g.ms / 1000)} s` : ''} | ${cell(numbersOf(g.numbers))} |`)
  }
  L.push('', '## Invariants (design §4.9)', '', '| | Status | Held by | Why |', '|---|---|---|---|')
  for (const i of report.invariants) L.push(`| **${i.id}** ${cell(i.says)} | ${i.status} | ${i.gates.join(', ')} | ${cell(i.why.join('; '))} |`)
  L.push('', '## Design §7: the numbers against the targets', '', '| Measure | Baseline | Target | This run | |', '|---|---|---|---|---|')
  for (const t of report.targets) L.push(`| ${cell(t.measure)} | ${cell(t.baseline)} | ${cell(t.target)} | ${cell(t.value ?? `not measured: ${t.why}`)} | ${t.status} |`)
  L.push('', 'A missed target is reported with its cause (design §7); the verdict is the gates\' and, at the release tier, the invariants\'.', '')
  return `${L.join('\n')}\n`
}
