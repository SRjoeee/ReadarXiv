// Where a module of an engine tree is: the engine's own directory (src/pdf-reader/engine), or, for a module the rebuild moved into
// the engine package (packages/engine/src, stage 1a), there in a tree that has moved it. A lab loader that takes another tree
// (--engine=<dir>) reads each module where that tree has it.
import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** `f` (a path under the engine's directory `engineDir`, e.g. layout/remove.mjs) where that tree has it */
export function movedIn(engineDir, f) {
  const at = join(engineDir, f)
  if (existsSync(at)) return at
  const moved = join(resolve(engineDir, '../../..'), 'packages/engine/src', basename(f))
  return existsSync(moved) ? moved : at
}
