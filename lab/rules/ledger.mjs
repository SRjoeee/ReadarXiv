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
//    (a) an arXiv id: the paper joins the holdout and the row is judged again: its own record reached the rule's
//    module and the rule did not take its other side there: a removal candidate marked `cited paper silent` (before it
//    is folded, the removal lane says which rule now takes the case the comment describes); not recorded, or recorded
//    without reaching the module (silence says nothing), `cited paper` (kept, waiting); (b) a definition (TeX,
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
//
// Two forms (the coordinator's ruling, 2026-11-13): the FULL record (`ledgerOf`: every site, the comments, the tests by
// name, the inputs' papers), kept outside the repository; and the TRACKED ledger (`trackedOf`, lab/rules/ledger.json):
// per rule what the census and a reader need to see its reason, nothing quoted (no comment, no entry, no test's name: a
// name is test input, and some are not English), naming the full record by its digest so that each row can be traced to it
// (`resolveTracked`).
import { createHash } from 'node:crypto'
import { CITES_DEFINITION } from '../release-check/census-lib.mjs'
import { areaOf } from './areas.mjs'

export const LEDGER_FORMAT = 'readarxiv/rule-ledger 1'
/** the inputs that are a case someone wrote: the tests that do not read the lab's data */
export const OWN_INPUT = 'tests'
/** the verdicts a row may hold, and whether each gives the rule a reason (the census's `rulesUnexplained`, P10) */
export const VERDICTS = {
  decides: { reason: true, says: "decides on the corpus: its counts, margin and nearest cases are its reason (a list: its entries' hits there)" },
  test: { reason: true, says: 'one outcome on the corpus (a list: no entry hit there); a test of our own takes the other side (hits it): the test is its reason' },
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

/** a list's entries as its hits judge them: an array's or a Set's its strings; a pattern's the words of its alternatives
 *  (pattern.mjs), each once, but those in a negative lookaround (never on a match's path) and those in a lookaround a group
 *  repeats, and any the census reads that is no alternative's word (`notJudged`, each with why) */
export function entriesJudged(rule, sites) {
  const alts = sites.find(s => s?.kind === 're' && s.alts)?.alts
  if (!alts) return { judged: rule.entries ?? [], notJudged: [] }
  const judged = []
  const notJudged = []
  const seen = new Set()
  const why = new Map()
  for (const x of alts.words) {
    const no = x.look === 'neg' ? 'in a negative lookaround' : x.look === 'pos' && x.rep ? 'in a lookaround a group repeats' : null
    if (no) {
      if (!why.has(x.w)) why.set(x.w, no)
      continue
    }
    if (!seen.has(x.w)) {
      seen.add(x.w)
      judged.push(x.w)
    }
  }
  for (const [w, no] of why) if (!seen.has(w)) notJudged.push({ entry: w, why: no })
  for (const e of rule.entries ?? []) if (!seen.has(e) && !why.has(e)) notJudged.push({ entry: e, why: "the census's entry, no alternative's word" })
  return { judged, notJudged }
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
    // (a `key` site, a table read by a key known at run time, is every entry's: judged by the entry's own key's hits)
    const keySites = sites.filter(s => s.kind === 'key')
    const deciding = sites.filter(s => s.kind !== 'val' && s.kind !== 'key')
    const vals = sites.filter(s => s.kind === 'val')
    const reads = sum(vals.map(s => ({ n: sum(Object.values(s.outcomes), 'n') })), 'n')
    const cite = citationsOf(rule.comment)
    const exempt = cite.flag && cite.flag !== 'tuned'
    // (a list's reads: those the recorder saw (iterated, joined, mapped, its pattern's source read) and those it cannot see,
    // which the site map names (sites.mjs `unseen`: an entry read by its index, a copy the platform makes))
    const listReads = sum(deciding.map(s => ({ n: Object.values(s.reads ?? {}).reduce((x, y) => x + y, 0) })), 'n') + (rule.unseen?.length ?? 0)
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
      ...(rule.holder ? { holder: rule.holder } : {}),
      sites,
      folds: [],
    }
    // (a citation's verdict, where nothing decides)
    // (a cited paper is silent where its own record reached the rule's module (some site of the file ran on it) and the
    // rule did not take its other side there; a record that never reached the module says nothing: the row waits)
    const reached = p => (recording.paperModules?.[base(p)] ?? []).includes(rule.file)
    const cited = () => {
      if (cite.flag === 'paper') return cite.papers.every(p => held.has(base(p)) && reached(p)) ? 'cited paper silent' : 'cited paper'
      return cite.flag === 'definition' ? 'definition' : 'measurement'
    }
    // (a comparison's site folds where it saw one outcome or never ran; a list's (its literal's, where every membership test
    // of it is recorded) where no entry of it was hit and it was read no other way: a list site's one outcome may be its
    // entries' every hit, never a fold to true)
    const foldable = rule.kind === 'list' ? s => !Object.keys(s.hits ?? {}).length && !Object.keys(s.reads ?? {}).length : s => s.state === 'one' || s.state === 'never'
    if (rule.kind === 'list') {
      // A LIST IS JUDGED BY ITS ENTRIES' HITS (3c): a hit is a membership test that found an entry (has, includes, indexOf,
      // a predicate held for it, an `every` stopped at it) or a match whose path went through it (pattern.mjs); a match
      // through none of its entries is a hit of the list still ('(no entry)'). Hit on the corpus (any input but the tests of
      // our own): it decides, and its entries no input hit go; hit by a test of our own alone: the test is its reason;
      // tested and never hit, or never tested: it goes with its rule (every test of it said "not in it"). A list read
      // otherwise too (iterated, joined, mapped, its pattern's source read, an entry read by its index) uses its entries
      // whole: not judged
      const hits = {}
      for (const s of deciding) for (const [k, v] of Object.entries(s.hits ?? {})) hits[k] = (hits[k] ?? 0) + v
      const hitIn = which =>
        deciding.some(s =>
          Object.entries(recording.sites)
            .filter(([input]) => (which === OWN_INPUT) === (input === OWN_INPUT))
            .some(([, per]) => Object.keys(per[s.id]?.hits ?? {}).length),
        )
      const membership = sum(deciding.map(s => ({ n: sum(Object.values(s.outcomes), 'n') })), 'n')
      row.hits = hits
      if (listReads) row.verdict = 'not judged'
      else if (hitIn('corpus')) row.verdict = 'decides'
      else if (hitIn(OWN_INPUT)) row.verdict = 'test'
      else row.verdict = exempt ? cited() : 'remove'
      if (!membership && !listReads && row.verdict === 'remove') row.neverTested = true
      if (!exempt && row.verdict !== 'not judged') row.folds = deciding.filter(foldable).map(s => s.id)
      // (the entries: judged where the list is used by membership alone and cites no definition; a pattern's are its
      // alternatives' words, but those its matches cannot show (pattern.mjs))
      const { judged, notJudged } = entriesJudged(rule, deciding.map(s => map.sites[s.id]))
      if (judged.join('\u0000') !== rule.entries.join('\u0000')) row.judged = judged
      if (notJudged.length) row.entriesNotJudged = notJudged
      if (row.verdict === 'decides' || row.verdict === 'test') {
        if (rule.class === 'defined' || exempt) row.entriesExempt = true
        else row.removeEntries = judged.filter(e => !hits[e])
      }
      if (row.verdict === 'not judged') row.listReads = { ...readsOf(deciding), ...(rule.unseen?.length ? { unseen: rule.unseen.length } : {}) }
      if (rule.unseen?.length) row.unseen = rule.unseen
    } else if (!sites.length) {
      // (a table entry handed whole is read where it is handed; one read nowhere is never read)
      row.verdict = rule.wholeReads ? (exempt && cite.flag !== 'paper' ? 'value' : 'magnitude') : exempt ? cited() : 'remove'
      if (rule.wholeReads) row.handedWhole = rule.wholeReads
    } else if (!deciding.length && !keySites.length) {
      row.reads = reads
      row.verdict = !reads ? (exempt ? cited() : 'remove') : cite.flag === 'definition' || cite.flag === 'measurement' ? 'value' : 'magnitude'
    } else {
      // (a table's entry read by a key known at run time: the reads of its own key are its hits, judged as a list's entry's
      // are: read on the corpus, it decides; by a test of our own alone, the test is its reason)
      const own = keySites.map(s => map.sites[s.id].bounds.find(b => b.rule === key)?.key)
      const keyHit = which =>
        keySites.some((s, k) =>
          Object.entries(recording.sites)
            .filter(([input]) => (which === OWN_INPUT) === (input === OWN_INPUT))
            .some(([, per]) => per[s.id]?.hits?.[own[k]]),
        )
      const handed = reads || rule.wholeReads
      if (deciding.some(s => s.state === 'decides') || keyHit('corpus')) row.verdict = 'decides'
      else if (deciding.some(s => s.state === 'test') || keyHit(OWN_INPUT)) row.verdict = 'test'
      else if (exempt) row.verdict = cited()
      else row.verdict = handed ? (cite.flag === 'definition' || cite.flag === 'measurement' ? 'value' : 'magnitude') : 'remove'
      if (!exempt) row.folds = deciding.filter(foldable).map(s => s.id)
      if (reads) row.reads = reads
      if (rule.wholeReads) row.handedWhole = rule.wholeReads
      if (keySites.length) {
        // (its own key's reads, per input)
        row.keyReads = {}
        for (const [input, per] of Object.entries(recording.sites)) {
          const n = keySites.reduce((x, s, k) => x + (per[s.id]?.hits?.[own[k]] ?? 0), 0)
          if (n) row.keyReads[input] = n
        }
      }
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

export const TRACKED_FORMAT = 'readarxiv/rule-ledger-tracked 1'
/** a short digest of a value (its JSON): what remap compares where the tracked ledger holds no text */
export const digestOf = x => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16)
/** a test's file: a test is named `<its file> > <its name>` (vitest-setup.mjs) */
const testFileOf = name => name.split(' > ')[0]

/** the tests the full record names (every site's tests, every nearest case's), per test file, each once, sorted by name:
 *  a test's ordinal is its place in its file's list, which only the full record can turn back into a name */
export function testsOf(full) {
  const by = new Map()
  const add = t => {
    if (!t) return
    const f = testFileOf(t)
    if (!by.has(f)) by.set(f, new Set())
    by.get(f).add(t)
  }
  for (const r of Object.values(full.rules))
    for (const s of r.sites) {
      for (const t of s.tests?.false ?? []) add(t)
      for (const t of s.tests?.true ?? []) add(t)
      add(s.margin?.false?.test)
      add(s.margin?.true?.test)
    }
  return Object.fromEntries([...by.keys()].sort().map(f => [f, [...by.get(f)].sort()]))
}

/** a row's margin: the nearest case on each side over its sites, in the rule's own units where any site has them (else in
 *  the comparisons' slack) */
export function marginOf(row) {
  const ms = row.sites.map(s => s.margin).filter(Boolean)
  if (!ms.length) return null
  const units = ms.some(m => m.units === 'rule') ? 'rule' : 'slack'
  const pick = side =>
    ms
      .filter(m => m.units === units)
      .map(m => m[side])
      .filter(Boolean)
      .sort((a, b) => a.d - b.d)[0] ?? null
  return { units, false: pick('false'), true: pick('true') }
}

/** the tracked ledger of a full record (`digest`: the full record's file's sha256; `map`: the site map, for the other
 *  operand remap compares): per rule its line, kind, value (or the list's size and its entries' digest), verdict,
 *  citation flag and papers, runs and each outcome's count per input, plain reads, the margin and its two nearest cases
 *  (by paper, page, the run's ordinal, or a test by file and ordinal; numbers only), its list's hits by entry (in the
 *  list's order) where they are what removes its entries, the tests that take each outcome by file and ordinal, the
 *  sites to fold (their count) and, not exercised, its module's importers */
export function trackedOf(full, { digest, map = null }) {
  const index = testsOf(full)
  const ordinal = new Map(Object.values(index).flatMap(names => names.map((t, i) => [t, i])))
  const ref = t => [testFileOf(t), ordinal.get(t)]
  const caseOf = c => (c ? { d: c.d, eff: c.eff, x: c.x, b: c.b, k: c.k, ...(c.paper ? { paper: c.paper } : {}), ...(c.page != null ? { page: c.page } : {}), ...(c.test ? { test: ref(c.test) } : {}) } : null)
  const rules = {}
  for (const [key, r] of Object.entries(full.rules)) {
    const runs = {}
    const reads = {}
    for (const s of r.sites)
      for (const [k, o] of Object.entries(s.outcomes)) {
        if (s.kind === 'val') {
          if (o.n) reads[k] = (reads[k] ?? 0) + o.n
          continue
        }
        // (a key site is the table's: the entry's own key's reads are `keyReads`)
        if (s.kind === 'key') continue
        const x = (runs[k] ??= [0, 0, 0])
        x[0] += o.n
        x[1] += o.t
        x[2] += o.f
      }
    const tests = {}
    for (const side of ['false', 'true']) {
      const names = new Set(r.sites.flatMap(s => s.tests?.[side] ?? []))
      if (!names.size) continue
      const byFile = {}
      for (const t of names) (byFile[testFileOf(t)] ??= []).push(ordinal.get(t))
      tests[side] = Object.fromEntries(
        Object.keys(byFile)
          .sort()
          .map(f => [f, byFile[f].sort((a, b) => a - b)]),
      )
    }
    const m = marginOf(r)
    const other = map?.rules?.[key]?.other
    rules[key] = {
      line: r.line,
      kind: r.kind,
      ...(r.kind === 'list' ? { size: r.entries.length, entriesDigest: digestOf(r.entries) } : { value: r.value }),
      ...(other ? { otherDigest: digestOf(other) } : {}),
      verdict: r.verdict,
      ...(r.citation.flag ? { cites: { flag: r.citation.flag, ...(r.citation.papers.length ? { papers: r.citation.papers } : {}) } } : {}),
      ...(Object.keys(runs).length ? { runs } : {}),
      ...(Object.keys(reads).length ? { reads } : {}),
      ...(r.keyReads && Object.keys(r.keyReads).length ? { keyReads: r.keyReads } : {}),
      ...(m ? { margin: { units: m.units, false: caseOf(m.false), true: caseOf(m.true) } } : {}),
      ...(r.removeEntries ? { hits: (r.judged ?? r.entries).map(e => r.hits?.[e] ?? 0), ...(r.judged ? { judged: r.judged.length } : {}) } : {}),
      ...(Object.keys(tests).length ? { tests } : {}),
      ...(r.folds.length ? { folds: r.folds.length } : {}),
      ...(r.module ? { module: r.module } : {}),
    }
  }
  return {
    format: TRACKED_FORMAT,
    about:
      "The rule ledger, tracked form (design-reduction 3c, 8.9): per census rule of the rule areas its verdict and what it rests on, nothing quoted: no comment, no list entry, no test's name. A test is named by its file and its ordinal there: its place among that file's tests the full record names, sorted by name; `margin` holds the nearest case each side over the rule's sites (numbers, the paper and page, k the run's ordinal at its site); `hits` count a list's entries in the list's order where they remove entries. The full record (every site, the comments, the tests by name, the inputs' papers) is kept outside the repository: `recorded.full` is its file's sha256; `node lab/rules/record.mjs trace --full=<it>` reads a row through it. Generated by `node lab/rules/record.mjs ledger`, never edited by hand.",
    recorded: {
      commit: full.recorded.commit,
      sites: full.recorded.sites,
      full: digest,
      inputs: Object.fromEntries(Object.entries(full.recorded.inputs ?? {}).map(([k, v]) => [k, { records: v.records, papers: v.papers?.length ?? 0 }])),
    },
    holdoutAdds: full.holdoutAdds,
    rules,
  }
}

/** the tracked ledger's text: one rule a line, every character outside ASCII written as its escape (a key is the code's
 *  own signature) */
export function trackedText(tracked) {
  const { rules, ...head } = tracked
  const top = JSON.stringify(head, null, 1).replace(/\n}$/, '')
  const lines = Object.entries(rules).map(([k, r]) => `  ${JSON.stringify(k)}: ${JSON.stringify(r)}`)
  return `${top},\n "rules": {\n${lines.join(',\n')}\n }\n}\n`.replace(/[\u0080-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** the tracked ledger read through the full record it names (the full record's file's text, checked against its digest):
 *  per rule its verdict, the tests that take each outcome by name, and the margin's cases with their tests by name */
export function resolveTracked(tracked, fullText) {
  const digest = createHash('sha256').update(fullText).digest('hex')
  if (digest !== tracked.recorded.full) throw new Error(`the full record's digest is ${digest}, the tracked ledger names ${tracked.recorded.full}`)
  const index = testsOf(JSON.parse(fullText))
  const nameOf = ([f, i]) => index[f]?.[i] ?? null
  const caseOf = c => (c ? { ...c, ...(c.test ? { test: nameOf(c.test) } : {}) } : null)
  const rules = {}
  for (const [key, r] of Object.entries(tracked.rules))
    rules[key] = {
      verdict: r.verdict,
      tests: Object.fromEntries(Object.entries(r.tests ?? {}).map(([side, byFile]) => [side, Object.entries(byFile).flatMap(([f, os]) => os.map(i => nameOf([f, i])))])),
      margin: r.margin ? { units: r.margin.units, false: caseOf(r.margin.false), true: caseOf(r.margin.true) } : null,
    }
  return { rules }
}

/** what was recorded of a row, in words: per input its decisions (each outcome's count) and its plain reads */
export function recordedOf(row) {
  const per = {}
  for (const s of row.sites)
    for (const [k, o] of Object.entries(s.outcomes)) {
      const p = (per[k] ??= { n: 0, t: 0, f: 0, reads: 0, keys: 0 })
      if (s.kind === 'val') p.reads += o.n
      else if (s.kind !== 'key') {
        p.n += o.n
        p.t += o.t
        p.f += o.f
      }
    }
  // (a table's entry read by a key known at run time: its own key's reads)
  for (const [k, n] of Object.entries(row.keyReads ?? {})) (per[k] ??= { n: 0, t: 0, f: 0, reads: 0, keys: 0 }).keys += n
  const runs = Object.entries(per)
    .filter(([, o]) => o.n || o.reads || o.keys)
    .map(([k, o]) => `${k}: ${[o.n ? `${o.n} run${o.n === 1 ? '' : 's'}, ${o.t} true, ${o.f} false` : '', o.reads ? `read ${o.reads}` : '', o.keys ? `read by its key ${o.keys}` : ''].filter(Boolean).join(', ')}`)
    .join('; ')
  return runs || 'never ran on any input'
}
