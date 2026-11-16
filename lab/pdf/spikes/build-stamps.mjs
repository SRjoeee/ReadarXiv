// lab/pdf/spikes/build-stamps.mjs: what the lab's native hosts of a compile (cm-check.mjs, the reference host of `draft` and
// `files` as the web's container sandbox answers them, and q1-check.mjs, which runs it) read of their build folder to tell
// which files a compile wrote: every regular file under it with its modification time. One definition for both.
import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** every regular file (no link) under `dir`, by its path there, with its modification time (s) */
export function stampsOf(dir, base = '', out = new Map()) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), rel = base ? `${base}/${name}` : name, st = lstatSync(path)
    if (st.isDirectory()) stampsOf(path, rel, out)
    else if (st.isFile()) out.set(rel, st.mtimeMs / 1000)
  }
  return out
}
