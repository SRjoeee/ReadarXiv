// lab/release-check/text-order.mjs: invariant I8, the text layer of every laid page reads the translation in reading order, over
// every pair a run's rows hold (`<pair>.json`, a translate Result by unit id: the release check's reader-parts rows step). Each
// page of the pair's bundle laid by the reader's own typesetter as the reader lays it (layPage under the target's rules, the
// reader's default reading options, the target's hyphenation patterns, the served faces' Metrics measured in Node:
// lab/typeset/served-metrics.mjs); its text layer's reading made by the composer's text module without a browser and judged by
// the harness's I8 judge (packages/reader/e2e/text-order.mjs, whose reading harness-lab holds equal to the browser's):
//   node lab/release-check/text-order.mjs --bundles=<dir> --rows=<dir> --papers=<papers.tsv> [--seed=swap] [<pair>…]
// It needs the served faces (AXT_FACE_TABLES, AXT_FACE_SLICES) and the patterns (AXT_HYPH), lab data: without them it says so
// and exits 2. One line a pair; the totals; every member missing or out of order, one a line; exit 1 where there is one.
// `--seed=swap`: the check's own fault, the first and the last translated item of each laid page's reading swapped (red). Not
// shipped.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundleOf, membersOfParts, orderOf, pdfjsNode, readingOf } from '../../packages/reader/e2e/text-order.mjs'

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
  const BUNDLES = arg('bundles'),
    ROWS = arg('rows'),
    PAPERS = arg('papers'),
    SEED = arg('seed')
  if (!BUNDLES || !ROWS || !PAPERS) {
    console.error('lab/release-check/text-order.mjs --bundles=<dir> --rows=<dir> --papers=<papers.tsv> [--seed=swap] [<pair>…]')
    process.exit(2)
  }
  const { hasServed, servedMetrics } = await import('../typeset/served-metrics.mjs')
  const HYPH = process.env.AXT_HYPH ?? null
  if (!hasServed || !HYPH || !existsSync(HYPH)) {
    console.log(`text-order: no served faces or patterns (AXT_FACE_TABLES, AXT_FACE_SLICES, AXT_HYPH): nothing read`)
    process.exit(2)
  }
  const { layPage, rulesFor, hyphenationOf } = await import('../../packages/typeset/src/index.ts')
  const { ruleTag } = await import('../../packages/reader/src/compose/typeset.ts')
  const { leftKinds } = await import('../../packages/reader/src/compose/classes.ts')
  const metrics = servedMetrics()
  const measure = (s, family, size) => {
    try {
      return metrics.advance(`100px ${family}`, size, s)
    } catch {
      return 0.5 * size * [...s].length
    }
  }
  const { lib, options } = await pdfjsNode()
  const dirs = new Map(
    readFileSync(PAPERS, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t')),
  )
  const named = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const pairs = named.length
    ? named
    : readdirSync(ROWS)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
  const LANG = { zh: 'zh-Hans', 'zh-TW': 'zh-Hant' }
  const hyphs = new Map()
  const patterns = (lang) => {
    if (!hyphs.has(lang)) {
      const f = join(HYPH, `${lang}.json`)
      const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
      hyphs.set(lang, v ? hyphenationOf({ patterns: v.patterns ?? [], exceptions: v.exceptions ?? [] }) : null)
    }
    return hyphs.get(lang)
  }
  const t0 = performance.now()
  const total = { pairs: 0, pages: 0, laidPages: 0, members: 0, runs: 0, missing: [], outOfOrder: [], unread: [] }
  for (const pair of pairs) {
    const paper = pair.replace(/-[a-z]{2,3}(-[A-Z]{2})?$/, '')
    const code = pair.slice(paper.length + 1)
    const tag = ruleTag(LANG[code] ?? code)
    const bdir = join(BUNDLES, paper)
    if (!tag || !existsSync(join(bdir, 'head.json')) || !dirs.has(paper)) {
      total.unread.push(`${pair}: ${!tag ? 'no rule set' : !dirs.has(paper) ? 'no paper in the list' : 'no bundle'}`)
      continue
    }
    total.pairs++
    const b = bundleOf(bdir)
    const members = membersOfParts(b.parts)
    const results = JSON.parse(readFileSync(join(ROWS, `${pair}.json`), 'utf8')).results
    const byId = new Map(results.map((r) => [r.id, r]))
    const rows = { get: (id) => byId.get(id), done: true, kept: (id) => b.kept.has(id) }
    const hyph = {}
    for (const l of rulesFor(tag).patterns) hyph[l] = patterns(l)
    const rules = rulesFor(tag, { leave: leftKinds(null) }, hyph)
    const A = readFileSync(join(dirs.get(paper), 'arxiv.pdf'))
    const W = new Uint8Array(b.addOn ? Buffer.concat([A, b.addOn]) : A)
    const task = lib.getDocument({ ...options, data: W })
    const doc = await task.promise
    const line = { pages: 0, laid: 0, members: 0, missing: [], outOfOrder: [] }
    try {
      for (const [n, part] of b.parts) {
        line.pages++
        const page = layPage(part, rows, rules, metrics)
        if (!page.members.some((m) => m.state === 'laid' && m.off)) continue
        line.laid++
        const pdfPage = await doc.getPage(n)
        const content = await pdfPage.getTextContent({ includeMarkedContent: true })
        pdfPage.cleanup()
        const r = await readingOf(content, page, members, measure)
        if (SEED === 'swap') {
          const [a, z] = [r.translated[0], r.translated.at(-1)]
          if (a !== undefined && z !== undefined && a !== z) [r.leaves[a], r.leaves[z]] = [r.leaves[z], r.leaves[a]]
        }
        const j = orderOf(r.leaves, page, members, content.items)
        line.members += j.members
        total.runs += j.runs
        for (const o of j.missingAll) line.missing.push(`p${n} ord ${o}`)
        for (const o of j.outOfOrderAll) line.outOfOrder.push(`p${n} ord ${o}`)
      }
    } finally {
      await task.destroy()
    }
    total.pages += line.pages
    total.laidPages += line.laid
    total.members += line.members
    total.missing.push(...line.missing.map((x) => `${pair} ${x}`))
    total.outOfOrder.push(...line.outOfOrder.map((x) => `${pair} ${x}`))
    console.log(
      `${pair}: ${line.laid} of ${line.pages} pages laid, ${line.members} members read; missing ${line.missing.length ? line.missing.join(', ') : 0}; out of order ${line.outOfOrder.length ? line.outOfOrder.join(', ') : 0}`,
    )
  }
  const ms = Math.round(performance.now() - t0)
  if (total.unread.length) console.log(`not read: ${total.unread.join('; ')}`)
  console.log(
    `I8 over the run's bundles: ${total.pairs} pairs, ${total.laidPages} laid pages of ${total.pages}, ${total.members} members (${total.runs} runs) read; missing ${total.missing.length}, out of order ${total.outOfOrder.length}; ${ms} ms${SEED ? ` (seeded: ${SEED})` : ''}`,
  )
  // (every member listed, one a line: the gate's judge holds each out-of-order member to its record, lab/release-check/text-order.json)
  for (const x of [...total.missing.map((m) => `missing ${m}`), ...total.outOfOrder.map((m) => `out of order ${m}`)]) console.log(`  ${x}`)
  process.exit(total.missing.length || total.outOfOrder.length ? 1 : 0)
}

await main()
