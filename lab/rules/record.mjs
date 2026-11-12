#!/usr/bin/env node
// lab/rules/record.mjs: the rule ledger's commands (design-reduction-2026-11-13.md §3c, R4). Not shipped.
//
//   node lab/rules/record.mjs sites [--out=<dir>] [--web-profile=<file>]
//       the site map of this checkout (sites.mjs) into <dir>/sites.json (default lab/rules/out): every rule of the rule
//       areas with its sites, each module's edits; AFTER's rules marked (`after`) where the website's profile is given, as
//       the census reads it (lab/release-check/census.mjs cutoverOf); prints the agreement with the census's counts
//   node lab/rules/record.mjs merge <record dir>… [--sites=<sites.json>] [--out=<file>]
//       the raw records (recorder.mjs) summed into one recording (merge.mjs), and the agreement of what ran with the map
//   node lab/rules/record.mjs agree --census=<census.json> --sites=<sites.json> [--recording=<recording.json>]
//       the census's AFTER headline items (its tuned thresholds and name lists) matched one by one to the map's rules (by
//       file, line, form and value or name): what one holds and the other lacks; the rules with no site and why; with a
//       recording, the rules that ran, by area (areas.mjs)
//   node lab/rules/record.mjs ledger --sites=<sites.json> --recording=<recording.json> [--out=lab/rules/ledger.json]
//       the ledger (ledger.mjs): every rule's row, its sites' states, its verdict
//   node lab/rules/record.mjs report --ledger=<ledger.json> [--census=<census.json>] [--out=<dir>] [--deferred=a,b]
//                                    [--profile="<what the inputs were>"]
//       the report by area and by file (report.mjs) into <dir>/report.md and report-by-file.md
//   node lab/rules/record.mjs remap --from=<old sites.json or ledger.json> --to=<new sites.json> [--out=<remap.json>]
//       old keys matched to new where code moved between functions or files: by signature, value and ordinal; every key
//       it cannot follow printed. A recording is never re-keyed by it: a moved tree is recorded again
//
// A recording run: AXT_RULES_SITES=<dir>/sites.json AXT_RULES_OUT=<records> node --import ./lab/rules/register.mjs
// [--import tsx] <runner> …; the tests: AXT_RULES_SITES=… AXT_RULES_OUT=… pnpm exec vitest run --config
// lab/rules/vitest.config.mts. Exit 0 done, 2 usage.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { graphOf, scanTree } from '../release-check/census-lib.mjs'
import { ENGINE_PROFILE } from '../release-check/census-profile.mjs'
import { cutoverOf } from '../release-check/census.mjs'
import { AREAS, areaOf } from './areas.mjs'
import { ledgerOf } from './ledger.mjs'
import { mergeRecords } from './merge.mjs'
import { reportOf } from './report.mjs'
import { RULE_AREAS, siteMapOf, sitesOf } from './sites.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** the site map of a checkout; with the website's profile, AFTER's rules marked by the census's own cut-over */
export function siteMapOfCheckout(root, { webProfile = null } = {}) {
  const inArea = p => ENGINE_PROFILE.areas.find(a => p.startsWith(a.prefix))
  const engine = scanTree('engine', root, ENGINE_PROFILE, { tokens: true, nodes: p => RULE_AREAS.includes(inArea(p)?.area) && inArea(p)?.role === 'product' })
  const scans = [engine]
  if (webProfile?.now && existsSync(webProfile.now)) scans.push(scanTree('web', webProfile.now, webProfile, { tokens: false }))
  const graph = graphOf(scans)
  let alive = null
  if (scans.length === 2) {
    const cut = cutoverOf(scans, graph)
    alive = new Set(scans.flatMap(s => [...s.files.keys()].map(p => `${s.repo}:${p}`)).filter(id => !cut.deleted.has(id) && !cut.goWith.has(id)))
  }
  let commit = null
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {}
  return siteMapOf(sitesOf(engine, graph, { alive }), { commit })
}

