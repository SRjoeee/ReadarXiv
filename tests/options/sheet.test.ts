// The settings page's own sheet (the redesign's design, §6.2, §8): the house rules — no :has() (DESIGN §7.2), no colour
// but a token's — and the agreed measures that no unit test sees drawn (tests/e2e/probes/settings-align.mjs measures
// them in a browser)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
