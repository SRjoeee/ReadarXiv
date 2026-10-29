import { afterAll, beforeAll, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A character's width at 100 px in its item's design (layer2.mjs wDesign, read by pageChars2) is measured in the font its style
// resolves to under the role set in force (fonts.mjs setRoleFaces). The font is kept, by the role set and the style object,
// since resolving it for every character was a long task's most (#478); a role set made afresh (another target, another family:
// its CJK fallback another) is measured in its own font, never in the one an earlier set resolved for the same style object

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type F = typeof import('@/pdf-reader/engine/layer-proto/fonts.mjs')
let L2: L2, F: F
const measured: string[] = []
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class {
    getContext() {
      const ctx = { font: '', measureText: (s: string) => { measured.push(ctx.font); return { width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 } } }
      return ctx
    }
  }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  F = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
})
afterAll(() => F.setRoleFaces(null, 'times', null))

const roles = (to: string, family = 'times') => F.setRoleFaces(to, family, resolveRules(BUILTIN_RULES, to).cjkFaces)

it('a style measured under one role set is measured in the next set\'s font after setRoleFaces, its own character again', () => {
  // one style object, as a page's font reader hands it for every item set in that font
  const st = { fam: 'serif', bold: false, italic: false, caps: false, design: 'cm', known: true }
  const items = (ch: string) => ({ items: [{ str: ch, transform: [10, 0, 0, 10, 0, 0], width: 10, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }] }) as never
  const fontFor = (ch: string) => {
    measured.length = 0
    L2.pageChars2(items(ch), () => st as never)
    return measured.at(-1) ?? null
  }
  roles('zh')
  const zh = fontFor('汉')
  expect(zh).toContain('"axt-shs-sc"')
  roles('ja')
  // (another character, so that the width's own cache does not answer for it: the font it is measured in is the ja set's)
  const ja = fontFor('漢')
  expect(ja).toContain('"axt-mincho"')
  expect(ja).not.toContain('"axt-shs-sc"')
  // the same set again: its font kept
  roles('zh')
  expect(fontFor('字')).toBe(zh)
})
