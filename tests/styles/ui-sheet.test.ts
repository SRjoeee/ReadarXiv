// The extension pages' own sheet (the redesign's design, §2.2): the tokens and the shared controls imported, the
// roles named for Tailwind, and the pages' base
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ruleOf, rules, sheet } from './css-rules'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/styles/ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('ui.css', () => {
  it('imports the generated tokens, so that the controls the pages share find them', () => {
    expect(SHEET).toContain('@import "./tokens.css";')
  })

  it('holds no token of the old pages: every colour a role of the generated sheet', () => {
    expect(SHEET).not.toMatch(/--axt-|--color-(bg|card|fg|fg-2|control|accent|accent-soft):|--radius-(card|control)|--font-ui/)
  })
})

// The language list, one for the popup and the settings page (the maintainer, 2026-09-30): under its search field, five
// rows and a half in a box of its own, so that the field stays in view as the list scrolls to its active row
describe('ui.css: a list under a search field', () => {
  const all = rules(SHEET)

  it('is five rows and a half, scrolling in its own box, keyed on MenuList\'s markup and not on one page\'s class', () => {
    expect(ruleOf(all, '.pop .search ~ [role="listbox"]', ['@layer components'])).toEqual({ 'max-height': '165px', overflow: 'auto', 'scrollbar-width': 'none' })
  })

  it('is the only cap on a menu\'s list among the pages\' sheets: the popup\'s is gone, the settings page adds none', () => {
    const pages = rules(sheet('../../src/entrypoints/popup/popup.css', '../../src/entrypoints/options/ui/settings.css', '../../src/styles/controls.css'))
    expect(pages.filter(r => /\[role="(listbox|menu)"\]/.test(r.selector) && /max-height/.test(r.body)).map(r => r.selector)).toEqual([])
  })
})

// The pages' base (Part 3's interfaces): what a root marked `ui` gives the controls inside it, and nothing to a page
// without one
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

  it('names every role for the pages\' own layouts, the hairline as the reader names it', () => {
    const colours = ['canvas', 'chrome', 'line-strong', 'ink', 'ink-2', 'ink-3', 'fill', 'well', 'lift', 'focus', 'danger', 'success', 'mark', 'page', 'group', 'group-hover', 'field', 'field-edge', 'button', 'button-danger', 'button-raised', 'brand', 'on-brand', 'on-brand-2', 'brand-chip']
    for (const role of colours) expect(SHEET).toContain(`--color-${role}: var(--${role});`)
    expect(SHEET).toContain('--color-float: var(--float-bg);')
    for (const shadow of ['page', 'float', 'pop', 'card', 'raised']) expect(SHEET).toContain(`--shadow-${shadow}: var(--${shadow}-shadow);`)
    expect(SHEET).toContain('--color-line: var(--chrome-line);')
  })
})
