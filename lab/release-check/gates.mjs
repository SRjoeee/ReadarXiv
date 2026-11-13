// lab/release-check/gates.mjs: what `pnpm release-check` runs and how it reads each gate (design §4.9): the invariants I1 to
// I10 and the migration's differential, the targets of §7, and every gate that exists, each as it exists: its command, the
// inputs it reads from outside the repository, the tier it first runs in, the invariants it holds and how its output is
// read. Nothing here is a new gate: a gate's pass is its own (its exit code, or the counts its own output states against the
// bound its own header names), and an invariant no gate holds is said so (`gap`). Not shipped.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CACHE as SWEEP_CACHE } from '../../packages/typeset/tests/replay/today.ts'
import { ADDED, ADDED_HEADING } from '../typeset/added.mjs'
import { PAIRS as PARITY_PAIRS } from '../typeset/parity/pairs.mjs'
import { SLICES, TABLES } from '../typeset/served-metrics.mjs'
import { perfOf } from './perf.mjs'

/** the tiers, each holding the gates of the ones before it (lab/release-check/CI.md says where each runs) */
export const TIERS = ['fast', 'full', 'release']

/** design §4.9's tiers, the order the gates run in */
export const STAGES = ['unit', 'pipeline', 'reader', 'platform', 'box', 'corpus']

/** design §4.9's invariants, and the migration's differential; `gap`: what no gate of either repository holds today */
export const INVARIANTS = [
  {
    id: 'I1',
    says: "all groups on, the composed page paints what arXiv's page paints, glyph for glyph, box for box and pixel for pixel (in the reader's canvas, up to the split show's residue)",
    gap: "the composed page in the reader is held on the harness's own fixtures only; on corpus papers the harness measures its residue and holds nothing, and the canvas gate (the release tier's) passed in lane L1 only with a stand-in (`--normalize`) for a reader change not built",
  },
  {
    id: 'I2',
    says: 'a group off hides exactly its ink, rules and images included; no pixel outside that ink changes',
    gap: 'no check of a group turned off in the reader; the prepare proves it in PDF.js and Cairo only',
  },
  { id: 'I3', says: "a laid unit's ink stays inside its regions and room and overlaps no other ink", gap: null },
  { id: 'I4', says: 'every element of a laid unit appears exactly once', gap: null },
  {
    id: 'I5',
    says: 'no line wider than its frame beyond the stated tolerance; no unit set under the size floor',
    gap: 'the runners count the restated form (a closing mark\'s blank half and an overfull line with nothing to shrink set apart); no gate counts the size floor',
  },
  {
    id: 'I6',
    says: 'the same inputs give the same bytes (prepare) and the same display list (typesetting on table metrics)',
    gap: 'a page laid twice gives the same display list on one pair alone (`purity.test.ts`, with lab data); over the corpus only a unit as every page\'s lay that runs its first page\'s fill lays it (`sentence-cover`)',
  },
  {
    id: 'I7',
    says: "a unit's boxes on the left and on the right are the same boxes",
    gap: "no gate: the harness holds the slots' page boxes at five scales and the highlight lighting one unit on both panes, not a unit's boxes",
  },
  {
    id: 'I8',
    says: 'the text layer of a laid page reads the translation in reading order',
    gap: 'held on the fixtures and five corpus papers (the harness; the website\'s e2e on fixtures); not on the corpus',
  },
  {
    id: 'I9',
    says: 'the box refuses each escape of the security suite, passes its canary and has no network',
    gap: 'the security suite has run under emulation only; three of its cases hold as written on native amd64 alone',
  },
  {
    id: 'I10',
    says: 'on both panes every piece drawn of a lit unit (its text, its elements, its label) is in exactly one of its sentences, and the panes have the same sentences',
    gap: "counted over the corpus's laid pages with today's rows (`sentence-cover`: the typesetter's runner, its entry over the reading from the part) and the parity's pairs as the reader lays them (`display`); not over the website's own rows, which only staging holds",
  },
  {
    id: 'D',
    says: "the migration's differential: no unit drawn or laid at the frozen baseline is lost, but for the acceptance list",
    gap: null,
  },
]

/** a performance row met: every measure named has NEW's value and reads equal or better (perf.mjs compare); null where none
 *  of them was measured; a measure missing or worse misses it */
const okOf = (n, ...ids) => {
  const rows = ids.map((k) => n.m?.[k]).filter(Boolean)
  if (!rows.length) return null
  return rows.length === ids.length && rows.every((x) => Number.isFinite(x[0]) && (x[2] === 'equal' || x[2] === 'better'))
}

/** design §7's rows; `from`: the gate whose numbers give the value, read by `value(numbers)`; none: not measured, `why` */
export const TARGETS = [
  { id: 'prepare', measure: 'Prepare, median on staging (n ≥ 90)', baseline: '33.6 s', target: 'under 20 s', from: 'private-soak', why: "staging's prepare records (the private repository's; the lab's perf/tools/staging.mjs measures it after a staging deploy)" },
  // (the performance rows below read perf-batch (NEW against the last round) and perf-release (NEW against TODAY, every measure
  // on the same papers and the same stored translation, each measured by one instrument on both sides): `m` holds each measure
  // as [NEW, TODAY or the last round, the reading], perf.mjs MEASURES names them)
  {
    id: 'prepare-box',
    measure: "Prepare in the box on the owner's machine (amd64 under emulation, one CPU, 3 GiB), median over the papers",
    baseline: "TODAY's, the same papers and the same machine",
    target: 'not slower than TODAY past the spread',
    from: 'perf-release',
    value: (n) => n.m?.prepareWall && `${n.m.prepareWall[0]} s against TODAY's ${n.m.prepareWall[1]} s (${n.m.prepareWall[2]}); CPU ${n.m.prepareCpu?.[0]} against ${n.m.prepareCpu?.[1]} s; memory peak ${n.m.prepareMem?.[0]} against ${n.m.prepareMem?.[1]} MiB`,
    met: (n) => okOf(n, 'prepareWall'),
  },
  {
    id: 'tex-runs',
    measure: 'TeX runs a paper',
    baseline: '4 compiles, 5 passes',
    target: "the paper's own passes; no final pass",
    from: 'perf-release',
    value: (n) => n.m?.passes && `${n.m.compiles?.[0]} compiles, ${n.m.passes[0]} passes over the papers against TODAY's ${n.m.compiles?.[1]}, ${n.m.passes[1]} (counted in the box: each jail run, each TeX engine process)`,
    met: (n) => (n.m?.passes && Number.isFinite(n.m.passes[0]) && Number.isFinite(n.m.passes[1]) ? n.m.passes[0] < n.m.passes[1] : null),
  },
  {
    id: 'reprepare',
    measure: 'A new prepare after an engine change that keeps the marks',
    baseline: '33.6 s',
    target: 'under 6 s, no TeX',
    from: 'perf-release',
    value: (n) => n.reprepared > 0 && `${n.reprepareS} s median, ${n.reprepareTex} TeX passes, ${n.reprepared} papers: NEW's box given its stored instrument (emulated amd64, one CPU); TODAY prepares whole again`,
    met: (n) => (n.reprepared > 0 && Number.isFinite(n.reprepareS) ? n.reprepareS < 6 && n.reprepareTex === 0 : null),
  },
  { id: 'reuse', measure: 'Translation after an engine change', baseline: 'every language of every paper again', target: 'changed units only', from: null, why: 'no gate measures the rows\' reuse rate after an engine change' },
  {
    id: 'units',
    measure: 'Units drawn on the 87 papers',
    baseline: '27,150 source, 2,668 ink',
    target: 'not fewer, but for the acceptance list; gains listed',
    from: 'prepare-diff',
    value: n => n.source != null && `${n.source} source, ${n.ink} ink, ${n.figures} figure texts drawn; lost ${n.lost} (+${n.accepted} accepted), gained ${n.gained}`,
    met: n => n.lost === 0,
  },
  { id: 'refused', measure: 'Papers refused whole for a page box or page count', baseline: '1 of 87', target: '0', from: 'prepare', value: n => n.refusedWhole != null && `${n.refusedWhole} of ${n.papers}`, met: n => n.refusedWhole === 0 },
  {
    id: 'layout',
    measure: "A page's layout, p50 / p95",
    baseline: '21.8 / 52.7 ms',
    target: 'under 10 / 30 ms',
    from: 'reader-parts',
    value: n => n.layP50 != null && `p50 ${n.layP50}, p90 ${n.layP90}, p99 ${n.layP99} ms over ${n.layPages} pages: the entry's layPage over each part and the door's rows (the runner prints no p95)`,
    // (no p95 printed: under 30 where the p99 is; over it where the p90 is; else the numbers cannot tell)
    met: n => (n.layP50 >= 10 || n.layP90 >= 30 ? false : n.layP99 < 30 ? true : null),
  },
  {
    id: 'commit',
    measure: "A page's commit at 1×, p50",
    baseline: '42 ms',
    target: 'under 20 ms',
    from: 'perf-batch',
    value: (n) => n.m?.commitP50 && `${n.m.commitP50[0]} ms, p90 ${n.m.commitP90?.[0]} ms: the main-thread task that put a page's translated drawing in and the rendering task that painted it, read off a Chrome trace, every page of three papers scrolled (the last round ${n.m.commitP50[1]} ms: ${n.m.commitP50[2]})`,
    met: (n) => (n.m?.commitP50 && Number.isFinite(n.m.commitP50[0]) ? n.m.commitP50[0] < 20 : null),
  },
  {
    id: 'switch',
    measure: 'Switching language',
    baseline: 'every page read again',
    target: 'rows and layout only',
    from: 'perf-release',
    value: (n) => n.m?.switchAgain && `${n.m.switchAgain[0]} layer objects asked again (TODAY ${n.m.switchAgain[1]}); the first page in the new language ${n.m.switchMs?.[0]} ms after the switch (TODAY ${n.m.switchMs?.[1]} ms)`,
    met: (n) => (n.m?.switchAgain && Number.isFinite(n.m.switchAgain[0]) ? n.m.switchAgain[0] === 0 : null),
  },
  {
    id: 'first-page',
    measure: 'The first translated page drawn, from the navigation, median over the papers',
    baseline: "TODAY's, the same papers, the same stored data, offline",
    target: 'not slower than TODAY past the spread',
    from: 'perf-release',
    value: (n) => n.m?.first && `${n.m.first[0]} ms against TODAY's ${n.m.first[1]} ms (${n.m.first[2]})`,
    met: (n) => okOf(n, 'first'),
  },
  {
    id: 'reader-bytes',
    measure: "The paper's data a reader downloads to see page 1, and the reader page's script and worker bytes",
    baseline: "TODAY's, the same papers",
    target: 'not more than TODAY past the spread',
    from: 'perf-release',
    value: (n) => n.m?.page1Data && `page 1 ${n.m.page1Data[0]} against ${n.m.page1Data[1]} bytes (${n.m.page1Data[2]}); the whole paper ${n.m.wholeData?.[0]} against ${n.m.wholeData?.[1]} (${n.m.wholeData?.[2]}); code ${n.m.codeBytes?.[0]} against ${n.m.codeBytes?.[1]} (${n.m.codeBytes?.[2]})`,
    met: (n) => okOf(n, 'page1Data', 'wholeData', 'codeBytes'),
  },
  {
    id: 'reader-smooth',
    measure: 'Scrolling the whole paper: long tasks and frames over budget; memory after',
    baseline: "TODAY's, the same papers",
    target: 'not worse than TODAY past the spread',
    from: 'perf-release',
    value: (n) => n.m?.longTasks && `long tasks ${n.m.longTasks[0]} against ${n.m.longTasks[1]} (${n.m.longTasks[2]}), the longest ${n.m.longestTask?.[0]} against ${n.m.longestTask?.[1]} ms; frames over budget ${n.m.framesOver?.[0]} against ${n.m.framesOver?.[1]} per 1,000; JS heap ${n.m.heap?.[0]} against ${n.m.heap?.[1]} MiB; canvases ${n.m.canvas?.[0]} against ${n.m.canvas?.[1]} MiB`,
    met: (n) => okOf(n, 'longTasks', 'longestTask', 'framesOver', 'heap', 'renderer', 'gpu'),
  },
  // (the census rows: lab/release-check/census.mjs, its definitions there; each value is TODAY → NOW → AFTER, AFTER being this
  // tree less what the cut-over deletes, found on the import graph; the website's numbers where its tree is given)
  {
    id: 'thresholds',
    measure: 'Geometric thresholds and name tables in the prepare (the census: tuned thresholds and name lists of the engine and the typesetter)',
    baseline: 'about 150 and about 100',
    target: 'each one left listed with its reason',
    from: 'census',
    value: n => n.thresholdsNow != null && `tuned thresholds ${n.thresholdsToday ?? '?'} → ${n.thresholdsNow} → ${n.thresholdsAfter} (after the cut-over ${n.thresholdsNoReason} with no comment, ${n.thresholdsBorderline} borderline); name lists ${n.listsToday ?? '?'} → ${n.listsAfter}; each listed with its file and line in the census`,
    met: n => n.thresholdsNoReason === 0,
  },
  {
    id: 'versions',
    measure: 'Version numbers raised by hand (the census: version constants of product code, and their mirrors)',
    baseline: 'about 12',
    target: '1',
    from: 'census',
    value: n => n.versionsNow != null && `${n.versionsToday ?? '?'} → ${n.versionsNow} → ${n.versionsAfter}, and ${n.mirrorsAfter} mirrors after the cut-over${n.contentVersionsAfter != null ? `; of them ${n.schemaNumbersAfter} a store's schema number, ${n.contentVersionsAfter} a content version` : ''}${n.partial ? " (this repository's alone: the website's tree not given)" : ''}`,
    met: n => (n.versionsAfter > 1 ? false : n.partial ? null : true),
  },
  {
    id: 'unchecked',
    measure: 'Engine lines never type-checked (the census: code lines of the engine no tsc project reads)',
    baseline: 'about 55,000',
    target: '0',
    from: 'census',
    value: n => n.uncheckedNow != null && `${n.uncheckedToday ?? '?'} → ${n.uncheckedNow} → ${n.uncheckedAfter} code lines (every line of those files ${n.uncheckedAllToday ?? '?'} → ${n.uncheckedAllAfter})`,
    met: n => n.uncheckedAfter === 0,
  },
  {
    id: 'imports',
    measure: "The website's imports of engine internals (the census: import statements of the website's tree into the pin that are not a package entry)",
    baseline: '262, and 142 of the interface source',
    target: '0: package entries only',
    from: 'census',
    value: n => (n.importsNow == null ? (n.trees ? "not measured here: the website's tree was not given (census.mjs --web-profile)" : false) : `${n.importsToday ?? '?'} → ${n.importsNow} → ${n.importsAfter}, and of the extension's source ${n.extImportsToday ?? '?'} → ${n.extImportsNow} → ${n.extImportsAfter}`),
    met: n => (n.importsNow == null ? null : n.importsAfter === 0 && n.extImportsAfter === 0),
  },
  {
    id: 'engine-lines',
    measure: "The engine's lines (code size, reported and not targeted: today's engine and the packages that replace it, every line of their code, declaration and style files)",
    baseline: '64,000 (2026-11-01)',
    target: 'about 30,000 (an estimate)',
    from: 'census',
    value: n => n.engineNow != null && `${n.engineToday ?? '?'} → ${n.engineNow} → ${n.engineAfter}; the cut-over deletes ${n.deletedFiles} product files, ${n.deletedCode} code lines${n.partial ? " (the website's tree not given: what its box keeps of the engine is not seen)" : ''}`,
    met: () => null,
  },
  {
    id: 'chains',
    measure: "Translate chains (the census: implementations; a module that puts translators of two or more kinds in an order and takes them through a workspace package's entry is a host of that package's chain)",
    baseline: "two: the website's and the extension's",
    target: '1',
    from: 'census',
    value: n => n.chainsNow != null && `${n.chainsToday ?? '?'} → ${n.chainsNow} → ${n.chainsAfter}${n.ordersAfter != null ? ` (orders after the cut-over: ${n.ordersAfter})` : ''}`,
    met: n => (n.partial ? null : n.chainsAfter <= 1),
  },
  {
    id: 'gpl',
    measure: 'Ported GPL request code a build reaches (the census: files headed "Ported from reference/")',
    baseline: 'the ported request layer, in both builds',
    target: '0 (design stage 4: no ported request code remains)',
    from: 'census',
    value: n => n.gplReachedNow != null && `reached now ${n.gplReachedNow}, after the cut-over ${n.gplReachedAfter}; ported files left after it ${n.gplFilesAfter}`,
    met: n => (n.partial ? null : n.gplReachedAfter === 0 && n.gplFilesAfter === 0),
  },
  { id: 'tiers', measure: 'Tiers that run on a pull request', baseline: "unit tests, the gate's model tier", target: 'every pull-request tier of §4.9', from: null, why: 'planned in lab/release-check/CI.md; the workflows are not written yet' },
]

