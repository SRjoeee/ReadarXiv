// lab/pdf/spikes/rules-gate.mjs
// The rules gate (rules-as-data plan §8, Task R6): what a change to the layout rule set, or to the drawing code that reads
// it, does to the instant layer, measured on the fixtures. It is the verdict of two model-tier runs of the layer gate made
// on one runner, the merge base's engine with its own built-in set (base) and the pull request's with its own (head), so
// that the platform stays out of every delta: no baseline from another machine is compared.
//   run      the layer gate's model tier in the production configuration, from the fixture pack alone
//   compare  (the default) two runs' verdict: each run must be whole (nothing failed, every output of the pack in it), each
//            target's outputs pooled over the model-tier measures and held to the merge rule's thresholds (layer-gate/score.mjs
//            compare), the pages that moved, the checks of a changed layout-rules.json, the one comment (<!-- rules-gate -->)
//            and the numbers (rules-gate.json). Exit 1 where the run cannot pass
//   engines  the same verdict for head's set on each engine lab/pdf/live-engines.json names, against the set published for it
//
//   node lab/pdf/spikes/rules-gate.mjs run --engine=<worktree> --rules=<file> --pack=<dir> [--out=<run.json>] [--log=<file>] [--workers=4]
//   node lab/pdf/spikes/rules-gate.mjs compare --base=<run.json> --head=<run.json> --out=<dir> [--base-sha=<sha>] [--head-sha=<sha>]
//       [--base-rules=<file> --head-rules=<file>] [--ruling=<file>]… [--pack=<gate-pack.json>] [--records=<fixtures dir>] [--label=<text>]
//   node lab/pdf/spikes/rules-gate.mjs engines --list=<live-engines.json> --head-rules=<file> --pack=<dir> --published=<origin> --out=<dir> [--pack-json=<gate-pack.json>]
//
// What it never does: show a page, or a word of a paper. The papers are under arXiv's licence, and the comment is public.
// Everything it writes is a number, a fixture's name, a measure's label or a commit; a run file's other fields (the page
// errors, the units a check names, the reason an output failed) are never read. `--records` is the second lock: the
// comment and the numbers are searched for every string of the fixtures' translations before they are written, and withheld
// (exit 2) where one is found. A ruling's words are the maintainer's, and are the only free text in the comment.
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { nameOf } from './layer-gate/ref.mjs'
import { compare, MEASURES, pooled, worse } from './layer-gate/score.mjs'

export const MARK = '<!-- rules-gate -->'
/** the lab, which the maintainer starts on his machine (lab/pdf/layer-lab/README.md); `rules=<sha>` opens the pull request's set */
export const LAB = 'http://127.0.0.1:8093/'
const here = new URL('.', import.meta.url).pathname
const REPO = resolve(here, '../../..')
const ENGINE = 'src/pdf-reader/engine'
const MODEL = MEASURES.filter(m => m[1] === 'model')
const DEFECTS = MODEL.filter(m => m[2] === 'defect').map(m => m[0])
const FIXTURE = /^[A-Za-z0-9._-]+v\d+-[A-Za-z-]+$/
const GIT_SHA = /^[0-9a-f]{7,40}$/
/** The inputs of a run that make it another instrument: what the gate takes from the checkout it runs from, the pack and the browser,
 *  the same for both runs. Not among them: the rule set, the engine's commit, its remover and the hyphenation digest, which the
 *  engine under test computes itself (layer-gate.mjs reads the hyph.mjs of the engine measured), so that a pull request that
 *  changes them is a change to measure, not a different instrument. The pack's patterns are the same for both runs, and verified. */
const INSTRUMENT = ['tier', 'pages', 'scale', 'inkScale', 'inkMin', 'composite', 'layouts', 'fixtures', 'refs', 'geometry', 'chromium', 'pdfjs', 'fonts', 'checker', 'measures', 'kind', 'protoUnits', 'place', 'order', 'faces', 'tex', 'removal']
/** the longest list of pages a comment holds; the numbers hold them all */
const PAGES_SHOWN = 60

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const labelOf = key => MEASURES.find(m => m[0] === key)?.[4] ?? key

/** the lab's address for one page of one output at a commit's set */
export function labLink(fixture, page, sha) {
  if (!FIXTURE.test(fixture) || !Number.isInteger(page) || page < 1 || !GIT_SHA.test(sha)) throw new Error('not a fixture, a page and a commit')
  return `${LAB}#f=${fixture}&p=${page}&rules=${sha}`
}

/**
 * A maintainer's ruling that accepts a regression, in the layer gate's `--ruling` form (layer-gate.mjs; the record's
 * `rulings`) with the machine's two additions, the `targets` it covers beside the `measures`: { date, by, on, quote,
 * english, measures, targets, scope, why }. `by`, `quote`, `why`, `measures` and `targets` are required. A measure is named by its label
 * or its key ("text units left English", `unitsLeft`).
 */
