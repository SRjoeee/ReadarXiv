// The fill colour TeX set a run in, from the colour its driver paints with (LaTeX's \current@color, which the marked original
// writes at each colour piece: marks.mjs AXT-COLOUR), as the reader draws it: 0xRRGGBB, the way PDF.js turns the PDF's fill to
// RGB. Imports nothing.
//
// The CMYK conversion (cmykToRgb) is ported from pdfjs-dist 6.3.289 (Mozilla, Apache-2.0), src/core/colorspace.js, DeviceCmykCS
// #toRgb, 2026-10-19, modified: one colour at a time into a clamped array, no buffer. PDF.js uses it where it has no ICC profile
// for DeviceCMYK (the reader's left page may convert by its CMYK profile instead, a few levels apart).

/** the PDF fill operators a driver writes (pdftex.def, luatex.def, xetex.def through xdvipdfmx): r g b rg, g g, c m y k k */
const PDF_FILL = /(?:^|\s)((?:-?[\d.]+\s+){0,3}-?[\d.]+)\s+(rg|g|k)(?:\s|$)/
/** the colour specials' own forms (dvips.def, xetex.def): rgb r g b, gray g, cmyk c m y k */
const SPECIAL = /^\s*(rgb|gray|cmyk)\s+((?:-?[\d.]+\s*){1,4})$/
const ARITY = { rg: 3, g: 1, k: 4, rgb: 3, gray: 1, cmyk: 4 }

/** each component 0 to 255 as PDF.js stores it (a Uint8ClampedArray: rounded to nearest, ties to even, clamped) */
const clamped = v => { const a = new Uint8ClampedArray(3); a[0] = v[0]; a[1] = v[1]; a[2] = v[2]; return (a[0] << 16) | (a[1] << 8) | a[2] }

/** a CMYK colour (each 0 to 1) as PDF.js's DeviceCMYK turns it to RGB, 0xRRGGBB */
export function cmykToRgb(c, m, y, k) {
  return clamped([
    255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k + -285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y + -17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747),
    255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k + -79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578),
    255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k + -14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k + -193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367),
  ])
}

/**
 * The fill of a driver's colour string, 0xRRGGBB, or null where it is of no form known or its numbers are not 0 to 1: the
 * first PDF fill operator in it (`0 0 1 rg 0 0 1 RG`, `0.5 g 0.5 G`, `0 1 1 0 k 0 1 1 0 K`), or a special's colour (`rgb
 * 0 0 1`, `gray 0.5`, `cmyk 0 1 1 0`). RGB and gray as PDF.js stores them (each component x 255, clamped), CMYK by
 * cmykToRgb. A named colour of dvips's (`Red`) is no colour here: what it paints is dvips's own table's
 */
export function fillOfColour(s) {
  if (typeof s !== 'string' || s.length > 200) return null
  const p = PDF_FILL.exec(s), q = p ? null : SPECIAL.exec(s)
  const op = p ? p[2] : q?.[1], nums = (p ? p[1] : q?.[2] ?? '').trim().split(/\s+/).map(Number)
  if (!op || nums.length !== ARITY[op] || !nums.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return null
  if (op === 'rg' || op === 'rgb') return clamped(nums.map(v => v * 255))
  if (op === 'g' || op === 'gray') return clamped([nums[0] * 255, nums[0] * 255, nums[0] * 255])
  return cmykToRgb(...nums)
}
