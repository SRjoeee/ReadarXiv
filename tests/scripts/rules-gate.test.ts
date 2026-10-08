import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureTotals, MEASURES, type PageEntry } from '../../lab/pdf/spikes/layer-gate/score.mjs'
import { checkRulesFile, commentOf, fragmentsIn, gateArgs, judge, labLink, leaksIn, loadRuling, MARK, outputsOfPack, parseRuling, publicLine, textsOf } from '../../lab/pdf/spikes/rules-gate.mjs'
import { BUILTIN_RULES, readRules, writeRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The rules gate's verdict (lab/pdf/spikes/rules-gate.mjs, rules-as-data plan §8, Task R6): two model-tier runs of one
// runner, base and head, pooled per target and held to the merge rule's thresholds; the single PR comment it writes; and
// the checks of a changed layout-rules.json. The runs here are synthetic and hold numbers alone: no fixture, no text.

const SHA_HEAD = '1234567890abcdef1234567890abcdef12345678'
const SHA_BASE = 'abcdef1234567890abcdef1234567890abcdef12'
const SAME_INPUTS = { tier: 'model', pages: 'the first 12 of each output', scale: 2.5, inkScale: 2, inkMin: 4, composite: 'darken', layouts: 'given', fixtures: 'out/gate-pack/fixtures', chromium: '153.0.0.0', pdfjs: '6.3.289', fonts: 'ffffffffffffffff', checker: 'cccccccccccccccc', measures: 'dddddddddddddddd', kind: 'proto', protoUnits: 'fixture', place: "the gate's", order: 'layGroups', tex: '{"use":"lines"}', hyphenation: 'eeeeeeeeeeeeeeee', removal: 'draw' }

/** a page's entry as the gate builds it, before the record drops its zeros: every model count in place */
function page(p: number, over: Record<string, unknown> = {}): PageEntry {
  return {
    p, textOn: 10, textDrawn: 10, cellsOn: 0, cellsDrawn: 0, left: {}, frames: 3, fills: 3, fill: 0.92, blankLines: 0, framesBlank1: 0, pitch: 1.3, pitchSpread: 0.01, scale: 1, fullSize: 3, scaleSpread: 0, dTop: 0, overRight: 0, onGrid: 1,
    cropForeign: 0, wrongPageText: 0, droppedPh: 0, modelCells: 100, missing: 0, twice: 0, brackets: 0, duplicated: 0, clipped: 0, markerResidue: 0, numbersTotal: 2, numbersShown: 2, numbersLost: 0, groupsSplit: 0, labelsSource: 0, style: [0, 0], ...over,
  }
}
/** a page's frames, as pageEntry returns them: the pitch spread is the pitches' */
const frames = (e: PageEntry) => ({ body: [1, 2, 3].map(() => ({ kind: 'para', scale: 1, blank: 0, pitch: 1.3, dTop: 0, dRight: 0, onGrid: 1 })), fills: [0.92, 0.92, 0.92], pitches: [1.3, 1.3 + Number(e.pitchSpread)], scales: [1, 1] })
/** the record drops what is zero or empty (layer-gate.mjs compact), so that a page missing a defect has none */
const compact = (e: PageEntry): PageEntry => Object.fromEntries(Object.entries(e).filter(([, v]) => !(v === 0 || v === null || (Array.isArray(v) && (!v.length || v.every(x => x === 0)))))) as PageEntry
const fixture = (pages: PageEntry[]) => ({ totals: fixtureTotals(pages, pages.map(frames), 'model'), pages: pages.map(compact) })
/** n pages of one output, each with its own overrides */
const output = (...overs: Record<string, unknown>[]) => fixture(overs.map((o, i) => page(i + 1, o)))

type Fixtures = Record<string, ReturnType<typeof fixture>>
function run(fixtures: Fixtures, o: { commit?: string; inputs?: Record<string, unknown>; failed?: { name: string; why: string }[]; failures?: string[]; version?: number } = {}) {
  return {
    schema: 1, tier: 'model', made: '2026-10-08T00:00:00.000Z', seconds: 30, gate: { commit: SHA_HEAD, dirty: false }, engine: { root: '.', commit: o.commit ?? SHA_HEAD, branch: 'x', dirty: false },
    inputs: { ...SAME_INPUTS, rules: { version: o.version ?? 1, sha256: 'a'.repeat(64) }, ...o.inputs }, totals: {}, fixtures, failed: o.failed ?? [], failures: o.failures ?? [],
  }
}
const labelOf = (key: string) => MEASURES.find(m => m[0] === key)![4]

/** four outputs: zh twice (two papers), ja and de once */
function base(over: { zhA?: Record<string, unknown>[]; zhB?: Record<string, unknown>[]; ja?: Record<string, unknown>[]; de?: Record<string, unknown>[] } = {}): Fixtures {
  return {
    '1512.03385v1-zh': output(...(over.zhA ?? [{}, {}])), '1706.03762v7-zh': output(...(over.zhB ?? [{}, {}])),
    '1512.03385v1-ja': output(...(over.ja ?? [{}, {}])), '1512.03385v1-de': output(...(over.de ?? [{}, {}])),
  }
}

describe('a target is pooled over its outputs and held to score.mjs\' thresholds', () => {
  it('pools zh over its two papers: one paper worse by more than the ratio tolerance moves the pool by half, and a pool within it is no regression', () => {
    // pitch spread, a ratio gated at 0.02: paper A from 0.01 to 0.04, paper B unchanged. A's +0.03 is outside the tolerance
    // on its own (listed apart, per output) and +0.015 inside it on the pool of two equally weighted papers
    const within = judge(run(base()), run(base({ zhA: [{ pitchSpread: 0.04 }, { pitchSpread: 0.04 }] })))
    expect(within.regressions).toEqual([])
    expect(within.perFixture.regressions.map(r => `${r.fixture}:${r.measure}`)).toEqual(['1512.03385v1-zh:pitchSpread'])
    const beyond = judge(run(base()), run(base({ zhA: [{ pitchSpread: 0.09 }, { pitchSpread: 0.09 }] })))
    expect(beyond.regressions.map(r => `${r.target}:${r.measure}`)).toEqual(['zh:pitchSpread'])
    expect(beyond.regressions[0]).toMatchObject({ label: labelOf('pitchSpread'), ruling: null })
    expect(beyond.regressions[0]!.to! - beyond.regressions[0]!.from!).toBeCloseTo(0.04, 3)
    expect(beyond.ok).toBe(false)
  })

  it('does not let one paper\'s gain hide in the pool of another target, and counts any unit left English as a regression (a count has no tolerance)', () => {
    const r = judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}], zhA: [{ pitchSpread: 0 }, { pitchSpread: 0 }] })))
    expect(r.regressions.map(x => `${x.target}:${x.measure}`)).toEqual(['ja:unitsLeft'])
    expect(r.improvements.map(x => `${x.target}:${x.measure}`)).toEqual([])
    // zh's gain is inside the tolerance on the pool, de did not move
    expect(r.targets.map(t => [t.target, t.worse, t.better])).toEqual([['de', 0, 0], ['ja', 1, 0], ['zh', 0, 0]])
    expect(r.targets.find(t => t.target === 'zh')!.outputs).toEqual(['1512.03385v1-zh', '1706.03762v7-zh'])
    // a defect is compared as a rate per 1,000 cells of the drawn units' frames: a placeholder missing on one page of 200 cells
    const d = judge(run(base()), run(base({ de: [{ missing: 1 }, {}] })))
    expect(d.regressions.map(x => `${x.target}:${x.measure}`)).toEqual(['de:missing'])
  })

  it('lists every model measure of every target with its two values and whether it moved', () => {
    const r = judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })))
    const model = MEASURES.filter(m => m[1] === 'model')
    const ja = r.targets.find(t => t.target === 'ja')!
    expect(ja.rows.map(x => x.key)).toEqual(model.map(m => m[0]))
    expect(ja.rows.find(x => x.key === 'unitsLeft')).toMatchObject({ base: 0, head: 1, moved: 'worse' })
    expect(ja.rows.find(x => x.key === 'fill')!.moved).toBe(null)
    expect(r.targets.find(t => t.target === 'zh')!.rows.every(x => x.moved === null)).toBe(true)
  })

  it('refuses to compare what is not one instrument or one set of outputs', () => {
    expect(judge(run(base()), run(base(), { inputs: { chromium: '154.0.0.0' } })).problems.join('\n')).toMatch(/chromium/)
    expect(judge(run(base()), run(base(), { inputs: { tier: 'pixel' } })).ok).toBe(false)
    const fewer = base()
    delete (fewer as Record<string, unknown>)['1512.03385v1-de']
    expect(judge(run(base()), run(fewer)).problems.join('\n')).toMatch(/1512\.03385v1-de.*only in the base run/)
    // an output that failed is in no run's fixtures but in its `failed`, with a reason that is a message of the run's, never the gate's to copy
    const noJa = base()
    delete (noJa as Record<string, unknown>)['1512.03385v1-ja']
    const failed = judge(run(base()), run(noJa, { failed: [{ name: '1512.03385v1-ja', why: 'no layout file' }] }))
    expect(failed.problems).toEqual(['1512.03385v1-ja did not run in the head run'])
    // the rule sets differing is the point of the run, not a reason to refuse; so is anything else the engine under test computes
    // for itself: the hyphenation digest is made by the hyph.mjs of the engine measured, which a pull request may change
    expect(judge(run(base()), run(base(), { version: 2 })).problems).toEqual([])
    expect(judge(run(base()), run(base(), { inputs: { hyphenation: '0123456789abcdef', remover: '0123456789abcdef' } })).problems).toEqual([])
  })
})

