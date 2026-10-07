// The token source (the redesign's design, §2.1, §2.2): the committed sheet is the source's, the reader's values are
// kept exactly, and a shadow root's sheet names nothing without the extension's prefix
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAMP, resolve, tokenSheet } from '@/shared/tokens'

const SHEET = join(import.meta.dirname, '../../src/styles/tokens.css')

describe('the token source', () => {
  it('is what the committed sheet holds: `pnpm tokens` rewrites it', () => {
    expect(readFileSync(SHEET, 'utf8')).toBe(tokenSheet('page'))
  })

  it('keeps the reader\'s ramp and roles as the reader\'s design §4.1 set them', () => {
    expect(RAMP).toEqual({
      'n-0': { light: 'oklch(1 0 0)', dark: 'oklch(0.255 0.006 255)' },
      'n-1': { light: 'oklch(0.985 0.002 255)', dark: 'oklch(0.215 0.006 255)' },
      'n-2': { light: 'oklch(0.962 0.004 255)', dark: 'oklch(0.185 0.006 255)' },
      'n-3': { light: 'oklch(0.935 0.006 255)', dark: 'oklch(0.275 0.007 255)' },
      'n-4': { light: 'oklch(0.905 0.007 255)', dark: 'oklch(0.31 0.008 255)' },
      'n-5': { light: 'oklch(0.86 0.008 255)', dark: 'oklch(0.36 0.009 255)' },
      'n-7': { light: 'oklch(0.62 0.012 255)', dark: 'oklch(0.56 0.01 255)' },
      'n-8': { light: 'oklch(0.505 0.014 255)', dark: 'oklch(0.71 0.01 255)' },
      'n-10': { light: 'oklch(0.235 0.012 255)', dark: 'oklch(0.935 0.005 255)' },
    })
    const both = (name: string) => [resolve(name, 'light'), resolve(name, 'dark')]
    expect(both('canvas')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.275 0.007 255)'])
    expect(both('well')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.185 0.006 255)'])
    expect(both('lift')).toEqual(['oklch(1 0 0)', 'oklch(0.36 0.009 255)'])
    expect(both('fill')).toEqual(['oklch(0.935 0.006 255)', 'oklch(0.31 0.008 255)'])
    expect(both('focus')).toEqual(both('ink'))
    expect(both('danger')).toEqual(['oklch(0.545 0.17 28)', 'oklch(0.69 0.15 28)'])
    expect(both('pop-shadow')).toEqual([
      '0 0 0 0.5px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.14)',
      '0 0 0 0.5px oklch(1 0 0 / 0.1), 0 14px 36px oklch(0 0 0 / 0.5)',
    ])
  })

  it('holds the two roles the pages add (Part 3; ruling 9): a hovered or open row in the popup\'s group, and P0\'s paper id', () => {
    const both = (name: string) => [resolve(name, 'light'), resolve(name, 'dark')]
    expect(both('group-hover')).toEqual(both('n-3'))
    expect(both('on-brand-2')).toEqual(['oklch(1 0 0 / 0.85)', 'oklch(1 0 0)'])
  })

  it('holds the brand red the maintainer chose (2026-09-28, round 8): arXiv\'s red to the eye, another value', () => {
    expect([resolve('brand', 'light'), resolve('brand', 'dark')]).toEqual(['oklch(0.493 0.186 24.5)', 'oklch(0.559 0.188 24.5)'])
  })

  it('holds the tooltip\'s shadow as a role, its value the one the tooltip drew, the same in both themes (Task 21)', () => {
    expect([resolve('tip-shadow', 'light'), resolve('tip-shadow', 'dark')]).toEqual(['0 4px 12px oklch(0 0 0 / 0.2)', '0 4px 12px oklch(0 0 0 / 0.2)'])
  })

  it('writes the pages\' sheet with the reader\'s selectors: light, the system\'s dark unless light is chosen, dark chosen', () => {
    const css = tokenSheet('page')
    expect(css).toContain(':root,\n[data-theme="light"] {\n  color-scheme: light;')
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;')
    expect(css).toContain('\n[data-theme="dark"] {\n  color-scheme: dark;')
    expect(css).toContain('  --fill: var(--n-4);')
    expect(css).toContain('  --float-bg: color-mix(in oklab, var(--n-0) 90%, transparent);')
  })

  it('writes a shadow root\'s sheet on :host, light or dark by a mark inside the shadow root, every variable and mark prefixed (hard rule 2)', () => {
    const css = tokenSheet('host')
    expect(css).toContain(':host,\n[data-axt-theme="light"] {\n  color-scheme: light;')
    // the system's dark reaches the host alone, so that an element marked light inside it stays light
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :host {\n    color-scheme: dark;')
    expect(css).toContain('\n[data-axt-theme="dark"] {\n  color-scheme: dark;')
    // arXiv's own sheet styles any [data-theme=dark], and a restore of the page strips every data-axt-* of the
    // document's elements, a host's among them: the sheet answers its own mark, and never one on the host
    expect(css).not.toContain('[data-theme')
    expect(css).not.toContain(':host([')
    const defined = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]!)
    expect(defined.length).toBeGreaterThan(40)
    expect(defined.filter(n => !n.startsWith('--axt-'))).toEqual([])
    expect(css).not.toMatch(/var\(--(?!axt-)/)
  })
})
