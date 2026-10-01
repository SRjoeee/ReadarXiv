// The TeX Live tree as the TeX page reaches it: its file list, walked as the local file server walked it, and the index
// the page ships (poc-site/tex-tree.mjs reads it). Node only; build.mjs runs it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, opendirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseIndex, resolve } from '../poc-site/tex-tree.mjs'
import { lsrCompare, PROGRAMS, parseCnf, searchPaths } from './kpathsea.mjs'

/** the operating systems' own files — Finder's, AppleDouble's, Windows Explorer's — which are not TeX Live's: a visit
 *  with Finder must not change the tree's version, nor put them on the site */
export const OS_METADATA = /^(\.DS_Store|\._.*|Thumbs\.db|desktop\.ini)$/

/**
 * The tree's files under `root`, relative, in the order of a top-down walk: a directory's files in the order the file
 * system lists them, then its subdirectories, each in turn. A link to a directory is not followed; the operating
 * systems' own files are left out
 */
export function walk(root) {
  const out = []
  const visit = rel => {
    const dirs = []
    const dir = opendirSync(join(root, rel))
    for (let e = dir.readSync(); e; e = dir.readSync()) {
      if (OS_METADATA.test(e.name)) continue
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) dirs.push(path)
      else if (e.isSymbolicLink()) { try { if (!statSync(join(root, path)).isDirectory()) out.push(path) } catch { /* a dangling link */ } }
      else if (e.isFile()) out.push(path)
    }
    dir.closeSync()
    for (const d of dirs) visit(d)
  }
  visit('')
  return out
}

/**
 * The index's text (poc-site/tex-tree.mjs reads it): '#axt-index 2', the search paths (`searchPaths`: { format:
 * { program: [elements] } }), the basenames whose answer depends on the program asking (`dependent`), then every file of
 * the tree grouped by directory, the directories in ls-R's order (as kpathsea's database lists a name's directories,
 * which decides among files of one name) and each one's files sorted
 */
export function indexText(paths, searchPaths, dependent = []) {
  const dirs = new Map()
  for (const p of paths) {
    const at = p.lastIndexOf('/')
    const dir = at < 0 ? '' : p.slice(0, at)
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir).push(p.slice(at + 1))
  }
  const lines = ['#axt-index 2', `#paths ${JSON.stringify(searchPaths)}`]
  if (dependent.length) lines.push(`#dependent ${JSON.stringify(dependent)}`)
  for (const dir of [...dirs.keys()].sort(lsrCompare)) lines.push(`${dir || '.'}/`, ...dirs.get(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  return lines.join('\n')
}

/**
 * The lowercase basenames held more than once whose answer, for some format, depends on the program asking: BusyTeX
 * keeps a fetched file under its format and name for every program, so the worker keeps these per program
 */
export function programDependent(index, programs) {
  const out = []
  for (const [key, ps] of index.names) {
    if (ps.length < 2) continue
    const names = new Set(ps.map(p => p.slice(p.lastIndexOf('/') + 1)))
    const formats = Object.keys(index.paths).map(Number)
    if ([...names].some(name => formats.some(format => new Set(programs.map(program => resolve(index, format, name, program))).size > 1))) out.push(key)
  }
  return out.sort()
}

/** a short content address for a version: the first 12 hex digits of a SHA-256 over the given strings or bytes */
export function versionOf(...parts) {
  const h = createHash('sha256')
  for (const p of parts) h.update(p).update('\0')
  return h.digest('hex').slice(0, 12)
}

/**
 * The tree's version: its files' paths and contents (`files`: [path, content hash]), in any order — nothing else, so
 * that every file of the tree lives at t/<tid>/<path> for good, and a change of the index's rules moves no file
 */
export function treeVersion(files) {
  return versionOf([...files].map(([path, hash]) => `${path} ${hash}`).sort().join('\n'))
}

/** the index's file name, versioned by its own content: an index of other rules is another small file */
export const indexName = text => `index-${versionOf(text)}.txt`

/** each file's SHA-256 (`paths` under `root`) → Map path → hex; kept in `cache` by size and time, so that a build
 *  hashes again only what changed */
export function hashTree(root, paths, cache) {
  const known = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : {}
  const out = new Map()
  for (const p of paths) {
    const st = statSync(join(root, p))
    const k = known[p]
    if (k && k[0] === st.size && k[1] === st.mtimeMs) { out.set(p, k[2]); continue }
    const hash = createHash('sha256').update(readFileSync(join(root, p))).digest('hex')
    known[p] = [st.size, st.mtimeMs, hash]
    out.set(p, hash)
  }
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, JSON.stringify(known))
  return out
}

/** the tree under `root` and its index: { paths, text }, the search paths from texmf.cnf's text `cnf` */
export function treeIndex(root, cnf) {
  const paths = walk(root)
  const searches = searchPaths(parseCnf(cnf))
  const dependent = programDependent(parseIndex(indexText(paths, searches)), Object.keys(PROGRAMS))
  return { paths, text: indexText(paths, searches, dependent) }
}
