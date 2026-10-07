// A directory under Node as a project's file system (latex-front.mjs inMemory's shape): the spikes' roots. Node only: the
// reader's modules (latex-front.mjs, paper-meta.mjs, and what the layer's door reaches) hold no `node:` specifier, so
// nothing a browser loads imports this one.
import { readdirSync, readFileSync } from 'node:fs'

/** a directory under Node, as a project's file system: { list(): relative paths, read(path): bytes or null } */
export function folder(dir) {
  const walk = rel => readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true }).flatMap(e => { const p = rel ? `${rel}/${e.name}` : e.name; return e.isDirectory() ? walk(p) : [p] })
  let names = null
  return { list: () => (names ??= walk('')), read: p => { try { return readFileSync(`${dir}/${p}`) } catch { return null } } }
}
