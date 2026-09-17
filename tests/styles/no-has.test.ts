// No `:has()` in the injected style sheets (DESIGN §7.2).
//
// Chrome answers a `:has()` in an author sheet by recalculating the whole document's styles on every DOM insertion,
// wherever it lands — into the hover highlight's band layer, into `<head>`, next to a paragraph. Measured 2026-09-17
// (tests/e2e/probes/hl-recalc.mjs): 14 ms per insertion on a 4 500-element paper, 161–165 ms on a 59 000-element one,
// the same for a hover band and for an arriving translation; with the `:has()` rules deleted, 0.2 and 1.4 ms. Every
// structural condition the layout needs is a `data-axt-*` mark the renderer writes at the moment it creates the
// structure. Selectors with `:has()` may still be used from TypeScript (`querySelectorAll`, `matches`, `closest`):
// a query sets no invalidation state.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES = join(import.meta.dirname, '../../src/styles')

describe('the injected style sheets', () => {
  const files = readdirSync(STYLES).filter(f => f.endsWith('.css')).sort()

  it('carry no :has() outside comments', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const rules = readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(rules, `${file} uses :has()`).not.toContain(':has(')
    }
  })
})
