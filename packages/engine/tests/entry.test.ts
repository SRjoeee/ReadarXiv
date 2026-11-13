// The package's entry (src/index.ts) re-exports some modules whole (`export * from`) and names the rest. A name it exports
// explicitly silently shadows the same name of a module it re-exports whole, which no type check reports: the stored plan's
// reader, exported as `planOf`, once took the place of the wrap's `planOf` (wrap.types.ts) for every caller of the entry
// (src/pdf-reader/engine/layout/wrap-final.mjs among them). Each value a module re-exported whole holds must be that module's.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import * as entry from '../src/index.ts'

const SRC = new URL('../src/', import.meta.url)
const whole = [...readFileSync(new URL('index.ts', SRC), 'utf8').matchAll(/^export \* from '(\.\/[^']+)'/gm)].map(
  (m) => m[1] ?? '',
)

describe("the package's entry", () => {
  test('re-exports some modules whole', () => {
    expect(whole.length).toBeGreaterThan(0)
  })
  test("shadows no value of a module it re-exports whole: each is that module's own", async () => {
    const shadowed: string[] = []
    const all: Record<string, unknown> = entry
    for (const path of whole) {
      const m: Record<string, unknown> = await import(new URL(path, SRC).href)
      for (const [name, value] of Object.entries(m)) if (all[name] !== value) shadowed.push(`${path} ${name}`)
    }
    expect(shadowed).toEqual([])
  })
  test("the wrap's planOf is the entry's; the stored plan's reader is storedPlanOf", async () => {
    const wrap: Record<string, unknown> = await import(new URL('wrap.types.ts', SRC).href)
    const plan: Record<string, unknown> = await import(new URL('plan.ts', SRC).href)
    expect(entry.planOf).toBe(wrap.planOf)
    expect(entry.storedPlanOf).toBe(plan.planOf)
  })
})