/** the counts a site map holds beside the census's: rules by kind and area, AFTER's headline (the census's debt areas) */
export function countsOf(map) {
  const rules = Object.values(map.rules)
  const headline = r => r.area !== 'pkg:translate' && r.after !== false
  const by = (xs, k) => xs.reduce((o, x) => ((o[k(x)] = (o[k(x)] ?? 0) + 1), o), {})
  return {
    rules: rules.length,
    thresholdsTuned: rules.filter(r => r.kind === 'threshold' && r.class === 'tuned' && headline(r)).length,
    lists: rules.filter(r => r.kind === 'list' && headline(r)).length,
    byArea: by(rules, r => `${r.area} ${r.kind}${r.kind === 'threshold' ? ` ${r.class}` : ''}${r.after === false ? ' (cut)' : ''}`),
    sites: map.sites.length,
    sitesByKind: by(map.sites, s => s.kind),
    noSite: rules.filter(r => !r.sites.length).map(r => `${r.key}${r.unsited ? ` (${r.unsited})` : r.wholeReads ? ' (its table read whole)' : ''}`),
    onlyReads: rules.filter(r => r.sites.length && r.sites.every(id => map.sites[id].kind === 'val')).length,
    files: Object.keys(map.files).length,
  }
}

/** the census's AFTER headline items against the map's rules, one by one; with a recording, what ran by area */
export function agreementOf(census, map, recording = null) {
  const T = census.trees.AFTER.debt
  const keyT = x => `${x.file}:${x.line}:${x.context}:${x.context === 'constant' || x.context === 'table' ? x.name : x.raw}`
  const keyL = x => `${x.file}:${x.line}:${x.form}:${x.size}`
  const bag = keys => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map())
  const less = (a, b) => [...a].flatMap(([k, n]) => Array(Math.max(0, n - (b.get(k) ?? 0))).fill(k))
  const censusT = bag(T.thresholds.list.filter(t => t.headline && t.class === 'tuned').map(keyT))
  const censusL = bag(T.lists.list.filter(l => l.headline).map(keyL))
  const headline = r => r.after !== false && r.area !== 'pkg:translate'
  const rules = Object.values(map.rules)
  const mapT = bag(rules.filter(r => r.kind === 'threshold' && r.class === 'tuned' && headline(r)).map(keyT))
  const mapL = bag(rules.filter(r => r.kind === 'list' && headline(r)).map(keyL))
  const kept = rules.filter(r => headline(r) && (r.kind === 'list' || r.class === 'tuned'))
  const ran = r => recording && Object.keys(recording.rules[r.key] ?? {}).length > 0
  const decides = r => r.sites.some(id => map.sites[id].kind !== 'val')
  const byArea = {}
  for (const r of kept) {
    const a = (byArea[areaOf(r.file)] ??= { thresholds: 0, lists: 0, noSite: 0, readsOnly: 0, ran: 0, ranThresholds: 0, ranLists: 0 })
    a[r.kind === 'list' ? 'lists' : 'thresholds']++
    if (!r.sites.length) a.noSite++
    else if (!decides(r)) a.readsOnly++
    if (ran(r)) {
      a.ran++
      a[r.kind === 'list' ? 'ranLists' : 'ranThresholds']++
    }
  }
  return {
    census: { thresholds: [...censusT.values()].reduce((a, b) => a + b, 0), lists: [...censusL.values()].reduce((a, b) => a + b, 0) },
    map: { thresholds: [...mapT.values()].reduce((a, b) => a + b, 0), lists: [...mapL.values()].reduce((a, b) => a + b, 0) },
    onlyCensus: [...less(censusT, mapT), ...less(censusL, mapL)],
    onlyMap: [...less(mapT, censusT), ...less(mapL, censusL)],
    noSite: kept.filter(r => !r.sites.length).map(r => ({ key: r.key, line: r.line, why: r.unsited ?? (r.wholeReads ? `its table read whole at ${r.wholeReads} place(s): its entries' decisions are made where it is handed` : 'read nowhere') })),
    readsOnly: kept.filter(r => r.sites.length && !decides(r)).length,
    byArea,
    ran: recording ? kept.filter(ran).length : null,
    rules: kept.length,
  }
}

/** old keys to new (P4): a key kept where its rule is the same rule (its value, or its entries); else, among the keys
 *  neither side kept, in turn: the same function, signature and ordinal in another file (`function`); the same signature
 *  and ordinal (`ordinal`); for a comparison, the same signature and the same text of its other operand (`operand`). Each
 *  stage pairs a key only where what it reads is one key on each side: what is left is printed, never guessed */
