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

describe('controls.css: fields, radios and reveals', () => {
  it('draws a field\'s label and hint 12 px in ink-2, 6 px from it; its reason in ink after a danger icon on the first line', () => {
    expect(of('.field')).toEqual({ display: 'flex', 'flex-direction': 'column', gap: '6px' })
    expect(of('.field > label')).toEqual({ color: 'var(--ink-2)', 'font-size': '12px', 'line-height': '1.4' })
    expect(of('.field-hint')).toEqual({ margin: '0', color: 'var(--ink-2)', 'font-size': '12px', 'line-height': '1.4' })
    expect(of('.field-error')).toEqual({ display: 'flex', 'align-items': 'flex-start', gap: '6px', margin: '0', color: 'var(--ink)', 'font-size': '12px', 'line-height': '1.45' })
    expect(of('.field-error > svg')).toEqual({ flex: 'none', 'margin-block-start': 'calc((1.45em - 14px) / 2)', color: 'var(--danger)' })
  })

  it('draws a text field 34 px, radius 8, on its ground with a 0.5 px edge; 1 px of ink-3 focused, the danger\'s at fault', () => {
    expect(of('.input')).toMatchObject({ height: '34px', padding: '0 10px', 'border-radius': '8px', background: 'var(--field)', 'box-shadow': 'inset 0 0 0 0.5px var(--field-edge)', font: '13px var(--font)' })
    expect(of('.input::placeholder')).toEqual({ color: 'var(--ink-2)' })
    expect(of('.input:focus')).toEqual({ 'box-shadow': 'inset 0 0 0 1px var(--ink-3)' })
    expect(of('.input[aria-invalid="true"]')).toEqual({ 'box-shadow': 'inset 0 0 0 1px var(--danger)' })
  })

  it('draws a radio 16 px, a 1.5 px ring of ink-3, ink when chosen, its dot growing from the centre in 150 ms', () => {
    expect(of('.radio')).toMatchObject({ width: '16px', height: '16px', 'border-radius': '999px', 'box-shadow': 'inset 0 0 0 1.5px var(--ink-3)' })
    expect(of('.radio::after')).toMatchObject({ inset: '4px', background: 'var(--ink)', scale: '0', transition: 'scale 150ms var(--ease)' })
    expect(of('[aria-checked="true"] > .radio')).toEqual({ 'box-shadow': 'inset 0 0 0 1.5px var(--ink)' })
    expect(of('[aria-checked="true"] > .radio::after')).toEqual({ scale: '1' })
  })

  it('reveals in 220 ms on the ease, its opacity 180 ms after 40; closes in 180 and 120; only fades under reduced motion', () => {
    expect(of('.reveal')).toEqual({ display: 'grid', 'grid-template-rows': '0fr', opacity: '0', transition: 'grid-template-rows 180ms ease-out, opacity 120ms ease-out' })
    expect(of('.reveal[data-open]')).toEqual({ 'grid-template-rows': '1fr', opacity: '1', transition: 'grid-template-rows 220ms var(--ease), opacity 180ms ease-out 40ms' })
    expect(of('.reveal > div')).toEqual({ 'min-height': '0', overflow: 'hidden' })
    expect(of('.reveal, .reveal[data-open]', RM)).toEqual({ transition: 'opacity 150ms ease-out' })
    expect(of('.radio::after', RM)).toEqual({ transition: 'none' })
  })

  it('redraws the radio\'s ring and the field\'s edge in the system\'s colours, where box-shadows are dropped (Review Focus)', () => {
    expect(of('.radio', FC)).toEqual({ 'forced-color-adjust': 'none', 'box-shadow': 'inset 0 0 0 1.5px CanvasText' })
    expect(of('[aria-checked="true"] > .radio', FC)).toEqual({ 'box-shadow': 'inset 0 0 0 1.5px Highlight' })
    expect(of('[aria-checked="true"] > .radio::after', FC)).toEqual({ background: 'Highlight' })
    expect(of('.input', FC)).toEqual({ border: '1px solid CanvasText' })
  })
})
