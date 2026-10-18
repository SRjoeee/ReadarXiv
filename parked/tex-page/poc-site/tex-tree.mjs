// The TeX page's file index: which file of the TeX Live tree answers BusyTeX's request for a file (a kpathsea format,
// a name, and the program asking), or that none does. kpathsea asks the page only for what it did not find in the
// preloaded files; the index answers a name the tree lacks on the spot, with no request, and names the file to fetch
// otherwise.
//
// A request is answered as kpathsea answers it (texk/kpathsea, TeX Live 2026): a name that does not already end in one
// of its format's suffixes is looked for with each of them first, then as it is unless the format is searched by
// suffix only (tex-file.c, try_std_extension_first, suffix_search_only);
// each element of the program's search path for the format in turn (texmf.cnf, as tex-page/kpathsea.mjs expands it),
// and in it each name in turn, the first file of exactly that name in ls-R's order (pathsearch.c, db.c). Beyond
// kpathsea, as the local file server answered before: the name in another case, the bare name where kpathsea asks for
// suffixed names only, then a directory outside the search path — a paper relying on that would not compile under TeX
// Live, but did here.
//
// The index's text: '#axt-index 2', then '#paths ' and the search paths as JSON ({ format: { program: [elements] } },
// '*' for any program not named), then every file of the tree grouped by directory in ls-R's order, each directory a
// line ending in '/' (the root './'), then its files, one a line (tex-page/tree.mjs indexText writes it).
//
// Runs in the page's worker too: tex-page/build.mjs puts this file, without its `export` keywords, before the worker's
// own code. So it imports nothing, and every export is a top-level declaration.

/** kpathsea's suffixes for each format it asks for (kpse_file_format_type → SUFFIXES) */
export const SUFFIXES = {
  0: ['gf'], 1: ['pk'], 3: ['.tfm'], 4: ['.afm'], 5: ['.base'], 6: ['.bib'], 7: ['.bst'], 8: ['.cnf'], 9: ['ls-R', 'ls-r'],
  10: ['.fmt'], 11: ['.map'], 12: ['.mem'], 13: ['.mf'], 14: ['.pool'], 15: ['.mft'], 16: ['.mp'], 17: ['.pool'],
  19: ['.ocp'], 20: ['.ofm', '.tfm'], 21: ['.opl'], 22: ['.otp'], 23: ['.ovf', '.vf'], 24: ['.ovp'], 26: ['.tex'],
  28: ['.pool'], 32: ['.pfa', '.pfb'], 33: ['.vf'], 35: ['.ist'], 36: ['.ttf', '.ttc', '.dfont'], 37: ['.t42'],
  42: ['.web'], 43: ['.w', '.web'], 44: ['.enc'], 46: ['.sfd'], 47: ['.otf'], 49: ['.lig'],
  51: ['.lua', '.luatex', '.luc', '.luctex', '.texlua', '.texluc', '.tlu'], 52: ['.fea'], 53: ['.cid', '.cidmap'],
  54: ['.mlbib', '.bib'], 55: ['.mlbst', '.bst'], 56: ['.dll', '.so'], 57: ['.ris'], 58: ['.bltxml'],
}
/** kpathsea's alternative suffixes: a name ending in one is looked for as it is, and gets no suffix */
export const ALT_SUFFIXES = {
  21: ['.pl'], 24: ['.vpl'], 25: ['.eps', '.epsi'], 26: ['.sty', '.cls', '.fd', '.aux', '.bbl', '.def', '.clo', '.ldf'],
  29: ['.dtx', '.ins'], 30: ['.pro'], 42: ['.ch'], 43: ['.ch'],
}

/** the formats whose names kpathsea looks for only with a suffix of theirs, never bare (tex-file.c,
 *  suffix_search_only) */
export const SUFFIX_ONLY = new Set([0, 1, 2, 3, 6, 19, 20, 21, 22, 23, 24, 33, 44, 46, 47, 49, 51, 52, 53, 54, 55, 56, 57, 58])

/** the names kpathsea looks for, in order, for a request of `format` for `name` (tex-file.c target_suffixed_names,
 *  target_asis_name): a name ending in one of the format's suffixes or alternative suffixes as it is; another with each
 *  suffix, then as it is unless the format is searched by suffix only */
export function candidates(format, name) {
  const lower = name.toLowerCase()
  const suffixes = SUFFIXES[format] ?? []
  const own = [...suffixes, ...(ALT_SUFFIXES[format] ?? [])].some(s => lower.endsWith(s.toLowerCase()))
  if (own) return [name]
  return [...suffixes.map(s => name + s), ...(SUFFIX_ONLY.has(format) ? [] : [name])]
}

/** whether directory `dir` (relative to the tree, no trailing slash) lies in path element `element` (kpathsea's
 *  `match`: `//` stands for any run of directories, none included; at the end, the directory and all below it) */