// ---------------------------------------------------------------- reading a gate's output
const num = s => Number(String(s).replace(/,/g, ''))

/** the census's numbers: its `census-numbers: {json}` line (lab/release-check/census.mjs numbersOf) */
export function censusOf(text) {
  const m = /^census-numbers: (\{.*\})$/m.exec(text)
  return m ? JSON.parse(m[1]) : {}
}

/** "N of M checks passed" (the reader's harness) or "N/M passed" (the extension's e2e scripts) */
export function checksOf(text) {
  const m = /(\d+) of (\d+) checks passed/.exec(text) ?? /(\d+)\/(\d+) passed/.exec(text)
  return m ? { passed: num(m[1]), checks: num(m[2]) } : {}
}

/**
 * harness-lab's verdict over the harness's run: its checks, each corpus paper's bundle and rows as the harness names them
 * ("fixture <id>: this run's bundle and its rows …" or "… lane L1's bundle and today's dump …"), and the harness's refusal of
 * bundles and rows that do not belong together ("FAIL fixtures: …"), which fails the gate with its own words. A paper laid from
 * lane L1's is named in the note
 */
export function harnessLabJudge(step) {
  const text = step.text
  const of = [...text.matchAll(/^fixture (\S+): (this run's|lane L1's) /gm)]
  const numbers = {
    ...checksOf(text),
    run: of.filter(m => m[2] === "this run's").map(m => m[1]),
    l1: of.filter(m => m[2] === "lane L1's").map(m => m[1]),
  }
  const refused = /^FAIL fixtures: (.*)$/m.exec(text)?.[1] ?? null
  const note = refused ?? (numbers.l1.length ? `laid from lane L1's bundle and today's dump, not in this run's rows: ${numbers.l1.join(', ')}` : null)
  return { pass: step.exit === 0 && !refused && !/route table violated/.test(text), numbers, ...(note ? { note } : {}) }
}

/** a terminal's colours (vitest colours its summary where it is asked to) */
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** vitest's summary: "Tests  9074 passed | 56 skipped (9130)" */
export function vitestOf(text) {
  const plain = text.replace(COLOUR, '')
  const t = /Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)?/.exec(plain)
  const f = /Test Files\s+(?:(\d+) failed \| )?(\d+) passed/.exec(plain)
  return t ? { tests: num(t[2]), failed: num(t[1] ?? 0), skipped: num(t[3] ?? 0), files: f ? num(f[2]) : undefined } : {}
}

/** baseline/tools/diff.mjs's summary line: "<scope>: 87 of 87 files; units 44180; shown 37793 -> 38146; lost 0 (+3 accepted), gained 356, changed 9398" */
export function diffOf(text) {
  const m = /(\w+): (\d+) of (\d+) files; units (\d+); shown (\d+) -> (\d+); lost (\d+) \(\+(\d+) accepted\), gained (\d+), changed (\d+)/.exec(text)
  if (!m) return {}
  return { files: num(m[2]), of: num(m[3]), units: num(m[4]), shownBefore: num(m[5]), shown: num(m[6]), lost: num(m[7]), accepted: num(m[8]), gained: num(m[9]), changed: num(m[10]) }
}