export function remapOf(from, to) {
  const partsOf = k => {
    const [, fn, ...rest] = k.split('::')
    const sig = rest.join('::')
    return { fn, sig: sig.replace(/#\d+$/, ''), ord: /#(\d+)$/.exec(sig)?.[1] ?? '0' }
  }
  const idOf = r => JSON.stringify([r.kind, r.kind === 'list' ? r.entries : r.value])
  let kept = 0
  const oldLeft = new Set()
  const newLeft = new Set(Object.keys(to.rules))
  for (const [k, r] of Object.entries(from.rules)) {
    if (to.rules[k] && idOf(to.rules[k]) === idOf(r)) {
      kept++
      newLeft.delete(k)
    } else oldLeft.add(k)
  }
  const STAGES = [
    ['function', (k, r) => [partsOf(k).fn, partsOf(k).sig, partsOf(k).ord, idOf(r)].join('\u0000')],
    ['ordinal', (k, r) => [partsOf(k).sig, partsOf(k).ord, idOf(r)].join('\u0000')],
    ['operand', (k, r) => (r.other ? [partsOf(k).sig, idOf(r), r.other].join('\u0000') : null)],
  ]
  const moved = {}
  const how = {}
  for (const [stage, read] of STAGES) {
    const index = (keys, rules) => {
      const m = new Map()
      for (const k of keys) {
        const x = read(k, rules[k])
        if (x != null) m.set(x, [...(m.get(x) ?? []), k])
      }
      return m
    }
    const olds = index(oldLeft, from.rules)
    const news = index(newLeft, to.rules)
    for (const [x, os] of olds) {
      const ns = news.get(x)
      if (os.length !== 1 || ns?.length !== 1) continue
      moved[os[0]] = ns[0]
      how[os[0]] = stage
      oldLeft.delete(os[0])
      newLeft.delete(ns[0])
    }
  }
  return { kept, moved, how, unmatched: { old: [...oldLeft].sort(), new: [...newLeft].sort() } }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  const opt = n => rest.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
  const labData = process.env.AXT_LAB_DATA ?? join(homedir(), 'Developer', 'readarxiv-lab-data')
  if (cmd === 'sites') {
    const out = resolve(opt('out') ?? join(ROOT, 'lab/rules/out'))
    const profileFile = opt('web-profile') ?? join(labData, 'refactor-2026-11', 'verification', 'census-web.json')
    const webProfile = existsSync(profileFile) ? JSON.parse(readFileSync(profileFile, 'utf8')) : null
    const t0 = performance.now()
    const map = siteMapOfCheckout(resolve(opt('root') ?? ROOT), { webProfile })
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'sites.json'), JSON.stringify(map))
    const c = countsOf(map)
    console.log(`rules: sites.json at ${map.commit ?? '?'} (digest ${map.digest}), ${Math.round(performance.now() - t0)} ms: ${c.rules} rules, ${c.sites} sites in ${c.files} modules${webProfile ? '' : " (no website profile: AFTER's rules not told from the cut-over's)"}`)
    console.log(`rules: the census's AFTER headline as the map reads it: tuned thresholds ${c.thresholdsTuned}, lists ${c.lists}`)
    console.log(`rules: sites by kind ${JSON.stringify(c.sitesByKind)}; rules read only as values ${c.onlyReads}; rules with no site ${c.noSite.length}`)
    console.log(`rules: by area ${JSON.stringify(c.byArea)}`)
    for (const k of c.noSite) console.log(`rules: no site: ${k}`)
    process.exit(0)
  }
  if (cmd === 'merge') {
    const dirs = rest.filter(a => !a.startsWith('--'))
    const sitesFile = opt('sites') ?? process.env.AXT_RULES_SITES
    if (!dirs.length || !sitesFile) {
      console.error('usage: record.mjs merge <record dir>… --sites=<sites.json> [--out=<file>]')
      process.exit(2)
    }
    const map = JSON.parse(readFileSync(sitesFile, 'utf8'))
    const rec = mergeRecords(map, dirs)
    const out = opt('out') ?? join(dirs[0], 'recording.json')
    writeFileSync(out, JSON.stringify(rec, null, 1))
    console.log(`rules: ${rec.records} records merged into ${out}: ${rec.agreement.line}`)
    process.exit(0)
  }
  if (cmd === 'agree') {
    const census = JSON.parse(readFileSync(opt('census') ?? join(ROOT, 'lab/release-check/out/census/census.json'), 'utf8'))
    const map = JSON.parse(readFileSync(opt('sites') ?? process.env.AXT_RULES_SITES, 'utf8'))
    const recording = opt('recording') ? JSON.parse(readFileSync(opt('recording'), 'utf8')) : null
    const a = agreementOf(census, map, recording)
    console.log(`rules: the census's AFTER headline ${a.census.thresholds} tuned thresholds, ${a.census.lists} lists; the map's ${a.map.thresholds}, ${a.map.lists}; in the census alone ${a.onlyCensus.length}, in the map alone ${a.onlyMap.length}`)
    for (const k of a.onlyCensus) console.log(`rules: in the census alone: ${k}`)
    for (const k of a.onlyMap) console.log(`rules: in the map alone: ${k}`)
    console.log(`rules: of the ${a.rules}, ${a.noSite.length} have no site, ${a.readsOnly} are only read as values (no outcome to record)${a.ran != null ? `; ${a.ran} ran in this recording` : ''}`)
    for (const r of a.noSite) console.log(`rules: no site: ${r.key} (line ${r.line}): ${r.why}`)
    for (const area of [...AREAS.map(x => x.id), 'other']) {
      const x = a.byArea[area]
      if (x) console.log(`rules: area ${area}: ${x.thresholds} thresholds, ${x.lists} lists; no site ${x.noSite}, read only as values ${x.readsOnly}${a.ran != null ? `; ran ${x.ran} (${x.ranThresholds} thresholds, ${x.ranLists} lists)` : ''}`)
    }
    process.exit(0)
  }
  if (cmd === 'ledger') {
    const map = JSON.parse(readFileSync(opt('sites') ?? process.env.AXT_RULES_SITES, 'utf8'))
    const recording = JSON.parse(readFileSync(opt('recording'), 'utf8'))
    if (recording.map !== map.digest) {
      console.error(`rules: the recording was made over the site map ${recording.map}, not ${map.digest}`)
      process.exit(2)
    }
    const ledger = ledgerOf(map, recording)
    const out = opt('out') ?? join(ROOT, 'lab/rules/ledger.json')
    writeFileSync(out, `${JSON.stringify(ledger, null, 1)}\n`)
    const by = {}
    for (const r of Object.values(ledger.rules)) by[r.verdict] = (by[r.verdict] ?? 0) + 1
    console.log(`rules: the ledger of ${Object.keys(ledger.rules).length} rules into ${out}: ${JSON.stringify(by)}`)
    process.exit(0)
  }
  if (cmd === 'report') {
    const ledger = JSON.parse(readFileSync(opt('ledger') ?? join(ROOT, 'lab/rules/ledger.json'), 'utf8'))
    const census = opt('census') ? JSON.parse(readFileSync(opt('census'), 'utf8')) : null
    const out = resolve(opt('out') ?? join(ROOT, 'lab/rules/out'))
    const r = reportOf(ledger, { budgets: census?.trees.AFTER.debt.thresholds.list ?? null, profile: opt('profile'), deferred: opt('deferred')?.split(',') ?? [] })
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'report.md'), r.byArea)
    writeFileSync(join(out, 'report-by-file.md'), r.byFile)
    for (const [a, c] of Object.entries(r.counts)) if (c.rules) console.log(`rules: area ${a}: ${c.rules} rules, ${JSON.stringify(c.verdicts)}, sites to fold ${c.folds}, entries to remove ${c.entries}`)
    console.log(`rules: ${join(out, 'report.md')}, ${join(out, 'report-by-file.md')}`)
    process.exit(0)
  }
  if (cmd === 'remap') {
    const from = JSON.parse(readFileSync(opt('from'), 'utf8'))
    const to = JSON.parse(readFileSync(opt('to'), 'utf8'))
    const m = remapOf(from, to)
    if (opt('out')) writeFileSync(opt('out'), `${JSON.stringify(m, null, 1)}\n`)
    const byStage = Object.values(m.how).reduce((o, s) => ((o[s] = (o[s] ?? 0) + 1), o), {})
    console.log(`rules: ${m.kept} keys kept, ${Object.keys(m.moved).length} followed across a move (${Object.entries(byStage).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}), ${m.unmatched.old.length} old and ${m.unmatched.new.length} new not matched`)
    for (const [o, n] of Object.entries(m.moved)) console.log(`rules: moved (${m.how[o]}): ${o} -> ${n}`)
    for (const k of m.unmatched.old) console.log(`rules: not followed (old): ${k}`)
    for (const k of m.unmatched.new) console.log(`rules: not followed (new): ${k}`)
    process.exit(m.unmatched.old.length ? 1 : 0)
  }
  console.error('usage: record.mjs sites|merge|agree|ledger|report|remap …')
  process.exit(2)
}
