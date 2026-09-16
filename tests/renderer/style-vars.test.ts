// The reader's appearance values (#47, rebuilt in v12): colour, opacity, underline thickness and
// the band. `appearanceRule` turns them into rules that go into the injected sheet — never into an
// inline style on <html>, which restore()'s prefix sweep could not clear (§7.1 would break).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyStyle, enable, restore } from '@/core/renderer/page'
import { TOP_TRANSLATION_SELECTOR, TRANSLATION_SELECTOR, appearanceRule } from '@/core/renderer/style-preset'
import { sanitizeColor } from '@/core/renderer/style-values'
import { BUILT_IN_HIGHLIGHTS, type Look } from '@/config/appearance'
import { docOf } from './helpers'
import { LOOK, lookWith } from './looks'

describe('sanitizeColor', () => {
  it('lets the common spellings through', () => {
    for (const value of ['#1565c0', '#abc', '#11223344', 'red', 'transparent', 'rgb(21 101 192)', 'oklch(0.6 0.1 250)', 'color-mix(in oklab, currentColor 40%, transparent)']) {
      expect([value, sanitizeColor(value).ok]).toEqual([value, true])
    }
  })

  it('the empty string is valid and means follow the original', () => {
    expect(sanitizeColor('   ')).toEqual({ ok: true, color: '' })
  })

  it('hex takes 3 / 4 / 6 / 8 digits only: any other length the browser drops whole, and storing it makes the setting a no-op', () => {
    for (const value of ['#abc', '#abcd', '#a1b2c3', '#a1b2c3d4']) expect([value, sanitizeColor(value).ok]).toEqual([value, true])
    // These pass the allowlist yet never reach the rendering: the reader would see the setting stored and the page unchanged (Codex on #106)
    for (const value of ['#ab', '#abcde', '#a1b2c3d', '#a1b2c3d4e']) expect([value, sanitizeColor(value).ok]).toEqual([value, false])
  })

  it('named colours are looked up in an exact table, not “any run of lowercase letters”', () => {
    for (const value of ['red', 'rebeccapurple', 'darkslategrey', 'transparent', 'currentcolor', 'CurrentColor']) {
      expect([value, sanitizeColor(value).ok]).toEqual([value, true])
    }
    // These pass the lexical shape but are no colours: storable, yet the browser drops the whole declaration (Codex on #106)
    for (const value of ['banana', 'reddish', 'colour', 'notacolor', 'inherit', 'initial', 'unset', 'revert']) {
      expect([value, sanitizeColor(value).ok]).toEqual([value, false])
    }
  })

  it('blocks input that would open a new declaration or close the rule', () => {
    // Typed into the box, "red; opacity: 0" adds a declaration; "}" closes early and what follows becomes a page-wide rule
    for (const value of ['red; opacity: 0', 'red}', '#fff{', 'url(x)', 'var(--x)', '<script>']) {
      expect([value, sanitizeColor(value).ok]).toEqual([value, false])
    }
  })
})

