// The translating indicator's look (engine/view/engine.css, docs/PDF-READER.md §11.8): the owner's Glint, a light of the
// paper's own colour over no ground. Held here: the light is the page's paper in both looks and laid with no blend (the
// overlay is a stacking context, so a mark's own blend would mix with nothing but its empty ground: measured 2026-11-01);
// a look with no ground still shows a mark where the light cannot pass (reduced motion, or a browser that cannot animate it);
// and the code's fallback padding is the sheet's
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAD_X, PAD_Y } from '@/pdf-reader/engine/view/layer-side.mjs'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** the declarations of every rule whose selector list is exactly `selector` */
const rulesOf = (sheet: string, selector: string) => [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1]?.trim() === selector).map(m => m[2] ?? '').join(';')
const value = (body: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim().replace(/\s+/g, ' ') ?? null
/** a custom property's value as the stylesheet sets it, on `:root` alone or with the reader's dimmed look over it */
const look = (sheet: string, name: string, dim: boolean) => (dim ? value(rulesOf(sheet, 'html[data-axt-dim]'), name) : null) ?? value(rulesOf(sheet, ':root'), name)
const reducedMotion = (sheet: string) => /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(sheet)?.[1] ?? ''

describe('the translating look: Glint (the owner, 2026-11-01)', () => {
  const engine = read('src/pdf-reader/engine/view/engine.css'), reader = read('src/entrypoints/pdf-reader/reader.css')

  it('a light of the paper\'s colour over no ground, laid with no blend', () => {
    for (const dim of [false, true]) {
      expect(look(engine, '--axt-tr-ground', dim)).toBe('transparent')
      expect(look(engine, '--axt-tr-light', dim)).toMatch(/^color-mix\(in oklab, var\(--axt-sk-paper\) \d+%, transparent\)$/)
      expect(look(engine, '--axt-tr-blend', dim)).toBe('normal')
    }
    // (why a blend would not do: the overlay is a stacking context, so a mark's blend mixes only within it)
    expect(rulesOf(engine, '.axt-translating')).toMatch(/z-index:\s*1/)
  })

  it('the paper the light is made of is the page\'s: white, and the dimmed page\'s colour in the dark', () => {
    expect(look(engine, '--axt-sk-paper', false)).toBe('#fff')
    const dimmed = value(rulesOf(reader, 'html[data-axt-dim] .pdfViewer .page'), 'background-color')?.replace(/\s*!important$/, '')
    expect(dimmed).toBeTruthy()
    expect(look(engine, '--axt-sk-paper', true)).toBe(dimmed)
  })

  it('a still mark that shows where the light cannot pass: never the empty ground', () => {
    for (const dim of [false, true]) {
      const still = look(engine, '--axt-tr-still', dim)
      expect(still).toMatch(/^color-mix\(in oklab, var\(--axt-sk-paper\) [1-9]\d*%, transparent\)$/)
    }
    expect(value(rulesOf(engine, '.axt-translating-still .axt-translating-mark'), 'background')).toBe('var(--axt-tr-still, var(--axt-tr-ground))')
    const rm = reducedMotion(engine)
    expect(rm).toMatch(/\.axt-translating\s*\{\s*animation:\s*none;?\s*\}/)
    expect(value(rulesOf(rm, '.axt-translating .axt-translating-mark'), 'background')).toBe('var(--axt-tr-still, var(--axt-tr-ground))')
  })

  it('the card\'s padding the code falls back on is the sheet\'s', () => {
    expect(Number(look(engine, '--axt-tr-pad-x', false))).toBe(PAD_X)
    expect(Number(look(engine, '--axt-tr-pad-y', false))).toBe(PAD_Y)
  })
})