/** the typeset runners' invariant line: "invariants over the laid members[ (page by page)]: {json}" */
export function typesetOf(text) {
  // (a runner's log that walked the added pairs apart, lab/typeset/added.mjs: the set's numbers are read before its heading,
  // the added pairs' after it, as `added`)
  const cut = text.indexOf(ADDED_HEADING)
  if (cut >= 0) return { ...typesetOf(text.slice(0, cut)), added: typesetOf(text.slice(cut + ADDED_HEADING.length)) }
  const out = {}
  const inv = /invariants over the laid members(?: \(page by page\))?: (\{[^}]*\})/.exec(text)
  if (inv) Object.assign(out, JSON.parse(inv[1]))
  // (I10, the sentence cover: the typesetter's runner with --entry --reading=part, the parity's v2 lay; counted only over
  // pieces: a run whose entry laid nothing states "0 pieces; 0 faults", no count)
  const cover = /^I10, the sentence cover \(cover\.ts\): (?:\d+ member-pages lit, )?(\d+) pieces; (\d+) faults/m.exec(text)
  if (cover) {
    out.I10pieces = num(cover[1])
    if (out.I10pieces > 0) out.I10 = num(cover[2])
  }
  // (I6 across the pages' lays, the runner with --entry: the units laid by two pages' lays or more, those laid otherwise by the
  // head pass's known cause, and by another, which fails the run)
  const across = /^I6 across the pages' lays \(cross-lay\.ts\): \d+ units begun on a pass page, (\d+) laid by two pages' lays or more; \d+ laid otherwise: (\d+) by the head pass .*, (\d+) by another cause$/m.exec(text)
  if (across) Object.assign(out, { I6twice: num(across[1]), I6head: num(across[2]), I6other: num(across[3]) })
  // (the paragraph points, the runner with --entry (paras-gate.ts): those stated on the pages walked, those whose row carries
  // their anchor, of those opened (their first word starts a line of the member) and on TeX's line, and those run on, which fail
  // the run)
  const paras = /^the paragraph points \(paras-gate\.ts\): (\d+) stated .*?; (\d+) with an anchor in their row .*?: (\d+) opened .*?, (\d+) of them on TeX's line, (\d+) NOT/m.exec(text)
  if (paras) Object.assign(out, { parasStated: num(paras[1]), parasAnchored: num(paras[2]), parasOpened: num(paras[3]), parasOnTexLine: num(paras[4]), parasOff: num(paras[5]) })
  // (the reads gate, the runner with --entry: each page laid again under the reader's default options and with every option on,
  // the row ids read outside the page's wait set, which fail the run: summed over the two)
  const reads = [...text.matchAll(/^the reads gate, .*?: (\d+) pages laid, (\d+) row ids read; (\d+) read outside the page's wait set/gm)]
  if (reads.length) Object.assign(out, { readsPages: num(reads[0][1]), readsOutside: reads.reduce((n, m) => n + num(m[3]), 0) })
  // (the entry, the runner with --entry: the runner's members it lays alike and not, and the time of a page's layPage)
  const entry = /^the entry \(layPage over each part and its rows\): (\d+) of the runner's members laid alike, (\d+) not.*; a page, ms: p50 ([\d.]+), p90 ([\d.]+), p99 ([\d.]+), max ([\d.]+) over (\d+) pages$/m.exec(text)
  if (entry) Object.assign(out, { entryAlike: num(entry[1]), entryNot: num(entry[2]), entryP50: num(entry[3]), entryP90: num(entry[4]), entryP99: num(entry[5]), entryMax: num(entry[6]), entryPages: num(entry[7]) })
  const lay = /a page's lay \(layPagePrepared[^)]*\), ms: p50 ([\d.]+), p90 ([\d.]+), p99 ([\d.]+), max ([\d.]+) over (\d+) pages/.exec(text)
  if (lay) Object.assign(out, { layP50: num(lay[1]), layP90: num(lay[2]), layP99: num(lay[3]), layMax: num(lay[4]), layPages: num(lay[5]) })
  const first = /^\{"pairs":.*\}$/m.exec(text)
  if (first) {
    const c = JSON.parse(first[0])
    Object.assign(out, { pairs: c.pairs, pages: c.pages, msPerPage: c.msPerPage })
  }
  return out
}

/** whether the release check's sentence-cover fails on a paragraph point its row anchors and the page runs on (paras-gate.ts):
 *  from the round in which the engine half states every point's first word (Placed.paras: design-display 2a, the coordinator's
 *  ruling of 2026-11-13), whose lane turns this on. Until then a point stated at a group the reply dropped has no first word to
 *  fall back to, and its count is reported, not held */
export const PARAS_HELD = false

/**
 * One run of the reader gate's runner with --entry (lab/typeset/gate-l1.mjs): its numbers, the added pairs' apart (`a`), and
 * whether it ended whole. The runner exits 1 for its own verdicts, each of which it states and counts: a paragraph point run on,
 * a unit laid otherwise by two pages' lays by another cause than the head pass's, a row id read outside a page's wait set. A run
 * that exits 1 with one of them stated, over pieces the entry drew (and, where the added pairs were walked, over theirs too),
 * ended whole and is read by its counts; any other exit is no count. `held`: the runner's own verdicts on the set and the added
 * pairs alike, the paragraph points held only where `parasHeld`
 */
export function entryRunOf(step, parasHeld = PARAS_HELD) {
  const t = typesetOf(step?.text ?? '')
  const a = t.added
  const both = [t, a].filter(Boolean)
  const stated = both.some(x => x.parasOff > 0 || x.I6other > 0 || x.readsOutside > 0)
  const whole = (step?.exit === 0 || (step?.exit === 1 && stated)) && t.I10pieces > 0 && (!a || a.I10pieces > 0)
  const held = whole && both.every(x => x.I6other === 0 && !(x.readsOutside > 0) && (!parasHeld || x.parasOff === 0))
  return { t, a, whole, held }
}

const parasOf = (x) => (x.parasOff != null ? { parasAnchored: x.parasAnchored, parasOpened: x.parasOpened, parasOnTexLine: x.parasOnTexLine, parasOff: x.parasOff } : {})

/** sentence-cover's verdict over its run (`steps`, the reader gate's): I10 and I6 counted where the run ended whole (entryRunOf),
 *  the runner's own verdicts held (a unit laid otherwise by another cause, a read outside a page's wait set; the paragraph
 *  points where `parasHeld`). The added pairs walked apart (`added`, lab/typeset/added.mjs) are held as the set's in each of
 *  these: their I10, their I6, their reads and their paragraph points */
export function sentenceCoverJudge(steps, parasHeld = PARAS_HELD) {
  const { t, a, whole, held } = entryRunOf(steps[0], parasHeld)
  const counted = whole && t.I10 != null
  const across = whole && t.I6other != null
  const findings = { ...(counted ? { I10: { held: t.I10 === 0, count: t.I10 } } : {}), ...(across ? { I6: { held: t.I6other === 0, count: t.I6other } } : {}) }
  return {
    pass: held && counted && t.I10 === 0 && across && (!a || a.I10 === 0),
    numbers: { ...(t.I10 != null ? { I10: t.I10 } : {}), pieces: t.I10pieces ?? 0, pairs: t.pairs, ...(t.I6other != null ? { I6twice: t.I6twice, I6head: t.I6head, I6other: t.I6other } : {}), ...(t.readsOutside != null ? { readsOutside: t.readsOutside } : {}), ...parasOf(t), ...(a ? { added: { pairs: a.pairs, I10: a.I10, pieces: a.I10pieces ?? 0, I6other: a.I6other, ...(a.readsOutside != null ? { readsOutside: a.readsOutside } : {}), ...parasOf(a) } } : {}) },
    ...(Object.keys(findings).length ? { findings } : {}),
  }
}

/** the Google rows tool's totals (the rounds' google-rows.mts): "total over N pairs: units U, google G, microsoft M, …", each
 *  count by its words in camel case (`refused unavailable` 3: `refusedUnavailable`, a unit whose wire the store holds no reply to;
 *  `no bundle`: `noBundle`) */
export function rowsOf(text) {
  const m = /^total over (\d+) pairs: (.*)$/m.exec(text)
  if (!m) return {}
  const out = { pairs: num(m[1]) }
  for (const [, k, n] of m[2].matchAll(/([a-z][a-z ]*?) (\d+)(?:, |$)/g)) out[k.replace(/ (\w)/g, (_, c) => c.toUpperCase())] = num(n)
  return out
}

/**
 * reader-parts' verdict over its three steps (`as`: 'door', the runner over the door's rows; 'rows', Google's rows made through
 * this tree's chain; 'google', the runner over them): each store's run whole and its runner's own verdicts held (entryRunOf), the
 * rows made with no unit unavailable (a unit whose wire the lab's store holds no reply to: the rows would not be the round's); I3,
 * I4 and I5 counted over both stores, the set and the added pairs, as findings, and held to the last integrated round's counts
 * (`record`, lab/release-check/reader-parts.json: the round judges the reader gate so, against the round before): a count above
 * its record fails the gate, one below it is said. The door's entry times give the page's layout (design §7)
 */
export function readerPartsJudge(steps, parasHeld = PARAS_HELD, record = null) {
  const at = as => steps.find(s => s.as === as)
  const rows = at('rows')
  const made = rowsOf(rows?.text ?? '')
  const runs = Object.fromEntries(['door', 'google'].map(k => [k, entryRunOf(at(k), parasHeld)]))
  const storeOf = ({ t, a }) => ({ alike: t.entryAlike, not: t.entryNot, I3: t.I3, I4: t.I4, I5: t.I5, I10: t.I10, pieces: t.I10pieces, I6other: t.I6other, readsOutside: t.readsOutside, ...parasOf(t), ...(a ? { added: { pairs: a.pairs, alike: a.entryAlike, not: a.entryNot, I3: a.I3, I4: a.I4, I5: a.I5, I10: a.I10, I6other: a.I6other, readsOutside: a.readsOutside, ...parasOf(a) } } : {}) })
  const findings = {}
  const rose = [],
    fell = []
  for (const k of ['I3', 'I4', 'I5']) {
    const parts = Object.entries(runs).filter(([, r]) => r.whole && r.t[k] != null).flatMap(([s, r]) => [[s, r.t[k]], ...(r.a?.[k] != null ? [[`${s}, added`, r.a[k]]] : [])])
    if (parts.length) findings[k] = { held: parts.every(([, n]) => n === 0), count: parts.every(([, n]) => n === 0) ? 0 : parts.filter(([, n]) => n > 0).map(([s, n]) => `${n} (${s})`).join(', ') }
    // (against the last integrated round's counts: a part the record names, its count above the record's or below it)
    for (const [s, n] of parts) {
      const was = record?.counts?.[s]?.[k]
      if (was == null) continue
      if (n > was) rose.push(`${k} ${was} -> ${n} (${s})`)
      else if (n < was) fell.push(`${k} ${was} -> ${n} (${s})`)
    }
  }
  const door = runs.door.t
  const notes = [
    made.refusedUnavailable > 0 && `the lab's Google store holds no reply to ${made.refusedUnavailable} units the chain asks: the rows are not the round's`,
    made.noBundle > 0 && `${made.noBundle} pairs have no bundle in this run`,
    rose.length && `above the last round's (${record.commit}): ${rose.join(', ')}`,
    fell.length && `below the last round's (${record.commit}), the record to lower: ${fell.join(', ')}`,
  ].filter(Boolean)
  return {
    pass: runs.door.held && runs.google.held && rows?.exit === 0 && made.units > 0 && !(made.refusedUnavailable > 0) && !(made.noBundle > 0) && !rose.length,
    numbers: { door: storeOf(runs.door), google: storeOf(runs.google), rows: made, ...(door.entryP50 != null ? { layP50: door.entryP50, layP90: door.entryP90, layP99: door.entryP99, layPages: door.entryPages } : {}) },
    ...(Object.keys(findings).length ? { findings } : {}),
    ...(notes.length ? { note: notes.join('; ') } : {}),
  }
}

/** reader-parts' record: the counts of the last integrated round (lab/release-check/reader-parts.json) */
export const readerPartsRecord = root => JSON.parse(readFileSync(join(root, 'lab/release-check/reader-parts.json'), 'utf8'))

/** a corpus runner's log.tsv (lab/pdf/prepare-back/corpus.sh): one line a paper, `id <tab> exit <tab> summary`. The table
 *  keeps 400 characters of a summary, and run.mjs's is longer since it states what locate made (60c263fd1): a paper's summary
 *  is read whole from its own log beside the table (`logs/<id>.log`, its last line that is the paper's JSON), the table's
 *  where the log has none */
export function corpusLogOf(file) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'))
  const out = { papers: rows.length, made: 0, failed: [], refused: [], missingCompile: [], proofs: { a: 0, c: 0, on: 0, offOutside: 0 } }
  const wholeOf = (id, cut) => {
    const log = join(dirname(file), 'logs', `${id}.log`)
    if (!existsSync(log)) return cut
    return readFileSync(log, 'utf8').split('\n').findLast(l => l.startsWith(`{"id":${JSON.stringify(id)}`)) ?? cut
  }
  for (const [id, rc, cut] of rows) {
    const summary = rc === '0' ? wholeOf(id, cut) : cut
    if (rc === 'refused') { out.refused.push(`${id} (${summary})`); continue }
    if (rc === '3') { out.missingCompile.push(id); continue }
    if (rc !== '0') { out.failed.push(`${id}: exit ${rc}: ${summary}`); continue }
    out.made++
    let s
    // (the summary is the paper's JSON, after its id where the runner prints one)
    try { s = JSON.parse(summary.slice(summary.indexOf('{'))) } catch { out.failed.push(`${id}: no summary`); continue }
    const p = s.proofs ?? {}
    // (a proof the prover refused is no count: run.mjs writes its reason where the count would be, `offOutside: '<why>'`, or
    // `refused`; that paper fails, named, and adds nothing to the counts)
    const refusals = Object.entries(p).filter(([k, v]) => k === 'refused' || typeof v === 'string' || (v && typeof v === 'object' && Object.values(v).some(x => typeof x !== 'number')))
    if (refusals.length) {
      out.failed.push(`${id}: a proof refused: ${refusals.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('; ')}`)
      continue
    }
    out.proofs.a += p.a ?? 0
    out.proofs.c += p.c ?? 0
    out.proofs.on += p.on ?? 0
    out.proofs.offOutside += Object.values(p.offOutside ?? {}).reduce((n, v) => n + v, 0)
  }
  return out
}

