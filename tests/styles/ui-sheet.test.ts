// The extension pages' own sheet: the system's dark answers only where light was not chosen, or a reader who chose
// light on a dark system gets a dark popup (the redesign's design, §3; the Review Focus's first line)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ruleOf, rules } from './css-rules'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/styles/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('ui.css', () => {
  it('scopes the system\'s dark to a root where light was not chosen', () => {
    const media = SHEET.slice(SHEET.indexOf('@media (prefers-color-scheme: dark)'))
    expect(media).toMatch(/^@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/)
  })

  it('imports the generated tokens, so that the controls the pages share find them', () => {
    expect(SHEET).toContain('@import "./tokens.css";')
  })

  it('places the top-level dark block after the light one, since the two tie on specificity and only source order decides which wins for an explicit dark on an otherwise-light page', () => {
    const light = SHEET.indexOf(':root,\n[data-theme="light"]')
    const dark = SHEET.indexOf('[data-theme="dark"]')
    expect(light).toBeGreaterThan(-1)
    expect(dark).toBeGreaterThan(light)
  })
})

// The pages' base (Part 3's interfaces): what a root marked `ui` gives the controls inside it, and nothing to a page
// without one — the old popup and settings page have none (tests/e2e/probes/pages-pixels.mjs holds their pixels)
describe('ui.css: the pages\' base', () => {
  const all = rules(SHEET)
  const BASE = ['@layer base']

  it('reaches only what sits in a root marked ui, and paints no ground: each page paints its own', () => {
    expect(all.filter(r => r.within.join(' | ') === '@layer base').map(r => r.selector)).toEqual([
      '.ui',
      '.ui button',
      '.ui [aria-disabled="true"]',
      '.ui :focus-visible',
      '.ui :is(input, textarea):focus-visible',
      'html[data-axt-pointer] .ui :is(input, textarea):focus-visible',
    ])
    expect(Object.keys(ruleOf(all, '.ui', BASE)).some(p => p.startsWith('background'))).toBe(false)
  })

  it('draws the extension\'s font and ink, and rings the keyboard\'s focus in 2 px of the focus ink, 2 px off', () => {
    expect(ruleOf(all, '.ui', BASE)).toEqual({ color: 'var(--ink)', font: '13px/1.4 var(--font)', '-webkit-font-smoothing': 'antialiased' })
    expect(ruleOf(all, '.ui :focus-visible', BASE)).toEqual({ outline: '2px solid var(--focus)', 'outline-offset': '2px' })
  })

  it('rings a text field hugging it, and not under the pointer, whose caret and edge say where the focus is', () => {
    expect(ruleOf(all, '.ui :is(input, textarea):focus-visible', BASE)).toEqual({ 'outline-offset': '0' })
    expect(ruleOf(all, 'html[data-axt-pointer] .ui :is(input, textarea):focus-visible', BASE)).toEqual({ outline: 'none' })
  })

  it('names every role for the pages\' own layouts, and keeps the old pages\' names as they are', () => {
    const colours = ['canvas', 'chrome', 'chrome-line', 'line-strong', 'ink', 'ink-2', 'ink-3', 'fill', 'well', 'lift', 'focus', 'danger', 'success', 'mark', 'page', 'group', 'group-hover', 'field', 'field-edge', 'button', 'button-danger', 'button-raised', 'brand', 'on-brand', 'on-brand-2', 'brand-chip']
    for (const role of colours) expect(SHEET).toContain(`--color-${role}: var(--${role});`)
    expect(SHEET).toContain('--color-float: var(--float-bg);')
    for (const shadow of ['page', 'float', 'pop', 'card', 'raised']) expect(SHEET).toContain(`--shadow-${shadow}: var(--${shadow}-shadow);`)
    expect(SHEET).toContain('--color-line: var(--axt-line);')
  })
})
