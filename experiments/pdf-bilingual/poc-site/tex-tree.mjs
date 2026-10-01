// The TeX page's file index: which file of the TeX Live tree answers BusyTeX's request for a file (a kpathsea format
// and a name), or that none does. kpathsea asks the page only for what it did not find in the preloaded files; the
// index answers a name the tree lacks on the spot, with no request, and names the file to fetch otherwise.
//
// A request is resolved as kpathsea resolves a name (texk/kpathsea/tex-file.c, TeX Live 2026): a name that does not
// already end in one of its format's suffixes is looked for with each of them first, then as it is
// (try_std_extension_first); every candidate by its lowercase basename, the first in the index. The index is built
// from the tree's file list by tex-page/build.mjs, one path for each lowercase basename, in the order it chooses.
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

/** the lowercase basenames to look for, in order, for a request of `format` for `name` */
export function candidates(format, name) {
  const lower = name.toLowerCase()
  const suffixes = SUFFIXES[format] ?? []
  const own = [...suffixes, ...(ALT_SUFFIXES[format] ?? [])].some(s => lower.endsWith(s.toLowerCase()))
  return own ? [lower] : [...suffixes.map(s => lower + s.toLowerCase()), lower]
}

/** the index as text: the paths grouped by directory, each directory a line ending in '/' (the root './'), then the
 *  names of its files, one a line. The first path given for a lowercase basename is the one the index keeps */
export function indexText(paths) {
  const dirs = new Map()
  for (const p of paths) {
    const at = p.lastIndexOf('/')
    const dir = at < 0 ? '' : p.slice(0, at)
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir).push(p.slice(at + 1))
  }
  const lines = []
  for (const dir of [...dirs.keys()].sort()) lines.push(`${dir || '.'}/`, ...dirs.get(dir))
  return lines.join('\n')
}

/** the index's text → Map lowercase basename → path. A basename given twice keeps the path first in the builder's order,
 *  which the text loses by grouping: so the builder writes only the chosen path of each basename */
export function parseIndex(text) {
  const index = new Map()
  let dir = ''
  for (const line of text.split('\n')) {
    if (!line) continue
    if (line.endsWith('/')) { dir = line === './' ? '' : line; continue }
    const key = line.toLowerCase()
    if (!index.has(key)) index.set(key, dir + line)
  }
  return index
}

/** the tree's path that answers `format`/`name`, or null when the tree has none */
export function resolve(index, format, name) {
  for (const c of candidates(format, name)) {
    const path = index.get(c)
    if (path) return path
  }
  return null
}

const encodePath = path => path.split('/').map(encodeURIComponent).join('/')

/**
 * The tree's files, fetched by `get(url)` → { status, bytes } (a synchronous request in the worker; status 0 when
 * the network failed). `fetch(name, format)` → { bytes, path } | { missing: true } | { network: true }:
 *  - a name the index lacks is missing, with no request;
 *  - 200 is the file; 404 or 410 is missing (the index and the tree disagree);
 *  - anything else — no answer, a timeout, a server's error, a refusal — is the network's: asked once more, and if it
 *    fails again the name is kept among the failures, which the compile reports, and is not taken for missing.
 */
export function treeFetcher({ index, base, get }) {
  let failed = []
  return {
    fetch(name, format) {
      const path = resolve(index, format, name)
      if (!path) return { missing: true }
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = get(base + encodePath(path))
        if (r.status === 200 && r.bytes) return { bytes: r.bytes, path }
        if (r.status === 404 || r.status === 410) return { missing: true }
      }
      if (!failed.includes(name)) failed.push(name)
      return { network: true }
    },
    failures: () => [...failed],
    takeFailures() { const out = failed; failed = []; return out },
  }
}
