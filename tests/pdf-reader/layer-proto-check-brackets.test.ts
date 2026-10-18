import { describe, expect, it } from 'vitest'
import { checkAll } from '@/pdf-reader/engine/layer-proto/check.mjs'

// The prototype's completeness checker (layer-proto/check.mjs checkAll), its doubled brackets: a rendering in brackets of its
// own, drawn inside the translation's of the kind ("\uff08(1)\uff09"). Its own are a pair round the whole rendering, its first
// character opening and its last closing it; a rendering that ends with a bracket closing a pair inside it ("eq. (1)", the
// cleveref reference 2609.26457's unit 17 draws in the translation's "\uff08\u2026\uff09") stands in none. A unit of one line
// laid of the tokens given, its placeholder drawn as its page text; no page drawn (the pixels' checks read none)

type Tok = { s?: string; space?: boolean; k?: number; ph?: string }
const t = (s: string, k?: number): Tok => (k === undefined ? { s } : { s, k, ph: 'orig-text' })
const sp: Tok = { space: true }
/** the placeholders' (k) brackets the checker finds doubled in a unit drawn as `tokens`, its placeholder 3 drawn as `text` */
function brackets(tokens: Tok[], text: string) {
  const prep = Object.assign(new Map([[3, { k: 3, mode: 'orig-text', cls: 'other', src: '\\cref{eq:a}', text, gap: { chars: [] } }]]), { uc: [], keep: [], gaps: [] })
  const placed = [{ id: 17, prep, tokens, unit: { kind: 'para', src: '', pieces: [] }, layout: { lines: [{ page: 1, items: tokens.map(x => ({ t: x })) }], clipped: false }, pages: [1] }]
  const r = checkAll({ N: 1, placed: placed as never, rows: [], pxOf: () => () => [0, 0], toPdf: () => [0, 0], chars2: [[]], audit: [], cols: () => [], cellRects: () => [] })
  return r.b.list.brackets.map(b => b.k)
}

describe('doubled brackets: a rendering in a pair of its own inside the translation\'s', () => {
  it('"(1)" in the translation\'s round brackets is doubled; in square ones, or with none, it is not', () => {
    expect(brackets([t('\u89c1\uff08'), t('(1)', 3), t('\uff09\u3002')], '(1)')).toEqual([3])
    expect(brackets([t('\u89c1('), t('(1)', 3), t(')\u3002')], '(1)')).toEqual([3])
    expect(brackets([t('\u89c1\uff3b'), t('(1)', 3), t('\uff3d\u3002')], '(1)')).toEqual([])
    expect(brackets([t('\u89c1'), t('(1)', 3), t('\u3002')], '(1)')).toEqual([])
  })

  it('"eq. (1)" in the translation\'s round brackets is not: its last bracket closes its number\'s, no pair round it', () => {
    expect(brackets([t('\u5019\u9009\uff08'), t('eq.', 3), sp, t('(1)', 3), t('\uff09\u3002')], 'eq. (1)')).toEqual([])
    // (nor a range of two numbers in brackets, its first bracket closed at its first number)
    expect(brackets([t('\u89c1\uff08'), t('(1)\u2013(3)', 3), t('\uff09\u3002')], '(1)\u2013(3)')).toEqual([])
    // (and a pair round it all, nested inside: one of its own)
    expect(brackets([t('\u89c1\uff08'), t('((1))', 3), t('\uff09\u3002')], '((1))')).toEqual([3])
  })
})
