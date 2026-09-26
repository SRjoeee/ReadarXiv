// The shared controls' sheet (src/styles/controls.css): what Part 3 adds, its values as the prototypes and the design
// agreed them (the redesign's design, §2.1, §5, §6, §8; Part 3's interfaces) — a change to one is a change to the design,
// made there first
import { describe, expect, it } from 'vitest'
import { ruleOf, rules, sheet } from './css-rules'

const all = rules(sheet('../../src/styles/controls.css'))
const C = ['@layer components']
const RM = ['@media (prefers-reduced-motion: reduce)']
const HOVER = [...C, '@media (hover: hover)']
const FC = ['@media (forced-colors: active)']
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

describe('controls.css: buttons and the shortcut label', () => {
  it('draws three sizes — lg 36 / 9 filling its width, md 32 / 8 and 16 in, sm 28 / 7 and 12 in — in 13 px / 500', () => {
    expect(of('.btn')).toMatchObject({ display: 'inline-flex', gap: '8px', padding: '0', font: '500 13px/1 var(--font)', 'white-space': 'nowrap' })
    expect(of('.btn.lg')).toEqual({ height: '36px', 'border-radius': '9px' })
    expect(of('.btn.md')).toEqual({ height: '32px', padding: '0 16px', 'border-radius': '8px' })
    expect(of('.btn.sm')).toEqual({ height: '28px', padding: '0 12px', 'border-radius': '7px', 'font-size': '12.5px' })
    expect(of('.btn > svg + span')).toEqual({ 'margin-inline-start': '-1px' })
  })

  it('grounds each kind in its role: the brand, the neutral grey (the fill when large), none for text, raised on a group', () => {
    expect(of('.btn.brand')).toEqual({ background: 'var(--brand)', color: 'var(--on-brand)' })
    expect(of('.btn.neutral')).toEqual({ background: 'var(--button)', color: 'var(--ink)' })
    expect(of('.btn.neutral.lg')).toEqual({ background: 'var(--fill)' })
    expect(of('.btn.text')).toEqual({ 'padding-inline': '10px', 'border-radius': '7px', color: 'var(--ink-2)', 'font-weight': '400' })
    expect(of('.btn.raised')).toEqual({ height: '26px', padding: '0 10px', 'border-radius': '7px', 'font-size': '12.5px', background: 'var(--button-raised)', color: 'var(--ink)', 'box-shadow': 'var(--raised-shadow)' })
    expect(of('.btn[aria-disabled="true"]')).toEqual({ background: 'var(--button)', color: 'var(--ink-3)', 'box-shadow': 'none' })
    expect(of('.btn.lg[aria-disabled="true"]')).toEqual({ background: 'var(--fill)' })
    expect(of('.btn.text[aria-disabled="true"]')).toEqual({ background: 'none' })
    expect(of('.btn[aria-busy="true"]')).toEqual({ cursor: 'progress' })
  })

  it('lights a text button on a hover only where a pointer hovers', () => {
    expect(of('.btn.text:not([aria-disabled="true"]):hover', HOVER)).toEqual({ background: 'var(--fill)', color: 'var(--ink)' })
  })

  it('presses an enabled button to 0.96 in 150 ms — not a disabled or a busy one, nor under reduced motion', () => {
    expect(of('.btn:not([aria-disabled="true"]):not([aria-busy="true"]):active')).toEqual({ scale: '0.96' })
    expect(of('.btn').transition).toBe('scale 150ms ease-out, background-color 150ms ease-out, color 150ms ease-out')
    expect(of('.btn:active', RM)).toEqual({ scale: 'none' })
  })

  it('labels a shortcut 11 px / 500, 3 by 5 in, radius 5, the ink\'s 9 % behind ink-2; on the brand its chip behind white', () => {
    expect(of('.kbd')).toEqual({ padding: '3px 5px', 'border-radius': '5px', background: 'color-mix(in oklab, var(--ink) 9%, transparent)', color: 'var(--ink-2)', font: '500 11px/1 var(--font)' })
    expect(of('.btn.brand .kbd')).toEqual({ background: 'var(--brand-chip)', color: 'var(--on-brand)' })
  })

  it('turns a busy button\'s loader in 900 ms, and holds it still under reduced motion', () => {
    expect(of('.spin')).toEqual({ animation: 'turn 900ms linear infinite' })
    expect(of('to', ['@keyframes turn'])).toEqual({ rotate: '1turn' })
    expect(of('.spin', RM)).toEqual({ animation: 'none' })
  })

  it('keeps a grounded button\'s edge in forced colours, where its ground is dropped, and greys a disabled one (Review Focus)', () => {
    expect(of('.btn:not(.text):not(:focus-visible)', FC)).toEqual({ outline: '1px solid ButtonText', 'outline-offset': '-1px' })
    expect(of('.btn[aria-disabled="true"]', FC)).toEqual({ color: 'GrayText' })
  })
})