describe('a run is accepted only when it is whole', () => {
  // the layer gate exits 1 for an output that threw, one that changed its inputs and a request that left the machine, and the run
  // file used to say none of it: two runs that lost the same outputs agreed on every output they shared
  const JA = '1512.03385v1-ja', DE = '1512.03385v1-de'
  const manifest = { files: Object.keys(base()).flatMap(n => [`refs/${n}/ref.json`, `refs/${n}/layout.json`, `fixtures/${n}/arxiv.pdf`]).map(path => ({ path })).concat([{ path: 'data/fonts/A.otf' }, { path: 'refs/not-a-fixture/ref.json' }]) }
  const OUTPUTS = outputsOfPack(manifest)
  const without = (...names: string[]) => { const f = base() as Record<string, unknown>; for (const n of names) delete f[n]; return f as Fixtures }

  it('takes the pack\'s outputs from its frozen references, and nothing that is no output\'s name', () => {
    expect(OUTPUTS).toEqual(['1512.03385v1-de', '1512.03385v1-ja', '1512.03385v1-zh', '1706.03762v7-zh'])
    expect(outputsOfPack({ files: [] })).toEqual([])
    expect(outputsOfPack(null)).toEqual([])
  })
  it('refuses an output that threw, though both runs lost the same one and agree on all the others', () => {
    const lost = () => run(without(JA), { failures: [JA] })
    const r = judge(lost(), lost(), { outputs: OUTPUTS })
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([`${JA} failed in the base run`, `${JA} failed in the head run`])
    // without a pack to hold them to, the failure alone is enough
    expect(judge(lost(), lost()).problems).toEqual([`${JA} failed in the base run`, `${JA} failed in the head run`])
  })
  it('refuses an output that ran but changed its inputs, which is in the run\'s fixtures', () => {
    const r = judge(run(base()), run(base(), { failures: [DE] }), { outputs: OUTPUTS })
    expect(r.problems).toEqual([`${DE} failed in the head run`])
  })
  it('refuses a request that would have left the machine', () => {
    const r = judge(run(base(), { failures: ['network'] }), run(base()), { outputs: OUTPUTS })
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual(['the base run made a request that would have left the machine'])
  })
  it('names an output that was not ready once, as the run that could not run it', () => {
    const r = judge(run(base()), run(without(JA), { failed: [{ name: JA, why: 'no geometry for v0' }], failures: [JA] }), { outputs: OUTPUTS })
    expect(r.problems).toEqual([`${JA} did not run in the head run`])
  })
  it('refuses two empty runs, with a pack or without one', () => {
    const empty = () => run({} as Fixtures)
    const withPack = judge(empty(), empty(), { outputs: OUTPUTS })
    expect(withPack.ok).toBe(false)
    expect(withPack.problems).toEqual([`the base run holds no output`, `the head run holds no output`])
    expect(judge(empty(), empty()).ok).toBe(false)
    expect(judge(empty(), empty()).problems).toEqual(withPack.problems)
  })
  it('refuses a run that lacks an output of the pack, or holds one the pack does not, naming the side and the names', () => {
    const r = judge(run(without(JA, DE)), run(base()), { outputs: OUTPUTS })
    expect(r.problems).toEqual([`the base run lacks 2 outputs of the pack's: ${DE}, ${JA}`, `${DE} only in the head run`, `${JA} only in the head run`])
    const more = judge(run(base()), run({ ...base(), '2001.00001v1-zh': output({}, {}) }), { outputs: OUTPUTS })
    expect(more.problems).toEqual([`the head run holds 1 output the pack does not: 2001.00001v1-zh`, `2001.00001v1-zh only in the head run`])
  })
  it('refuses a run that does not say what failed (another gate\'s), and one that names a failure by something that is no name', () => {
    const old = run(base()) as Record<string, unknown>
    old.failures = undefined
    expect(judge(old as ReturnType<typeof run>, run(base()), { outputs: OUTPUTS }).problems).toEqual(['the base run does not say what failed: it was made by another gate'])
    const odd = judge(run(base()), run(base(), { failures: ['x'.repeat(5) + '\n<img src=x>'] }), { outputs: OUTPUTS })
    expect(odd.problems).toEqual(['1 output failed in the head run'])
    expect(odd.problems.join('')).not.toContain('<img')
  })
  it('still compares a run that is whole and fails the gate\'s completeness count: that exit is in neither the failures nor the outputs', () => {
    // (the gate exits 1 for a completeness count the merge rule decides; the run it wrote is whole)
    const r = judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { outputs: OUTPUTS })
    expect(r.problems).toEqual([])
    expect(r.regressions.map(x => `${x.target}:${x.measure}`)).toEqual(['ja:unitsLeft'])
    expect(r.ok).toBe(false)
    expect(judge(run(base()), run(base()), { outputs: OUTPUTS }).ok).toBe(true)
  })
  it('is written into the run file by the gate, after the last place that adds to it and before the file is', () => {
    const source = readFileSync(join(resolve(__dirname, '../..'), 'lab/pdf/spikes/layer-gate.mjs'), 'utf8')
    const leak = source.indexOf("failures.push('network')"), literal = source.indexOf('const run = {'), written = source.indexOf('writeFileSync(runFile')
    expect(leak).toBeGreaterThan(0)
    expect(leak).toBeLessThan(literal)
    expect(literal).toBeLessThan(written)
    expect(source.slice(literal, written)).toContain('failures: [...new Set(failures)].sort()')
  })
})