export function parseRuling(json, name) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) throw new Error('a ruling\'s file name is letters, digits, dots, dashes and underscores')
  const fail = field => { throw new Error(`ruling ${name}: ${field} is missing or not ${field === 'measures' || field === 'targets' ? 'a non-empty list of strings' : 'a non-empty string'}`) }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) throw new Error(`ruling ${name}: not an object`)
  for (const f of ['by', 'quote', 'why']) if (typeof json[f] !== 'string' || !json[f].trim()) fail(f)
  for (const f of ['measures', 'targets']) if (!Array.isArray(json[f]) || !json[f].length || json[f].some(x => typeof x !== 'string' || !x)) fail(f)
  const text = v => (typeof v === 'string' ? v : null)
  return { name, date: text(json.date), by: json.by, on: text(json.on), quote: json.quote, english: text(json.english), scope: text(json.scope), why: json.why, measures: new Set(json.measures), targets: new Set(json.targets) }
}

/** a page of a run as the compare reads it: the record drops a zero, so a defect or a count it lacks is 0 */
const ZERO = Object.fromEntries([...DEFECTS, 'textOn', 'textDrawn', 'cellsOn', 'cellsDrawn', 'modelCells'].map(k => [k, 0]))
const withZeros = fixtures => Object.fromEntries(Object.entries(fixtures).map(([n, f]) => [n, { totals: f.totals, pages: (f.pages ?? []).map(e => ({ ...ZERO, ...e })) }]))

/** Text as one inline code span, so that nothing of it is markdown, an image, a mention or HTML: whitespace folded, cut at 400
 *  characters, backticks made apostrophes (a span cannot hold its own fence) */
export function codeSpan(text, max = 400) {
  return `\`${String(text).replace(/\s+/g, ' ').replace(/`/g, "'").trim().slice(0, max)}\``
}

/** the value a table shows: a share in per cent, a ratio to 3 places, a count; a defect with its rate per 1,000 cells */
function shown(row, side) {
  const v = row[side], rate = row[`${side}Rate`]
  if (v === null) return '–'
  if (row.cls === 'share') return `${(100 * v).toFixed(2)} %`
  if (row.cls === 'ratio') return v.toFixed(3)
  if (row.cls === 'defect') return rate === null ? String(v) : `${v} (${rate.toFixed(2)})`
  return String(v)
}

/** the outputs a pack holds: the frozen references of its listing (`refs/<name>/ref.json`), the set the layer gate itself requires
 *  of each fixture it runs. `pack` is gate-pack.json, or any `{ files: [{ path }] }` */
export function outputsOfPack(pack) {
  const names = new Set()
  for (const f of pack?.files ?? []) { const m = /^refs\/([^/]+)\/ref\.json$/.exec(f?.path ?? ''); if (m && FIXTURE.test(m[1])) names.add(m[1]) }
  return [...names].sort(byName)
}

/** names for a line of a comment: only what is shaped like an output's name is shown, the first few of them */
const SHOWN = 6
function namesIn(list) {
  const own = list.filter(n => typeof n === 'string' && FIXTURE.test(n)), rest = own.length - Math.min(own.length, SHOWN) + (list.length - own.length)
  if (!own.length) return countOf(list.length, 'output')
  return `${own.slice(0, SHOWN).join(', ')}${rest ? ` and ${rest} more` : ''}`
}
const countOf = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`

/**
 * Why a run is not whole. The layer gate exits 1 for an output that threw, one that did not get ready, one whose inputs
 * changed and a request that would have left the machine, and for a completeness count the merge rule decides; the run file
 * keeps the first group in `failures` (names and the word `network`) and not the last, which is a number of the file. A run
 * is whole when no `failure` is in it and its `fixtures` and `failed` are the pack's outputs, no more and no fewer: two runs
 * that lost the same outputs agree on every output they share, and two empty ones on all of none. `outputs` is the pack's
 * (`outputsOfPack`), or null where there is no pack to hold the run to (a run with no output at all is refused anyway).
 */
export function wholeness(side, run, outputs) {
  const out = [], reported = new Set()
  const failed = new Set((run.failed ?? []).map(f => f?.name))
  if (!Array.isArray(run.failures)) out.push(`the ${side} run does not say what failed: it was made by another gate`)
  else {
    const named = run.failures.filter(n => n !== 'network')
    // (an output that was not ready is in `failed`, which says so)
    const lost = named.filter(n => !failed.has(n))
    for (const n of named) reported.add(n)
    if (lost.length) out.push(`${namesIn(lost)} failed in the ${side} run`)
    if (run.failures.includes('network')) out.push(`the ${side} run made a request that would have left the machine`)
  }
  const have = new Set([...Object.keys(run.fixtures ?? {}), ...failed])
  if (!have.size) out.push(`the ${side} run holds no output`)
  else if (outputs) {
    // (an output that threw is named above: it is also among the missing)
    const missing = outputs.filter(n => !have.has(n) && !reported.has(n)), extra = [...have].filter(n => !outputs.includes(n))
    if (missing.length) out.push(`the ${side} run lacks ${countOf(missing.length, 'output')} of the pack's: ${namesIn(missing)}`)
    if (extra.length) out.push(`the ${side} run holds ${countOf(extra.length, 'output')} the pack does not: ${namesIn(extra)}`)
  }
  return out
}

