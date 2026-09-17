// One definition of "a real translation node" (DESIGN §7.1): `TRANSLATION_EXCLUDED_CLASSES` in attrs.ts.
// The style sheets cannot import it, so every `.axt-t:not(…)` they write that names `.axt-pending`
// must list exactly the same classes — issue #46 was this list drifting between two copies. The browser suites
// cannot import it either (their selectors run inside the page), and are held to it the same way.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REAL_TRANSLATION, TRANSLATION_EXCLUDED_CLASSES } from '@/core/renderer/attrs'
import { TOP_TRANSLATION_SELECTOR, TRANSLATION_SELECTOR } from '@/core/renderer/style-preset'

const STYLES = join(import.meta.dirname, '../../src/styles')
const E2E = join(import.meta.dirname, '../e2e')
const canonical = TRANSLATION_EXCLUDED_CLASSES.map(c => `.${c}`).join(', ')

describe('the translation boundary', () => {
  it('is the four injected sub-classes, in the documented order', () => {
    expect(canonical).toBe('.axt-pending, .axt-error, .axt-mirror, .axt-split')
    expect(REAL_TRANSLATION).toBe(`.axt-t:not(${canonical})`)
    expect(TRANSLATION_SELECTOR).toBe(`html[data-axt-on] ${REAL_TRANSLATION}`)
    expect(TOP_TRANSLATION_SELECTOR).toContain(REAL_TRANSLATION)
  })

  it('every copy in the style sheets lists the same classes', () => {
    const seen: string[] = []
    for (const file of readdirSync(STYLES).filter(f => f.endsWith('.css'))) {
      const css = readFileSync(join(STYLES, file), 'utf8')
      for (const m of css.matchAll(/\.axt-t:not\(([^)]*)\)/g)) {
        const list = m[1]!
        if (!list.includes('.axt-pending')) continue // a deliberately narrower list, e.g. `:not(.axt-error)` alone
        seen.push(`${file}: ${list}`)
        expect(list, `${file} writes a different boundary`).toBe(canonical)
      }
    }
    // the sheets do carry the boundary — a regex that matched nothing would pass vacuously
    expect(seen.length).toBeGreaterThanOrEqual(6)
  })

  it('every copy in the browser suites lists the same classes: a count of “real translations” that forgot one kind of copy counts copies', () => {
    const seen: string[] = []
    // The suites and their probes; the dot-directories are build copies, not scripts
    const scripts = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? (entry.name.startsWith('.') ? [] : scripts(join(dir, entry.name))) : entry.name.endsWith('.mjs') ? [join(dir, entry.name)] : [])
    const excluded = TRANSLATION_EXCLUDED_CLASSES.map(c => `.${c}`)
    for (const path of scripts(E2E)) {
      const file = path.slice(E2E.length + 1)
      const script = readFileSync(path, 'utf8')
      // Chains (`:not(.a):not(.b)`) are not a way round the rule: the list is written once, as production writes it
      expect(script, `${file} chains :not() over our classes`).not.toMatch(/(?::not\(\.axt-[^)]*\)){2,}/)
      for (const m of script.matchAll(/:not\((\.axt-[^)]*)\)/g)) {
        const list = m[1]!
        // Any list naming one of the four is a boundary, and must be the whole one: `:not(.axt-mirror)` alone would count
        // rings and widgets as translations. `:not(.axt-t)` — “not ours” — names none of them and is another question
        if (!excluded.some(c => list.split(/,\s*/).includes(c))) continue
        seen.push(`${file}: ${list}`)
        expect(list, `${file} writes a different boundary`).toBe(canonical)
      }
    }
    expect(seen.length).toBeGreaterThan(5)
  })
})