describe('appearanceRule', () => {
  const all = (look: Look) => appearanceRule(look)
  const band = (over: Partial<(typeof BUILT_IN_HIGHLIGHTS)[number]>) => ({ ...BUILT_IN_HIGHLIGHTS[0]!, ...over })

  it('the default appearance writes only the two highlight variables: the translation itself is pixel for pixel as before this feature', () => {
    const css = all(LOOK)
    expect(css).toContain('--axt-hl-mix: 22%;')
    expect(css).toContain(`--axt-hl-color: ${BUILT_IN_HIGHLIGHTS[0]!.color};`)
    expect(css).not.toContain('--axt-color:')
    expect(css).not.toContain('opacity:')
  })

  it('colour and opacity act on the “real translation”, excluding the skeleton, the failure widget, mirrors and split copies', () => {
    const css = all(lookWith({ color: '#1565c0', opacity: 0.8 }))
    expect(css).toContain(TRANSLATION_SELECTOR)
    expect(css).toContain('--axt-color: #1565c0;')
    expect(css).toContain('opacity: 0.8;')
    // Mirrors and split copies are visual clones of the **source** and must not wear the translation's colour and opacity (the same line as §7.5 draws)
    for (const cls of ['.axt-pending', '.axt-error', '.axt-mirror', '.axt-split']) {
      expect([cls, css.includes(cls)]).toEqual([cls, true])
    }
  })

  it('the highlight configuration is written as colour + percentage: the band\'s strength is consumed by color-mix', () => {
    const css = all({ style: LOOK.style, highlight: band({ color: '#e91e63', opacity: 0.3 }) })
    expect(css).toContain('html[data-axt-on] {')
    expect(css).toContain('--axt-hl-color: #e91e63;')
    expect(css).toContain('--axt-hl-mix: 30%;')
  })

  it('the highlight strength is clamped to the schema\'s bounds: caught when a slip makes it invisible or a smear', () => {
    expect(all({ style: LOOK.style, highlight: band({ opacity: 0 }) })).toContain('--axt-hl-mix: 5%;')
    expect(all({ style: LOOK.style, highlight: band({ opacity: 1 }) })).toContain('--axt-hl-mix: 60%;')
  })

  it('the line width is written only when a line is really drawn: a configuration without an underline must leave no dangling variable', () => {
    expect(all(lookWith({ underline: 'wavy', thickness: 2 }))).toContain('--axt-deco-thickness: 2px;')
    expect(all(lookWith({ underline: 'none', thickness: 2 }))).not.toContain('--axt-deco-thickness')
    expect(all(lookWith({ underline: 'wavy', thickness: 1 }))).not.toContain('--axt-deco-thickness')
  })

  it('the opacity declaration is static, in presets.css, on “top-level real translation”, so a nested footnote translation does not multiply it twice', () => {
    // side mode's localizeNotes inserts .axt-note-t.axt-t inside the paragraph translation; matched on both levels
    // the lower bound 0.3 would render as 0.09. Chrome, measured with this selector: top level 0.5, nested footnote 1, split copy 1, the real translation inside the copy 0.5
    const css = readFileSync(join(import.meta.dirname, '../../src/styles/presets.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toContain(`${TOP_TRANSLATION_SELECTOR} {\n  opacity: var(--axt-opacity, 1);\n}`)
    // The look sheet carries the value only, as a variable on <html> (INVENTORY T5)
    expect(appearanceRule(lookWith({ opacity: 0.5 }))).not.toContain('opacity: var(')
    // The colour rule needs no such exclusion: --axt-color is an inherited property, and nesting does not stack it
    expect(appearanceRule(lookWith({ color: '#1565c0' }))).not.toContain(':not(:where(')
  })

  it('every value is a variable — on <html>, the colour on the translation selector — and nothing but variables: the static sheets consume them, so the look sheet follows them and is rewritten alone (INVENTORY T5)', () => {
    const rule = appearanceRule({ style: { ...LOOK.style, color: '#1565c0', opacity: 0.5 }, highlight: band({ color: '#e91e63' }) })
    const onHtml = /html\[data-axt-on\] \{\n([^}]*)\}/.exec(rule)![1]!
    expect(onHtml).toContain('--axt-opacity: 0.5;')
    expect(onHtml).toContain('--axt-hl-color: #e91e63;')
    expect(onHtml).not.toContain('--axt-color')
    expect(rule).toContain(`${TRANSLATION_SELECTOR} {\n--axt-color: #1565c0;\n}`)
    // Not one property that is not a custom one: a real declaration here would depend on where the sheet sits in the cascade
    for (const line of rule.split('\n')) if (line.includes(':') && !line.includes('{')) expect(line.trimStart().startsWith('--axt-')).toBe(true)
  })

  it('an invalid colour is dropped rather than written into the rule as it is', () => {
    expect(all(lookWith({ color: 'red; opacity: 0' }))).not.toContain('--axt-color')
  })

  it('the opacity does not go below the lower bound: caught when a slip makes it invisible', () => {
    expect(all(lookWith({ opacity: 0 }))).toContain('--axt-opacity: 0.3;')
  })
})

describe('injection and restore', () => {
  // In vitest a `?inline` CSS import resolves to an **empty string** (css: false in vitest.config), so the static sheet's
  // content cannot be asserted here; asserted are the two sheets' order in the document and the text contract of
  // presets.css. The real cascade is covered by browser measurement (blur with the slider at 0.5 → computed 0.375)
  it('two sheets: the static one first, the look sheet right after it (INVENTORY T5)', () => {
    const doc = docOf('<p class="ltx_p" id="p1">Hello.</p>')
    doc.head.append(doc.createElement('meta')) // something else the head holds after our sheets
    enable(doc, 'stack', lookWith({ blur: true, color: '#1565c0', opacity: 0.5 }))
    const sheets = Array.from(doc.querySelectorAll('style[data-axt-sheet]'), s => s.getAttribute('data-axt-sheet'))
    expect(sheets).toEqual(['modes', 'look'])
    expect(doc.querySelector('style[data-axt-sheet="modes"]')!.nextElementSibling).toBe(doc.querySelector('style[data-axt-sheet="look"]'))
    const css = doc.querySelector('style[data-axt-sheet="look"]')!.textContent ?? ''
    expect(css).toContain('--axt-opacity: 0.5;')
    expect(css).toContain('--axt-color: #1565c0;')
    // Dropping an object straight into a template string leaves this (measured: it happened on the settings page's preview)
    expect(css).not.toContain('[object Object]')
  })

  it('in presets.css the baseline opacity precedes the blur rule: equal specificity, so the blur wins by order alone', () => {
    const css = readFileSync(join(import.meta.dirname, '../../src/styles/presets.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const baseline = css.indexOf('opacity: var(--axt-opacity, 1);')
    expect(baseline).toBeGreaterThanOrEqual(0)
    expect(baseline).toBeLessThan(css.indexOf('filter: blur(4px);'))
  })

  it('stacking declarations act on the top-level translation only; a nested footnote translation is not multiplied a second time', () => {
    // opacity / filter both act on the whole subtree: side mode's .axt-note-t.axt-t nests inside the paragraph translation,
    // and matched on both levels they multiply. Chrome, measured (slider 0.5): before, outer/nested both 0.375 and each got one
    // blur(4px); after, nested is 1 / none (Codex on #106)
    const css = readFileSync(join(import.meta.dirname, '../../src/styles/presets.css'), 'utf8')
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '')
    const offenders: string[] = []
    for (const m of rules.matchAll(/([^{}]*\.axt-t[^{}]*)\{([^{}]*)\}/g)) {
      const [, selector, body] = m
      // Parsed declaration by declaration, without a negative-lookahead regex: `\s*` backtracks to zero width and lets (?!none) evaluate at the space, always true
      const compounds = body!.split(';').some(decl => {
        const [prop, ...rest] = decl.split(':')
        return ['opacity', 'filter', 'animation'].includes(prop!.trim()) && rest.join(':').trim() !== 'none'
      })
      if (!compounds) continue
      if (!selector!.includes(':not(:where(')) offenders.push(selector!.trim())
    }
    expect(offenders).toEqual([])
  })

  it('in presets.css the blur consumes --axt-opacity rather than overriding it', () => {
    const css = readFileSync(join(import.meta.dirname, '../../src/styles/presets.css'), 'utf8')
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // The blur brings its own 0.75 and must multiply the reader's value, or the slider has no effect on it (Codex on #106)
    expect(rules).toContain('calc(var(--axt-opacity, 1) * 0.75)')
    // No hard-coded bare opacity value may remain; it would override the reader's value
    expect(rules).not.toMatch(/opacity:\s*0?\.\d+;/)
  })

  it('the advanced declaration block still has the last word', () => {
    const doc = docOf('<p class="ltx_p" id="p1">Hello.</p>')
    enable(doc, 'stack', lookWith({ css: 'color: teal;', color: '#1565c0' }))
    const css = doc.querySelector('style[data-axt-sheet="look"]')!.textContent ?? ''
    expect(css.indexOf('color: teal;')).toBeGreaterThan(css.indexOf('--axt-color: #1565c0'))
  })

  it('applyStyle rewrites the look sheet only and touches no node; returns false with translation off', () => {
    const doc = docOf('<p class="ltx_p" id="p1">Hello.</p>')
    expect(applyStyle(doc, lookWith({ color: '#1565c0' }))).toBe(false)
    enable(doc, 'stack', LOOK)
    const body = doc.body.outerHTML
    const fixed = doc.querySelector('style[data-axt-sheet="modes"]')!
    fixed.textContent = 'STATIC' // stands in for the 900 lines vitest's `?inline` leaves empty; any rewrite would show
    expect(applyStyle(doc, lookWith({ underline: 'dotted', color: '#1565c0', opacity: 0.8 }))).toBe(true)
    expect(doc.documentElement.getAttribute('data-axt-underline')).toBe('dotted')
    expect(doc.querySelector('style[data-axt-sheet="look"]')!.textContent).toContain('--axt-color: #1565c0')
    // Only the look sheet and the attributes on <html> change; body does not change by one byte, the static sheet by one either
    expect(doc.body.outerHTML).toBe(body)
    expect(doc.querySelector('style[data-axt-sheet="modes"]')).toBe(fixed)
    expect(fixed.textContent).toBe('STATIC')
    // Still two sheets only
    expect(doc.querySelectorAll('style[data-axt-sheet]')).toHaveLength(2)
  })

  it('a second enable leaves the static sheet alone and follows the look; without a look it touches neither the attributes nor the look sheet', () => {
    const doc = docOf('<p class="ltx_p" id="p1">Hello.</p>')
    enable(doc, 'stack', lookWith({ color: '#1565c0' }))
    const fixed = doc.querySelector('style[data-axt-sheet="modes"]')!
    fixed.textContent = 'STATIC'
    enable(doc, 'side', lookWith({ color: 'teal' }))
    expect(doc.querySelector('style[data-axt-sheet="modes"]')).toBe(fixed)
    expect(fixed.textContent).toBe('STATIC')
    expect(doc.querySelector('style[data-axt-sheet="look"]')!.textContent).toContain('--axt-color: teal;')
    enable(doc, 'only')
    expect(doc.querySelector('style[data-axt-sheet="look"]')!.textContent).toContain('--axt-color: teal;')
    expect(doc.querySelectorAll('style[data-axt-sheet]')).toHaveLength(2)
  })

  it('after restoring the original the DOM equals the pre-translation one byte for byte (§7.1 item 4)', () => {
    const doc = docOf('<p class="ltx_p" id="p1">Hello.</p>')
    const before = doc.documentElement.outerHTML
    enable(doc, 'side', lookWith({ underline: 'wavy', color: '#1565c0', opacity: 0.6 }))
    applyStyle(doc, lookWith({ blur: true, color: 'red', opacity: 0.4 }))
    restore(doc)
    expect(doc.documentElement.outerHTML).toBe(before)
  })
})
