// lab/rules/ledger.mjs: the rule ledger (design-reduction-2026-11-13.md §3c, amendment 8.9): every rule of the site map
// (sites.mjs) with what the recording (merge.mjs) says it decides, and the classifier's verdict. Pure. Not shipped.
//
// The classifier's rules, as settled (8.9), in the order they are applied:
// 1. A row is one census rule; the unit of folding is a site. A site's state, over every input: `decides` where the corpus
//    (the corpus's runs, the holdout, the tests that read the lab's data) saw both outcomes; `test` where only a test of
//    our own takes the other side (that test is its reason); `one` where one outcome only was seen; `never` where it never
//    ran. A plain read of a constant (`val`) has no outcome: it counts reads.
// 2. A site in state `one` or `never` is folded to its constant answer, even where the rule's other sites decide, unless
//    the rule's comment carries a citation flag (4). The rule goes when no site is left: every deciding site folded and
//    no read of it as a value left.
// 3. A margin is information for whoever reads the row: it never decides a removal. Removal follows from `one` or `never`
//    alone.
// 4. A citation, flagged from the whole comment (the coordinator confirms or strikes each flag before a removal lane acts;
//    a comment that cites a definition and a paper is flagged a definition, its paper still sent to the holdout, the row
//    holding both):
//    (a) an arXiv id: the paper joins the holdout and the row is judged again: recorded there (or among the corpus's
//    papers) and silent, the rule is a removal candidate marked `cited paper silent`; not yet recorded, `cited paper`
//    (kept, waiting); (b) a definition (TeX,
//    the PDF, Unicode, a font's table, a standard: the census's CITES_DEFINITION) or a section of our own documents:
//    `definition`, kept, listed as cited and silent where it never decided; (c) "measured", "corpus", "on the N papers"
//    with no id: `measurement`, kept, listed as "cites a measurement, not reproduced"; (d) "tuned" or "empiric" alone:
//    flagged, no exemption.
// 5. A constant read only as a value: never read on any input, removed as never run; read, `value`: with a reason where its
//    comment cites a definition or a measurement, else `magnitude`, listed by name as "a magnitude with no stated source"
//    (not a decision with no reason: a magnitude decides nothing a recording can show). A table entry whose table is
//    handed whole is read where it is handed: `value` or `magnitude` the same way.
// 6. A list: its membership tests are its sites (a hit is the outcome `true`); a list used otherwise too (iterated,
//    joined, mapped, spread) is `not judged` by entry (R6's), its sites still judged; a list the census reads as citing a
//    definition is exempt from the entry rule; otherwise each entry with no hit on any input is removed, and a list with
//    no hit goes with its rule.
// 7. A rule whose module ran no site on any input (no input imports or calls it), and none of its own elsewhere, is `not
//    exercised`: never a removal ("never ran" keeps meaning that the module ran and this rule did not). The records say
//    which modules each process loaded (transform.mjs); the row names the module's importers.
// Any input other than the tests of our own counts as the corpus: a third paper set (a fresh sweep's papers) is recorded
// with AXT_RULES_INPUT=<its name>, a list and a cache directory, no code changed.
import { CITES_DEFINITION } from '../release-check/census-lib.mjs'
import { areaOf } from './areas.mjs'

export const LEDGER_FORMAT = 'readarxiv/rule-ledger 1'
/** the inputs that are a case someone wrote: the tests that do not read the lab's data */
export const OWN_INPUT = 'tests'
/** the verdicts a row may hold, and whether each gives the rule a reason (the census's `rulesUnexplained`, P10) */
export const VERDICTS = {
  decides: { reason: true, says: 'decides on the corpus: its counts, margin and nearest cases are its reason' },
  test: { reason: true, says: 'one outcome on the corpus; a test of our own takes the other side: the test is its reason' },
  definition: { reason: true, says: 'cites a definition: kept as the definition\'s (silent on the inputs where it never decided)' },
  'cited paper': { reason: true, says: 'cites a paper: the paper joins the holdout and the row is judged again' },
  measurement: { reason: true, says: 'cites a measurement, not reproduced: kept and listed' },
  value: { reason: true, says: 'a value (decides nothing a recording can show) whose comment cites a definition or a measurement' },
  magnitude: { reason: null, says: 'a magnitude with no stated source: reported beside the unmeasured budgets, not counted as a decision' },
  'not judged': { reason: null, says: "a list used otherwise than by membership: entries not judged (R6's)" },
  'cited paper silent': { reason: false, says: 'its cited paper was recorded in the holdout and it decided nothing there: a removal candidate' },
  'not exercised': { reason: false, says: 'its module ran no site on any input (no input imports or calls it): the recording cannot judge it; the report names what would exercise it' },
  remove: { reason: false, says: 'decides nothing on any input, and cites nothing that exempts it: removed' },
}