/** the candidate's prepare dumps (baseline FORMAT.md §3): units drawn by group, and the papers refused whole (no source
 *  unit drawn), as baseline/tools/acceptance.mjs counts them; `within` a directory of dumps (the baseline's): only the papers
 *  it holds a dump of, so that a count stands beside the baseline's own (a paper the corpus gained after it is left out) */
export function drawnOf(dir, within = null) {
  const groupOf = u => (u.kind === 'name' ? 'names' : u.kind === 'inkfigures' ? 'figures' : /^ink/.test(u.kind ?? '') ? 'ink' : 'source')
  const out = { source: 0, ink: 0, figures: 0, refusedWhole: 0, papers: 0 }
  for (const f of readdirSync(dir).filter(f => f.endsWith('.prepare.json') && (!within || existsSync(join(within, f))))) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    out.papers++
    let source = 0
    for (const u of d.units) {
      if (u.state !== 'drawn') continue
      const g = groupOf(u)
      if (g === 'source') source++
      if (g in out) out[g]++
    }
    if (!source) out.refusedWhole++
  }
  return out
}

/** canvas.mjs's line a paper, held to the bound its header names (the erasure's E4: at most 0.1 % of the split glyphs'
 *  pixels, max channel Δ 16; no pixel outside them); a paper it refused (`{ id, refused }`: no add-on) or did not report at
 *  all, of the `ids` asked, is over, by name */
export function canvasOf(text, ids = []) {
  const rows = text.split('\n').filter(l => l.startsWith('{"id"') && (l.includes('"splitShows"') || l.includes('"refused"'))).map(l => JSON.parse(l))
  const over = rows.filter(r => r.refused || r.outsidePages?.length || r.shareMax > 0.001 || r.maxDelta > 16)
  const seen = new Set(rows.map(r => r.id))
  return {
    papers: rows.length,
    pages: rows.reduce((n, r) => n + (r.pages ?? 0), 0),
    over: [...over.map(r => `${r.id}: ${r.refused ? r.refused : `outside ${JSON.stringify(r.outsidePages)}, share ${r.shareMax}, Δ ${r.maxDelta}`}`), ...ids.filter(id => !seen.has(id)).map(id => `${id}: no line (the canvas did not report it)`)],
  }
}

// ---------------------------------------------------------------- the gates
// A gate: `id`, `title`, `tier` (the first it runs in), `stage` (design §4.9), `holds` (invariant ids), `steps(ctx)` (each
// `{ cmd, slot?, env?, fresh?, all?, as? }`, run in order, the first that fails ends the gate but one marked `all`; `slot` the
// heavy slot's kind, the lab's rule: `test` for a job that spawns a worker a core (vitest, a build), `run` for one long process
// with no pool of workers (a corpus run, a runner over the pairs, the parity's lay), `e2e` for a browser; `as` names a step
// for its gate's judge), `needs(ctx)` (inputs outside the
// repository: `{ what, path }`, a gate whose input is missing is skipped and says which), `after` (gates whose output it
// reads), `disk` (writes corpus outputs: refused under the free disk the lab's runners require), `network` ('live': runs
// only with --online), `judge(ctx, steps)` (its pass and numbers; by default every step's exit code 0), and for a gate of
// the private repository `private: true` (named, never run here). `cutover: true`: a cut-over blocker (CI.md): the report's
// cut-over verdict is NO-GO while it has not passed, whatever the tier's verdict.
const pnpm = (...a) => ({ cmd: ['pnpm', ...a] })
const e2e = (script, title, holds = [], extra = {}) => ({
  id: script,
  title,
  tier: 'fast',
  stage: 'reader',
  holds,
  after: ['build'],
  steps: () => [{ cmd: ['pnpm', script], slot: 'e2e' }],
  judge: (ctx, steps) => ({ pass: steps.every(s => s.exit === 0), numbers: checksOf(steps.at(-1).text) }),
  ...extra,
})
/** the build of today's reader the full tier makes (build-today) */
const todayBuild = ctx => join(ctx.work, 'today-reader', '.output', 'chrome-mv3')
/** an e2e script on today's reader's build: passed where it ran on that build (no rebuilt reader's pdfjs/ in it) and passed */
const todayE2e = (script, title) => ({
  ...e2e(script, title),
  id: `${script}-today`,
  tier: 'full',
  after: ['build-today'],
  steps: ctx => [{ cmd: ['pnpm', script], slot: 'e2e', env: { AXT_EXT_DIR: todayBuild(ctx) } }],
  judge: (ctx, steps) => {
    const rebuilt = existsSync(join(todayBuild(ctx), 'pdfjs'))
    return { pass: !rebuilt && steps.every(s => s.exit === 0), numbers: checksOf(steps.at(-1).text), ...(rebuilt ? { note: `${todayBuild(ctx)} carries the rebuilt reader (pdfjs/): its checks ran in place of today's` } : {}) }
  },
})
const lab = (ctx, ...p) => join(ctx.refactor, ...p)
/** the five corpus papers the reader package's harness opens (its I8 on the corpus) */
const HARNESS_PAPERS = ['1512.03385v1', '1706.03762v7', '2609.26457v1', '2307.16209v1', '2610.20030v1']
const exists = (what, path) => ({ what, path })

// The corpus the prepare's gates run, as the integration round's stage 1a runs it (lanes/converge-8/rf-chain.sh): the set's 88
// papers and the added pairs' papers (lab/typeset/added.mjs: their bundles are what the reader gate and the display gate walk
// them over), written as one list into the work directory (papers.mjs); the compile caches its chain reads, whose newest
// directories hold the compiles of the marks the round moved and the added papers' (RELEASE_CHECK_CACHES: the round's run's
// flags.txt, whose chain names them; else the lab's list, which goes stale when a round fills a compile directory of its own);
// and its flags, the baseline's dumps read for the units of today's the candidate makes otherwise (run.mjs --baseline: the
// stated causes the acceptance list reads). A run and its twin take the same flags: same.mjs compares two runs only where their
// flags agree.
const PAPERS = 'lanes/L1-papers88.tsv'
const ADDED_PAPERS = 'baseline/added/papers.tsv'
const cachesFile = ctx => process.env.RELEASE_CHECK_CACHES ?? lab(ctx, 'lanes/L1-caches88.txt')
/** the corpus list a run prepares: the set's papers, then the added papers' */
const corpusList = ctx => join(ctx.work, 'papers.tsv')
const listStep = ctx => ({ cmd: ['node', 'lab/release-check/papers.mjs', corpusList(ctx), lab(ctx, PAPERS), lab(ctx, ADDED_PAPERS)], as: 'papers' })
/** a compile cache chain, colon-joined, from its file: a list of directories (joined by `:` or one a line, `#` a comment), or
 *  a corpus run's flags.txt (corpus.sh writes the chain it read as its `--caches=` line) */
export function cachesOf(text) {
  const flag = /^--caches=(.*)$/m.exec(text)
  if (flag) return flag[1].trim()
  return text
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .flatMap(l => l.split(':'))
    .filter(Boolean)
    .join(':')
}
const corpusNeeds = ctx => [exists('the 88 papers', lab(ctx, PAPERS)), exists("the added pairs' papers (lab/typeset/added.mjs)", lab(ctx, ADDED_PAPERS)), exists("the compile caches' list (RELEASE_CHECK_CACHES)", cachesFile(ctx))]
/** a run with the round's flags reads the baseline's dumps besides */
const stage1aNeeds = ctx => [...corpusNeeds(ctx), exists("the baseline's prepare dumps", lab(ctx, 'baseline/prepare'))]
/** corpus.sh's arguments: the papers (the run's list), the output, the caches and two papers at once, then run.mjs's flags */
const corpusArgs = (ctx, out, ...flags) => ['bash', 'lab/pdf/prepare-back/corpus.sh', corpusList(ctx), out, cachesOf(readFileSync(cachesFile(ctx), 'utf8')), '2', ...flags]
const stage1a = ctx => ['--prove', `--baseline=${lab(ctx, 'baseline/prepare')}`]

// The pairs the integration round's reader gate and Google's rows walk (lanes/converge-8/rf-rows-reader.sh): the 90 of the stored
// rows (the tap's pairs of the release's rows whose paper the corpus holds), as lab-data lists them for the rounds, then the added
// pairs (lab/typeset/added.mjs), which the runner walks apart
const STORED = 'lanes/cjk-punct/blast/pairs.txt'
const storedOf = ctx => readFileSync(lab(ctx, STORED), 'utf8').split(/\s+/).filter(Boolean)
// Google's rows as the rounds make them (the integration's tools, lab-data only): the lab's Google store read through this tree's
// chain, no translator asked (google-rows.mts), and the reader gate laid over them in place of the door's (rows-register.mjs, a
// module hook on gate-l1.ts that fails to load where one of its anchors no longer stands once in the file)
const GOOGLE_STORE = 'google-rows/ef6989debed1'
const ROWS_TOOL = 'lanes/converge-7/tools-b15/google-rows.mts'
const ROWS_REGISTER = 'lanes/converge-7/tools-b15/rows-register.mjs'
/** the inputs the typesetter's runners read besides the bundles */
const runnerNeeds = ctx => [
  exists('the tap', lab(ctx, 'baseline/tap/ledgers')),
  exists("the release sweep's cache (AXT_SWEEP_CACHE)", join(SWEEP_CACHE, 'papers')),
  exists("the reader's served faces' tables (AXT_FACE_TABLES)", join(TABLES, 'index.json')),
  exists("the reader's served faces (AXT_FACE_SLICES)", SLICES.find(d => existsSync(d)) ?? SLICES[0]),
]
/** this run's bundles (the prepare gate's), which every gate after it reads */
const bundlesDir = ctx => join(ctx.work, 'prepare', 'bundles')
/** this run's rows of its bundles: Google's, made by reader-parts' rows step over them (`<pair>.json`), which harness-lab lays */
const runRowsDir = ctx => join(ctx.work, 'reader-parts', 'google-rows')