describe('a regression fails the run unless a ruling covers its measure and its target', () => {
  const regressed = () => judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { rulings: [] })
  const ruling = (over: Record<string, unknown> = {}) => parseRuling({ date: '2026-10-08', by: 'the maintainer', quote: 'accepted', english: 'accepted', measures: [labelOf('unitsLeft')], targets: ['ja'], scope: 'one unit of one paper', why: 'the unit is a caption the face lacks', ...over }, 'ja-unit.json')

  it('fails without a ruling', () => {
    const r = regressed()
    expect(r.ok).toBe(false)
    expect(r.regressions).toHaveLength(1)
  })
  it('passes with a ruling that names the measure (by its label or its key) and the target, and says which ruling', () => {
    const rulings = [ruling()]
    const r = judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { rulings })
    expect(r.ok).toBe(true)
    expect(r.regressions[0]).toMatchObject({ target: 'ja', measure: 'unitsLeft', ruling: 'ja-unit.json' })
    expect(judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { rulings: [ruling({ measures: ['unitsLeft'] })] }).ok).toBe(true)
  })
  it('does not pass for another target, another measure, or a regression that comes with a second one', () => {
    const head = run(base({ ja: [{ textDrawn: 9 }, {}] }))
    expect(judge(run(base()), head, { rulings: [ruling({ targets: ['zh'] })] }).ok).toBe(false)
    expect(judge(run(base()), head, { rulings: [ruling({ measures: [labelOf('cellsLeft')] })] }).ok).toBe(false)
    const two = run(base({ ja: [{ textDrawn: 9 }, {}], de: [{ textDrawn: 8 }, {}] }))
    const r = judge(run(base()), two, { rulings: [ruling()] })
    expect(r.ok).toBe(false)
    expect(r.regressions.map(x => `${x.target}:${x.ruling}`)).toEqual(['de:null', 'ja:ja-unit.json'])
  })
  it('takes only a whole ruling: the maintainer\'s quote, the measures and targets it covers, and why', () => {
    const whole = { date: '2026-10-08', by: 'the maintainer', quote: 'q', measures: ['m'], targets: ['ja'], why: 'w' }
    expect(() => parseRuling(whole, 'a.json')).not.toThrow()
    for (const missing of ['by', 'quote', 'measures', 'targets', 'why']) expect(() => parseRuling({ ...whole, [missing]: undefined }, 'a.json')).toThrow(new RegExp(`a\\.json.*${missing}`))
    expect(() => parseRuling({ ...whole, measures: [] }, 'a.json')).toThrow(/measures/)
    expect(() => parseRuling({ ...whole, targets: 'ja' }, 'a.json')).toThrow(/targets/)
  })
})

