// One definition of "a real translation node" (DESIGN §7.1): `TRANSLATION_EXCLUDED_CLASSES` in attrs.ts — issue #46
// was this list drifting between copies. Two kinds of copy cannot import it, and are held to it here:
// - the style sheets: every `.axt-t:not(…)` that names `.axt-pending` lists exactly the same classes (a sheet may write a
//   deliberately narrower list, `:not(.axt-error)` alone, for a rule about one kind of node);
// - the browser suites (their selectors run inside the page): every `:not(…)` that names any of the four classes lists
//   exactly the same, unless the selector it qualifies is itself one of those kinds (`.axt-error:not(.axt-split)`, an
//   error widget outside a split copy). A list built by interpolation (`:not(${x})`) cannot be read here.
import { execFileSync } from 'node:child_process'
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
    const root = join(import.meta.dirname, '../..')
    const tracked = execFileSync('git', ['ls-files', 'tests/e2e'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))
    const excluded = TRANSLATION_EXCLUDED_CLASSES.map(c => `.${c}`)
    const seen: string[] = []
    for (const file of tracked) {
      const script = readFileSync(join(root, file), 'utf8')
      // Chains (`:not(.a):not(.b)`) are not a way round the rule: the list is written once, as production writes it
      expect(script, `${file} chains :not() over our classes`).not.toMatch(/(?::not\([^()]*\.axt-[^()]*\)){2,}/)
      for (const m of script.matchAll(/((?:\.[\w-]+|\[[^\]]*\])*):not\(([^()]*)\)/g)) {
        const items = m[2]!.split(',').map(item => item.trim())
        if (!items.some(item => excluded.includes(item))) continue
        // The qualified selector is itself one of the four kinds: a rule about that kind, not a count of translations
        const subject = m[1]!.match(/\.[\w-]+/g) ?? []
        if (subject.some(c => excluded.includes(c))) continue
        seen.push(`${file}: ${m[0]}`)
        expect(items.join(', '), `${file} writes a different boundary: ${m[0]}`).toBe(canonical)
      }
    }
    expect(seen.length).toBeGreaterThan(5)
  })
})
