// The L1 bundles folder the lab reads (a folder a paper: `<paper>/head.json`, its parts and units): AXT_L1_BUNDLES where set, else
// the converge lane's default (lanes/L7). A value that is set and is no bundles folder is an error naming it, never the default:
// twice a clobbered shell variable (a number) sent a gate over the wrong bundles or over none (integration's round 8m reader
// gate laid 0 pages, "no L1 bundle" 123 times; marks-2's reader gate). Every tool names the folder it serves in one line
// (`bundlesLine`), so a gate's log always says which; a pair a tool is asked of a named folder that holds no head of it is an
// error too (`headsFor`). No other import: the plain node tools read it as the replay does.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type BundlesDir = { dir: string; from: 'default' | 'env' }

/** a pair's paper (today.ts paperOf's rule: the target and a pack's suffix off) */
const paperOf = (pair: string): string => pair.replace(/-[a-z]{2,3}(\.pack)?$/, '')

/**
 * The bundles folder `env` names (AXT_L1_BUNDLES), else `def`; throws, naming the value, where it is set and is no folder or a
 * folder that holds no paper's head (no bundles folder: a run's folder instead of its `bundles`, a number, an empty string)
 */
export function bundlesDir(env: Record<string, string | undefined>, def: string): BundlesDir {
  const v = env.AXT_L1_BUNDLES
  if (v === undefined) return { dir: def, from: 'default' }
  const refuse = (why: string) => {
    throw new Error(
      `AXT_L1_BUNDLES=${JSON.stringify(v)}: ${why} (the lab never falls back to the default bundles where the variable is set)`,
    )
  }
  if (!v || !existsSync(v) || !statSync(v).isDirectory()) refuse('no such folder')
  if (!readdirSync(v).some((p) => existsSync(join(v, p, 'head.json'))))
    refuse("no bundles folder: no paper's head.json in it")
  return { dir: v, from: 'env' }
}

/** the one line a tool prints of the bundles it serves */
export const bundlesLine = (b: BundlesDir): string =>
  `bundles: ${resolve(b.dir)} (${b.from === 'env' ? 'from AXT_L1_BUNDLES' : 'default'})`

/**
 * The pairs of `pairs` whose paper the bundles `b` hold no head of (`missing`). Where the folder was named (AXT_L1_BUNDLES) and
 * the tool was asked these pairs, one missing is an error naming it and the folder; where the tool lists them itself
 * (`listed`: every ledger of the tap) or serves the default, the missing are only returned, for the tool to say and stop as
 * before
 */
export function headsFor(pairs: readonly string[], b: BundlesDir, o: { listed?: boolean } = {}): { missing: string[] } {
  const missing = pairs.filter((p) => !existsSync(join(b.dir, paperOf(p), 'head.json')))
  if (missing.length && b.from === 'env' && !o.listed)
    throw new Error(`AXT_L1_BUNDLES=${JSON.stringify(b.dir)}: no head of ${missing.join(', ')} in it (the pairs asked)`)
  return { missing }
}
