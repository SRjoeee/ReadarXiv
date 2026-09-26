// The extension pages' own sheet: the system's dark answers only where light was not chosen, or a reader who chose
// light on a dark system gets a dark popup (the redesign's design, §3; the Review Focus's first line)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
