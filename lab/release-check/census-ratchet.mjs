// lab/release-check/census-ratchet.mjs: the census's judged part (the owner's per-batch check of rule debt, 2026-11-12).
// Each measure of MEASURES may only fall or hold: the census's ledger records its value for the tree NOW and for AFTER (NOW
// less what the cut-over deletes), per repository, as the last integrated round measured them; a value above the recorded
// one fails, naming the measure, both values and the entries that added to it; a value below passes and can be recorded.
// No tolerance, no percentage. A ledger is written by `census.mjs --record` alone, never by hand: a value is raised only by
// `--record --raise=<measure> --reason="…"`, and every raise ever made stays in the ledger with its reason and commit.
// This repository's ledger is census-ledger.json beside the profile; the website's is its own, beside its profile. Pure but
// for `newLinesOf` (git). Not shipped.
import { execFileSync } from 'node:child_process'

export const LEDGER_FORMAT = 'readarxiv/census-ledger 1'

/** what may only fall or hold. `crossRepo`: its value for this repository depends on what the website's tree reaches of it
 *  (judged only where the website's tree is given); `repo`: the measure of one repository alone */
export const MEASURES = [
  { id: 'thresholds', says: "tuned thresholds (the profile's debt areas; every product file where it names none)" },
  { id: 'thresholdsNoReason', says: 'tuned thresholds with no comment' },
  { id: 'lists', says: "name lists (the profile's debt areas; every product file where it names none)" },
  { id: 'listsUndefined', says: 'name lists citing no definition' },
  { id: 'versions', says: 'version constants raised by hand' },
  { id: 'mirrors', says: 'mirrors of a version constant' },
  { id: 'unchecked', says: "code lines no type checker reads (the profile's engine areas; every product file where it names none)" },
  { id: 'webImports', says: "the website's imports of engine internals", repo: 'web' },
  { id: 'webExtensionImports', says: "the website's imports of the extension's source", repo: 'web' },
  { id: 'duplicates', says: 'duplicated functions (a group of copies across the two repositories is the website\'s)' },
  { id: 'deadModules', says: 'dead modules', crossRepo: true },
  { id: 'deadExports', says: 'dead exports', crossRepo: true },
  { id: 'cycles', says: 'import cycles among product modules' },
  { id: 'chains', says: 'translate chains' },
  { id: 'gplReached', says: 'ported GPL files a build reaches', crossRepo: true },
  { id: 'productCode', says: 'product code lines (generated files apart; by area)' },
  { id: 'productModules', says: 'product modules (by area)' },
  { id: 'contentVersions', says: "version constants raised by hand that are not a store's schema number" },
  { id: 'budgetsUnmeasured', says: 'budgets with no measurement or platform limit on record (every product file)' },
  { id: 'longestFunction', says: "the longest function's code lines" },
  { id: 'functionsOver1000', says: 'functions over 1,000 code lines' },
  { id: 'tenLongest', says: 'code lines in the ten longest functions' },
  { id: 'historyComments', says: 'comment lines in the packages telling history' },
  { id: 'unsafeCasts', says: '`as never`, `as any` and casts of a cast in product TypeScript' },
  { id: 'suppressions', says: '@ts-ignore and @ts-expect-error in product code' },
]
const IDS = MEASURES.map(m => m.id)

/** a tree's ratchet items from the census's measures of it: for each measure, `{ repo, file, line, w }` (w the item's
 *  weight: 1, or its lines) */
