// The settings page's own sheet (the redesign's design, §6.2, §8): the house rules — no :has() (DESIGN §7.2), no colour
// but a token's — and the agreed measures that no unit test sees drawn (tests/e2e/probes/settings-align.mjs measures
// them in a browser)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ruleOf, rules } from '../styles/css-rules'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/entrypoints/options/ui/settings.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the settings page\'s sheet', () => {
  it('carries no :has() and names no colour but through a token', () => {
    expect(SHEET).not.toContain(':has(')
    expect(SHEET).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(|hsla?\(/i)
  })

  it('writes the row grammar\'s measures: a row 48 px, 8 × 10 in; a level 28 px more; the trailing icon button 28 px pulled 6 px', () => {
    expect(SHEET).toMatch(/\.o-row \{[^}]*min-height: 48px;[^}]*padding: 8px 10px;/)
    expect(SHEET).toContain('.o-row[data-level="1"] { padding-inline-start: 38px; }')
    expect(SHEET).toContain('.o-row[data-level="2"] { padding-inline-start: 66px; }')
    expect(SHEET).toMatch(/\.o-icon-button \{[^}]*width: 28px; height: 28px;[^}]*margin-inline-end: -6px;/)
    expect(SHEET).toMatch(/\.o-card \{[^}]*padding: 4px; border-radius: 10px;/)
    // a heading's aside is words a reader reads: ink-2, 4.5:1 (ink-3 is under it; ruling 19)
    expect(SHEET).toContain('.o-aside { color: var(--ink-2);')
  })

  it('centres the frame, the sidebar and the column one group: 232 px, and the column\'s 680 with 48 on either side (Task 103b)', () => {
    expect(SHEET).toMatch(/\.o-frame \{[^}]*grid-template-columns: 232px minmax\(0, 1fr\);[^}]*max-width: calc\(232px \+ 48px \+ 680px \+ 48px\);[^}]*margin-inline: auto;/)
    expect(SHEET).toMatch(/\.o-main \{[^}]*padding: 30px 48px 40px;/)
    expect(SHEET).toContain('.o-column { max-width: 680px; }')
  })

  it('folds the sidebar above the column below 640 px, the rows sized to their content; the interface language at the title row\'s end, its menu opening downward there and upward at the foot (Task 103b)', () => {
    const all = rules(SHEET)
    const layer = ['@layer components']
    const narrow = [...layer, '@media (width < 640px)']
    expect(ruleOf(all, '.o-frame', narrow)).toMatchObject({ 'grid-template-columns': 'minmax(0, 1fr)', 'align-content': 'start' })
    expect(ruleOf(all, '.o-side', narrow)).toMatchObject({ display: 'grid', 'grid-template-columns': 'max-content minmax(0, 1fr)', 'grid-template-areas': '"brand lang" "search search" "nav nav"', 'align-items': 'start', padding: '16px 16px 4px' })
    expect(['.o-brand', '.o-search', '.o-nav', '.o-lang'].map(s => ruleOf(all, s, narrow)['grid-area'])).toEqual(['brand', 'search', 'nav', 'lang'])
    expect(ruleOf(all, '.o-lang', narrow)).toMatchObject({ 'justify-self': 'end', 'max-width': '100%', 'margin-top': '0' })
    expect(ruleOf(all, '.o-lang', layer)['margin-top']).toBe('auto')
    expect(ruleOf(all, '.pop.o-lang-menu', layer)['position-area']).toBe('top span-right')
    expect(ruleOf(all, '.pop.o-lang-menu', narrow)['position-area']).toBe('bottom span-left')
  })

  it('shows the interface language\'s search row the place true at the window\'s width, by the query that moves the control: the other sentence out of sight and of the accessibility tree (Task 104b)', () => {
    const all = rules(SHEET)
    const layer = ['@layer components']
    const narrow = [...layer, '@media (width < 640px)']
    expect(ruleOf(all, '.o-narrow', layer).display).toBe('none')
    expect(ruleOf(all, '.o-wide', narrow).display).toBe('none')
    expect(ruleOf(all, '.o-narrow', narrow).display).toBe('inline')
  })

  // Codex 4c: a greyed add row read as an available one in forced colours, where ink-3 becomes ButtonText
  it('greys an add row at its list\'s cap in forced colours as the shared Button\'s disabled state is: GrayText', () => {
    expect(ruleOf(rules(SHEET), 'button.o-row[aria-disabled="true"] :is(.o-lead, .o-label)', ['@media (forced-colors: active)'])).toEqual({ color: 'GrayText' })
  })

  // Codex 4c: the styles' heading with Restore greyed and its reason held its line past a 320 px window's column in English
  it('lets a heading\'s action, a reason before its button, go under the title on the trailing edge rather than hold the heading\'s line', () => {
    const all = rules(SHEET)
    expect(ruleOf(all, '.o-heading[data-action]', ['@layer components'])).toMatchObject({ 'flex-wrap': 'wrap' })
    expect(ruleOf(all, '.o-heading-end', ['@layer components'])).toMatchObject({ 'margin-inline-start': 'auto', flex: '0 1 auto', 'min-width': '0', 'flex-wrap': 'wrap', 'justify-content': 'flex-end' })
  })

  it('draws a search hit in ink on the mark, in a description too: its inherited ink-2 fell under 4.5:1 (Task 101)', () => {
    expect(SHEET).toContain('.o-hit { padding: 0 1px; border-radius: 2px; background: var(--mark); color: var(--ink); }')
  })

  it('gives every motion its reduced form', () => {
    const motions = [...SHEET.matchAll(/animation: (o-[a-z-]+)/g)].map(m => m[1])
    expect(motions.length).toBeGreaterThan(0)
    const reduced = SHEET.slice(SHEET.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of new Set(motions)) expect(SHEET.includes(`@keyframes ${name}`), name).toBe(true)
    expect(reduced).toContain('.o-arrive')
    expect(reduced).toContain('.o-swap')
    expect(reduced).toContain('[data-arriving]')
    // the reader's words-in is Part 3's (controls.css): used here, never defined again
    expect(SHEET).toContain('animation: words-in 180ms ease-out')
    expect(SHEET).not.toContain('@keyframes words-in')
  })

  it('draws a switch that is on in the brand, its thumb white, in the components layer, where the shared forced-colours Highlight still wins (the maintainer, 2026-09-28)', () => {
    const all = rules(SHEET)
    expect(ruleOf(all, '.o-frame .switch[aria-checked="true"]', ['@layer components'])).toEqual({ background: 'var(--brand)' })
    expect(ruleOf(all, '.o-frame .switch[aria-checked="true"]::after', ['@layer components'])).toEqual({ background: 'var(--on-brand)' })
  })
})
