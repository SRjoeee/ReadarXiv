import { beforeAll, describe, expect, it } from 'vitest'

// A spacing accent joined to its letter (layer2.mjs pageChars2's joinAccents; the M1 survey of 2608.16117: "Munster et al.,¨
// 2013" for Münster in seven citations, every language). TeX's \accent sets the accent and moves back over it to set the
// letter; PDF.js starts a new item at the move back, so the accent ends one item ("…(Picu, 2011; M¨") and its letter begins
// the next ("unster et al.,"); before, the accent had no width there and charsOfUnit2 moved it to its line's end. The items
// here are 2608.16117's own, page 1 (its PDF.js text content), and an accent-after-letter font's; the canvas measures a
// character as half an em

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const ST = { fam: 'serif', bold: false, italic: false, caps: false, design: 'cm', known: true }
const MATH = { ...ST, fam: 'math', italic: true }
/** a PDF.js text item: its string, its left edge, baseline, width and size, its font */
const item = (str: string, x: number, y: number, width: number, size = 11.955, fontName = 'cmr12') => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, fontName, dir: 'ltr', hasEOL: false })
const charsOf = (items: ReturnType<typeof item>[]) => L2.pageChars2({ items } as never, (name: string) => (name === 'cmmi12' ? MATH : ST) as never)
const textOf = (cs: { ch: string }[]) => cs.map(c => c.ch).join('')

describe("a spacing accent TeX's \\accent set apart", () => {
  it("is joined to its letter: 2608.16117's Münster, page 1", () => {
    const cs = charsOf([item('integrity (Picu, 2011; M¨', 79.37, 186.32, 394.23), item('unster et al.,', 467.42, 186.32, 65.5), item('2013). Individual fibers', 79.37, 171.88, 120)])
    expect(textOf(cs)).toBe('integrity (Picu, 2011; Münster et al.,2013). Individual fibers')
    // (the letter keeps its place, its item and its index; no character of the accent's own is left)
    const u = cs.find(c => c.ch === 'ü')!
    expect([u.item, u.k, u.x0]).toEqual([1, 0, 467.42])
    expect(cs.some(c => c.ch === '¨')).toBe(false)
    // (the citation as a unit's line reads it: the accent no longer at the line's end)
    const rects = [[1, 79.37, 184, 533, 196], [1, 79.37, 170, 533, 181]] as never
    const uc = L2.charsOfUnit2(rects, [cs as never], undefined, new Map([[rects[0]!, { baseline: 186.32, size: 10 }], [rects[1]!, { baseline: 171.88, size: 10 }]]))
    expect(uc.map(c => c.ch).join('').trim()).toBe('integrity (Picu, 2011; Münster et al., 2013). Individual fibers')
  })

  it('joins every accent of the survey: grave to double acute, caron and dotless i among them', () => {
    const join = (before: string, accent: string, letter: string) => {
      const a = item(`${before}${accent}`, 100, 500, 6 * (before.length + 1)), end = 100 + 6 * (before.length + 1)
      return textOf(charsOf([a, item(`${letter}ck`, end - 5.5, 500, 18)]))
    }
    expect(join('G', '¨', 'a')).toBe('Gäck')
    expect(join('Jeleni', '´', 'c')).toBe('Jelenićck')
    expect(join('Duri', 'ˇ', 'c')).toBe('Duričck')
    expect(join('Lo', '¨', 'ı')).toBe('Loïck')
    expect(join('Fran', '¸', 'c')).toBe('Françck')
    expect(join('Erd', '˝', 'o')).toBe('Erdőck')
    expect(join('Ang', '˚', 'a')).toBe('Angåck')
    expect(join('Pi', '`', 'e')).toBe('Pièck')
    expect(join('Ma', '˘', 'g')).toBe('Mağck')
    expect(join('S', '˛', 'e')).toBe('Sęck')
  })

  it("is joined whatever the two items' fills tell: one item's told, the other's not, or a link's colour on the accent", () => {
    const items = [item('integrity (Picu, 2011; M\u00a8', 79.37, 186.32, 394.23), item('unster et al.,', 467.42, 186.32, 65.5)]
    const fontOf = () => ST as never
    for (const fills of [[0, -1], [-1, 0], [[0, 0, 23, 0x0000ff], 0x0000ff]]) {
      const cs = L2.pageChars2({ items } as never, fontOf, null, fills)
      expect(textOf(cs)).toBe('integrity (Picu, 2011; M\u00fcnster et al.,')
    }
    // (the letter keeps its own fill)
    const cs = L2.pageChars2({ items } as never, fontOf, null, [-1, 0x0000ff])
    expect((cs.find(c => c.ch === '\u00fc')!.st as { fill?: number }).fill).toBe(0x0000ff)
  })

  it('is joined in an accent-after-letter font: the accent begins its item, over the letter that ended the one before', () => {
    const cs = charsOf([item('Zu', 100, 500, 12), item('¨rich', 108.5, 500, 24)])
    expect(textOf(cs)).toBe('Zürich')
  })

  it('is a letter of its own where a letter combines with a mark written after it in one item', () => {
    expect(textOf(charsOf([item('Zürich', 100, 500, 30)]))).toBe('Zürich')
  })

  it("stays where the page does not show TeX's \\accent: no move back, another font or baseline, an accent alone, no letter, no composition", () => {
    // (a URL's tilde in one item, and one that begins an item set after a space: no move back over it)
    expect(textOf(charsOf([item('x.org/~user', 100, 500, 66)]))).toBe('x.org/~user')
    expect(textOf(charsOf([item('see', 100, 500, 18), item('~user', 122, 500, 30)]))).toBe('see~user')
    // (a formula's hat in the text font over a letter in the math font, the accent its item's last)
    expect(textOf(charsOf([item('where ˆ', 100, 500, 40), item('a', 133, 500, 6, 11.955, 'cmmi12')]))).toBe('where ˆa')
    // (a formula's hat alone in its item, over a letter of its own font: its glyph and box its own)
    expect(textOf(charsOf([item('ˆ', 434.96, 268.89, 5.85), item('d', 434.15, 265.73, 7.47)]))).toBe('ˆd')
    // (raised over a capital: another baseline)
    expect(textOf(charsOf([item('the ¨', 100, 503, 30), item('Ober', 122, 500, 24)]))).toBe('the ¨Ober')
    // (a digit after it, and a pair that composes to no one letter)
    expect(textOf(charsOf([item('x¨', 100, 500, 12), item('2', 106, 500, 6)]))).toBe('x¨2')
    expect(textOf(charsOf([item('x¨', 100, 500, 12), item('q', 106, 500, 6)]))).toBe('x¨q')
    // (the next item is no move back: it starts at this one's end)
    expect(textOf(charsOf([item('M¨', 100, 500, 12), item('unster', 112, 500, 36)]))).toBe('M¨unster')
  })
})