const PAPER_ID = /\b\d{4}\.\d{4,5}(?:v\d+)?\b/g
/** a section of our own documents that states a decision */
const OUR_SECTION = /(?:\b(?:DESIGN|PDF-READER|DECISIONS|ARCHITECTURE|UI|RELEASE)\s*)?§\s?\d+(?:\.\d+)*/
const MEASUREMENT = /\bmeasured\b|\bmeasurements?\b|\bcorpus\b|\bon the \d+ papers\b/i
const TUNED = /\btuned\b|\bempiric/i

/** a comment's citation flags (rule 4): every one found, for the coordinator's review */
export function citationsOf(comment) {
  const c = comment ?? ''
  const papers = [...new Set(c.match(PAPER_ID) ?? [])]
  const definition = CITES_DEFINITION.exec(c)?.[0] ?? null
  const section = OUR_SECTION.exec(c)?.[0] ?? null
  const measurement = !papers.length && MEASUREMENT.test(c)
  const tuned = TUNED.test(c)
  const flag = definition || section ? 'definition' : papers.length ? 'paper' : measurement ? 'measurement' : tuned ? 'tuned' : null
  return { flag, papers, definition, section, measurement, tuned }
}

const sum = (xs, k) => xs.reduce((n, x) => n + (x?.[k] ?? 0), 0)
/** a list's reads other than by membership (iterated, joined, mapped…), summed over its sites */
export function readsOf(sites) {
  const out = {}
  for (const s of sites) for (const [k, v] of Object.entries(s.reads ?? {})) out[k] = (out[k] ?? 0) + v
  return out
}

/** the ledger of a site map and a recording; `holdout`: the papers a cited paper is judged on (by default every paper the
 *  recording ran on an input that is not a test of our own: the corpus, the holdout, the tests that read the lab's data) */
