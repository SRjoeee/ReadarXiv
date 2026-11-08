// The engine's modules load whichever of them is imported first, in Node as it runs them (vitest's runner resolves an import
// cycle that Node does not). today's makers copied beside locate re-export facts.ts's classifyFont (deps.mjs), and are loaded
// first by the parity's join (lab/typeset/parity/join.mjs imports ink-units.mjs): a module facts.ts imports that imports them
// back leaves one of them uninitialised there (facts.ts reading accents through today.types.ts: "Cannot access 'UNIT_FLAG'
// before initialization").
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const loads = (path: string) => {
  const url = new URL(path, import.meta.url).href
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], {
    encoding: 'utf8',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  })
  return r.status === 0 ? 'loaded' : r.stderr.split('\n').find((l) => /Error/.test(l))
}

describe("the engine's modules in Node, whichever is imported first", () => {
  it("loads today's makers before facts.ts, and facts.ts before them", () => {
    expect(loads('../src/locate/today/ink-units.mjs')).toBe('loaded')
    expect(loads('../src/locate/today/deps.mjs')).toBe('loaded')
    expect(loads('../src/locate/facts.ts')).toBe('loaded')
  })
})
