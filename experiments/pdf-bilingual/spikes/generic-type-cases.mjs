// Cases for generic-type.mjs: the design table and the solver that finds one set of type per paper from predicted
// lines (plans/2026-09-30-generic-type.md, step 2). Synthetic units, no TeX. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/generic-type-cases.mjs
import { correctUnits, DESIGN, flowLeads, heightRatio, solveType, unitHeights } from './generic-type.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const near = (a, b, eps) => Math.abs(a - b) <= eps
const linesOf = w => Math.max(1, w / 24 + 0.5)

// a unit: its original lines and leading, the ruler's capacity, and its translation's width in em at a CJK type
// (wide characters scaled, tracked between them; the rest fixed) — what density.mjs gives
const unit = (lo, cap, wide, rest = 0, bs = 12) => ({ lo, bs, cap, width: ({ scale = 1, track = 0 } = {}) => wide * scale + Math.max(0, wide - 1) * track + rest })
const zhShort = Array.from({ length: 40 }, (_, i) => ({ ...unit(8, 24, 120, 10), i }))   // Chinese about 0.74 of the original's lines: at its base leading, 1.3, a little short
const deLong = Array.from({ length: 40 }, () => unit(8, 24, 0, 215))    // German about 1.15 of them

check('the design: CJK knobs and alphabet knobs, ranges around the base', DESIGN.Hans.base.lead === 1.3 && DESIGN.Hans.lead[1] === 1.45 && DESIGN.Jpan.base.lead === 1 && DESIGN.Latn.size[0] === 0.9 && DESIGN.Cyrl.lead[0] === 0.95)

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
check('alphabet: a long translation set smaller', de.size < 1 && de.size >= 0.9 - 1e-9, JSON.stringify(de))
check('alphabet: the leading takes what the size left, within its range', de.lead >= 0.95 - 1e-9 && de.lead <= 1.1 + 1e-9)
check('alphabet: the predicted height ratio reaches one', near(heightRatio(deLong, 'Latn', de), 1, 0.02), `${heightRatio(deLong, 'Latn', de)}`)

// how wide a face sets at each size (density.mjs SIZE_PROBE). Computer Modern at 10.95 pt has 10 pt below it and
// nothing between: 0.9–0.95 of the body set as 10 pt does, 0.96 and up as the body does. The height is the size asked
const grid = (lo, hi) => Array.from({ length: Math.round((hi - lo) / 0.01) + 1 }, (_, k) => Number((lo + k * 0.01).toFixed(2)))
const cm11 = [...grid(0.9, 0.95).map(size => ({ size, h: 10 / 10.95 })), ...grid(0.96, 0.99).map(size => ({ size, h: 1 })), { size: 1, h: 1 }]
const deCM = solveType(deLong, 'Latn', cm11)
check('fixed sizes: a long translation set in the size below, as the face sets it', near(deCM.h, 10 / 10.95, 1e-9) && near(heightRatio(deLong, 'Latn', deCM), 1, 0.01), JSON.stringify(deCM))
check('fixed sizes: the leading within its range', deCM.lead >= 0.95 - 1e-9 && deCM.lead <= 1.1 + 1e-9, JSON.stringify(deCM))
// a face with two sizes alone, German 1.08 times the original's lines between them: neither reaches one within the
// leading's range; long pushes floats and page breaks later, so the smaller size, short
const two = [{ size: 0.9, h: 0.9 }, { size: 1, h: 1 }]
const deGap = Array.from({ length: 40 }, () => unit(8, 24, 0, 1.08 * 7.5 * 24))
const gap = solveType(deGap, 'Latn', two)
check('between two sizes that miss: the smaller one, running short rather than long', gap.size === 0.9 && heightRatio(deGap, 'Latn', gap) <= 1 + 1e-9, JSON.stringify(gap))
// how wide a face sets at a size counts: a face that sets wider there (an optical size) takes more lines
check('a face set wider at its size takes more height', heightRatio(deLong, 'Latn', { size: 0.9, h: 0.95, lead: 1 }) > heightRatio(deLong, 'Latn', { size: 0.9, h: 0.9, lead: 1 }))