describe('a ruling file that cannot be parsed is a sentence of ours, never the parser\'s words', () => {
  // the comment is public markdown, and V8 quotes the first characters of a source it cannot parse: an image, a ping or HTML
  const HOSTILE = '@everyone ![x](http://example.com/a.png) <img src=x onerror=1> and more text of the file'
  const script = join(resolve(__dirname, '../..'), 'lab/pdf/spikes/rules-gate.mjs')

  it('says the file is not valid JSON with its validated name, and keeps the parser\'s message for the private log', () => {
    const r = loadRuling('/work/rulings/zh-lead.json', { read: () => HOSTILE })
    expect(r.ruling).toBeUndefined()
    expect(r.problem).toBe('the ruling file `zh-lead.json` is not valid JSON')
    // what the parser said is kept, apart from the comment: it quotes the source
    expect(r.detail).toContain('zh-lead.json: ')
    expect(r.detail).toContain('@everyone')
    // a file whose name is no name is not named, and cannot be read as a ruling either
    expect(loadRuling('/work/rulings/a|b`c.json', { read: () => HOSTILE }).problem).toBe('a ruling file is not valid JSON')
    expect(loadRuling('/work/rulings/gone.json', { read: () => { throw new Error(`ENOENT: ${HOSTILE}`) } }).problem).toBe('the ruling file `gone.json` is not valid JSON')
  })
  it('leaves a valid ruling and a JSON that is no ruling to parseRuling, whose words name a field and nothing else', () => {
    const whole = { date: '2026-10-08', by: 'the maintainer', quote: 'q', measures: ['m'], targets: ['ja'], why: 'w' }
    expect(loadRuling('/work/rulings/ok.json', { read: () => JSON.stringify(whole) }).ruling).toMatchObject({ name: 'ok.json', by: 'the maintainer' })
    expect(loadRuling('/work/rulings/few.json', { read: () => JSON.stringify({ ...whole, why: HOSTILE, measures: [] }) }).problem).toBe('ruling few.json: measures is missing or not a non-empty list of strings')
    expect(loadRuling('/work/rulings/list.json', { read: () => JSON.stringify([HOSTILE]) }).problem).toBe('ruling list.json: not an object')
  })
  it('reaches neither the comment nor the numbers in a compare, which fails for it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rules-gate-compare-'))
    const write = (name: string, content: string) => { writeFileSync(join(dir, name), content); return join(dir, name) }
    const runFile = write('run.json', JSON.stringify(run(base())))
    write('hostile.json', HOSTILE)
    const out = join(dir, 'verdict')
    const r = spawnSync(process.execPath, [script, 'compare', `--base=${runFile}`, `--head=${runFile}`, `--out=${out}`, `--ruling=${join(dir, 'hostile.json')}`], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(1)
    const comment = readFileSync(join(out, 'rules-gate.md'), 'utf8'), numbers = readFileSync(join(out, 'rules-gate.json'), 'utf8')
    expect(comment).toContain('- the ruling file `hostile.json` is not valid JSON')
    expect(comment).toMatch(/^## Rules gate: failed/m)
    for (const text of [comment, numbers, r.stdout]) expect(text).not.toMatch(/@everyone|!\[x\]|<img|example\.com|more text of the file/)
    // the parser's words are in a file of the runner that nothing uploads (the artifact is rules-gate.json alone)
    expect(readFileSync(join(out, 'rulings-private.log'), 'utf8')).toContain('hostile.json: ')
  })
})

