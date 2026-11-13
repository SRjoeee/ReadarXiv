// An adapter's behaviour digest (contract.ts Translator `digest`): the SHA-256 of what it writes for every fixture unit and
// what it reads from every recorded reply. A module of its own, imported by no test runner, so that a script recomputes it
// (`pnpm digests`, scripts/digests.ts); the conformance suite (suite.ts) holds an adapter's literal to it.
import type { Lang, Translator, UnitIn } from '../contract.ts'
import { sha256Hex } from '../sha256.ts'

/** what a digest is taken over: the target, the fixture units, the recorded replies by unit */
export interface Golden {
  target: Lang
  units: readonly UnitIn[]
  replies: readonly { unit: number; raw: string }[]
}

/** what the behaviour digest is taken over: write's output on every fixture unit, read's on every recorded reply */
export function goldenOf(t: Translator, f: Golden): string {
  const writes = f.units.map((u) => t.write(u, f.target))
  const reads = f.replies.map((r) => {
    const unit = f.units[r.unit] as UnitIn
    try {
      return t.read(unit, r.raw)
    } catch (e) {
      return { threw: String(e) }
    }
  })
  return sha256Hex(JSON.stringify({ writes, reads }))
}