export function inElement(dir, element) {
  return elementPattern(element).test(dir)
}
const patterns = new Map()
function elementPattern(element) {
  let re = patterns.get(element)
  if (re) return re
  const deep = element.endsWith('//')
  const body = (deep ? element.slice(0, -2) : element).replace(/\/+$/, '')
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  re = !body ? (deep ? /^/ : /^$/) : new RegExp(`^${body.split('//').map(t => esc(t.replace(/^\/+|\/+$/g, ''))).join('(?:/.+)?/')}${deep ? '(?:/.+)?' : ''}$`)
  patterns.set(element, re)
  return re
}

/** the index's text → { names: Map lowercase basename → paths in ls-R's order, paths: the search paths, dependent:
 *  the basenames whose answer depends on the program asking } */
export function parseIndex(text) {
  const names = new Map()
  let paths = {}
  let dependent = new Set()
  let dir = ''
  for (const line of text.split('\n')) {
    if (!line) continue
    if (line.startsWith('#')) {
      if (line.startsWith('#paths ')) paths = JSON.parse(line.slice(7))
      if (line.startsWith('#dependent ')) dependent = new Set(JSON.parse(line.slice(11)))
      continue
    }
    if (line.endsWith('/')) { dir = line === './' ? '' : line; continue }
    const key = line.toLowerCase()
    if (!names.has(key)) names.set(key, [])
    names.get(key).push(dir + line)
  }
  return { names, paths, dependent }
}

const baseOf = p => p.slice(p.lastIndexOf('/') + 1)
const dirOf = p => { const at = p.lastIndexOf('/'); return at < 0 ? '' : p.slice(0, at) }

/** the tree's path that answers `format`/`name` for `program` (the pipeline's name for it: pdflatex, xelatex,
 *  xdvipdfmx, bibtex8…), or null when the tree has none */
export function resolve(index, format, name, program = '*') {
  const targets = candidates(format, name)
  // beyond kpathsea, the name as it is too (the file server's first try), where kpathsea searches by suffix only
  const loose = targets.includes(name) ? targets : [...targets, name]
  const byFormat = index.paths[format] ?? {}
  const elements = byFormat[program] ?? byFormat['*'] ?? []
  const files = t => index.names.get(t.toLowerCase()) ?? []
  // kpathsea: each element in turn, each name in turn, the first file of exactly that name (ls-R's order)
  for (const e of elements) for (const t of targets) for (const p of files(t)) if (baseOf(p) === t && inElement(dirOf(p), e)) return p
  // beyond it, as the file server answered: the name in another case within the search path, then anywhere
  for (const e of elements) for (const t of loose) for (const p of files(t)) if (inElement(dirOf(p), e)) return p
  for (const t of loose) { const fs = files(t); const p = fs.find(f => baseOf(f) === t) ?? fs[0]; if (p) return p }
  return null
}

const encodePath = path => path.split('/').map(encodeURIComponent).join('/')

/**
 * The tree's files, fetched by `get(url)` → { status, bytes } (a synchronous request in the worker; status 0 when
 * the network failed), `program()` → the program asking (the pipeline's name for the command running).
 * `fetch(name, format)` → { bytes, path } | { missing: true } | { network: true }:
 *  - a name the index lacks is missing, with no request;
 *  - 200 is the file;
 *  - anything else is the network's — no answer, a timeout, a server's error, a refusal, and a 404 or 410 too: the
 *    index is built from the tree it is published with, so a file it lists that the tree does not answer is an upload
 *    that is incomplete or out of order, not a file TeX should be told is not there. Asked once more, and if it fails
 *    again the file's path is kept among the failures, which the compile reports, and is not taken for missing; it is
 *    not asked again until the failures are taken (the next compile).
 */
export function treeFetcher({ index, base, get, program = () => '*' }) {
  let failed = []
  return {
    fetch(name, format) {
      const path = resolve(index, format, name, program())
      if (!path) return { missing: true }
      // failed already in this compile: kpathsea looks a file up several times, and each try may wait for a timeout
      if (failed.includes(path)) return { network: true }
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = get(base + encodePath(path))
        if (r.status === 200 && r.bytes) return { bytes: r.bytes, path }
      }
      failed.push(path)
      return { network: true }
    },
    /** the key BusyTeX keeps a fetched file under: its name, or its name and the program where the answer depends on
     *  the program asking (index.dependent) */
    keyOf(name, format) {
      const dependent = index.dependent ?? new Set()
      return [...candidates(format, name), name].some(t => dependent.has(t.toLowerCase())) ? `${name}@${program()}` : name
    },
    failures: () => [...failed],
    takeFailures() { const out = failed; failed = []; return out },
  }
}
