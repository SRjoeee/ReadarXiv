// WCAG contrast from oklch() colours, as the browser paints them: oklch → OKLab → linear sRGB (Ottosson's matrices),
// clamped and encoded to sRGB, an alpha composited in sRGB over what lies below, then WCAG 2's relative luminance.
// The same arithmetic as the prototypes' brand.py, whose numbers the design quotes (§12)

/** r, g, b in encoded sRGB 0–1, and alpha */
export type Rgba = [number, number, number, number]

export function parseOklch(css: string): Rgba {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(css.trim())
  if (!m) throw new Error(`not an oklch() colour: ${css}`)
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const alpha = m[4] === undefined ? 1 : Number(m[4])
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ]
  const encode = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return [encode(linear[0]!), encode(linear[1]!), encode(linear[2]!), alpha]
}

/** `top` painted over `below`, which is opaque */
export const over = (top: Rgba, below: Rgba): Rgba =>
  [0, 1, 2].map(i => top[i]! * top[3] + below[i]! * (1 - top[3])).concat(1) as Rgba

const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
