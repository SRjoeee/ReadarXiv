// A directory under Node as a project's file system (the package's latex-front.ts inMemory's shape): the spikes' roots. Node
// only (moved here from today's engine at the cut-over): the package's modules hold no `node:` specifier.
import { readdirSync, readFileSync } from 'node:fs'

/** a directory under Node, as a project's file system: { list(): relative paths, read(path): bytes or null } */
export function folder(dir) {
  const walk = rel => readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true }).flatMap(e => { const p = rel ? `${rel}/${e.name}` : e.name; return e.isDirectory() ? walk(p) : [p] })
  let names = null
  return { list: () => (names ??= walk('')), read: p => { try { return readFileSync(`${dir}/${p}`) } catch { return null } } }
}
