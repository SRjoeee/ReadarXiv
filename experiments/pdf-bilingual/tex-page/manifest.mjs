// What the TeX page fetches ahead, from what the corpus's compiles opened and fetched (measure.mjs --mode=record):
// the slim preloads (which of BusyTeX's preloaded files each engine's compiles open) and the manifest of common files
// (which files of the tree most visits of an engine fetch, and which only one CJK script's visits fetch: its faces).

/**
 * The manifest: `visits` [{ paper, engine, script, first, keys }] — a paper's compiles of one engine for one script
 * (Latn for the paper's own), `first` false for a fallback strategy's, `keys` the 'format/name' of the files they
 * fetched — → { engines: { engine: [keys] }, fonts: { script: [keys] } }. An engine's files are those at least
 * `threshold` of its visits fetched; a file that reaches the threshold in one non-Latin script's visits and in no other
 * script's of that engine is that script's (its faces, its babel files), fetched only when the reader names the script.
 * A fallback's visits count for nothing: what only it needs is fetched when it runs. Keys sorted
 */
export function buildManifest(visits, { threshold }) {
  const groups = new Map() // engine|script → Map paper → Set keys
  for (const v of visits) {
    if (v.first === false) continue
    const g = `${v.engine}|${v.script ?? 'Latn'}`
    if (!groups.has(g)) groups.set(g, new Map())
    const papers = groups.get(g)
    if (!papers.has(v.paper)) papers.set(v.paper, new Set())
    for (const k of v.keys) papers.get(v.paper).add(k)
  }
  const frequent = sets => {
    const count = new Map()
    for (const s of sets) for (const k of s) count.set(k, (count.get(k) ?? 0) + 1)
    return new Set([...count].filter(([, n]) => n >= threshold * sets.length).map(([k]) => k))
  }
  // engine → script → the files at least `threshold` of that group's visits fetched; engine → every visit's files
  const byEngine = new Map(), pooled = new Map()
  for (const [g, papers] of groups) {
    const [engine, script] = g.split('|')
    if (!byEngine.has(engine)) { byEngine.set(engine, new Map()); pooled.set(engine, []) }
    byEngine.get(engine).set(script, frequent([...papers.values()]))
    pooled.get(engine).push(...papers.values())
  }
  const fonts = {}, specific = new Set()
  for (const scripts of byEngine.values()) {
    for (const [script, keys] of scripts) {
      if (script === 'Latn') continue
      const own = [...keys].filter(k => [...scripts].every(([s, other]) => s === script || !other.has(k)))
      if (!own.length) continue
      fonts[script] = [...new Set([...(fonts[script] ?? []), ...own])].sort()
      for (const k of own) specific.add(k)
    }
  }
  const engines = {}
  for (const [engine, sets] of pooled) engines[engine] = [...frequent(sets)].filter(k => !specific.has(k)).sort()
  return { engines, fonts }
}

/**
 * The preloaded tier (`basic`: its file paths, in its order) split by the engines whose compiles open each file
 * (`opened`: { pdflatex: Set, xelatex: Set }): common (both, and what `always` keeps), pdftex, xetex (each engine's
 * own) and rest (neither: loaded only for another engine). `leave[engine](path)` true for a file that engine's compiles
 * open but do not need (XeLaTeX's fontconfig opens every font of the tier at start-up). Each part in basic's order
 */
export function slimSets(basic, opened, { leave = {}, always = () => false } = {}) {
  const used = engine => new Set([...(opened[engine] ?? [])].filter(p => !(leave[engine]?.(p))))
  const P = used('pdflatex'), X = used('xelatex')
  const common = basic.filter(p => always(p) || (P.has(p) && X.has(p)))
  const c = new Set(common)
  const pdftex = basic.filter(p => !c.has(p) && P.has(p))
  const xetex = basic.filter(p => !c.has(p) && X.has(p))
  const taken = new Set([...common, ...pdftex, ...xetex])
  return { common, pdftex, xetex, rest: basic.filter(p => !taken.has(p)) }
}
