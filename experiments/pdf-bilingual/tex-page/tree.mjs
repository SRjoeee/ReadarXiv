// The TeX Live tree as the TeX page reaches it: its file list, walked as the local file server walked it, and the index
// the page ships (poc-site/tex-tree.mjs reads it). Node only; build.mjs runs it.
import { createHash } from 'node:crypto'
import { opendirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