describe('compare as the job runs it', () => {
  // the command line itself, on runs of numbers: what the workflow's Verdict step calls
  const root = resolve(__dirname, '../..'), script = join(root, 'lab/pdf/spikes/rules-gate.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'rules-gate-cli-'))
  const write = (name: string, content: unknown) => { writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content)); return join(dir, name) }
  const compareRun = (...args: string[]) => spawnSync(process.execPath, [script, 'compare', ...args], { encoding: 'utf8' })
  const enginePipeline = /export const PIPELINE_VERSION = '([^']+)'/.exec(readFileSync(join(root, 'src/pdf-reader/engine/pipeline/versions.mjs'), 'utf8'))![1]!
  const manifest = (pipeline: string, names: string[]) => ({ schema: 1, pipeline, files: names.map(n => ({ path: `refs/${n}/ref.json` })) })

  it('holds both runs to the pack\'s outputs, and warns of a pack made under another PIPELINE than the engine\'s (it finds the engine\'s version where the engine keeps it)', () => {
    const file = write('run.json', run(base()))
    const names = Object.keys(base())
    const ok = compareRun(`--base=${file}`, `--head=${file}`, `--out=${join(dir, 'ok')}`, `--pack=${write('pack-ok.json', manifest('9', names))}`)
    expect(ok.status, ok.stderr).toBe(0)
    expect(readFileSync(join(dir, 'ok', 'rules-gate.md'), 'utf8')).toContain(`The pack was made under PIPELINE 9 and the engine is at PIPELINE ${enginePipeline}: remake the pack.`)
    // a pack with one more output than the runs hold: both runs lack it
    const more = compareRun(`--base=${file}`, `--head=${file}`, `--out=${join(dir, 'more')}`, `--pack=${write('pack-more.json', manifest(enginePipeline, [...names, '2001.00001v1-zh']))}`)
    expect(more.status).toBe(1)
    const comment = readFileSync(join(dir, 'more', 'rules-gate.md'), 'utf8')
    expect(comment).toContain("- the base run lacks 1 output of the pack's: 2001.00001v1-zh")
    expect(comment).toContain("- the head run lacks 1 output of the pack's: 2001.00001v1-zh")
    expect(comment).not.toContain('remake the pack')
  })
  it('stops at a --pack that names no file, instead of going without one', () => {
    const file = write('run.json', run(base()))
    const r = compareRun(`--base=${file}`, `--head=${file}`, `--out=${join(dir, 'none')}`, `--pack=${join(dir, 'no-such-pack.json')}`)
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--pack: no such file')
  })
})