/**
 * The verdict of two model-tier runs. Each target's outputs (the fixtures named <paper>v<n>-<target>: zh five, the others
 * four) are pooled by the gate's own arithmetic (score.mjs pooled) and the pools compared with the merge rule (score.mjs
 * compare: a share by 0.2 points, a ratio by 0.02, a count at all, a defect as a rate per 1,000 cells at all). The pages
 * whose measures moved come from the same compare on the outputs. Returns { ok, problems, targets, regressions,
 * improvements, pages, perFixture }: `problems` is what fails the run besides a regression (a run that is no model run, a
 * different instrument, a run that is not whole (`wholeness`), an output missing or failed), and a regression fails it unless
 * one of the `rulings` covers its target and its measure.
 */
export function judge(base, head, { rulings = [], outputs = null } = {}) {
  const problems = []
  for (const [side, run] of [['base', base], ['head', head]]) {
    if (run.tier !== 'model') problems.push(`the ${side} run is not the model tier`)
    for (const f of run.failed ?? []) problems.push(typeof f?.name === 'string' && FIXTURE.test(f.name) ? `${f.name} did not run in the ${side} run` : `an output did not run in the ${side} run`)
    problems.push(...wholeness(side, run, outputs))
  }
  for (const k of INSTRUMENT) {
    const a = base.inputs?.[k], b = head.inputs?.[k]
    if (String(a) !== String(b)) problems.push(`the runs are not one instrument: ${k} is ${String(a).slice(0, 60)} in the base run and ${String(b).slice(0, 60)} in the head run`)
  }
  // (an output that is missing from a side for what that side says failed is not also "only in" the other)
  const failed = side => new Set([...(side.failed ?? []).map(f => f?.name), ...(Array.isArray(side.failures) ? side.failures : [])])
  const names = { base: Object.keys(base.fixtures ?? {}).filter(n => FIXTURE.test(n)).sort(byName), head: Object.keys(head.fixtures ?? {}).filter(n => FIXTURE.test(n)).sort(byName) }
  for (const n of names.base) if (!names.head.includes(n) && !failed(head).has(n)) problems.push(`${n} only in the base run`)
  for (const n of names.head) if (!names.base.includes(n) && !failed(base).has(n)) problems.push(`${n} only in the head run`)
  const common = names.base.filter(n => names.head.includes(n))
  const byTarget = new Map()
  for (const n of common) { const t = nameOf(n).target; byTarget.set(t, [...(byTarget.get(t) ?? []), n]) }
  const targets = [...byTarget.keys()].sort(byName)
  const poolOf = (run, list) => pooled(list.map(n => run.fixtures[n].totals), 'model')
  const prev = {}, cur = {}
  for (const t of targets) { prev[t] = { totals: poolOf(base, byTarget.get(t)), pages: [] }; cur[t] = { totals: poolOf(head, byTarget.get(t)), pages: [] } }
  const cmp = compare(prev, cur, 'model')

  const covers = (t, key, label) => rulings.find(r => r.targets.has(t) && (r.measures.has(label) || r.measures.has(key)))?.name ?? null
  const regressions = cmp.regressions.map(r => ({ target: r.fixture, measure: r.measure, label: r.label, from: num(r.from), to: num(r.to), ruling: covers(r.fixture, r.measure, r.label) }))
  const improvements = cmp.improvements.map(r => ({ target: r.fixture, measure: r.measure, label: r.label, from: num(r.from), to: num(r.to) }))
  const rows = t => MODEL.map(m => {
    const w = worse(m, prev[t].totals, cur[t].totals, 'model'), defect = m[2] === 'defect'
    const at = (totals, k) => num(totals[k]), rate = (totals, k) => (defect ? num(totals.modelRates?.[k]) : null)
    return { key: m[0], label: m[4], cls: m[2], base: at(prev[t].totals, m[0]), head: at(cur[t].totals, m[0]), baseRate: rate(prev[t].totals, m[0]), headRate: rate(cur[t].totals, m[0]), moved: w?.worse ? 'worse' : w?.better ? 'better' : null }
  })
  const targetRows = targets.map(t => {
    const r = rows(t)
    return { target: t, outputs: byTarget.get(t), rows: r, worse: r.filter(x => x.moved === 'worse').length, better: r.filter(x => x.moved === 'better').length }
  })

  const perOutput = compare(withZeros(pick(base.fixtures, common)), withZeros(pick(head.fixtures, common)), 'model')
  const moved = perOutput.pages.map(p => ({ fixture: p.fixture, page: p.page, worse: p.worse.map(labelOf), better: p.better.map(labelOf) }))
  // the pages that got worse first, each group in the runs' order
  const pages = [...moved.filter(p => p.worse.length), ...moved.filter(p => !p.worse.length)]
  const perFixture = { regressions: perOutput.regressions.map(r => ({ fixture: r.fixture, measure: r.measure, label: r.label })), improvements: perOutput.improvements.length }
  return { ok: problems.length === 0 && regressions.every(r => r.ruling), problems, targets: targetRows, regressions, improvements, pages, perFixture }
}
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]))

