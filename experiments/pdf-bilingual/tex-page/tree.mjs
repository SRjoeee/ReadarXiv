// The TeX Live tree as the TeX page reaches it: its file list, walked as the local file server walked it, and the index
// the page ships (poc-site/tex-tree.mjs reads it). Node only; build.mjs runs it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, opendirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * The tree's files under `root`, relative, in the order of a top-down walk: a directory's files in the order the file
 * system lists them, then its subdirectories, each in turn (Python's os.walk, which the local file server walked its
 * tree with: so the first file of a basename here is the one it served). A link to a directory is not followed
 */
export function walk(root) {
  const out = []
  const visit = rel => {
    const dirs = []
    const dir = opendirSync(join(root, rel))
    for (let e = dir.readSync(); e; e = dir.readSync()) {
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
 * The path the index keeps for each lowercase basename, in the walk's order: `preferred(path)` true for a path that wins
 * over the walk's order — the files today's preloaded tier holds, which kpathsea found there before it asked the file
 * server, so that a file a slim preload leaves out comes back as the preload had it. → the chosen paths
 */
export function chooseIndex(paths, preferred = () => false) {
  const chosen = new Map()
  for (const p of paths) {
    const key = p.slice(p.lastIndexOf('/') + 1).toLowerCase()
    const had = chosen.get(key)
    if (had === undefined || (preferred(p) && !preferred(had))) chosen.set(key, p)
  }
  return [...chosen.values()]
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