export function itemsOf(t, view, profiles) {
  const debtAreas = repo => (profiles[repo]?.debtAreas?.length ? true : null)
  const inDebt = x => (debtAreas(x.repo) ? x.headline : true)
  const one = (repo, file, line = null, w = 1) => ({ repo, file, line, w })
  const items = Object.fromEntries(IDS.map(id => [id, []]))
  for (const x of t.debt.thresholds.list) {
    if (x.class !== 'tuned' || !inDebt(x)) continue
    items.thresholds.push(one(x.repo, x.file, x.line))
    if (!x.reason) items.thresholdsNoReason.push(one(x.repo, x.file, x.line))
  }
  for (const x of t.debt.lists.list) {
    if (!inDebt(x)) continue
    items.lists.push(one(x.repo, x.file, x.line))
    if (x.class === 'listed') items.listsUndefined.push(one(x.repo, x.file, x.line))
  }
  for (const v of t.debt.versions.list) {
    const into = v.mirror ? items.mirrors : items.versions
    into.push(one(v.repo, v.file, v.line))
    if (!v.mirror && !v.schema) items.contentVersions.push(one(v.repo, v.file, v.line))
  }
  for (const x of t.debt.thresholds.list) if (x.class === 'budget' && !x.source) items.budgetsUnmeasured.push(one(x.repo, x.file, x.line))
  // (a function's measures are each repository's own: its longest, its ten longest, by their code lines)
  for (const [repo, s] of Object.entries(t.functions.byRepo)) {
    if (s.longest) items.longestFunction.push(one(repo, s.longest.file, s.longest.line, s.longest.code))
    for (const f of s.over1000) items.functionsOver1000.push(one(repo, f.file, f.line))
    for (const f of s.ten) items.tenLongest.push(one(repo, f.file, f.line, f.code))
  }
  for (const h of t.history.byFile) for (const line of h.at) items.historyComments.push(one(h.repo, h.file, line))
  for (const c of t.types.unsafeCastItems) items.unsafeCasts.push(one(c.repo, c.file, c.line))
  for (const c of t.types.suppressionItems) items.suppressions.push(one(c.repo, c.file, c.line))
  for (const f of t.types.files) if (f.repo !== 'engine' || f.engine) items.unchecked.push(one(f.repo, f.file, null, f.code))
  for (const i of t.webImports?.items ?? []) (i.cls === 'engine' ? items.webImports : items.webExtensionImports).push(one(i.repo, i.file, i.line))
  for (const g of t.duplicates.all) items.duplicates.push(one(g.repo, g.file, g.line))
  for (const d of t.dead.moduleItems) items.deadModules.push(one(d.repo, d.file))
  for (const d of t.dead.exportItems) items.deadExports.push(one(d.repo, d.file, d.line))
  for (const c of t.graph.cycles.all) {
    const web = c.find(id => id.startsWith('web:'))
    const first = web ?? c[0]
    items.cycles.push(one(web ? 'web' : 'engine', first.slice(first.indexOf(':') + 1)))
  }
  for (const c of t.chains.implementations) items.chains.push(one(c.repo, c.path))
  for (const g of t.gpl) if (g.reachedBy.length) items.gplReached.push(one(g.repo, g.path))
  for (const x of view.files)
    if (x.f.role === 'product' && x.f.kind === 'code' && !x.f.generated) {
      items.productCode.push(one(x.repo, x.f.area, null, x.f.lines.code))
      items.productModules.push(one(x.repo, x.f.area))
    }
  return items
}

/** one repository's part of a tree: each measure's value and its count by file (by area for the product's size) */
export function partOf(items, repo) {
  const values = {}
  const files = {}
  for (const id of IDS) {
    const mine = items[id].filter(i => i.repo === repo)
    values[id] = mine.reduce((n, i) => n + i.w, 0)
    files[id] = {}
    for (const i of mine) files[id][i.file] = (files[id][i.file] ?? 0) + i.w
  }
  return { values, files, items: Object.fromEntries(IDS.map(id => [id, items[id].filter(i => i.repo === repo)])) }
}

/** the lines of each file added or changed since `commit` in the checkout at `root` (a file git does not hold at that commit:
 *  'all'); null where the commit is not in the checkout */
export function newLinesOf(root, commit) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    git('cat-file', '-e', `${commit}^{commit}`)
  } catch {
    return null
  }
  const out = new Map()
  let file = null
  for (const l of git('diff', '-U0', '--no-color', '--no-renames', commit).split('\n')) {
    const f = /^\+\+\+ b\/(.*)$/.exec(l)
    if (f) {
      file = f[1]
      out.set(file, new Set())
      continue
    }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l)
    if (h && file) for (let i = 0; i < Number(h[2] ?? 1); i++) out.get(file).add(Number(h[1]) + i)
  }
  for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) out.set(f, 'all')
  return out
}

/**
 * The ratchet's judgement of one repository's ledger against its current parts (`current`: { NOW, AFTER? }, each a partOf).
 * `measured`: which trees this run measured, and whether the website's tree was given (else a crossRepo measure is
 * skipped). `newLines`: newLinesOf for this repository, or null. Each line: { tree, measure, says, status: 'rise' | 'fall'
 * | 'hold' | 'new' | 'skipped', recorded, value, why?, added? } — `added`, for a rise, the files whose count rose, with the
 * entries on lines new since the recorded commit.
 */
