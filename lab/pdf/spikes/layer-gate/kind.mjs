// The layer gate's --engine-kind (spikes/layer-gate.mjs): which layer it measures. `proto` is the drawn layer, v0
// (layer-proto/run.mjs, opened through the reader's door): the gate's default and the mode of its records. `layer` is the
// first layer, the engine's layer/layer.mjs over a layout file, which the engine no longer holds (parked/engine/layer/;
// parked/README.md says where it last ran): the gate's instrument still has its page for it (layer-gate/page.mjs, hashed
// into every record, so left as it was), which asks the engine for that entry and fails every fixture where there is none.
// An older worktree, given by --engine=<it>, that still has the entry is measured as it was.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** the kind to measure: `given` (the flag, or undefined), `proto` where none is; throws for a kind there is not, and for the
 *  first layer of an engine that has none. `exists` is a seam for the test */
export function engineKindOf(given, engine, exists = existsSync) {
  const kind = given ?? 'proto'
  if (kind !== 'layer' && kind !== 'proto') throw new Error(`--engine-kind=${kind}: proto (the drawn layer, v0; the default) or layer (the first layer, parked)`)
  if (kind === 'layer' && !exists(join(engine, 'src/pdf-reader/engine/layer/layer.mjs'))) {
    throw new Error(`--engine-kind=layer measures the first layer, layer/layer.mjs, which is parked (parked/engine/layer/, see parked/README.md) and absent from ${engine}. The gate measures the drawn layer: leave --engine-kind out, or give --engine-kind=proto (the records' mode is --proto-tex=lines --removal=draw), or --door`)
  }
  return kind
}
