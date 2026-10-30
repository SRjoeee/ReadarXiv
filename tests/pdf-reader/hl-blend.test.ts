// The highlight's wash blends into the page by its layer (engine/view/engine.css, entrypoints/pdf-reader/reader.css): the layer is
// a stacking context (its z-index), an isolated group, so a band's own blend mode would mix with nothing but the layer's empty
// ground and the wash would lie over the letters, greying them (docs/PDF-READER.md §17.3, measured 2026-10-31)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** the declarations of every rule whose selector list is exactly `selector` */
const rulesOf = (sheet: string, selector: string) => [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m => m[1]?.trim() === selector).map(m => m[2] ?? '').join(';')

describe('the highlight wash blends by its layer', () => {
  const engine = read('src/pdf-reader/engine/view/engine.css'), reader = read('src/entrypoints/pdf-reader/reader.css')
  it('multiplied into a white page: the layer blends, its bands do not', () => {
    expect(rulesOf(engine, '.axt-hl-layer')).toMatch(/z-index:\s*3/)
    expect(rulesOf(engine, '.axt-hl-layer')).toMatch(/mix-blend-mode:\s*multiply/)
    expect(engine.match(/\.axt-hl(?![-\w])[^{]*\{[^}]*mix-blend-mode/g)).toBeNull()
  })
  it('screened over a dimmed page, by the layer too', () => {
    expect(rulesOf(reader, 'html[data-axt-dim] .axt-hl-layer')).toMatch(/mix-blend-mode:\s*screen/)
    expect(reader.match(/\.axt-hl(?![-\w])[^{]*\{[^}]*mix-blend-mode/g)).toBeNull()
  })
})
