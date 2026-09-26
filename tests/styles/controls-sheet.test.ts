// The shared controls' sheet (src/styles/controls.css): what Part 3 adds, its values as the prototypes and the design
// agreed them (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces) — a change to one is a change to the design,
// made there first
import { describe, expect, it } from 'vitest'
import { ruleOf, rules, sheet } from './css-rules'

const all = rules(sheet('../../src/styles/controls.css'))
const C = ['@layer components']
const RM = ['@media (prefers-reduced-motion: reduce)']
const of = (selector: string, within = C) => ruleOf(all, selector, within)

describe('controls.css: the motions both pages share', () => {
  it('holds the reader\'s words-in, moved here unchanged: 3 px up and in, a fade alone under reduced motion (ruling 3)', () => {
    expect(of('from', ['@keyframes words-in'])).toEqual({ opacity: '0', translate: '0 3px' })
    expect(of('from', [...RM, '@keyframes words-in'])).toEqual({ opacity: '0' })
  })

  it('leaves the reader\'s sheet without a copy of its own, its capsule still naming it', () => {
    const reader = sheet('../../src/entrypoints/pdf-reader/reader.css')
    expect(reader).not.toContain('@keyframes words-in')
    expect(reader).toMatch(/\.capsule \.words \{[^}]*animation: words-in 180ms ease-out/)
  })
})
