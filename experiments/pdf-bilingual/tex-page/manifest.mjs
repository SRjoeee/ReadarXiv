// What the TeX page fetches ahead, from what the corpus's compiles opened and fetched (measure.mjs --mode=record):
// the slim preloads (which of BusyTeX's preloaded files to keep in each engine's part) and the manifest of common files
// (which files of the tree to download in parallel at start-up: an engine's, and a CJK script's faces).
//
// One rule decides both (worth): a file is fetched ahead when the share of the visits that need it is larger than the
// share of a round trip its own download takes — fetched when needed, it would cost that share of visits a round trip
// and its bytes; fetched ahead, every visit its bytes, in parallel with the rest.

/** the link the rule weighs a file's bytes against a round trip on: 50 Mbit/s and 30 ms, the research's typical reader */
export const REFERENCE = { mbit: 50, rtt: 30 }

/** a file of `bytes` (on the wire) that `share` of the visits need: worth fetching ahead over a link of `mbit` and `rtt` ms */
export const worth = ({ mbit, rtt }) => (bytes, share) => {
  const download = (bytes * 8) / (mbit * 1000) // ms
  return share * (rtt + download) > download
}

/**
 * The shares of the visits that fetched each file: `visits` [{ paper, engine, script, first, keys }] — a paper's
 * compiles of one engine for one script (Latn for the paper's own), `first` false for a fallback strategy's (they
 * count for nothing: what only a fallback needs is fetched when it runs), `keys` the files ('format/name') they
 * fetched — → { groups: { 'engine|script': { papers, shares: { key: share } } }, pooled: { engine: { papers, shares } } }.
 * A paper counts once in a group
 */
export function sharesOf(visits) {
  const groups = new Map() // engine|script → Map paper → Set keys
  for (const v of visits) {
    if (v.first === false) continue
    const g = `${v.engine}|${v.script ?? 'Latn'}`
    if (!groups.has(g)) groups.set(g, new Map())
    const papers = groups.get(g)
    if (!papers.has(`${v.paper}`)) papers.set(`${v.paper}`, new Set())
    for (const k of v.keys) papers.get(`${v.paper}`).add(k)
  }
  const shares = sets => {
    const count = new Map()
    for (const s of sets) for (const k of s) count.set(k, (count.get(k) ?? 0) + 1)
    return { papers: sets.length, shares: Object.fromEntries([...count].sort().map(([k, n]) => [k, n / sets.length])) }
  }
  const out = { groups: {}, pooled: {} }
  const byEngine = new Map()
  for (const [g, papers] of groups) {
    out.groups[g] = shares([...papers.values()])
    const engine = g.split('|')[0]
    if (!byEngine.has(engine)) byEngine.set(engine, [])
    byEngine.get(engine).push(...papers.values())
  }
  for (const [engine, sets] of byEngine) out.pooled[engine] = shares(sets)
  return out
}

/**
 * The manifest from the shares: `keep(key, share)` says whether a file is fetched ahead. → { engines: { engine: [keys] },
 * fonts: { script: [keys] } }: a file only one non-Latin script's visits fetch (of any engine), kept at its share of
 * that script's visits, is that script's (its faces, its babel files), fetched only when the reader names the script;
 * an engine's files are the others kept at their share of all its visits. Keys sorted
 */
export function buildManifest({ groups, pooled }, keep) {
  const scriptOf = g => g.split('|')[1]
  const fonts = {}, specific = new Set()
  for (const [g, { shares }] of Object.entries(groups)) {
    const script = scriptOf(g)
    if (script === 'Latn') continue
    const elsewhere = Object.entries(groups).filter(([h]) => scriptOf(h) !== script).map(([, d]) => d.shares)
    const own = Object.entries(shares).filter(([k, share]) => keep(k, share) && elsewhere.every(other => !other[k])).map(([k]) => k)
    if (!own.length) continue
    fonts[script] = [...new Set([...(fonts[script] ?? []), ...own])].sort()
    for (const k of own) specific.add(k)
  }
  const engines = {}
  for (const [engine, { shares }] of Object.entries(pooled)) engines[engine] = Object.entries(shares).filter(([k, share]) => !specific.has(k) && keep(k, share)).map(([k]) => k).sort()
  return { engines, fonts }
}

/** XeLaTeX's fontconfig opens every font of the preloaded tier the first time a compile looks a font up by name; no
 *  compile of the corpus needs a Type 1 or AFM font that way (identity, S3a report), so opening them is no need of
 *  them. (ICU's data is needed: XeTeX opens its converters at every start, and stops without them) */
export const scannedOnly = (engine, path) => engine === 'xelatex' && (path.includes('/fonts/type1/') || path.includes('/fonts/afm/'))

/**
 * The preloaded tier (`basic`: its file paths, in its order) split into common (both engines keep it, or `always`),
 * pdftex, xetex (one engine keeps it) and rest (neither: loaded only for another engine). `kept`: { pdflatex: Set,
 * xelatex: Set } of the files each engine's part should hold. Each part in basic's order
 */
export function slimSets(basic, kept, { always = () => false } = {}) {
  const P = kept.pdflatex ?? new Set(), X = kept.xelatex ?? new Set()
  const common = basic.filter(p => always(p) || (P.has(p) && X.has(p)))
  const c = new Set(common)
  const pdftex = basic.filter(p => !c.has(p) && P.has(p))
  const xetex = basic.filter(p => !c.has(p) && X.has(p))
  const taken = new Set([...common, ...pdftex, ...xetex])
  return { common, pdftex, xetex, rest: basic.filter(p => !taken.has(p)) }
}