describe('the comment holds no fixture text', () => {
  // a record as a fixture's record.json holds it: the unit's source, its translation and its pieces
  const RECORD = {
    units: [
      { kind: 'para', src: 'The quick brown fox jumps over the lazy dog near the river bank', tr: 'Der schnelle braune Fuchs springt über den faulen Hund am Flussufer', pieces: [{ t: 'text', tr: true, s: 'Der schnelle braune Fuchs springt' }, { t: 'ph', src: '\\mathcal{L}_{\\mathrm{total}}' }], sentences: { src: ['The quick brown fox jumps over the lazy dog.'], tr: ['Der schnelle braune Fuchs.'] } },
      { kind: 'heading', src: 'A synthetic heading of the second unit', tr: 'Eine synthetische Überschrift der zweiten Einheit', pieces: [{ t: 'text', s: 'Eine synthetische Überschrift der zweiten Einheit' }] },
    ],
  }
  const strings = textsOf(RECORD)

  it('finds the strings of a record to keep out: sources, translations, pieces and sentences, none shorter than ten characters', () => {
    expect(strings.has('The quick brown fox jumps over the lazy dog near the river bank')).toBe(true)
    expect(strings.has('Der schnelle braune Fuchs springt')).toBe(true)
    expect(strings.has('Eine synthetische Überschrift der zweiten Einheit')).toBe(true)
    expect(strings.has('\\mathcal{L}_{\\mathrm{total}}')).toBe(true)
    expect([...strings].every(s => s.length >= 10)).toBe(true)
  })

  it('carries none into the comment or the numbers, though the run files they come from hold them', () => {
    // a run file's fields that hold text in a real run: a failed output's reason, the page errors, the units a check names
    const leaky = (f: Fixtures) => {
      const r = run(f, { failed: [] })
      for (const x of Object.values(r.fixtures) as Record<string, unknown>[]) Object.assign(x, { summary: { pageErrors: [`TypeError at ${RECORD.units[0]!.src}`], why: { [RECORD.units[1]!.src]: 3 } }, info: { family: RECORD.units[0]!.tr } })
      return r
    }
    const headFixtures = base({ ja: [{ textDrawn: 9 }, {}], zhA: [{ pitchSpread: 0.09 }, { pitchSpread: 0.09, where: { missing: [[2, 7]] } }] })
    for (const e of Object.values(headFixtures)) Object.assign(e.pages[0]!, { why: RECORD.units[0]!.src })
    const report = judge(leaky(base()), leaky(headFixtures), { rulings: [] })
    const text = commentOf(report, { headSha: SHA_HEAD, baseSha: SHA_BASE })
    expect(text).toContain('ja')
    expect(report.pages.length).toBeGreaterThan(0)
    expect(leaksIn(text, strings)).toBe(0)
    expect(leaksIn(JSON.stringify(report), strings)).toBe(0)
  })

  it('knows a fragment of a translation in free text (a ruling\'s words), where the whole string is not there', () => {
    const haystack = [...strings].join('\u0000')
    const fragment = RECORD.units[0]!.src.slice(5, 50)
    expect(leaksIn(`why: ${fragment}`, strings)).toBe(0)
    expect(fragmentsIn(`why: ${fragment} (and more)`, haystack)).toBeGreaterThan(0)
    // a short phrase is no leak; neither is a sentence of the maintainer's own
    expect(fragmentsIn('the quick brown fox', haystack)).toBe(0)
    expect(fragmentsIn('the unit is a caption the served faces lack, so it stays English on both sides', haystack)).toBe(0)
  })

  it('knows a leak when it sees one, and a failed output\'s reason is never copied', () => {
    expect(leaksIn(`a line with ${RECORD.units[0]!.src} in it`, strings)).toBe(1)
    const r = judge(run(base()), run(base(), { failed: [{ name: '1512.03385v1-ja', why: `error at ${RECORD.units[1]!.src}` }] }))
    expect(leaksIn(commentOf(r, { headSha: SHA_HEAD, baseSha: SHA_BASE }), strings)).toBe(0)
    expect(commentOf(r, { headSha: SHA_HEAD, baseSha: SHA_BASE })).toContain('1512.03385v1-ja')
  })
})