/**
 * The checks of a changed layout-rules.json, with the head engine's own `readRules` and `writeRules` (so that the file is
 * judged by the code that will read it): its version is the base file's plus one, its note is not the base's, and its bytes
 * are the canonical form. Returns { changed, problems, from, to }; a file that did not change has none. Every problem is
 * found, not the first.
 */
export async function checkRulesFile(baseBytes, headBytes, engine) {
  const same = baseBytes && baseBytes.length === headBytes.length && baseBytes.every((b, i) => b === headBytes[i])
  if (same) return { changed: false, problems: [] }
  let before = null
  try { before = JSON.parse(new TextDecoder().decode(baseBytes)) } catch { /* a base without a readable file has no version to raise */ }
  const from = Number.isInteger(before?.version) ? before.version : null
  let set
  try { ({ set } = await engine.readRules(headBytes)) } catch (e) { return { changed: true, problems: [`the file is refused: ${e?.field ?? 'json'}: ${e?.why ?? 'not a rule set'}`], from, to: null } }
  const problems = []
  if (from === null) problems.push('the base has no readable version to raise')
  else if (set.version !== from + 1) problems.push(`version is ${set.version}, not ${from + 1} (the base's ${from} plus one)`)
  if (before && set.note === before.note) problems.push("note is the base's: it says what changed and why")
  if (engine.writeRules(set) !== new TextDecoder().decode(headBytes)) problems.push('the file is not canonical: the lab writes it, or `writeRules`')
  return { changed: true, problems, from, to: set.version }
}

/** the verdict with the file's checks in it: a problem of the file fails the run */
export function withRulesFile(report, check) {
  const out = { ...report, rulesFile: check }
  if (check.problems.length) { out.problems = [...report.problems, ...check.problems.map(p => `layout-rules.json: ${p}`)]; out.ok = false }
  return out
}

