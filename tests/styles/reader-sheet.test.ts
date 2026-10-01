// The PDF reader's own style sheet (src/entrypoints/pdf-reader/reader.css), held to a rule the interface review of
// 2026-09-26 brought in: a hover's look only where a pointer can hover — on a touch screen :hover latches after a tap
// and reads as a state stuck on (better-accessibility, hit areas)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolve } from '@/shared/tokens'
import { contrast, over, parseOklch } from '../shared/wcag'
import { type Rule, rules, sheet } from './css-rules'

/** the reader's sheet and the shared sheets it imports: the tokens (the redesign's design, §2.2) and the controls. A sheet renamed or gone fails here */
const SHEET = ['../../src/entrypoints/pdf-reader/reader.css', '../../src/styles/tokens.css', '../../src/styles/controls.css']
  .map(p => join(import.meta.dirname, p))
  .map(p => readFileSync(p, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const all = rules(SHEET)

describe('the reader\'s style sheet (the interface review, 2026-09-26)', () => {
  it('reads its rules: the toolbar button\'s among them', () => {
    expect(all.some(r => r.selector.startsWith('.tbtn'))).toBe(true)
  })

  it('draws a hover only where a pointer hovers: every :hover rule inside @media (hover: hover)', () => {
    const loose = all.filter(r => r.selector.includes(':hover') && !r.within.some(a => /^@media\s*\(hover:\s*hover\)/.test(a)))
    expect(loose.map(r => r.selector)).toEqual([])
  })

  it('rings the focus in the ink, in every theme: the reader\'s chrome has no hue but danger (the maintainer, 2026-09-26)', () => {
    const focus = [...SHEET.matchAll(/--focus:\s*([^;]+);/g)].map(m => m[1]!.trim())
    expect(focus.length).toBeGreaterThan(0)
    expect([...new Set(focus)]).toEqual(['var(--n-10)'])
  })

  it('marks a chosen swatch with the strong line, a step lighter than the focus\'s ink, so that the two read apart', () => {
    expect(all.some(r => r.body.includes('--line-strong:'))).toBe(true)
    const chosen = all.find(r => r.selector.startsWith('.swatch[aria-pressed="true"]'))
    expect(chosen?.body).toMatch(/outline:[^;]*var\(--line-strong\)/)
  })

  it('caps no menu\'s list: the reader\'s nine languages show whole under their search, the pages\' cap (ui.css) out of its sheet (the maintainer, 2026-09-30)', () => {
    const reader = readFileSync(join(import.meta.dirname, '../../src/entrypoints/pdf-reader/reader.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(reader).not.toMatch(/@import[^;]*ui\.css/)
    expect(all.filter(r => /\[role="(listbox|menu)"\]/.test(r.selector) && /max-height/.test(r.body)).map(r => r.selector)).toEqual([])
  })

  it('leaves a text field\'s ring, and the active option\'s beside it, to the keyboard: a click shows the caret', () => {
    const pointerOff = all.filter(r => r.selector.includes('[data-axt-pointer]') && /outline:\s*none/.test(r.body))
    expect(pointerOff.some(r => r.selector.includes('input:focus-visible'))).toBe(true)
    const itemRing = all.filter(r => r.selector.includes('.search:focus-visible') && r.selector.includes('.item[data-active]'))
    expect(itemRing.length).toBeGreaterThan(0)
    expect(itemRing.every(r => r.selector.includes(':not([data-axt-pointer])'))).toBe(true)
  })

  it('presses nothing in by a scale under reduced motion: each press that scales has its rule there, as the toolbar\'s and the card\'s (#299, Part 6; §4.2: a motion is a fade or nothing)', () => {
    const own = rules(sheet('../../src/entrypoints/pdf-reader/reader.css'))
    const reduced = (r: Rule) => r.within.some(a => /prefers-reduced-motion:\s*reduce/.test(a))
    const still = (r: Rule) => ['1', 'none'].includes(/(?:^|;)\s*scale:\s*([^;]+)/.exec(r.body)?.[1]?.trim() ?? '')
    const pressed = own.filter(r => !reduced(r) && r.selector.includes(':active') && /(?:^|;)\s*scale:/.test(r.body) && !still(r))
    expect(pressed.length).toBeGreaterThan(0)
    const held = own.filter(r => reduced(r) && still(r)).flatMap(r => r.selector.split(',').map(x => x.trim()))
    expect(pressed.map(r => r.selector).filter(selector => !held.includes(selector))).toEqual([])
  })

  it('draws the progress line at 3:1 on the chrome in both themes: it is all a sighted reader is shown of a load or a run (#299, Part 6\'s interface review; WCAG 1.4.11)', () => {
    const line = all.find(r => r.selector === '.progress-line')
    const fill = /background:\s*([^;]+)/.exec(line?.body ?? '')?.[1]?.trim() ?? ''
    // a role, or a role mixed with transparent (`name@share`, as the redesign's pairs read it)
    const role = /^var\(--([\w-]+)\)$/.exec(fill)?.[1] ?? /^color-mix\(in oklab, var\(--([\w-]+)\) (\d+)%, transparent\)$/.exec(fill)?.slice(1).join('@')
    expect(role, fill).toBeDefined()
    const [name = '', share] = role!.split('@')
    for (const mode of ['light', 'dark'] as const) {
      const chrome = parseOklch(resolve('chrome', mode))
      const [r, g, b, a] = parseOklch(resolve(name, mode))
      const drawn = over([r, g, b, share ? (a * Number(share)) / 100 : a], chrome)
      expect(contrast(drawn, chrome), `${fill}, ${mode}`).toBeGreaterThanOrEqual(3)
    }
  })
})