describe('a changed layout-rules.json raises version by one, changes note and is canonical', () => {
  const engine = { readRules, writeRules }
  const set = (over: Record<string, unknown> = {}) => ({ ...structuredClone(BUILTIN_RULES), ...over }) as typeof BUILTIN_RULES
  const bytes = (s: string) => new TextEncoder().encode(s)
  const canonical = (over: Record<string, unknown> = {}) => bytes(writeRules(set(over)))
  const BASE = canonical({ version: 4, note: 'the first set' })

  it('passes a change that does all three, and a file that did not change', async () => {
    const ok = await checkRulesFile(BASE, canonical({ version: 5, note: 'zh leadBase 1.30 to 1.35' }), engine)
    expect(ok).toMatchObject({ changed: true, problems: [], from: 4, to: 5 })
    expect(await checkRulesFile(BASE, BASE, engine)).toMatchObject({ changed: false, problems: [] })
  })
  it('refuses a version that is not the base\'s plus one, a note that stayed, and bytes that are not the canonical form', async () => {
    expect((await checkRulesFile(BASE, canonical({ version: 6, note: 'changed' }), engine)).problems.join('\n')).toMatch(/version is 6, not 5/)
    expect((await checkRulesFile(BASE, canonical({ version: 4, note: 'changed' }), engine)).problems.join('\n')).toMatch(/version is 4, not 5/)
    expect((await checkRulesFile(BASE, canonical({ version: 5, note: 'the first set' }), engine)).problems.join('\n')).toMatch(/note is the base's/)
    const loose = bytes(JSON.stringify(set({ version: 5, note: 'changed' }), null, 2))
    expect((await checkRulesFile(BASE, loose, engine)).problems.join('\n')).toMatch(/not canonical/)
    // every one of them at once is three problems, not the first
    const all = await checkRulesFile(BASE, bytes(JSON.stringify(set({ version: 9, note: 'the first set' }))), engine)
    expect(all.problems).toHaveLength(3)
  })
  it('refuses a set the engine would refuse, naming the field and never the set', async () => {
    const bad = JSON.parse(writeRules(set({ version: 5, note: 'changed' })))
    bad.scripts.Hans.leadBase = 99
    const r = await checkRulesFile(BASE, bytes(JSON.stringify(bad, null, 1)), engine)
    expect(r.problems.join('\n')).toMatch(/refused.*leadBase/)
  })
})

describe('a page that moved is listed with its lab link', () => {
  it('lists each page whose measures moved, worse ones first, each linking the lab at the head commit\'s set', () => {
    const r = judge(run(base()), run(base({ zhA: [{}, { pitchSpread: 0.09 }], de: [{ fill: 0.99 }, {}] })))
    expect(r.pages.map(p => `${p.fixture} p${p.page}`)).toEqual(['1512.03385v1-zh p2', '1512.03385v1-de p1'])
    expect(r.pages[0]).toMatchObject({ worse: [labelOf('pitchSpread')], better: [] })
    expect(r.pages[1]).toMatchObject({ worse: [], better: [labelOf('fill')] })
    const text = commentOf(r, { headSha: SHA_HEAD, baseSha: SHA_BASE })
    expect(text).toContain(`(http://127.0.0.1:8093/#f=1512.03385v1-zh&p=2&rules=${SHA_HEAD})`)
    expect(text).toContain(`(http://127.0.0.1:8093/#f=1512.03385v1-de&p=1&rules=${SHA_HEAD})`)
    expect(labLink('1512.03385v1-zh', 7, SHA_HEAD)).toBe(`http://127.0.0.1:8093/#f=1512.03385v1-zh&p=7&rules=${SHA_HEAD}`)
  })
  it('sees a page that went from clean to a defect, though the record drops a zero', () => {
    const r = judge(run(base()), run(base({ de: [{}, { missing: 2 }] })))
    expect(r.pages.map(p => `${p.fixture} p${p.page}`)).toEqual(['1512.03385v1-de p2'])
    expect(r.pages[0]!.worse).toEqual([labelOf('missing')])
  })
  it('makes a link of a fixture name, a page and a commit, and of nothing else', () => {
    expect(() => labLink('x&y', 1, SHA_HEAD)).toThrow()
    expect(() => labLink('1512.03385v1-zh', 0, SHA_HEAD)).toThrow()
    expect(() => labLink('1512.03385v1-zh', 1, 'main; rm')).toThrow()
  })
})

describe('the comment', () => {
  it('is one comment, found again by its marker, whose table of a target that did not move is folded and whose verdict is first', () => {
    const r = judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })))
    const text = commentOf(r, { headSha: SHA_HEAD, baseSha: SHA_BASE })
    expect(text.startsWith(`${MARK}\n`)).toBe(true)
    expect(text.split(MARK)).toHaveLength(2)
    expect(text).toMatch(/^## Rules gate: failed/m)
    expect(text).toMatch(/### ja \(1 output\)/)
    expect(text).toMatch(/<details><summary>zh: 2 outputs, no measure moved/)
    expect(text).toContain(labelOf('unitsLeft'))
    expect(text).toContain(SHA_HEAD.slice(0, 8))
    expect(commentOf(judge(run(base()), run(base())), { headSha: SHA_HEAD, baseSha: SHA_BASE })).toMatch(/^## Rules gate: passed/m)
  })
  it('says a regression a ruling covers, with whose ruling, and a target no output stands for', () => {
    const ruling = parseRuling({ date: '2026-10-08', by: 'the maintainer', quote: 'fine', measures: [labelOf('unitsLeft')], targets: ['ja'], why: 'a caption', scope: 'one unit' }, 'ja.json')
    const text = commentOf(judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { rulings: [ruling] }), { headSha: SHA_HEAD, baseSha: SHA_BASE, targets: ['zh', 'zh-TW', 'ja', 'de'] })
    expect(text).toMatch(/^## Rules gate: passed under a ruling/m)
    expect(text).toContain('ja.json')
    expect(text).toMatch(/No output for zh-TW/)
  })
  it('renders a ruling\'s words as code spans: no image, no ping, no raw HTML, whatever it holds', () => {
    const hostile = parseRuling({ date: '2026-10-08', by: 'the @maintainer', quote: 'see ![x](http://example.com/a.png) and <img src=x onerror=1> and @everyone `tick` and\nnew line', english: 'plain', measures: [labelOf('unitsLeft')], targets: ['ja'], why: '<b>why</b> ```fence``` @team' }, 'ja.json')
    const text = commentOf(judge(run(base()), run(base({ ja: [{ textDrawn: 9 }, {}] })), { rulings: [hostile] }), { headSha: SHA_HEAD, baseSha: SHA_BASE, rulings: [hostile] })
    const quoted = text.split('\n').find(l => l.startsWith('> '))!
    // what is left of the line outside its code spans carries none of it
    const outside = quoted.replace(/(`+)[^`]+?\1/g, '')
    expect(outside).not.toMatch(/[!<@[\]]/)
    expect(quoted).toContain('`plain`')
    expect(quoted).not.toContain('\n')
    // a file name that is no name is no ruling
    expect(() => parseRuling({ date: 'x', by: 'b', quote: 'q', measures: ['m'], targets: ['ja'], why: 'w' }, 'a|b`c.json')).toThrow(/file name/)
  })
  it('warns when the pack was made under another PIPELINE than the engine\'s', () => {
    const text = commentOf(judge(run(base()), run(base())), { headSha: SHA_HEAD, baseSha: SHA_BASE, pack: { digest: 'f'.repeat(64), pipeline: '10' }, enginePipeline: '11' })
    expect(text).toMatch(/PIPELINE 10.*PIPELINE 11/)
  })
})

