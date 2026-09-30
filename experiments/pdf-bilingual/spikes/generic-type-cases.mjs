// Cases for generic-type.mjs: the design table and the solver that finds one set of type per paper from predicted
// lines (plans/2026-09-30-generic-type.md, step 2). Synthetic units, no TeX. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/generic-type-cases.mjs
import { DESIGN, heightRatio, solveType } from './generic-type.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const near = (a, b, eps) => Math.abs(a - b) <= eps

// a unit: its original lines and leading, the ruler's capacity, and its translation's width in em at a CJK type
// (wide characters scaled, tracked between them; the rest fixed) — what density.mjs gives
const unit = (lo, cap, wide, rest = 0, bs = 12) => ({ lo, bs, cap, width: ({ scale = 1, track = 0 } = {}) => wide * scale + Math.max(0, wide - 1) * track + rest })
const zhShort = Array.from({ length: 40 }, () => unit(8, 24, 120, 10))   // Chinese about 0.74 of the original's lines: at its base leading, 1.3, a little short
const deLong = Array.from({ length: 40 }, () => unit(8, 24, 0, 215))    // German about 1.15 of them

check('the design: CJK knobs and alphabet knobs, ranges around the base', DESIGN.Hans.base.lead === 1.3 && DESIGN.Hans.lead[1] === 1.45 && DESIGN.Jpan.base.lead === 1 && DESIGN.Latn.size[0] === 0.93 && DESIGN.Cyrl.lead[0] === 0.95)

// Chinese that runs short: more room within the ranges, height ratio brought to one
const zh = solveType(zhShort, 'Hans')
check('CJK: a short translation is given room', zh.lead > DESIGN.Hans.base.lead || zh.track > 0, JSON.stringify(zh))
check('CJK: the predicted height ratio reaches one', near(heightRatio(zhShort, 'Hans', zh), 1, 0.01), `${heightRatio(zhShort, 'Hans', zh)}`)
check('CJK: every knob within its range', zh.lead <= 1.45 + 1e-9 && zh.lead >= 1.2 - 1e-9 && zh.track >= 0 && zh.track <= 0.05 + 1e-9 && zh.scale >= 0.92 - 1e-9 && zh.scale <= 1 + 1e-9)

// a translation far too short saturates every knob, and says how far it got
const zhVeryShort = Array.from({ length: 40 }, () => unit(8, 24, 80, 5))
const sat = solveType(zhVeryShort, 'Hans')
check('CJK: out of reach, the knobs at their ends and the ratio left below one', near(sat.lead, 1.45, 1e-6) && near(sat.track, 0.05, 1e-6) && heightRatio(zhVeryShort, 'Hans', sat) < 0.95, JSON.stringify(sat))

// German that runs long: smaller type first, then the leading
const de = solveType(deLong, 'Latn')
check('alphabet: a long translation set smaller', de.size < 1 && de.size >= 0.93 - 1e-9, JSON.stringify(de))
check('alphabet: the leading takes what the size left, within its range', de.lead >= 0.95 - 1e-9 && de.lead <= 1.1 + 1e-9)
check('alphabet: the predicted height ratio reaches one', near(heightRatio(deLong, 'Latn', de), 1, 0.02), `${heightRatio(deLong, 'Latn', de)}`)

// a translation already the original's length keeps the base type
const same = Array.from({ length: 40 }, () => unit(8, 24, 0, 7.5 * 24))
const keep = solveType(same, 'Latn')
check('alphabet: a translation as long as the original keeps the paper\'s type', near(keep.size, 1, 0.01) && near(keep.lead, 1, 0.02), JSON.stringify(keep))

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