export function judge(ledger, current, { web, newLines = null, repo }) {
  const out = []
  for (const tree of ['NOW', 'AFTER']) {
    for (const m of MEASURES) {
      if (m.repo && m.repo !== repo) continue
      const base = { tree, measure: m.id, says: m.says }
      const rec = ledger?.trees?.[tree]?.values?.[m.id]
      if (!current[tree]) {
        out.push({ ...base, status: 'skipped', recorded: rec ?? null, value: null, why: "AFTER needs the website's tree: what its builds keep alive of this repository decides what the cut-over deletes" })
        continue
      }
      if (m.crossRepo && !web) {
        out.push({ ...base, status: 'skipped', recorded: rec ?? null, value: null, why: "its value depends on what the website's tree reaches of this one, and that tree was not given" })
        continue
      }
      const value = current[tree].values[m.id]
      if (rec == null) {
        out.push({ ...base, status: 'new', recorded: null, value })
        continue
      }
      const status = value > rec ? 'rise' : value < rec ? 'fall' : 'hold'
      const line = { ...base, status, recorded: rec, value }
      if (status === 'rise') {
        const before = ledger.trees[tree].files?.[m.id] ?? {}
        const now = current[tree].files[m.id]
        line.added = Object.entries(now)
          .filter(([f, n]) => n > (before[f] ?? 0))
          .map(([f, n]) => {
            const lines = newLines?.get(f)
            const entries = current[tree].items[m.id].filter(i => i.file === f && i.line != null && lines && (lines === 'all' || lines.has(i.line))).map(i => `${f}:${i.line}`)
            return { file: f, from: before[f] ?? 0, to: n, entries }
          })
      }
      out.push(line)
    }
  }
  return out
}

/**
 * The ledger written anew from this run: every measure that fell or held takes its new value, a new measure its first; one
 * that rose is refused unless `raise` names it, and a raise without a reason is refused; a raise is kept in `raises` with
 * its reason and commit. A measure this run skipped keeps its recorded value. Throws with every refusal named.
 */
export function record(ledger, current, lines, { raise = [], reason = '', commit, at, about }) {
  const rises = lines.filter(l => l.status === 'rise')
  const refused = []
  if (raise.length && !reason.trim()) refused.push(`--raise=${raise.join(',')} without --reason: a value is raised only with its reason`)
  for (const r of rises) if (!raise.includes(r.measure)) refused.push(`${r.tree} ${r.measure} rose ${r.recorded} → ${r.value}: lower it, or raise it with --raise=${r.measure} --reason="…"`)
  for (const m of raise) if (!IDS.includes(m)) refused.push(`--raise=${m}: no such measure (${IDS.join(', ')})`)
  if (refused.length) throw new Error(`census --record refused:\n  ${refused.join('\n  ')}`)
  const next = { format: LEDGER_FORMAT, about, recorded: { commit, at }, trees: structuredClone(ledger?.trees ?? {}), raises: [...(ledger?.raises ?? [])] }
  for (const l of lines) {
    if (l.status === 'skipped') continue
    next.trees[l.tree] ??= { values: {}, files: {} }
    next.trees[l.tree].values[l.measure] = l.value
    next.trees[l.tree].files[l.measure] = Object.fromEntries(Object.entries(current[l.tree].files[l.measure]).sort())
    if (l.status === 'rise') next.raises.push({ tree: l.tree, measure: l.measure, from: l.recorded, to: l.value, reason: reason.trim(), commit, at })
  }
  return next
}

/** the ratchet's report lines: every rise (with the entries that added to it), what can be lowered, what was skipped, and
 *  every raise the ledger holds */
export function reportOf(repo, lines, ledger, recorded = false) {
  const count = st => lines.filter(x => x.status === st).length
  const L = [`${repo}: ${lines.length - count('skipped')} measures judged, ${count('rise')} rose, ${count('hold')} held, ${count('fall')} fell${count('new') ? `, ${count('new')} ${recorded ? 'recorded' : 'not recorded yet'}` : ''}${count('skipped') ? `, ${count('skipped')} skipped` : ''}`]
  for (const l of lines.filter(x => x.status === 'rise')) {
    L.push(`RISE ${repo} ${l.tree} ${l.measure} (${l.says}): ${l.recorded} → ${l.value}`)
    for (const a of l.added ?? []) L.push(`  ${a.file}: ${a.from} → ${a.to}${a.entries.length ? `; new: ${a.entries.join(', ')}` : ''}`)
  }
  const low = lines.filter(x => x.status === 'fall')
  if (low.length) L.push(`can be lowered (${repo}): ${low.map(l => `${l.tree} ${l.measure} ${l.recorded} → ${l.value}`).join('; ')}`)
  const fresh = lines.filter(x => x.status === 'new')
  if (fresh.length) L.push(`${recorded ? 'recorded' : 'not recorded yet'} (${repo}): ${fresh.map(l => `${l.tree} ${l.measure} ${l.value}`).join('; ')}`)
  const skipped = lines.filter(x => x.status === 'skipped')
  if (skipped.length) L.push(`skipped (${repo}): ${[...new Set(skipped.map(l => `${l.tree === 'AFTER' && l.why.startsWith('AFTER') ? 'AFTER' : `${l.tree} ${l.measure}`}: ${l.why}`))].join('; ')}`)
  for (const r of ledger?.raises ?? []) L.push(`raised (${repo}) ${r.tree} ${r.measure} ${r.from} → ${r.to} at ${r.commit} (${r.at}): ${r.reason}`)
  return L
}
