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
import { mergeRecords } from './merge.mjs'
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
  console.error('usage: record.mjs sites|merge|agree …')
  process.exit(2)
}