export function ledgerOf(map, recording, { holdout = null } = {}) {
  const inputs = Object.keys(recording.sites)
  // (a paper by its number: a comment may cite it with or without its version, a pair names it with its language)
  const base = p => p.replace(/-[a-z]{2,3}$/, '').replace(/v\d+$/, '')
  const ran = Object.entries(recording.inputs).filter(([k]) => k !== OWN_INPUT).flatMap(([, v]) => v.papers ?? [])
  const held = new Set((holdout ?? ran).map(base))
  const siteOf = id => {
    const s = map.sites[id]
    const per = {}
    for (const input of inputs) {
      const r = recording.sites[input][id]
      if (r) per[input] = r
    }
    const own = per[OWN_INPUT]
    const corpus = Object.entries(per).filter(([k]) => k !== OWN_INPUT).map(([, r]) => r)
    const all = Object.values(per)
    const c = { n: sum(corpus, 'n'), t: sum(corpus, 't'), f: sum(corpus, 'f') }
    const a = { n: sum(all, 'n'), t: sum(all, 't'), f: sum(all, 'f') }
    const reads = {}
    for (const r of all) for (const [k, v] of Object.entries(r.reads ?? {})) reads[k] = (reads[k] ?? 0) + v
    const hits = {}
    for (const r of all) for (const [k, v] of Object.entries(r.hits ?? {})) hits[k] = (hits[k] ?? 0) + v
    const nearest = [0, 1].map(slot => all.map(r => r.near?.[slot]).filter(Boolean).sort((x, y) => x.d - y.d)[0] ?? null)
    const tests = [0, 1].map(slot => own?.tests?.[slot]?.kept ?? [])
    let state
    if (s.kind === 'val') state = a.n ? 'read' : 'never'
    // (a list made and used, but never by membership: read, not unused; its entries are not judged)
    else if (!a.n && Object.keys(reads).length) state = 'read'
    else if (c.t && c.f) state = 'decides'
    else if (a.t && a.f) state = 'test'
    else if (!a.n) state = 'never'
    else state = 'one'
    return {
      id,
      file: s.file,
      line: s.line,
      fn: s.fn,
      kind: s.kind,
      ...(s.op ? { op: s.op } : {}),
      shape: s.bounds[0]?.shape ?? null,
      state,
      ...(state === 'one' ? { outcome: a.t > 0 } : {}),
      outcomes: Object.fromEntries(Object.entries(per).map(([k, r]) => [k, { n: r.n, t: r.t, f: r.f }])),
      ...(Object.keys(reads).length ? { reads } : {}),
      ...(Object.keys(hits).length ? { hits } : {}),
      ...(nearest[0] || nearest[1] ? { margin: { false: nearest[0], true: nearest[1], units: s.bounds[0]?.shape === 'other' ? 'slack' : 'rule' } } : {}),
      ...(state === 'test' ? { tests: { false: tests[0], true: tests[1] } } : {}),
    }
  }

  // (a module an input exercised: one where some site ran, on any input; the modules the records say were loaded, where
  // they say it)
  const exercised = new Set()
  for (const per of Object.values(recording.sites)) for (const [sid, r] of Object.entries(per)) if (r.n) exercised.add(map.sites[Number(sid)]?.file)
  const told = Object.values(recording.inputs).filter(v => v.loaded)
  const loaded = told.length ? new Set(told.flatMap(v => v.loaded)) : null
  const rows = {}
  for (const [key, rule] of Object.entries(map.rules)) {
    const sites = rule.sites.map(siteOf)
    const deciding = sites.filter(s => s.kind !== 'val')
    const vals = sites.filter(s => s.kind === 'val')
    const reads = sum(vals.map(s => ({ n: sum(Object.values(s.outcomes), 'n') })), 'n')
    const cite = citationsOf(rule.comment)
    const exempt = cite.flag && cite.flag !== 'tuned'
    const listReads = sum(deciding.map(s => ({ n: Object.values(s.reads ?? {}).reduce((x, y) => x + y, 0) })), 'n')
    const row = {
      key,
      file: rule.file,
      line: rule.line,
      area: areaOf(rule.file),
      kind: rule.kind,
      name: rule.name,
      ...(rule.kind === 'list' ? { entries: rule.entries, form: rule.form } : { value: rule.value, raw: rule.raw, context: rule.context }),
      class: rule.class,
      after: rule.after,
      comment: rule.comment ?? '',
      citation: cite,
      sites,
      folds: [],
    }
    // (a citation's verdict, where nothing decides)
    const cited = () => {
      if (cite.flag === 'paper') return cite.papers.every(p => held.has(base(p))) ? 'cited paper silent' : 'cited paper'
      return cite.flag === 'definition' ? 'definition' : 'measurement'
    }
    const foldable = s => s.state === 'one' || s.state === 'never'
    if (rule.kind === 'list') {
      const hits = {}
      for (const s of deciding) for (const [k, v] of Object.entries(s.hits ?? {})) hits[k] = (hits[k] ?? 0) + v
      const membership = sum(deciding.map(s => ({ n: sum(Object.values(s.outcomes), 'n') })), 'n')
      row.hits = hits
      if (!membership && !listReads) row.verdict = exempt ? cited() : 'remove'
      else if (!membership) row.verdict = 'not judged'
      else if (deciding.some(s => s.state === 'decides')) row.verdict = listReads ? 'not judged' : 'decides'
      else if (deciding.some(s => s.state === 'test')) row.verdict = listReads ? 'not judged' : 'test'
      else row.verdict = exempt ? cited() : listReads ? 'not judged' : 'remove'
      if (!exempt) row.folds = deciding.filter(foldable).map(s => s.id)
      // (the entries: judged where the list is used by membership alone and cites no definition)
      if (row.verdict === 'decides' || row.verdict === 'test') {
        if (rule.class === 'defined' || exempt) row.entriesExempt = true
        else row.removeEntries = rule.entries.filter(e => !hits[e])
      }
      if (row.verdict === 'not judged') row.listReads = readsOf(deciding)
    } else if (!sites.length) {
      // (a table entry handed whole is read where it is handed; one read nowhere is never read)
      row.verdict = rule.wholeReads ? (exempt && cite.flag !== 'paper' ? 'value' : 'magnitude') : exempt ? cited() : 'remove'
      if (rule.wholeReads) row.handedWhole = rule.wholeReads
    } else if (!deciding.length) {
      row.reads = reads
      row.verdict = !reads ? (exempt ? cited() : 'remove') : cite.flag === 'definition' || cite.flag === 'measurement' ? 'value' : 'magnitude'
    } else {
      if (deciding.some(s => s.state === 'decides')) row.verdict = 'decides'
      else if (deciding.some(s => s.state === 'test')) row.verdict = 'test'
      else if (exempt) row.verdict = cited()
      else row.verdict = reads ? (cite.flag === 'definition' || cite.flag === 'measurement' ? 'value' : 'magnitude') : 'remove'
      if (!exempt) row.folds = deciding.filter(foldable).map(s => s.id)
      if (reads) row.reads = reads
    }
    // (a cited paper silent in the holdout is a removal candidate: its sites fold like any other's)
    if (row.verdict === 'cited paper silent') row.folds = deciding.filter(foldable).map(s => s.id)
    // (a rule that stays because it is still read as a value, its deciding sites all folded)
    if ((row.verdict === 'value' || row.verdict === 'magnitude') && deciding.length && row.folds.length === deciding.length) row.foldedToValue = true
    // (a rule whose module ran no site on any input, and no site of its own elsewhere: not exercised, never a removal)
    if ((row.verdict === 'remove' || row.verdict === 'cited paper silent') && !exercised.has(row.file) && sites.every(s => !Object.values(s.outcomes).some(o => o.n))) {
      row.verdict = 'not exercised'
      row.folds = []
      row.module = { loaded: loaded ? loaded.has(row.file) : null, importers: map.files[row.file]?.importers ?? null }
    }
    rows[key] = row
  }
  // (each cited paper once, by its number, its version where a comment gives one: the papers of the rows the recording
  // does not show deciding, a definition's among them, which may show the rule deciding there)
  const cited = new Map()
  const waiting = r => r.verdict === 'cited paper' || r.verdict === 'cited paper silent' || r.verdict === 'definition'
  for (const p of Object.values(rows).filter(waiting).flatMap(r => r.citation.papers)) if (!cited.has(base(p)) || p.length > cited.get(base(p)).length) cited.set(base(p), p)
  const papersCited = [...cited.values()].sort()
  return {
    format: LEDGER_FORMAT,
    about:
      "The rule ledger (design-reduction §3c, §8.9): every census rule of the rule areas with what the recording says it decides, and the classifier's verdict (lab/rules/ledger.mjs). Generated by `node lab/rules/record.mjs ledger`, never edited by hand. A margin is information; it never decides a removal.",
    recorded: { commit: recording.commit, sites: map.digest, inputs: recording.inputs },
    holdoutAdds: papersCited.filter(p => !held.has(base(p))),
    rules: rows,
  }
}

/** what was recorded of a row, in words: per input its decisions (each outcome's count) and its plain reads */
export function recordedOf(row) {
  const per = {}
  for (const s of row.sites)
    for (const [k, o] of Object.entries(s.outcomes)) {
      const p = (per[k] ??= { n: 0, t: 0, f: 0, reads: 0 })
      if (s.kind === 'val') p.reads += o.n
      else {
        p.n += o.n
        p.t += o.t
        p.f += o.f
      }
    }
  const runs = Object.entries(per)
    .map(([k, o]) => `${k}: ${[o.n ? `${o.n} run${o.n === 1 ? '' : 's'}, ${o.t} true, ${o.f} false` : '', o.reads ? `read ${o.reads}` : ''].filter(Boolean).join(', ')}`)
    .join('; ')
  return runs || 'never ran on any input'
}
