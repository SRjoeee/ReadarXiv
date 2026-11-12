#!/usr/bin/env node
// lab/rules/record.mjs: the rule ledger's commands (design-reduction-2026-11-13.md §3c, R4). Not shipped.
//
//   node lab/rules/record.mjs sites [--out=<dir>] [--web-profile=<file>]
//       the site map of this checkout (sites.mjs) into <dir>/sites.json (default lab/rules/out): every rule of the rule
//       areas with its sites, each module's edits; AFTER's rules marked (`after`) where the website's profile is given, as
//       the census reads it (lab/release-check/census.mjs cutoverOf); prints the agreement with the census's counts
//   node lab/rules/record.mjs merge <record dir>… [--sites=<sites.json>] [--out=<file>]
//       the raw records (recorder.mjs) summed into one recording (merge.mjs), and the agreement of what ran with the map
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
  console.error('usage: record.mjs sites|merge …')
  process.exit(2)
}
