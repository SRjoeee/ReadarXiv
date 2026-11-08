// The engine's modules load whichever of them is imported first, in Node as it runs them (vitest's runner resolves an import
// cycle that Node does not). today's makers copied beside locate re-export facts.ts's classifyFont (deps.mjs), and are loaded
// first by the parity's join (lab/typeset/parity/join.mjs imports ink-units.mjs): a module facts.ts imports that imports them
// back leaves one of them uninitialised there (facts.ts reading accents through today.types.ts: "Cannot access 'UNIT_FLAG'
// before initialization").
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** the package's directory, which Node resolves the engine's packages from */
const ENGINE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

/** 'loaded' where Node runs `module` as the first module it loads, else the first line of its error */
const loads = (module: URL) => {
  const r = spawnSync(process.execPath, [fileURLToPath(module)], { encoding: 'utf8', cwd: ENGINE })
  return r.status === 0 ? 'loaded' : r.stderr.split('\n').find((l) => /Error/.test(l))
}

describe("the engine's modules in Node, whichever is imported first", () => {
  it("loads today's makers before facts.ts, and facts.ts before them", () => {
    expect(loads(new URL('../src/locate/today/ink-units.mjs', import.meta.url))).toBe('loaded')
    expect(loads(new URL('../src/locate/today/deps.mjs', import.meta.url))).toBe('loaded')
    expect(loads(new URL('../src/locate/facts.ts', import.meta.url))).toBe('loaded')
  })
})