// a translation already the original's length keeps the base type
const same = Array.from({ length: 40 }, () => unit(8, 24, 0, 7.5 * 24))
const keep = solveType(same, 'Latn')
check('alphabet: a translation as long as the original keeps the paper\'s type', near(keep.size, 1, 0.01) && near(keep.lead, 1, 0.02), JSON.stringify(keep))

// the correction a preview gives (step 4's free measurement): the translation measured 4 % taller than predicted at
// the type it was set in; the units scaled to agree, and the type solved again brings the height ratio back to one
const measured = 1.04
const corrected = correctUnits(zhShort, 'Hans', zh, measured)
check('corrected units predict what was measured at the old type', near(heightRatio(corrected, 'Hans', zh), measured, 0.002), `${heightRatio(corrected, 'Hans', zh)}`)
const again = solveType(corrected, 'Hans')
check('the type solved again on corrected units reaches one', near(heightRatio(corrected, 'Hans', again), 1, 0.01) && again.lead < zh.lead + 1e-9, JSON.stringify(again))
const deCorrected = correctUnits(deLong, 'Latn', de, 0.97)
check('an alphabet corrected the same way', near(heightRatio(deCorrected, 'Latn', de), 0.97, 0.002))
// the leading along the paper (flowLeads): the first half of a German translation runs long, the second short, the
// whole about right. One type for all leaves the first half's end a stretch late; a leading that follows the original
// over a window of its lines sets the first half tighter and the second looser, and keeps each place near its own
const halves = [...Array.from({ length: 20 }, (_, k) => ({ ...unit(8, 24, 0, 200), i: k })), ...Array.from({ length: 20 }, (_, k) => ({ ...unit(8, 24, 0, 170), i: 20 + k }))]
const halfType = solveType(halves, 'Latn')
const heightsAt = unitHeights(halves, 'Latn', halfType)
check('unit heights: each unit\'s predicted lines at the type, times its size and leading one', heightsAt.size === 40 && near(heightsAt.get(0), linesOf(200 * halfType.h) * halfType.size * 12, 1e-9), `${heightsAt.get(0)}`)
const drift = leads => { let d = 0, worst = 0; for (const u of halves) { d += heightsAt.get(u.i) * (leads?.get(u.i) ?? halfType.lead) - u.lo * u.bs; worst = Math.max(worst, Math.abs(d)) } return worst }
const flow = flowLeads(halves, 'Latn', heightsAt, { window: 40 })
check('flow: the stretch that runs long set tighter, the one that runs short looser', flow.get(2) < halfType.lead && flow.get(37) > halfType.lead, `${flow.get(2)} ${halfType.lead} ${flow.get(37)}`)
check('flow: every leading within the design\'s range', [...flow.values()].every(l => l >= 0.95 - 1e-9 && l <= 1.1 + 1e-9))
check('flow: the translation stays nearer the original\'s flow than one type for all', drift(flow) < 0.5 * drift(null), `${drift(flow)} vs ${drift(null)}`)
const span = Math.max(...flow.values()) - Math.min(...flow.values()), step = Math.max(...[...Array(39).keys()].map(k => Math.abs(flow.get(k + 1) - flow.get(k))))
check('flow: a change of density spread over the window, not taken at one unit', step <= 0.4 * span, `${step} of ${span}`)
const whole = flowLeads(halves, 'Latn', heightsAt, { window: Infinity })
check('flow over the whole paper: one leading, the one that brings the whole to the original\'s height', [...whole.values()].every(l => near(l, whole.get(0), 1e-12)) && near(heightRatio(halves, 'Latn', { ...halfType, lead: whole.get(0) }), 1, 0.005), `${whole.get(0)}`)
const cjkFlow = flowLeads(zhShort, 'Hans', unitHeights(zhShort, 'Hans', zh), { window: 40 })
check('flow for CJK: the leading × the paper\'s, within its range', [...cjkFlow.values()].every(l => l >= 1.2 - 1e-9 && l <= 1.45 + 1e-9) && near(cjkFlow.get(zhShort[5].i), zh.lead, 0.01), `${cjkFlow.get(zhShort[5].i)} ${zh.lead}`)
// a leading at its floor: Korean sets no tighter than the paper's own leading, and a paper whose first half runs 10 %
// long and second half 10 % short is balanced at that floor. The first half cannot be set tighter; if the second were
// set looser all the same, the whole would come out 5 % long. What the first half left behind is taken back instead
const floorUnits = Array.from({ length: 40 }, (_, i) => ({ lo: 8, bs: 12, cap: 24, i, width: () => 0 }))
const floorHeights = new Map(floorUnits.map(u => [u.i, (u.i < 20 ? 1.1 : 0.9) * 96]))
const floorLeads = flowLeads(floorUnits, 'Kore', floorHeights, { window: 40 })
const floorTotal = floorUnits.reduce((t, u) => t + floorHeights.get(u.i) * floorLeads.get(u.i), 0) / (40 * 96)
check('flow at a floor: what a stretch could not give back is taken back after it, not given away', floorTotal <= 1.01 && [...floorLeads.values()].every(l => l >= 1 - 1e-9), `${floorTotal}`)
// a window of 0: each unit its original's height where the range allows, the rest taken back after it
const each = flowLeads(halves, 'Latn', heightsAt, { window: 0, horizon: 40 })
check('flow, each unit on its own: the long half tighter, the short half looser, near the original\'s flow', each.get(2) < each.get(37) && drift(each) < 0.5 * drift(null), `${each.get(2)} ${each.get(37)} ${drift(each)} vs ${drift(null)}`)
// a little ahead of the original, never behind: text that runs even a little long pushes what cannot break — a figure
// set here ([H]), the last page before a forced break — to the next column (2608.06233: ten points too many before its
// [H] figure moved it a column on, and every page after it half a column late); a little short costs white space
const wavy = Array.from({ length: 60 }, (_, i) => ({ lo: 8, bs: 12, cap: 24, i, width: () => 0 }))
const wavyHeights = new Map(wavy.map(u => [u.i, 96 * (1 + 0.04 * Math.sin(u.i * 1.7))]))
const aheadLeads = flowLeads(wavy, 'Latn', wavyHeights, { window: 0, horizon: 40, ahead: 2 })
let d = 0
const drifts = wavy.map(u => (d += wavyHeights.get(u.i) * aheadLeads.get(u.i) - u.lo * u.bs))
check('ahead: after the first stretch the translation keeps about two lines ahead of the original, never behind', drifts.slice(20).every(x => x < 0 && near(x, -24, 8)), drifts.slice(20, 26).map(x => x.toFixed(1)).join(' '))
const level = flowLeads(wavy, 'Latn', wavyHeights, { window: 0, horizon: 40 })
d = 0
check('without it, each unit its own original\'s height: no drift', wavy.every(u => Math.abs((d += wavyHeights.get(u.i) * level.get(u.i) - u.lo * u.bs)) < 1e-6))
// what the preview measured (the owner's two compiles: the preview's places are known before the final is set): the
// drift at each unit's start as the preview came out, pages, floats and all. The final starts from it, not from the
// heights alone: a figure that jumped a column in the preview is taken back after it, and after a forced break, where
// the preview stood level again, a lead ahead is built again before the next thing that cannot break
const even = Array.from({ length: 40 }, (_, i) => ({ lo: 8, bs: 12, cap: 24, i, width: () => 0 }))
const evenHeights = new Map(even.map(u => [u.i, 96]))
const jumped = new Map(even.map(u => [u.i, u.i >= 20 ? 60 : 0]))   // the preview: 60 pt late from unit 20 on
const previewHeights = new Map(even.map(u => [u.i, 96]))
const blind = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40 })
const seen = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: jumped, preview: previewHeights } })
check('measured: without the preview\'s places, a jump goes unseen', [...blind.values()].every(l => near(l, 1, 1e-9)))
check('measured: before the jump as before, after it set tighter to take it back', near(seen.get(10), 1, 1e-9) && seen.get(21) < 0.99 && seen.get(21) >= 0.95 - 1e-9, `${seen.get(10)} ${seen.get(21)}`)
let taken = 60
for (const u of even) if (u.i >= 20) taken += 96 * seen.get(u.i) - 96
check('measured: most of the jump taken back by the end', taken < 20, `${taken}`)
// a forced break the preview reset: level at unit 20 though the height before it ran 2 lines ahead; with a lead aimed
// ahead, the units after the break are set tighter again
const reset = new Map(even.map(u => [u.i, u.i < 20 ? -24 : 0]))
const rebuilt = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, ahead: 2, measured: { drift: reset, preview: previewHeights } })
check('measured: after a break that put it level, the lead ahead is built again', rebuilt.get(20) < 1 - 1e-6 && rebuilt.get(21) < 1 - 1e-6, `${rebuilt.get(20)} ${rebuilt.get(21)}`)
// the preview measured noise as well as jumps: a paragraph that did not fit at a page's foot went whole to the next
// page, a column ended a little early (2212.06817: measured 30 pt behind the heights' account at the median, 85 at p90,
// and the final set tighter throughout ran 0.12 page ahead). With `snap`, the measure is taken only where it parts from
// the heights by more than that; less, it is noise, and the heights go on
const noisy = new Map(even.map(u => [u.i, u.i === 0 ? 0 : u.i % 2 ? 30 : -20]))   // level at the first unit, whose measure is always taken
const calm = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: noisy, preview: previewHeights, snap: 60 } })
check('snap: noise under the threshold leaves the heights\' account alone', [...calm.values()].every(l => near(l, 1, 1e-9)), JSON.stringify([...calm.values()].slice(0, 4)))
const snapped = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: jumped, preview: previewHeights, snap: 40 } })
check('snap: a jump over the threshold is taken', snapped.get(21) < 0.99, `${snapped.get(21)}`)
// a lead ahead only where the preview jumped: a jump is a rise in the measured drift the heights do not account for;
// the stretch before it is set a little ahead, so that what jumped fits this time, and everywhere else the text keeps
// level (a lead ahead everywhere cost every unit two lines of drift, and 2608.21180 ran a quarter column ahead)
const local = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, ahead: 2, measured: { drift: jumped, preview: previewHeights, snap: 40, local: 30 } })
check('local lead: level far from the jump', near(local.get(5), 1, 1e-9), `${local.get(5)}`)
check('local lead: the stretch just before the jump set tighter', local.get(18) < 0.99 && local.get(19) < 0.99, `${local.get(18)} ${local.get(19)}`)
let before = 0
for (const u of even) if (u.i < 20) before += 96 * local.get(u.i) - 96
check('local lead: about the lead gained by the jump, as far as the range allows', before <= -15 && before >= -30, `${before}`)
// the first unit's measure is always taken: before it stands only the front matter — a title a line shorter in the
// translation (2608.21180, Korean: 20 pt), no page break's noise — and a page 1 that took the room shrank its glue
// until the paper's own \\vspace{-2.8em} set the abstract on the e-mail line
const frontShort = new Map(even.map(u => [u.i, u.i === 0 ? -20 : null]).filter(([, d]) => d != null))
const front = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: frontShort, preview: previewHeights, snap: 60 } })
check('the first measure is taken under the threshold: the units after it set looser to take back the front matter', front.get(0) > 1 + 1e-6, `${front.get(0)}`)
// one unit read far off and the next back (Korean 2608.06701: a paragraph moved from the foot of the left column to below
// a figure at the head of the right, read 0.42 column late, the next paragraph level): a reading no unit after it
// shares is not a drift, and the median of the next five readings leaves it out
const spike = new Map(even.map(u => [u.i, u.i === 10 ? 225 : 0]))
const steady = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: spike, preview: previewHeights, snap: 40 } })
check('measured: one reading far off, the units around it read level, is left out', [...steady.values()].every(l => near(l, 1, 1e-9)), JSON.stringify([...steady.values()].slice(8, 13)))
check('measured: a jump that lasts is taken a little before it, where the text can still make way', snapped.get(18) < 1 - 1e-6 || snapped.get(19) < 1 - 1e-6, `${snapped.get(18)} ${snapped.get(19)}`)
// the front matter's offset is kept until a reading parts from it by more than the threshold: Korean 2608.21180's title
// left page 1 51 pt ahead, under the threshold; set back to level at the next reading, the room it left was taken again
const frontThenSame = new Map(even.map(u => [u.i, u.i === 0 ? -56 : -51]))
const kept = flowLeads(even, 'Latn', evenHeights, { window: 0, horizon: 40, measured: { drift: frontThenSame, preview: previewHeights, snap: 96 } })
check('measured: an offset under the threshold at the first unit is kept through the readings like it', kept.get(3) > 1 + 1e-6 && kept.get(8) > 1 + 1e-6, `${kept.get(3)} ${kept.get(8)}`)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