// The parity's steps over some pairs (lab/typeset/parity/: v2's lay, the drawing, the measures and the verdict), into `dir`;
// `toggles` the reading options (`--toggles=on`: every switch of "What to translate" on), `wrap` the command's environment (the
// added pairs' through added.mjs). The verdict's step runs whatever it finds (`all`), so that the steps after it run too
const parity = (ctx, dir, pairs, { toggles = [], wrap = x => x, as = '' } = {}) => [
  { cmd: wrap(['node', 'lab/typeset/parity/v2.mjs', `--out=${join(dir, 'v2')}`, ...toggles, ...pairs]), slot: 'run', env: { AXT_L1_BUNDLES: bundlesDir(ctx) }, fresh: dir, as: `v2${as}` },
  { cmd: wrap(['node', 'lab/typeset/parity/render.mjs', `--work=${dir}`, `--out=${join(dir, 'sheet')}`, ...toggles, ...pairs]), slot: 'e2e', env: { AXT_L1_BUNDLES: bundlesDir(ctx) }, as: `render${as}` },
  { cmd: wrap(['node', 'lab/typeset/parity/measure.mjs', `--work=${dir}`, `--out=${join(dir, 'sheet')}`, ...pairs]), env: { AXT_L1_BUNDLES: bundlesDir(ctx) }, all: true, as: `measure${as}` },
]
const withAdded = cmd => ['node', 'lab/typeset/added.mjs', '--', ...cmd]
/** the parity's inputs besides the runners' (lab/typeset/parity/README.md "Today's side") */
const parityNeeds = ctx => [
  ...runnerNeeds(ctx),
  exists('the 87 papers', lab(ctx, 'lanes/L1-papers87.tsv')),
  exists("today's prepare dumps (the original's lines of today's units)", lab(ctx, 'baseline/prepare')),
  exists("today's engine at 065c1d973 (AXT_TODAY)", join(process.env.AXT_TODAY ?? join(ctx.root, '..', 'refactor-read'), 'src/pdf-reader/engine/view/engine.css')),
]
/** today's side is production's (lab/typeset/parity/production-rows.mjs): production's own row path over the stored rows gives
 *  them back, or the side drawn as production's is not; its count per pair in the gate's numbers, a pair not production's
 *  failing it. Run whatever it finds, so that the parity is measured and reported beside it */
