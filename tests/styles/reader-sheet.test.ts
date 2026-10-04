// The PDF reader's own style sheet (src/entrypoints/pdf-reader/reader.css), held to a rule the interface review of
// 2026-09-26 brought in: a hover's look only where a pointer can hover — on a touch screen :hover latches after a tap
// and reads as a state stuck on (better-accessibility, hit areas)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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

  it('sets the capsule\'s words on a whole 17 px line, so that they sit on its middle (the maintainer, 2026-10-04)', () => {
    expect(all.find(r => r.selector === '.capsule .words')?.body).toMatch(/line-height: 17px;/)
  })

  it('closes the bar\'s zones up in a narrow window: 8 px below 400 px, 6 px below 360 px with the trail\'s dividers gone (the maintainer, 2026-10-04)', () => {
    const at = (query: string, selector: string) => all.find(r => r.selector === selector && r.within.includes(query))?.body.trim()
    expect(at('@media (width < 400px)', 'header.bar')).toBe('gap: 8px;')
    expect(at('@media (width < 360px)', 'header.bar')).toBe('gap: 6px;')
    expect(at('@media (width < 360px)', '[data-zone="trail"] > .divider')).toBe('display: none;')
    // one specificity, so the cascade is the source's order: the base gap, then 400 px, then 360 px, which must win below it
    const order = (query?: string) => all.findIndex(r => r.selector === 'header.bar' && (query ? r.within.includes(query) : r.within.length === 0))
    const [base, below400, below360] = [order(), order('@media (width < 400px)'), order('@media (width < 360px)')]
    expect(base).toBeGreaterThanOrEqual(0)
    expect(base).toBeLessThan(below400)
    expect(below400).toBeLessThan(below360)
  })

  it('rings the capsule that is a stop of its own as the chrome\'s controls are rung (Codex and Devin on #307)', () => {
    const ring = (selector: string) => all.find(r => r.selector.split(',').map(x => x.trim()).includes(selector))?.body.match(/outline:[^;]+/)?.[0]
    expect(ring('.capsule:focus-visible')).toBe(ring('.chrome :focus-visible'))
  })

  it('shows the pointer over a switch\'s row, which a press on its words turns as a press on the switch does (#299 review; the popup\'s .toggle)', () => {
    const row = all.find(r => r.selector.split(',').map(x => x.trim()).includes('.pop label.row'))
    expect(row?.body).toMatch(/cursor:\s*pointer/)
  })

  it('gives a contents fold a 24 × 24 target, grown away from its link, its 18 px drawing unchanged (#299, Part 6\'s interface review; WCAG 2.5.8)', () => {
    const px = (v: string) => Number.parseFloat(v)
    const fold = all.find(r => r.selector === '.fold')?.body ?? ''
    const size = ['width', 'height'].map(p => px(new RegExp(`(?:^|;)\\s*${p}:\\s*([\\d.]+)px`).exec(fold)?.[1] ?? 'NaN'))
    expect(size).toEqual([18, 18])
    expect(fold).toMatch(/position:\s*relative/)
    const grown = all.find(r => r.selector === '.fold::before')?.body ?? ''
    // inset: top right bottom left, as the shorthand reads
    const [top = 0, right = 0, bottom = 0, left = 0] = (/inset:\s*([^;]+)/.exec(grown)?.[1] ?? '').trim().split(/\s+/).map(v => 0 - px(v))
    expect(grown).toMatch(/content:\s*""/)
    expect([size[0]! + left + right, size[1]! + top + bottom]).toEqual([24, 24])
    // nothing toward the link that follows it: the row's 2 px gap stays a gap
    expect(right).toBe(0)
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
})