describe('the job log is public: the gate\'s output is filtered before it is echoed', () => {
  const NAME = '1512.03385v1-zh'
  const TEXT = 'The quick brown fox jumps over the lazy dog near the river bank'
  it('lets through the lines that are names and numbers, and cuts a failure after the output\'s name', () => {
    expect(publicLine(`ok   ${NAME}: 12 pages, 133/133 text units drawn (4.8 s)`)).toBe(`ok   ${NAME}: 12 pages, 133/133 text units drawn (4.8 s)`)
    expect(publicLine(`ok   ${NAME}: 12 pages, 111/111 text units drawn, in 9 parts (3.0 s)`)).toContain('in 9 parts')
    expect(publicLine(`FAIL ${NAME}: TypeError: cannot read ${TEXT} at layer-proto/run.mjs:12`)).toBe(`FAIL ${NAME}`)
    expect(publicLine(`FAIL ${NAME}: v0 changed its inputs (the geometry or the units) as it drew`)).toBe(`FAIL ${NAME}`)
    expect(publicLine(`FAIL requests that would have left the machine: http://example.com/${TEXT.replaceAll(' ', '%20')}`)).toBe('FAIL requests that would have left the machine')
    expect(publicLine('model tier: 29 outputs, 483 pages in 34.2 s on 4 workers; the run in /work/out/layer-gate/model-010c5789-2026-10-08T08-05-36-198Z.json')).toMatch(/^model tier: 29 outputs/)
    expect(publicLine(`completeness (spec §5): 1 of 29 outputs fail: ${NAME} [missing, twice]`)).toContain(`${NAME} [missing, twice]`)
    expect(publicLine('completeness (spec §5): every one of 29 outputs passes')).toContain('every one of 29')
  })
  it('holds back everything else: a stack, a reason, a table, a line of a debug print, an ok line that carries more than numbers', () => {
    for (const line of [
      `    at loadUnit (file:///work/src/pdf-reader/engine/layer-proto/run.mjs:88:11)`, `Error: ${TEXT}`, `TypeError at ${TEXT}`, TEXT, '',
      `1512.03385v1-zh	0	12	0.911`, `ok   ${NAME}: ${TEXT}`, `ok   ${NAME}: 12 pages, 133/133 text units drawn (4.8 s) ${TEXT}`,
      `completeness (spec §5): 1 of 29 outputs fail: ${NAME} [${TEXT}]`, `FAILED ${TEXT}`, `FAIL ${TEXT}`,
    ]) expect(publicLine(line), line).toBe(null)
  })
  it('shows no stretch of a paper whatever the gate prints', () => {
    const printed = [`ok   ${NAME}: 12 pages, 133/133 text units drawn (4.8 s)`, `FAIL ${NAME}: Error: ${TEXT}`, `  stack: ${TEXT}`, `${TEXT}\t1\t2`, 'model tier: 1 outputs, 12 pages in 1 s on 4 workers; the run in /tmp/x.json']
    const echoed = printed.map(publicLine).filter(Boolean).join('\n')
    expect(leaksIn(echoed, new Set([TEXT]))).toBe(0)
    expect(echoed.split('\n')).toHaveLength(3)
  })
})

describe('the runs are the production configuration', () => {
  it('runs the model tier of the hybrid over the text-removed PDF, on 4 workers, from the pack alone', () => {
    const { args, env } = gateArgs({ engine: '/work/base', rules: '/work/base/rules.json', pack: '/work/pack' })
    expect(args).toEqual(['--tier=model', '--engine-kind=proto', '--proto-tex=lines', '--removal=draw', '--fixtures=/work/pack/fixtures', '--engine=/work/base', '--rules=/work/base/rules.json', '--workers=4'])
    expect(env).toEqual({ AXT_DATA: '/work/pack/data', LAYER_REFS: '/work/pack/refs', LAYER_GEOMETRY: '/work/pack/geometry', TEXMF_DIST: '/work/pack/texmf' })
  })
})
