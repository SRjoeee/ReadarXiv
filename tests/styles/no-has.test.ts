// No `:has()` in the injected style sheets (DESIGN §7.2).
//
// Chrome answers a `:has()` in an author sheet by recalculating the whole document's styles on every DOM insertion,
// wherever it lands — into the hover highlight's band layer, into `<head>`, next to a paragraph. Measured 2026-09-17
// (tests/e2e/probes/insert-recalc.mjs): 14 ms per insertion on a 4 500-element paper, 161–165 ms on a 59 000-element one,
// the same for a hover band and for an arriving translation; with the `:has()` rules deleted, 0.2 and 1.4 ms. Every
// structural condition the layout needs is a `data-axt-*` mark the renderer writes at the moment it creates the
// structure. Selectors with `:has()` may still be used from TypeScript (`querySelectorAll`, `matches`, `closest`):
// a query sets no invalidation state.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES, type Look } from '@/config/appearance'
import { STYLE_ATTR } from '@/core/renderer'
import { failureWidget } from '@/core/renderer/failed'
import { appearanceSheet } from '@/core/renderer/page'
import { enableDebug } from '@/entrypoints/content/debug'

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

// The files above are not all that reaches a page: some CSS is text built in TypeScript, which a gate that reads
// `src/styles/*.css` never sees. These read what is **actually injected** — the text a `<style>` ends up holding —
// so a sheet assembled from pieces, or generated from the reader's settings, is held to the rule as a whole.
// (The floating button's sheet is checked where its harness is, tests/entry/floating-button.test.ts.)
describe('the style sheets built in TypeScript', () => {
  const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

  afterEach(() => {
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-axt-debug')
  })

  it('the page sheet as it is assembled, for every built-in look and for a profile with an advanced block', () => {
    const looks: Look[] = BUILT_IN_STYLES.flatMap(style => BUILT_IN_HIGHLIGHTS.map(highlight => ({ style, highlight })))
    // The reader's own declarations go between a pair of our braces (style-values.ts `sanitizeCustomCss` admits no
    // selector, no brace, no at-rule), so they cannot bring a `:has()` in; the rule they land in is ours, and checked
    looks.push({
      style: { ...BUILT_IN_STYLES[0]!, id: 'custom', name: 'Custom', color: '#336699', underline: 'dashed', blur: true, css: 'font-style: italic; letter-spacing: 0.01em' },
      highlight: { ...BUILT_IN_HIGHLIGHTS[0]!, id: 'custom-band', color: '#ffcc00' },
    })
    expect(looks.length).toBe(BUILT_IN_STYLES.length * BUILT_IN_HIGHLIGHTS.length + 1)
    for (const look of looks) {
      const sheet = withoutComments(appearanceSheet(look))
      // Not an empty string passing for a clean sheet. Under vitest the `?inline` imports of the four files are empty
      // strings, so the static part is the case above's, from the files themselves; what is held here is the part
      // `lookSheet` generates, and it has to be there: the band's variables always, the reader's block when given
      expect(sheet, `${look.style.id} / ${look.highlight.id}`).toContain('--axt-hl-color')
      if (look.style.css) expect(sheet).toContain(look.style.css)
      expect(sheet, `the page sheet for ${look.style.id} / ${look.highlight.id} uses :has()`).not.toContain(':has(')
    }
  })

  it('the failure widget\'s sheet, inside its shadow root', () => {
    const widget = failureWidget(document, 'network: offline', () => undefined)
    const sheet = widget.shadowRoot?.querySelector('style')?.textContent ?? ''
    expect(sheet.length).toBeGreaterThan(0)
    expect(withoutComments(sheet)).not.toContain(':has(')
  })

  it('the debug outlines\' sheet (#axt-debug)', () => {
    enableDebug([])
    const sheet = document.querySelector(`style[${STYLE_ATTR}="debug"]`)?.textContent ?? ''
    expect(sheet.length).toBeGreaterThan(0)
    expect(withoutComments(sheet)).not.toContain(':has(')
  })
})