/** every string of a fixture's translation (record.json, units.json) the comment must not carry: those of ten characters or more, at any depth of its units */
export function textsOf(record, min = 10) {
  const out = new Set()
  const walk = v => {
    if (typeof v === 'string') { if (v.length >= min) out.add(v) } else if (Array.isArray(v)) v.forEach(walk)
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(record?.units)
  return out
}
/** how many of the strings a text holds */
export function leaksIn(text, strings) {
  let n = 0
  for (const s of strings) if (text.includes(s)) n++
  return n
}

/**
 * How many windows of a free text (a ruling's words) are in the strings of the translations, joined by NUL as `haystack`:
 * the text cut in windows of `size` characters every `stride`, so that a run of `size + stride - 1` characters or more of a
 * paper is found wherever it falls, and a phrase of a few words is not. The whole-string check above finds a string the gate
 * copied; this finds a part of one that a person typed.
 */
export function fragmentsIn(text, haystack, { size = 20, stride = 10 } = {}) {
  let n = 0
  for (let i = 0; i + size <= text.length; i += stride) if (haystack.includes(text.slice(i, i + size))) n++
  return n
}

/** the numbers: everything the comment says, as data, and nothing a paper wrote */
export function reportJson(report, meta = {}) {
  const side = s => (s ? { commit: GIT_SHA.test(s.commit ?? '') ? s.commit : null, rules: s.rules ? { version: num(s.rules.version), sha256: /^[0-9a-f]{64}$/.test(s.rules.sha256 ?? '') ? s.rules.sha256 : null } : null } : null)
  return {
    schema: 1, tier: 'model', ok: report.ok, base: side(meta.base), head: side(meta.head), problems: report.problems,
    targets: report.targets.map(t => ({ target: t.target, outputs: t.outputs, worse: t.worse, better: t.better, measures: t.rows.map(({ key, base, head, baseRate, headRate, moved }) => ({ key, base, head, baseRate, headRate, moved })) })),
    regressions: report.regressions, improvements: report.improvements, pages: report.pages, perFixture: report.perFixture,
    rulesFile: report.rulesFile ?? null, pack: meta.pack ? { digest: meta.pack.digest, pipeline: meta.pack.pipeline } : null, changedTargets: meta.changedTargets ?? null,
  }
}

/**
 * The comment, as markdown: its verdict first, a table for each target that moved (the others folded), the pages that
 * moved with their lab links, and what the run could not say. `o`: { headSha, baseSha, pack, enginePipeline, targets (the
 * targets the engine offers), changedTargets (those whose rules the change touches), label }.
 */
export function commentOf(report, o) {
  const verdict = !report.ok ? 'failed' : report.regressions.length ? 'passed under a ruling' : 'passed'
  const short = s => (GIT_SHA.test(s ?? '') ? `\`${s.slice(0, 8)}\`` : 'its base')
  const link = p => (GIT_SHA.test(o.headSha ?? '') ? `[${p.fixture} p${p.page}](${labLink(p.fixture, p.page, o.headSha)})` : `${p.fixture} p${p.page}`)
  const L = [MARK, `## Rules gate: ${verdict}`, '']
  L.push(`Model tier of the layer gate on ${report.targets.reduce((a, t) => a + t.outputs.length, 0)} outputs of ${report.targets.length} targets, ${short(o.headSha)} against the merge base ${short(o.baseSha)}${o.label ? ` (${o.label})` : ''}, both runs on one runner.`, '')
  if (report.problems.length) L.push('**This run cannot pass:**', ...report.problems.map(p => `- ${p}`), '')
  if (o.pack && o.enginePipeline && String(o.pack.pipeline) !== String(o.enginePipeline)) L.push(`The pack was made under PIPELINE ${o.pack.pipeline} and the engine is at PIPELINE ${o.enginePipeline}: remake the pack.`, '')
  if (o.changedTargets) L.push(o.changedTargets.length ? `Rules changed for: ${o.changedTargets.join(', ')}.` : 'The rule set changes no target.', '')
  if (o.targets) {
    const have = new Set(report.targets.map(t => t.target)), none = o.targets.filter(t => !have.has(t))
    if (none.length) L.push(`No output for ${none.join(', ')}: ${none.some(t => o.changedTargets?.includes(t)) ? 'a change to their rules is not measured here, look at it in the lab' : 'their rules are not measured here'}.`, '')
  }
  if (report.regressions.length) {
    L.push('### Regressions', '', '| target | measure | base | head | |', '|---|---|---|---|---|')
    const rate = (r, v) => (v === null ? '–' : String(Math.round(v * 10000) / 10000))
    for (const r of report.regressions) L.push(`| ${r.target} | ${r.label} | ${rate(r, r.from)} | ${rate(r, r.to)} | ${r.ruling ? `accepted by ruling ${codeSpan(r.ruling)}` : '**not accepted**'} |`)
    L.push('')
    for (const name of [...new Set(report.regressions.map(r => r.ruling).filter(Boolean))]) {
      const g = o.rulings?.find(x => x.name === name)
      // (the maintainer's words, and the one free text of the comment: code spans, whatever they hold)
      if (g) L.push(`> ${codeSpan(name)} (${codeSpan(g.date ?? 'undated')}, ${codeSpan(g.by)}): ${codeSpan(g.english ?? g.quote)}${g.why ? ` — ${codeSpan(g.why)}` : ''}`, '')
    }
    L.push('A defect is compared as a rate per 1,000 cells of the drawn units\' frames; the other measures as their values.', '')
  }
  const table = t => ['| measure | base | head | |', '|---|---|---|---|', ...t.rows.map(r => `| ${r.label} | ${shown(r, 'base')} | ${shown(r, 'head')} | ${r.moved === 'worse' ? '**worse**' : r.moved === 'better' ? 'better' : ''} |`)]
  const count = n => `${n} output${n === 1 ? '' : 's'}`
  for (const t of report.targets) {
    if (t.worse || t.better) L.push(`### ${t.target} (${count(t.outputs.length)}): ${[t.worse ? `${t.worse} worse` : '', t.better ? `${t.better} better` : ''].filter(Boolean).join(', ')}`, '', ...table(t), '')
    else L.push(`<details><summary>${t.target}: ${count(t.outputs.length)}, no measure moved</summary>`, '', ...table(t), '', '</details>', '')
  }
  if (report.pages.length) {
    L.push(`### Pages that moved (${report.pages.length})`, '')
    for (const p of report.pages.slice(0, PAGES_SHOWN)) L.push(`- ${link(p)}: ${[p.worse.length ? `worse ${p.worse.join(', ')}` : '', p.better.length ? `better ${p.better.join(', ')}` : ''].filter(Boolean).join('; ')}`)
    if (report.pages.length > PAGES_SHOWN) L.push(`- and ${report.pages.length - PAGES_SHOWN} more, in the artifact`)
    L.push('')
  }
  if (report.perFixture.regressions.length) L.push(`Per output, which does not gate: ${report.perFixture.regressions.length} regression${report.perFixture.regressions.length === 1 ? '' : 's'} (${report.perFixture.regressions.slice(0, 6).map(r => `${r.fixture} ${r.label}`).join('; ')}${report.perFixture.regressions.length > 6 ? '; …' : ''}), ${report.perFixture.improvements} better.`, '')
  L.push('The links open the lab on a machine that has the fixtures. No page and no text of a paper is shown here: the papers are under arXiv\'s licence.')
  return `${L.join('\n')}\n`
}

// ---------------------------------------------------------------- running the gate

/** the layer gate's flags and environment for one side of the comparison: the production configuration, the model tier, 4
 *  workers, every input from the pack (`pack` is its directory) */
export function gateArgs({ engine, rules, pack, workers = 4 }) {
  return {
    args: ['--tier=model', '--engine-kind=proto', '--proto-tex=lines', '--removal=draw', `--fixtures=${join(pack, 'fixtures')}`, `--engine=${engine}`, `--rules=${rules}`, `--workers=${workers}`],
    env: { AXT_DATA: join(pack, 'data'), LAYER_REFS: join(pack, 'refs'), LAYER_GEOMETRY: join(pack, 'geometry'), TEXMF_DIST: join(pack, 'texmf') },
  }
}

/** the output of the gate that is names and numbers: an output's `ok` line, the tier's line, the completeness line */
const NAME = '[A-Za-z0-9._-]+v\\d+-[A-Za-z-]+'
const CHECK = '(?:missing|twice|brackets|duplicated|clipped|groupsSplit|labelsSource|lostInk|numbers)'
const OK_LINE = new RegExp(`^ok   ${NAME}: \\d+ pages, \\d+/\\d+ text units drawn(?:, in \\d+ parts)? \\(\\d+(?:\\.\\d+)? s\\)$`)
const TIER_LINE = /^model tier: \d+ outputs, \d+ pages in \d+(?:\.\d+)? s on \d+ workers; the run in .+\.json$/
const COMPLETE_LINE = new RegExp(`^completeness \\(spec §5\\): (?:every one of \\d+ outputs passes|\\d+ of \\d+ outputs fail: ${NAME} \\[${CHECK}(?:, ${CHECK})*\\](?:; ${NAME} \\[${CHECK}(?:, ${CHECK})*\\])*)$`)
const FAIL_LINE = new RegExp(`^FAIL (${NAME})(?::|$)`)

/**
 * What of a line the gate prints may be echoed to a job log anyone can read, or null. The gate prints exception stacks, the
 * reason an output failed and what a check names, which can carry a unit's text. An output's `ok` line and the tier's and
 * completeness lines are names and numbers and pass as they are; a failure is cut after the output's name; the rest is held back
 * (the whole output is in a file of the runner that nothing uploads).
 */
export function publicLine(line) {
  if (OK_LINE.test(line) || TIER_LINE.test(line) || COMPLETE_LINE.test(line)) return line
  const fail = FAIL_LINE.exec(line)
  if (fail) return `FAIL ${fail[1]}`
  if (line.startsWith('FAIL requests that would have left the machine')) return 'FAIL requests that would have left the machine'
  return null
}

/** the gate run on one side; resolves with the run file it wrote. The gate exits 1 for a completeness count the merge rule
 *  decides, so only a missing run file is a failure here; whether the file is a whole run (nothing failed, every output of the
 *  pack in it) is `judge`'s to say, with the side's name. Its whole output goes to the file `log` (a file of the runner, never
 *  uploaded); the job log gets `publicLine`'s lines alone */
export function runGate(o) {
  const { args, env } = gateArgs(o)
  const log = resolve(o.log ?? join(tmpdir(), `rules-gate-${process.pid}-${basename(o.engine)}.log`))
  mkdirSync(dirname(log), { recursive: true })
  const sink = createWriteStream(log)
  return new Promise((ok, fail) => {
    const child = spawn(join(REPO, 'node_modules/.bin/tsx'), [join(here, 'layer-gate.mjs'), ...args], { cwd: REPO, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', pending = '', hidden = 0
    const echo = text => {
      const lines = (pending + text).split('\n')
      pending = lines.pop()
      for (const line of lines) { const shown = publicLine(line); if (shown === null) hidden++; else console.log(shown) }
    }
    child.stdout.on('data', d => { sink.write(d); out += d; echo(String(d)) })
    child.stderr.on('data', d => { sink.write(d); hidden += String(d).split('\n').filter(Boolean).length })
    child.on('error', fail)
    child.on('close', code => {
      echo('\n')
      sink.end()
      console.log(`(${hidden} more lines of the gate's output are in ${log}, which the job does not show)`)
      const file = /the run in (.+\.json)\s*$/m.exec(out)?.[1]
      if (!file || !existsSync(file)) return fail(new Error(`the gate wrote no run file (exit ${code}); its output is in ${log}`))
      if (o.out) copyFileSync(file, o.out)
      ok(o.out ?? file)
    })
  })
}

// ---------------------------------------------------------------- the engines the release lines run

/** the schema an engine's source declares (rules/layout.mjs), or null for one that predates the rule set */
export const schemaOf = source => { const m = /export const RULES_SCHEMA = (\d+)/.exec(source); return m ? Number(m[1]) : null }

/** the entries of lab/pdf/live-engines.json, checked: { name, ref } with a name to show and a git ref that is no option */
export function parseEngines(json) {
  const list = json?.engines
  if (json?.schema !== 1 || !Array.isArray(list)) throw new Error('live-engines.json: { schema: 1, engines: [...] } expected')
  return list.map((e, i) => {
    if (typeof e?.name !== 'string' || !/^[A-Za-z0-9._ -]{1,40}$/.test(e.name) || typeof e?.ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(e.ref)) throw new Error(`live-engines.json: engine ${i} wants a name and a git ref`)
    return { name: e.name, ref: e.ref }
  })
}

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 })

async function engines(argv) {
  const arg = n => option(argv, n)
  const list = parseEngines(JSON.parse(readFileSync(resolve(arg('list')), 'utf8')))
  if (!list.length) { console.log('no live engine is named in live-engines.json: nothing to check'); return 0 }
  const headFile = resolve(arg('head-rules')), pack = resolve(arg('pack')), out = resolve(arg('out') ?? 'rules-gate-engines')
  mkdirSync(out, { recursive: true })
  const head = await headEngine()
  const { set: headSet } = await head.readRules(new Uint8Array(readFileSync(headFile)))
  // (the pack the job verified is the committed manifest's: its outputs are what each run must hold)
  const outputs = outputsOfPack(readJson(typeof arg('pack-json') === 'string' ? resolve(arg('pack-json')) : join(REPO, 'lab/pdf/gate-pack.json')))
  const failures = []
  const work = join(tmpdir(), `rules-engines-${process.pid}`)
  for (const e of list) {
    const sha = git('rev-parse', '--verify', '--end-of-options', `${e.ref}^{commit}`).trim()
    let source = null
    try { source = git('show', `${sha}:${ENGINE}/rules/layout.mjs`) } catch { /* an engine before the rule set */ }
    const schema = source === null ? null : schemaOf(source)
    if (schema !== headSet.schema) { console.log(`skip ${e.name} (${e.ref}): ${schema === null ? 'it predates the rule set' : `RULES_SCHEMA ${schema}, head's is ${headSet.schema}`}`); continue }
    const dir = join(work, e.name.replace(/[^A-Za-z0-9._-]+/g, '-'))
    git('worktree', 'add', '--detach', dir, sha)
    try {
      symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
      // the set published for this engine: what a reader of its schema takes now; none yet, the engine's own built-in
      let published = join(dir, ENGINE, 'rules/layout-rules.json'), from = 'the built-in set (none is published)'
      if (arg('published')) {
        const url = `${arg('published').replace(/\/+$/, '')}/api/v1/rules/s${schema}`
        const res = await fetch(url, { headers: { 'user-agent': 'readarxiv-rules-ci' } })
        if (res.ok) { published = join(out, `${basename(dir)}-published.json`); writeFileSync(published, Buffer.from(await res.arrayBuffer())); from = 'the published set' }
        else if (res.status !== 404) throw new Error(`${url}: HTTP ${res.status}`)
      }
      console.log(`${e.name} (${e.ref}): head's set against ${from}`)
      const base = JSON.parse(readFileSync(await runGate({ engine: dir, rules: published, pack, log: join(out, `${basename(dir)}-base.log`) }), 'utf8'))
      const next = JSON.parse(readFileSync(await runGate({ engine: dir, rules: headFile, pack, log: join(out, `${basename(dir)}-head.log`) }), 'utf8'))
      const report = judge(base, next, { outputs })
      const md = commentOf(report, { headSha: git('rev-parse', 'HEAD').trim(), baseSha: sha, label: `engine ${e.name}` }).replace(MARK, `<!-- rules-gate engine ${basename(dir)} -->`)
      writeFileSync(join(out, `${basename(dir)}.md`), md)
      writeFileSync(join(out, `${basename(dir)}.json`), `${JSON.stringify(reportJson(report), null, 1)}\n`)
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
      if (!report.ok) failures.push(`${e.name} (${e.ref}): ${[...report.regressions.filter(r => !r.ruling).map(r => `${r.target} ${r.label}`), ...report.problems].join('; ')}`)
    } catch (err) {
      // an engine the gate could not run is a failure to name, not the end of the others
      failures.push(`${e.name} (${e.ref}): the gate did not run: ${String(err?.message ?? err).split('\n')[0].slice(0, 200)}`)
    } finally { git('worktree', 'remove', '--force', dir) }
  }
  rmSync(work, { recursive: true, force: true })
  for (const f of failures) console.log(`FAIL on engine ${f}`)
  return failures.length ? 1 : 0
}

// ---------------------------------------------------------------- the command line

const option = (argv, name) => { const a = argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
const options = (argv, name) => argv.filter(x => x.startsWith(`--${name}=`)).map(x => x.slice(name.length + 3))
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
/** the head engine's rule set module, read by the code that will ship */
const headEngine = (dir = join(REPO, ENGINE)) => import(pathToFileURL(join(dir, 'rules/layout.mjs')).href)

/** every string of the fixtures' translations in a pack's fixtures folder (record.json and units.json of each output) */
function packStrings(dir) {
  const out = new Set()
  for (const n of readdirSync(dir)) for (const f of ['record.json', 'units.json']) if (existsSync(join(dir, n, f))) for (const s of textsOf(readJson(join(dir, n, f)))) out.add(s)
  return out
}

async function compareCommand(argv) {
  const arg = n => option(argv, n)
  const base = readJson(resolve(arg('base'))), head = readJson(resolve(arg('head')))
  const out = resolve(arg('out') ?? 'rules-gate')
  const headSha = arg('head-sha') || head.engine?.commit, baseSha = arg('base-sha') || base.engine?.commit
  const rulings = [], bad = []
  for (const f of options(argv, 'ruling')) { try { rulings.push(parseRuling(readJson(resolve(f)), basename(f))) } catch (e) { bad.push(String(e?.message ?? e)) } }
  // the pack the runs are held to: a flag that names no file is a mistake, not a pack to do without
  if (typeof arg('pack') === 'string' && !existsSync(resolve(arg('pack')))) throw new Error('--pack: no such file')
  const pack = typeof arg('pack') === 'string' ? readJson(resolve(arg('pack'))) : null
  let report = judge(base, head, { rulings, outputs: pack ? outputsOfPack(pack) : null })
  if (bad.length) report = { ...report, ok: false, problems: [...report.problems, ...bad] }
  const meta = { base: { commit: baseSha, rules: base.inputs?.rules }, head: { commit: headSha, rules: head.inputs?.rules } }
  const engineDir = typeof arg('head-engine') === 'string' ? resolve(arg('head-engine')) : join(REPO, ENGINE)
  const E = await headEngine(engineDir)
  if (arg('base-rules') && arg('head-rules')) {
    const baseBytes = new Uint8Array(readFileSync(resolve(arg('base-rules')))), headBytes = new Uint8Array(readFileSync(resolve(arg('head-rules'))))
    report = withRulesFile(report, await checkRulesFile(baseBytes, headBytes, E))
    // the targets whose resolved rules the change touches: those a reviewer should expect to move
    const sets = []
    for (const bytes of [baseBytes, headBytes]) { try { sets.push((await E.readRules(bytes)).set) } catch { sets.push(null) } }
    // (a target's rules without the set's version, which moves for every one)
    const rulesOf = (set, t) => { const { version: _, ...rules } = E.resolveRules(set, t); return JSON.stringify(rules) }
    if (sets[0] && sets[1]) meta.changedTargets = E.TARGETS.filter(t => rulesOf(sets[0], t) !== rulesOf(sets[1], t))
  }
  const pipeline = /export const PIPELINE_VERSION = '([^']+)'/.exec(readFileSync(join(engineDir, 'versions.mjs'), 'utf8'))?.[1] ?? null
  meta.pack = pack
  const text = commentOf(report, { headSha, baseSha, pack, enginePipeline: pipeline, targets: E.TARGETS, changedTargets: meta.changedTargets, rulings, label: typeof arg('label') === 'string' ? arg('label') : undefined })
  const json = `${JSON.stringify(reportJson(report, meta), null, 1)}\n`
  mkdirSync(out, { recursive: true })
  // (the numbers first, so that a comment withheld below leaves them in the log; they are counts, labels and names the report was built from)
  for (const t of report.targets) console.log(`${t.target.padEnd(6)} ${String(t.outputs.length)} outputs: ${t.worse} worse, ${t.better} better`)
  for (const r of report.regressions) console.log(`  regression ${r.target} ${r.label}: ${r.from} -> ${r.to}${r.ruling ? ` (ruling ${r.ruling})` : ''}`)
  if (typeof arg('records') === 'string') {
    const strings = packStrings(resolve(arg('records'))), haystack = [...strings].join('\u0000')
    const free = rulings.flatMap(r => [r.by, r.on, r.quote, r.english, r.scope, r.why].filter(Boolean))
    const leaks = leaksIn(text + json, strings) + free.reduce((n, t) => n + fragmentsIn(t, haystack), 0)
    if (leaks) {
      writeFileSync(join(out, 'rules-gate.md'), `${MARK}\n## Rules gate: withheld\n\nThe comment held text of a paper and was not written. The numbers are in the job log.\n`)
      console.log(`FAIL the comment would carry ${leaks} string${leaks === 1 ? '' : 's'} of the fixtures' translations: withheld`)
      return 2
    }
  }
  writeFileSync(join(out, 'rules-gate.md'), text)
  writeFileSync(join(out, 'rules-gate.json'), json)
  for (const p of report.problems) console.log(`FAIL ${p}`)
  console.log(`${report.ok ? 'ok' : 'FAIL'}: ${report.pages.length} pages moved; ${join(out, 'rules-gate.md')}`)
  return report.ok ? 0 : 1
}

async function main(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'compare'
  const rest = argv.filter((x, i) => !(i === 0 && x === command))
  if (command === 'run') {
    const arg = n => option(rest, n)
    const file = await runGate({ engine: resolve(arg('engine')), rules: resolve(arg('rules')), pack: resolve(arg('pack')), out: typeof arg('out') === 'string' ? resolve(arg('out')) : undefined, log: typeof arg('log') === 'string' ? arg('log') : undefined, workers: arg('workers') ? Number(arg('workers')) : 4 })
    console.log(`RUN ${file}`)
    return 0
  }
  if (command === 'engines') return engines(rest)
  if (command === 'compare') return compareCommand(rest)
  throw new Error('usage: rules-gate.mjs run | compare | engines')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(String(e?.message ?? e)); process.exit(2) })
}
