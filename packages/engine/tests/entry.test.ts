// The package's entry (src/index.ts) re-exports some modules whole (`export * from`) and names the rest. A name it exports
// explicitly silently shadows the same name of a module it re-exports whole, which no type check reports: the stored plan's
// reader, exported as `planOf`, once took the place of the wrap's `planOf` (wrap.types.ts) for every caller of the entry
// (src/pdf-reader/engine/layout/wrap-final.mjs among them). Each value a module re-exported whole holds must be that module's.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import * as deltaWire from '../src/delta-wire.types.ts'
import * as compiled from '../src/compiled.ts'
import * as entry from '../src/index.ts'
import * as ink from '../src/ink.types.ts'
import * as memory from '../src/memory.ts'
import * as plan from '../src/plan.ts'
import * as remove from '../src/remove.types.ts'
import * as section from '../src/section.ts'
import * as tail from '../src/tail.ts'
import * as wrap from '../src/wrap.types.ts'
import * as xref from '../src/xref.types.ts'

/** the modules the entry re-exports whole, by the path its `export *` names (a package names its imports literally) */
const WHOLE: Record<string, Record<string, unknown>> = {
  './ink.types.ts': ink,
  './delta-wire.types.ts': deltaWire,
  './memory.ts': memory,
  './remove.types.ts': remove,
  './section.ts': section,
  './tail.ts': tail,
  './wrap.types.ts': wrap,
  './xref.types.ts': xref,
}

describe("the package's entry", () => {
  test('re-exports whole the modules this test reads, and no other', () => {
    const text = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    const starred = [...text.matchAll(/^export \* from '(\.\/[^']+)'/gm)].map((m) => m[1])
    expect(starred.sort()).toEqual(Object.keys(WHOLE).sort())
  })
  test("shadows no value of a module it re-exports whole: each is that module's own", () => {
    const all: Record<string, unknown> = entry
    const shadowed = Object.entries(WHOLE).flatMap(([path, m]) =>
      Object.entries(m).flatMap(([name, value]) => (all[name] === value ? [] : [`${path} ${name}`])),
    )
    expect(shadowed).toEqual([])
  })
  test("the wrap's planOf is the entry's; the stored plan's reader is storedPlanOf, its writer storedInstrumentOf, the stored half compiledOf", () => {
    expect(entry.planOf).toBe(wrap.planOf)
    expect(entry.storedPlanOf).toBe(plan.planOf)
    expect(entry.storedInstrumentOf).toBe(plan.storedInstrumentOf)
    expect(entry.compiledOf).toBe(compiled.compiledOf)
  })
})