const productionRows = (pairs, wrap = x => x, as = 'rows') => ({ cmd: wrap(['node', 'lab/typeset/parity/production-rows.mjs', ...pairs]), all: true, as })
/** production-rows.mjs's totals: "production's rows: P of N pairs; R of S stored rows given back …", and the pairs that are not */
export function productionRowsOf(text) {
  const m = /^production's rows: (\d+) of (\d+) pairs; (\d+) of (\d+) stored rows/m.exec(text)
  const not = [...text.matchAll(/^(\S+): (?:NOT production's|not read): (.*)$/gm)].map(x => `${x[1]}: ${x[2].slice(0, 160)}`)
  return m ? { pairs: num(m[1]), of: num(m[2]), rows: num(m[3]), stored: num(m[4]), ...(not.length ? { not } : {}) } : { ...(not.length ? { not } : {}) }
}
/** a display gate's verdict over its parity runs (`modes`: each run's `as` suffix and where its numbers go: [] the gate's own,
 *  ['added'], ['on'], ['on', 'added']) and its checks of today's rows (`rows`: their `as`): every planned step ran (`planned`)
 *  and exited 0; I10 over the pairs as v2's lay states it, every run's summed */
export function displayJudge(steps, planned, modes, rows) {
  const at = as => steps.find(s => s.as === as)
  const numbers = {}
  let I10 = null
  for (const [suffix, path] of modes) {
    const n = parityOf(at(`measure${suffix}`)?.text ?? '')
    const i = typesetOf(at(`v2${suffix}`)?.text ?? '').I10
    if (i != null) {
      n.I10 = i
      I10 = (I10 ?? 0) + i
    }
    let into = numbers
    for (const k of path) {
      into[k] ??= {}
      into = into[k]
    }
    Object.assign(into, n)
  }
  numbers.today = Object.fromEntries(rows.map(as => [as, productionRowsOf(at(as)?.text ?? '')]))
  const notProduction = rows.flatMap(as => productionRowsOf(at(as)?.text ?? '').not ?? [])
  return {
    pass: steps.length === planned && steps.every(s => s.exit === 0),
    numbers,
    ...(I10 != null ? { findings: { I10: { held: I10 === 0, count: I10 } } } : {}),
    ...(notProduction.length ? { note: `today's side is not production's: ${notProduction.join('; ')}` } : {}),
  }
}

export const GATES = [
  // ---------------------------------------------------------------- unit (hosted CI, every pull request)
  { id: 'typecheck', title: 'the type check (the extension, the packages, the website\'s calls in tests/contract/website-use.tsx)', tier: 'fast', stage: 'unit', holds: [], steps: () => [pnpm('typecheck')] },
  { id: 'lint', title: 'Biome, the packages\' format, the English, boundary and review-citation gates', tier: 'fast', stage: 'unit', holds: [], steps: () => [pnpm('lint')] },
  {
    id: 'test',
    title: "the unit tests: the extension's and every package's (the typeset replays read the tap where the machine has it)",
    tier: 'fast',
    stage: 'unit',
    holds: [],
    steps: () => [{ cmd: ['pnpm', 'test'], slot: 'test' }],
    judge: (ctx, steps) => ({ pass: steps[0].exit === 0, numbers: vitestOf(steps[0].text) }),
  },
  {
    id: 'contract',
    title: "the contract tests: the website's import contract, no GPL from any entry point, the language table",
    tier: 'fast',
    stage: 'unit',
    holds: [],
    steps: () => [pnpm('exec', 'vitest', 'run', '--project', 'extension', 'tests/contract')],
    judge: (ctx, steps) => ({ pass: steps[0].exit === 0, numbers: vitestOf(steps[0].text) }),
  },
  { id: 'build', title: 'the build (wxt build, scripts/check-output.mjs)', tier: 'fast', stage: 'unit', holds: [], steps: () => [pnpm('build')] },
  {
    id: 'census',
    title: "the complexity and debt census (lab/release-check/census.mjs): today's tree, this one, and this one less what the cut-over deletes, the website's where its profile is on this machine, reported against design §7; judged by its ratchet: no measure of its ledger (census-ledger.json, the last integrated round's values) above its recorded value",
    tier: 'fast',
    stage: 'unit',
    holds: [],
    steps: ctx => [{ cmd: ['node', 'lab/release-check/census.mjs', `--out=${join(ctx.work, 'census')}`] }],
    // (its exit: 0 no measure rose, 1 one rose (its lines name the measure, the values and the new entries), 2 a usage error)
    judge: (ctx, steps) => ({ pass: steps[0].exit === 0, numbers: censusOf(steps[0].text), note: [...steps[0].text.matchAll(/^census-ratchet: (RISE .*)$/gm)].map(m => m[1]).join('; ') || `the census: ${join(ctx.work, 'census', 'census.md')}` }),
  },
  // ---------------------------------------------------------------- reader (hosted CI, every pull request: offline browsers)
  {
    id: 'harness',
    title: "the reader package's browser checks on its own fixtures (packages/reader/e2e/run.mjs)",
    tier: 'fast',
    stage: 'reader',
    holds: ['I1', 'I3', 'I4', 'I8'],
    steps: ctx => [{ cmd: ['node', 'packages/reader/e2e/run.mjs'], slot: 'e2e', env: { AXT_TIMINGS_OUT: join(ctx.work, 'harness-timings.json') } }],
    judge: (ctx, steps) => {
      const text = steps[0].text
      const numbers = checksOf(text)
      const sw = /^(ok|FAIL) +compose: a language switch reuses/m.exec(text)
      if (sw) numbers.languageSwitch = sw[1] === 'ok'
      const f = join(ctx.work, 'harness-timings.json')
      if (existsSync(f)) {
        const rows = Object.entries(JSON.parse(readFileSync(f, 'utf8'))).filter(([k]) => k.endsWith('@1x')).flatMap(([, r]) => r.map(x => x.commitMs)).sort((a, b) => a - b)
        if (rows.length) Object.assign(numbers, { commitP50: rows[rows.length >> 1], commitPages: rows.length })
      }
      return { pass: steps[0].exit === 0 && !/route table violated/.test(text), numbers }
    },
  },
  // (a default build carries the rebuilt reader (AXT_READER v2, pdfjs/ at its root), on which tests/e2e/reader.mjs and
  // registration.mjs run the rebuilt reader's checks: today's reader's are the full tier's, on a build of its own, below)
  e2e('e2e:reader', "the rebuilt reader in the extension (the shipped build's) on the stand-in of our server's /api/v2 (tests/e2e/reader-v2.mjs, reader-v2-layer.mjs)"),
  e2e('e2e:framing', 'the reader and the popup framed: every way the extension opens them works, a framing page gets nothing'),
  e2e('e2e:a11y', 'the A/B axe audit: no finding the extension adds'),
  e2e('e2e:viewer', "the figure viewer's control under a pinned header"),
  e2e('e2e:registration', "the rebuilt reader in the extension: a laid page's drawing, overlay and links registered at every zoom (tests/e2e/registration-v2.mjs)"),
  e2e('e2e:small-caps', "today's layer's small capitals in Chromium, Firefox and WebKit", [], { after: [] }),
  // ---------------------------------------------------------------- pipeline (the self-hosted runner, with lab data)
  {
    id: 'prepare',
    title: "the prepare's back half on the 88 papers and the added pairs' from cached compiles, with PDF.js's proofs (I1 (a), I2 (c′)), as the round's stage 1a runs it",
    tier: 'full',
    stage: 'pipeline',
    holds: ['I1', 'I2'],
    disk: true,
    needs: stage1aNeeds,
    steps: ctx => [listStep(ctx), { cmd: corpusArgs(ctx, join(ctx.work, 'prepare'), ...stage1a(ctx)), slot: 'run', fresh: join(ctx.work, 'prepare') }],
    judge: ctx => corpusJudge(ctx, join(ctx.work, 'prepare'), ['a', 'c']),
  },
  {
    id: 'prepare-diff',
    title: "the migration's differential, the prepare's scope (baseline/tools/diff.mjs against the frozen baseline)",
    tier: 'full',
    stage: 'pipeline',
    holds: ['D'],
    after: ['prepare'],
    needs: ctx => [exists('the frozen baseline', lab(ctx, 'baseline/acceptance.json'))],
    steps: ctx => [{ cmd: ['node', lab(ctx, 'baseline/tools/diff.mjs'), lab(ctx, 'baseline'), join(ctx.work, 'prepare'), '--scope=prepare', `--json=${join(ctx.work, 'prepare-diff.json')}`] }],
    judge: (ctx, steps) => ({ pass: steps[0].exit === 0, numbers: { ...diffOf(steps[0].text), ...drawnOf(join(ctx.work, 'prepare', 'prepare'), lab(ctx, 'baseline/prepare')) } }),
  },
  {
    id: 'prepare-same',
    title: "the same inputs give the same bytes: the prepare run again with the same flags and compared object by object (lab/pdf/prepare-back/same.mjs), as the round's twin run",
    tier: 'full',
    stage: 'pipeline',
    holds: ['I6'],
    disk: true,
    after: ['prepare'],
    needs: stage1aNeeds,
    steps: ctx => [
      listStep(ctx),
      { cmd: corpusArgs(ctx, join(ctx.work, 'prepare-2'), ...stage1a(ctx)), slot: 'run', fresh: join(ctx.work, 'prepare-2') },
      { cmd: ['node', 'lab/pdf/prepare-back/same.mjs', join(ctx.work, 'prepare'), join(ctx.work, 'prepare-2')], as: 'same' },
    ],
    judge: (ctx, steps) => {
      const log = corpusLogOf(join(ctx.work, 'prepare-2', 'log.tsv'))
      if (log.refused.length) return { skip: `the corpus runner refused ${log.refused.length} papers: ${log.refused[0]}` }
      return { pass: steps.length === 3 && steps.every(s => s.exit === 0), numbers: { papers: log.papers, same: steps.find(s => s.as === 'same')?.text.trim().split('\n').at(-1) } }
    },
  },
  {
    id: 'translate-equivalence',
    title: "the translate package's adapters against today's readers on recorded replies (lab/translate/equivalence.ts)",
    tier: 'full',
    stage: 'pipeline',
    holds: [],
    needs: ctx => [exists("today's readers' replies, captured", lab(ctx, 'lanes/L6/capture.jsonl'))],
    steps: ctx => [{ cmd: ['pnpm', 'exec', 'tsx', 'lab/translate/equivalence.ts', lab(ctx, 'lanes/L6/capture.jsonl'), join(ctx.work, 'equivalence')], fresh: join(ctx.work, 'equivalence') }],
    // (its rows in either shape of the tool: before its accepted classes every difference is `disagree`; with them, a
    // difference of a class the package's owners chose is `accepted`, compared and counted apart, and the tool exits 1 on any
    // other disagreement or a class's count moved)
    judge: (ctx, steps) => {
      const rows = JSON.parse(readFileSync(join(ctx.work, 'equivalence', 'equivalence.json'), 'utf8'))
      const n = k => rows.filter(r => String(r.outcome).startsWith(k)).length
      const [agree, accepted, disagree] = [n('agree'), n('accepted'), n('disagree')]
      return { pass: steps[0].exit === 0 && disagree === 0, numbers: { compared: agree + accepted + disagree, agree, accepted, disagree, wireDiffers: rows.filter(r => r.outcome === 'wire').length } }
    },
  },
  // ---------------------------------------------------------------- reader, with lab data
  {
    id: 'typeset-today',
    title: "the typesetter over today's members (lab/typeset/gate.mjs) and the reader's differential",
    tier: 'full',
    stage: 'reader',
    holds: ['D', 'I3', 'I4', 'I5'],
    needs: ctx => [
      exists('the tap', lab(ctx, 'baseline/tap/ledgers')),
      exists("lane L3's derived inputs", lab(ctx, 'lanes/L3/replay')),
      exists("the release sweep's cache (AXT_SWEEP_CACHE): the views and rules today's reader read", join(SWEEP_CACHE, 'papers')),
      exists("the reader's served faces' tables (AXT_FACE_TABLES), the measurer of a width the tap lacks", join(TABLES, 'index.json')),
      exists("the reader's served faces (AXT_FACE_SLICES)", SLICES.find(d => existsSync(d)) ?? SLICES[0]),
    ],
    steps: ctx => [
      { cmd: ['node', 'lab/typeset/gate.mjs', `--out=${join(ctx.work, 'typeset-today')}`], slot: 'run', fresh: join(ctx.work, 'typeset-today') },
      { cmd: ['node', lab(ctx, 'baseline/tools/diff.mjs'), lab(ctx, 'baseline'), join(ctx.work, 'typeset-today'), '--scope=reader', `--json=${join(ctx.work, 'typeset-today-diff.json')}`] },
    ],
    judge: (ctx, steps) => typesetJudge(steps),
  },
  {
    id: 'sentence-cover',
    title: "the sentence cover over this run's prepared parts: each page laid by the entry over the release's stored rows, the reading from the part (lab/typeset/gate-l1.mjs --entry --reading=part); every drawn piece in exactly one sentence on both panes; and each unit laid alike by every page's lay that holds it (I6 across the lays, the head pass's known cause counted apart)",
    tier: 'full',
    stage: 'reader',
    holds: ['I10', 'I6'],
    after: ['prepare'],
    needs: runnerNeeds,
    // (every pair the tap holds, the gate pack's pairs among them, then the added pairs apart; the entry alone is read: its
    // dumps are not compared)
    steps: ctx => [
      { cmd: ['node', 'lab/typeset/gate-l1.mjs', '--entry', '--reading=part', `--out=${join(ctx.work, 'sentence-cover')}`], slot: 'run', env: { AXT_L1_BUNDLES: bundlesDir(ctx) }, fresh: join(ctx.work, 'sentence-cover') },
    ],
    // (counted over the pieces the entry drew: a run that laid nothing, or did not end whole, has no count and fails; a run whose
    // exit is one of the runner's own verdicts, stated (a unit laid otherwise by two pages' lays by another cause than the head
    // pass's, a row read outside a page's wait set, a paragraph point run on), ended whole: its counts are read, the first two
    // fail the gate and the third where PARAS_HELD says so; the added pairs walked apart held as the set's: sentenceCoverJudge)
    judge: (ctx, steps) => sentenceCoverJudge(steps),
  },
  {
    id: 'reader-parts',
    title: "the reader gate over this run's prepared parts, once with each rows store, as the integration round runs it (lab/typeset/gate-l1.mjs --entry --reading=part, the runner set up as the entry is): each page of the 90 pairs of the stored rows and the added pairs (apart) laid over the door's rows, the release's stored replies, and over Google's, the lab's Google store read through this tree's chain (no translator asked); I3 read by ink, I4 and I5 counted on both",
    tier: 'full',
    stage: 'reader',
    holds: ['I3', 'I4', 'I5'],
    after: ['prepare'],
    needs: ctx => [
      ...runnerNeeds(ctx),
      exists('the 90 pairs of the stored rows', lab(ctx, STORED)),
      exists("the lab's Google store", lab(ctx, GOOGLE_STORE)),
      exists("the rounds' tool making Google's rows from the store", lab(ctx, ROWS_TOOL)),
      exists('its hook laying them in place of the door\'s', lab(ctx, ROWS_REGISTER)),
    ],
    // (one long process each, no pool of workers: the heavy slot's `run`; the door's run whatever it finds, so that Google's runs
    // too; AXT_GATE_ENTRY=1, as the round sets it, lists each member the entry lays otherwise in the log)
    steps: ctx => {
      const dir = join(ctx.work, 'reader-parts')
      const pairs = [...storedOf(ctx), ...ADDED]
      const env = { AXT_L1_BUNDLES: bundlesDir(ctx), AXT_GATE_ENTRY: '1' }
      const gate = (store, ...pre) => ['node', ...pre, 'lab/typeset/gate-l1.mjs', '--entry', '--reading=part', `--out=${join(dir, store)}`, ...pairs]
      return [
        { cmd: gate('door'), slot: 'run', env, fresh: dir, all: true, as: 'door' },
        { cmd: ['node', '--experimental-strip-types', lab(ctx, ROWS_TOOL), ctx.root, runRowsDir(ctx), lab(ctx, GOOGLE_STORE), ...pairs], slot: 'run', env, as: 'rows' },
        { cmd: gate('google', '--import', lab(ctx, ROWS_REGISTER)), slot: 'run', env: { ...env, AXT_B14_ROWS: runRowsDir(ctx) }, as: 'google' },
      ]
    },
    // (each store's run read whole as the runner states it, its own verdicts held; I3, I4, I5 counted as findings and held to the
    // last integrated round's counts, reader-parts.json: readerPartsJudge)
    judge: (ctx, steps) => readerPartsJudge(steps, PARAS_HELD, readerPartsRecord(ctx.root)),
  },
  {
    id: 'display',
    title: "display ≥ today: no page worse than today's, a difference only where nearer the original (lab/typeset/parity/: today's output and v2's drawn beside arXiv's page on 22 papers with the same rows, every difference judged against the original; under the reader's default options and with every switch on, as the round judges it; the added pairs, lab/typeset/added.mjs, judged apart; today's rows checked production's first)",
    tier: 'full',
    stage: 'reader',
    holds: ['I3', 'I10'],
    // (the maintainer's base threshold for the refactor: v2's display equal to or better than the production site's)
    cutover: true,
    after: ['prepare'],
    disk: true,
    needs: ctx => [...parityNeeds(ctx), exists("the added pairs' today's side (lab/typeset/added.mjs)", lab(ctx, 'baseline/added/pairs.txt'))],
    // (today's rows of the 22 and of the added pairs checked production's (production-rows.mjs); then the 22 pairs, the added
    // pairs in steps of their own, their today's side read through added.mjs's root of links (made as the step runs), their sheet
    // beside, so that the 22's numbers stay comparable with the rounds before; then both again with every switch on)
    steps: ctx => {
      const dir = name => join(ctx.work, name)
      return [
        productionRows(PARITY_PAIRS),
        productionRows(ADDED, withAdded, 'rows-added'),
        ...parity(ctx, dir('display'), PARITY_PAIRS),
        ...parity(ctx, dir('display-added'), ADDED, { wrap: withAdded, as: '-added' }),
        ...parity(ctx, dir('display-on'), PARITY_PAIRS, { toggles: ['--toggles=on'], as: '-on' }),
        ...parity(ctx, dir('display-added-on'), ADDED, { toggles: ['--toggles=on'], wrap: withAdded, as: '-added-on' }),
      ]
    },
    judge: (ctx, steps) => {
      const j = displayJudge(steps, 14, [['', []], ['-added', ['added']], ['-on', ['on']], ['-added-on', ['on', 'added']]], ['rows', 'rows-added'])
      const sheets = ['display', 'display-added', 'display-on', 'display-added-on'].map(d => join(ctx.work, d, 'sheet', 'index.html')).join(', ')
      return { ...j, note: [j.note, `the sheets: ${sheets}`].filter(Boolean).join('; ') }
    },
  },
  {
    id: 'typeset-data',
    title: "the typesetter's generated data equal to their sources, and today's readings derived again (lab/typeset/*-data.mjs --check, derive.mjs)",
    tier: 'full',
    stage: 'reader',
    holds: [],
    // (today's engine at 065c1d973, read only: AXT_TODAY, else the worktree beside this one that packages/typeset/tests/replay/tap.ts names)
    needs: ctx => [exists("today's engine at 065c1d973 (AXT_TODAY)", join(process.env.AXT_TODAY ?? join(ctx.root, '..', 'refactor-read'), 'src/pdf-reader/engine/rules/tex-names.json'))],
    // (not move-fit.mjs --check, which held the breaker's five moved files to today's code and the changes it lists: the
    // typesetter's rulings edit those files in place since a8c36be1f (2026-11-08, a URL broken where its url package lets TeX
    // break it), about forty commits of PDF-READER §18 and §19, so the file it would write is no longer the package's and the
    // check failed on every one; the moved code is held as the ported files are, by the reader's gates and the display gates)
    steps: () => [
      { cmd: ['node', 'lab/typeset/faces-data.mjs', '--check'], all: true },
      { cmd: ['node', 'lab/typeset/rules-data.mjs', '--check'], all: true },
      { cmd: ['node', '--import', './lab/typeset/register.mjs', 'lab/typeset/derive.mjs'], all: true },
      { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'lab/typeset/vitest.config.ts'], all: true },
    ],
  },
  {
    id: 'harness-lab',
    title: "the reader package's browser checks with five corpus papers, laid from this run's bundles and this run's rows of them (the prepare's bundles; reader-parts' rows step, Google's rows over them read from the lab's store, no translator asked); the text layer's order asserted; their I1 residue and I3 reported, not asserted",
    tier: 'full',
    stage: 'reader',
    holds: ['I8'],
    // (bundles and rows of the same run, never one without the other: the prepare's bundles (AXT_L1_BUNDLES) and the rows
    // reader-parts' rows step made over them (AXT_LAB_ROWS). The harness refuses bundles without rows, and stops before any
    // check where a paper's rows leave a unit its bundle asks without a row, or name units it does not hold ("rows do not belong
    // to these bundles": rows of another run); a paper the rows do not hold is laid from lane L1's bundle and the baseline's dump
    // of today's reader over it, named in the gate's numbers. Laid with rows of no run of its own, today's dumps keyed by L1's
    // units, the run's bundles left the units its prepare cut otherwise without a row: 2609.26457v1's abstract and introduction
    // the original's, lane harness-weight, 2026-11-13)
    after: ['prepare', 'reader-parts'],
    // (the papers' arXiv PDFs, the baseline's dumps the lab's; the rows this run's reader-parts made)
    needs: ctx => [
      exists("the corpus papers' list", lab(ctx, 'baseline/corpora/papers.json')),
      exists("today's reader dumps", lab(ctx, 'baseline/reader')),
      exists("this run's rows of its bundles (reader-parts' rows step)", runRowsDir(ctx)),
    ],
    steps: ctx => [{ cmd: ['node', 'packages/reader/e2e/run.mjs'], slot: 'e2e', env: { AXT_LAB_FIXTURES: HARNESS_PAPERS.join(','), AXT_L1_BUNDLES: bundlesDir(ctx), AXT_LAB_ROWS: runRowsDir(ctx), AXT_TIMINGS_OUT: join(ctx.work, 'harness-lab-timings.json') } }],
    judge: (ctx, steps) => harnessLabJudge(steps[0]),
  },
  // today's reader, the way back until the cut-over deletes it: a build of its own (a default build carries the rebuilt reader,
  // on which reader.mjs and registration.mjs run the rebuilt reader's checks), today's checks run on it; a build that carries the
  // rebuilt reader's PDF.js files is refused, so that the rebuilt reader's checks never stand in for today's
  {
    id: 'build-today',
    title: "the extension built with today's reader (AXT_READER=today) from this commit, apart from the checkout (lab/release-check/today-build.sh): the way back, until the cut-over deletes it",
    tier: 'full',
    stage: 'reader',
    holds: [],
    steps: ctx => [{ cmd: ['bash', 'lab/release-check/today-build.sh', ctx.root, join(ctx.work, 'today-reader')], slot: 'test' }],
  },
  todayE2e('e2e:reader', "today's reader (AXT_READER=today, the way back) on the stand-in of the v1 layer API: tests/e2e/reader.mjs's own checks"),
  todayE2e('e2e:registration', "today's reader (AXT_READER=today): a laid page's copy, SVG and links registered at every zoom"),
  // ---------------------------------------------------------------- the private repository's (named, never run here)
  { id: 'private-platform', title: "the private repository's platform tier: the Worker, the paper's object and the Workflows under workerd, the routes' contract suite, the persisted contracts", tier: 'full', stage: 'platform', holds: [], private: true },
  { id: 'private-box', title: "the private repository's box tier: the security suite on native amd64", tier: 'release', stage: 'box', holds: ['I9'], private: true },
  { id: 'private-box-bytes', title: "the private repository's box tier: the corpus through the box, byte for byte the lab's prepare", tier: 'release', stage: 'box', holds: ['I6'], private: true },
  { id: 'private-site', title: "the private repository's website reader e2e (the reader package behind the site's host)", tier: 'full', stage: 'reader', holds: ['I8'], private: true },
  { id: 'private-soak', title: "the private repository's staging soak: the prepare's and the translation's records on staging", tier: 'release', stage: 'corpus', holds: [], private: true },
  { id: 'private-sweep', title: "the private repository's release sweep against staging", tier: 'release', stage: 'corpus', holds: ['D'], private: true },
  // ---------------------------------------------------------------- corpus (before a release, the owner's machine)
  {
    id: 'display-wide',
    title: "display ≥ today on every pair of the stored rows (lab/typeset/parity/ over the 90 pairs, about 2,300 pages, under the reader's default options): the display gate's question, the owner's rulings encoded in its verdict, on every pair the lab holds today's rows of; today's rows checked production's first",
    tier: 'release',
    stage: 'corpus',
    holds: ['I3', 'I10'],
    // (the maintainer's base threshold, as `display` asks it, over every pair: in typeset-replays' place, design 3i; about 2.5
    // hours of browser slots (954 s for 344 pages, measured on a shared machine), once per candidate, overnight. A page it leaves
    // uncovered is fixed, shown to be a measure's artefact, or brought to the owner, never listed as accepted. After the cut-over
    // today's side of every measure is read from what C1 froze)
    cutover: true,
    after: ['prepare'],
    disk: true,
    needs: ctx => [...parityNeeds(ctx), exists('the 90 pairs of the stored rows', lab(ctx, STORED))],
    steps: ctx => {
      const pairs = storedOf(ctx)
      return [productionRows(pairs), ...parity(ctx, join(ctx.work, 'display-wide'), pairs)]
    },
    judge: (ctx, steps) => {
      const j = displayJudge(steps, 4, [['', []]], ['rows'])
      return { ...j, note: [j.note, `the sheet: ${join(ctx.work, 'display-wide', 'sheet', 'index.html')}`].filter(Boolean).join('; ') }
    },
  },
  {
    id: 'pixels',
    title: "the prepare's pixel proofs on every page of the 88 papers and the added pairs': all groups on is arXiv's page under Splash (I1 (b)), each kind off changes only its ink under Cairo (I2 (c))",
    tier: 'release',
    stage: 'corpus',
    holds: ['I1', 'I2'],
    disk: true,
    needs: ctx => [...corpusNeeds(ctx), exists('poppler (pdftoppm, pdftocairo)', which('pdftocairo'))],
    steps: ctx => [listStep(ctx), { cmd: corpusArgs(ctx, join(ctx.work, 'pixels'), '--prove', '--pixels', '--cairo'), slot: 'run', fresh: join(ctx.work, 'pixels') }],
    judge: ctx => corpusJudge(ctx, join(ctx.work, 'pixels'), ['a', 'c', 'on', 'offOutside']),
  },
  {
    id: 'canvas',
    title: "all groups on in the reader's canvas: arXiv's page against the composed document in Chromium, on spike S1c's papers (lab/pdf/prepare-back/canvas.mjs, the bound its header names)",
    tier: 'release',
    stage: 'corpus',
    holds: ['I1'],
    after: ['prepare'],
    needs: ctx => [exists("spike S1c's papers (lane L1's canvas runs)", lab(ctx, 'lanes/L1-canvas.jsonl')), exists('the 88 papers', lab(ctx, PAPERS))],
    steps: ctx => [{ cmd: ['node', '--import', 'tsx', 'lab/pdf/prepare-back/canvas.mjs', join(ctx.work, 'prepare'), lab(ctx, PAPERS), ...canvasIds(ctx)], slot: 'e2e' }],
    judge: (ctx, steps) => {
      const c = canvasOf(steps[0].text, canvasIds(ctx))
      return { pass: steps[0].exit === 0 && c.papers > 0 && !c.over.length, numbers: { papers: c.papers, pages: c.pages, over: c.over.length }, note: c.over.slice(0, 4).join('; ') }
    },
  },
  {
    id: 'speed',
    title: "today's engine's speed check, head against the released tree (lab/pdf/spikes/layer-gate/run-speed.sh; CLAUDE.md's rule before a release): src/pdf-reader/engine, which the extension's reader still runs (AXT_READER 'today', stage 5a) and which perf-batch and perf-release, measuring the website's readers, do not",
    tier: 'release',
    stage: 'corpus',
    holds: [],
    // (the driver is a zsh script and only measures: its runs' logs go to the work directory, and the verdict is speed.mjs's
    // over them, exit 0 PASS, 1 FAIL, 2 INCOMPARABLE; a measurement with no verdict is no pass. It goes with today's engine,
    // deleted at the cut-over: design §6.2 stage 6, "nothing of the old paths in either tree")
    needs: ctx => [exists("the base: today's released engine at 065c1d973 (RELEASE_CHECK_BASE, else AXT_TODAY, else the worktree beside this one)", join(speedBase(ctx), 'src/pdf-reader/engine')), exists('the layer gate\'s fixture pack (PACK)', packOf(ctx)), exists('zsh', which('zsh'))],
    steps: ctx => [
      { cmd: ['zsh', 'lab/pdf/spikes/layer-gate/run-speed.sh', ctx.root, speedBase(ctx), '3'], slot: 'e2e', env: { PACK: packOf(ctx), SPEED_LOGS: join(ctx.work, 'speed') }, fresh: join(ctx.work, 'speed') },
      { cmd: ['node', 'lab/pdf/spikes/layer-gate/speed.mjs', join(ctx.work, 'speed')] },
    ],
    judge: (ctx, steps) => {
      const analysis = steps[1]
      if (!analysis) return { pass: false, note: 'no verdict: the analysis did not run' }
      const verdict = analysis.exit === 0 ? 'PASS' : analysis.exit === 1 ? 'FAIL' : analysis.exit === 2 ? 'INCOMPARABLE' : `exit ${analysis.exit}`
      return { pass: analysis.exit === 0, note: `the analysis: ${verdict}` }
    },
  },
  // ---------------------------------------------------------------- performance (the owner's base threshold: better than
  // production, measured; lab/release-check/perf.mjs judges, the lab's perf/tools measure: each reader built as its website
  // builds it and served offline from stored data, each prepare in its own compile image under one CPU and 3 GiB as the box.
  // The per-batch check holds only the slots of its own kinds under the machine's ordinary load (no integration round can give
  // it the whole machine): its spreads are that load's, its judged measures lean on counts, bytes and CPU time. The release's
  // comparison holds every heavy slot (perf/tools/quiet.sh), in a window the coordinator gives)
  {
    id: 'perf-batch',
    title: "the per-batch performance check: NEW's prepare in the round's box (one paper, three times, a warm box, the docker slot) and its reader built from this commit in the website's tree (three papers, three visits each after a warm-up, one e2e slot), each measure against the last round recorded, worse or missing only past the two rounds' run-to-run spreads added under ordinary load (lab perf/tools/run.mjs --mode=batch, lab/release-check/perf.mjs)",
    tier: 'full',
    stage: 'corpus',
    holds: [],
    needs: (ctx) => [exists('the performance tools', lab(ctx, 'perf/tools/run.mjs')), exists("the website's tree NEW's reader is built in (PERF_WEB: a website worktree, its HEAD the website's side)", perfWeb())],
    // (NEW's reader built from this commit (build-new.sh: the website's HEAD with this commit as vendor/readarxiv, built as staging
    // builds it), never a build made before: a build of another head would measure that head. The reader is given this run's own
    // bundles where the prepare gate made them, else the lab's last round's; run.mjs takes each part's slot itself)
    steps: (ctx) => [buildNew(ctx, join(ctx.work, 'perf-batch-build')), { cmd: ['node', lab(ctx, 'perf/tools/run.mjs'), '--mode=batch', `--work=${join(ctx.work, 'perf-batch')}`], env: { ENGINE: ctx.root, PERF_BUILD: join(ctx.work, 'perf-batch-build'), ...bundlesOf(ctx) }, fresh: join(ctx.work, 'perf-batch') }],
    judge: (ctx, steps) => perfJudge(steps),
  },
  {
    id: 'perf-release',
    title: "performance ≥ today: TODAY's reader and box (production's release: the engine at 065c1d973 and the website that pins it) against NEW's on the same papers and the same stored translation, every measure; NEW worse on any past the two sides' run-to-run spreads added fails it (lab perf/tools/run.mjs --mode=release, lab/release-check/perf.mjs; a cut-over blocker)",
    tier: 'release',
    stage: 'corpus',
    holds: [],
    // (the maintainer's base threshold for the refactor: performance better than the production site's)
    cutover: true,
    needs: (ctx) => [
      exists('the performance tools', lab(ctx, 'perf/tools/run.mjs')),
      exists('the quiet window', lab(ctx, 'perf/tools/quiet.sh')),
      exists("TODAY's reader's build and tree (PERF_TODAY_BUILD: today-dist-web, today-web)", join(todayPerfBuild(), 'today-dist-web')),
      exists("the website's tree NEW's reader is built in (PERF_WEB: a website worktree, its HEAD the website's side)", perfWeb()),
    ],
    // (NEW's reader built from this commit as perf-batch builds it, TODAY's linked from production's build beside it)
    steps: (ctx) => {
      const build = join(ctx.work, 'perf-release-build')
      return [
        buildNew(ctx, build),
        ...['today-dist-web', 'today-web'].map(d => ({ cmd: ['ln', '-sfn', join(todayPerfBuild(), d), join(build, d)] })),
        { cmd: ['bash', lab(ctx, 'perf/tools/quiet.sh'), '--', 'node', lab(ctx, 'perf/tools/run.mjs'), '--mode=release', `--work=${join(ctx.work, 'perf-release')}`], env: { ENGINE: ctx.root, PERF_BUILD: build, ...bundlesOf(ctx) }, fresh: join(ctx.work, 'perf-release') },
      ]
    },
    judge: (ctx, steps) => perfJudge(steps),
  },
  // the online scripts: arXiv, the free engines and staging, under the project's User-Agent (tests/e2e/lib/online.mjs)
  { id: 'build-staging', title: 'the staging build the online scripts take (pnpm build:staging)', tier: 'release', stage: 'corpus', holds: [], network: 'live', steps: () => [pnpm('build:staging')] },
  ...[
    ['e2e', 'whole-page translation, the cache, restore, the fallback, the popup, diagnostics'],
    ['e2e:pdf', "arXiv's PDF page: the button and the popup open the bilingual version"],
    ['e2e:floating', 'the floating button on the abstract, PDF and full-text pages'],
    ['e2e:popup', 'the popup: finding a paper, the menus, the entries'],
    ['e2e:layout', 'the side-mode layout contract'],
    ['e2e:local-endpoint', 'an http endpoint without CORS headers translates a whole page'],
    ['e2e:image', 'image translation, bitmaps read by the shipped recogniser'],
    ['e2e:placeholders', 'the live placeholder run: survival per sentence shape against a real engine'],
  ].map(([script, title]) => ({ ...e2e(script, title), tier: 'release', stage: 'corpus', network: 'live', after: ['build-staging'], steps: () => [{ cmd: ['pnpm', script], slot: 'e2e', env: { AXT_E2E_ONLINE: '1' } }] })),
]

/**
 * The gates retired, each with its reason and what holds its question now. A retired gate is not run and not judged: naming it
 * to --only says why, and the report lists them. Its tools stay runnable in the lab until the cut-over deletes them with today's
 * engine (design 3i, C1).
 */
export const RETIRED = [
  {
    id: 'typeset-parts',
    retired: '2026-11-13',
    by: ['reader-parts'],
    why: "its runner (lab/typeset/gate-l1.mjs, today's reading: no --entry) lays only units whose id is today's, and the owner's rulings since 2026-11-08 cut units otherwise on purpose: its losses (1,416 at 13216ac44, 4,043 at round B14, all 'not laid from L1's part') counted the runner, not what the reader draws. The reader gate as the entry lays each page, over both rows stores (reader-parts), holds I3 read by ink, I4 and I5; that nothing is lost is held by prepare-diff, display and sentence-cover",
  },
  {
    id: 'typeset-replays',
    retired: '2026-11-13',
    by: ['display-wide'],
    why: "the six replays (lab/typeset/replay-*.mjs) compare the typesetter's internal passes with today's recorded ones: every ruling since 2026-11-08 would have to be taught to four replay readers that the cut-over deletes, and a pass that differs is not a difference a reader sees (at 13216ac44 fit and display failed on one pair, a crop box the tap does not record; at round B14's head emit read 13 differing and 9 thrown). Their point, a comparison with today's lay wider than 22 pairs, is the display gate over every pair of the stored rows (display-wide), which asks the owner's own question with his rulings encoded and survives the cut-over",
  },
]

/** the website's tree NEW's reader is built in: PERF_WEB, a website worktree whose HEAD is the website's side (its pin of
 *  vendor/readarxiv replaced by this commit); none by default, so that no build stands in for the head's */
const perfWeb = () => process.env.PERF_WEB ?? ''
/** TODAY's reader's build and tree (production's: the website at 0bf496b5 with the engine 065c1d973), which perf-release
 *  measures against: PERF_TODAY_BUILD, else where the lab's performance lane built it */
const todayPerfBuild = () => process.env.PERF_TODAY_BUILD ?? '/Volumes/SanDisk_Dev/readarxiv-lab-archive/perf-check/build'
/** NEW's reader built from this commit into `build` (the lab's perf/tools/build-new.sh: the website's HEAD exported with this
 *  commit as vendor/readarxiv, installed from the store, built as staging builds it, into new-web and new-dist-web) */
const buildNew = (ctx, build) => ({ cmd: ['bash', lab(ctx, 'perf/tools/build-new.sh'), 'HEAD', 'HEAD'], slot: 'test', env: { PERF_BUILD: build, PERF_WEB_REPO: perfWeb(), PERF_ENGINE_REPO: ctx.root }, fresh: build, as: 'build' })
/** NEW's bundles the reader is served: the prepare gate's of this run where it made them (PERF_V2_BUNDLES), else none set */
const bundlesOf = (ctx) => (existsSync(join(ctx.work, 'prepare', 'bundles')) ? { PERF_V2_BUNDLES: join(ctx.work, 'prepare', 'bundles') } : {})
/** a performance gate's reading: the lab's run's last line (perf.mjs perfOf), its pass the run's own exit and verdict */
function perfJudge(steps) {
  const built = steps.find(x => x.as === 'build')
  if (built && built.exit !== 0) return { pass: false, note: `NEW's reader could not be built from this commit: ${lastLine(built.text)}` }
  const s = steps.at(-1)
  const p = perfOf(s?.text ?? '')
  if (!p) return { pass: false, note: 'no verdict: the run printed no {"perf": …} line' }
  // (a round whose repetition stalled twice in a row: the machine could not measure; skipped, never a pass: perf.mjs stallOf)
  if (p.unmeasured) return { skip: `the machine could not measure: ${p.unmeasured}` }
  const { mode, pass, worse, ...numbers } = p
  return { pass: s.exit === 0 && pass === true, numbers, note: worse?.length ? `worse: ${worse.join(', ')}` : undefined }
}

/** the canvas gate's papers: spike S1c's, as lane L1's canvas runs list them */
const canvasIds = ctx => readFileSync(lab(ctx, 'lanes/L1-canvas.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).id)
/** the layer gate's fixture pack: PACK, else where the rules gate restores it */
const packOf = ctx => process.env.PACK ?? join(ctx.root, 'lab/pdf/out/gate-pack')
/** the speed check's base: RELEASE_CHECK_BASE, else the last release's tree, today's engine at 065c1d973, as the gates that
 *  read today's engine take it (AXT_TODAY, else the worktree beside this one) */
const speedBase = ctx => process.env.RELEASE_CHECK_BASE ?? process.env.AXT_TODAY ?? join(ctx.root, '..', 'refactor-read')

const lastLine = t => t.trim().split('\n').filter(l => !/^\s*at /.test(l)).at(-1)?.slice(0, 200) ?? ''

function which(bin) {
  for (const dir of (process.env.PATH ?? '').split(':')) if (dir && existsSync(join(dir, bin))) return join(dir, bin)
  return ''
}

function corpusJudge(ctx, out, proofs) {
  const log = corpusLogOf(join(out, 'log.tsv'))
  if (log.refused.length) return { skip: `the corpus runner refused ${log.refused.length} of ${log.papers} papers: ${log.refused[0]}` }
  const failing = proofs.filter(k => log.proofs[k] > 0)
  const drawn = existsSync(join(out, 'prepare')) ? drawnOf(join(out, 'prepare')) : {}
  return {
    pass: !log.failed.length && !log.missingCompile.length && !failing.length && log.made === log.papers,
    numbers: { papers: log.papers, made: log.made, ...Object.fromEntries(proofs.map(k => [`proof ${k}`, log.proofs[k]])), refusedWhole: drawn.refusedWhole },
    note: [log.failed[0], log.missingCompile.length && `${log.missingCompile.length} papers missing a compile (exit 3): ${log.missingCompile.slice(0, 3).join(', ')}`, failing.length && `proofs failing: ${failing.join(', ')}`].filter(Boolean).join('; '),
    // (I1: (a) the ink nothing moved, (b) every group on is A's pixels; I2: (c′) each glyph and box in exactly its group, (c)
    // a kind off changes pixels inside its ink alone)
    findings: Object.fromEntries(
      [['I1', ['a', 'on']], ['I2', ['c', 'offOutside']]].map(([i, ks]) => {
        const bad = ks.filter(k => proofs.includes(k) && log.proofs[k] > 0)
        return [i, { held: !bad.length, count: bad.length ? bad.map(k => `${k} ${log.proofs[k]}`).join(', ') : 0 }]
      }),
    ),
  }
}

/** a parity verdict's numbers (lab/typeset/parity/measure.mjs's log): its pages, pairs and pages worse; what kept it from being
 *  judged whole (an asked pair or page not drawn, a page that failed: any fails the gate); each measure's pages worse */
function parityOf(text) {
  const m = /parity: (\d+) pages of (\d+) pairs; (\d+) worse than today/.exec(text)
  const numbers = m ? { pages: num(m[1]), pairs: num(m[2]), worse: num(m[3]) } : {}
  const inc = /^incomplete: (\d+)/m.exec(text)
  if (inc) numbers.incomplete = num(inc[1])
  for (const f of text.matchAll(/^ {2}([a-z-]+) +(\d+) pages worse \((\d+) differences\), (\d+) nearer/gm)) numbers[f[1]] = `${f[2]} pages worse, ${f[4]} nearer`
  return numbers
}

function typesetJudge(steps) {
  const t = typesetOf(steps[0].text)
  const d = steps[1] ? diffOf(steps[1].text) : {}
  return {
    pass: steps.every(s => s.exit === 0),
    numbers: { ...d, I3: t.I3, I4: t.I4, I5: t.I5, msPerPage: t.msPerPage, layP50: t.layP50, layP90: t.layP90, layP99: t.layP99, layPages: t.layPages, ...(t.added ? { added: { pairs: t.added.pairs, I3: t.added.I3, I4: t.added.I4, I5: t.added.I5 } } : {}) },
    findings: Object.fromEntries(['I3', 'I4', 'I5'].filter(k => t[k] != null).map(k => [k, { held: t[k] === 0, count: t[k] }])),
  }
}
