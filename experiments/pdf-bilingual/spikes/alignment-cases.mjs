// Cases for alignment.mjs: pages, drift, block size and uniformity from unit marks and line probes. Synthetic marks.
// Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/alignment-cases.mjs
import { alignment, uniformity } from './alignment.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps

// two-column pages 792 pt high whose text runs from 700 pt down to 100 pt; a unit from (page, x, y) to (page, x, y)
const marks = (pages, twoColumn, list) => ({ pages, width: 612, height: 792, twoColumn, marks: new Map(list.flatMap(([i, s, e]) => [[`${i}s`, s], [`${i}e`, e]])) })
const p = (page, x, y) => ({ page, x, y })
const orig = marks(2, true, [
  [0, p(0, 60, 700), p(0, 60, 600)], [1, p(0, 60, 580), p(0, 60, 100)], [2, p(0, 320, 700), p(0, 320, 100)],
  [3, p(1, 60, 700), p(1, 60, 650)], [4, p(1, 320, 400), p(1, 320, 100)],
])

const same = alignment(orig, orig)
check('a layout against itself: no page off, no drift, every block its size', same.pages === 0 && same.drift.median === 0 && same.drift.within === 1 && same.size.median === 1 && same.matched === 5 && same.missing === 0)

// the translation: unit 0 60 pt lower (a tenth of the column), unit 1 starting at the right column's top instead of low in
// the left, unit 2 in the left column halfway down, unit 3 a page late, unit 4 missing
const tr = marks(3, true, [
  [0, p(0, 60, 640), p(0, 60, 550)], [1, p(0, 320, 700), p(0, 320, 340)], [2, p(0, 60, 400), p(0, 60, 100)],
  [3, p(2, 60, 700), p(2, 60, 640)],
])
const a = alignment(orig, tr)
check('pages: the translation\'s minus the original\'s', a.pages === 1)
check('a missing unit is counted', a.missing === 1 && a.matched === 4)
check('drift, in columns of the text block: 60 pt of a 600 pt column is a tenth', near(a.drift.values[0], 0.1, 1e-6), JSON.stringify(a.drift.values))
check('drift: the left column\'s foot and the right column\'s top are next to each other in reading order', near(a.drift.values[1], 1 - (700 - 580) / 600, 1e-6), JSON.stringify(a.drift.values))
check('drift: from the right column\'s top to halfway down the left is half a column back', near(a.drift.values[2], 0.5, 1e-6), JSON.stringify(a.drift.values))
check('drift: a page late is two columns', near(a.drift.values[3], 2, 1e-6), JSON.stringify(a.drift.values))
check('block size: height over the original\'s, same column both', near(a.size.values[0], 90 / 100) && near(a.size.values[1], 360 / 480) && near(a.size.values[2], 300 / 600) && near(a.size.values[3], 60 / 50))
check('shares: within a tenth of a column, within 15 % of size', near(a.drift.within, 1 / 4) && near(a.size.within, 1 / 4))

// uniformity: the leading of translated paragraphs as a multiple of their size, its spread
const units = [{ kind: 'para' }, { kind: 'para' }, { kind: 'caption' }, { kind: 'para' }]
const even = new Map([[0, { lines: 5, bs: 13, size: 10 }], [1, { lines: 4, bs: 13, size: 10 }], [2, { lines: 2, bs: 11, size: 9 }], [3, { lines: 6, bs: 13, size: 10 }]])
check('one leading for every paragraph: no spread', uniformity(even, units).spread === 0 && uniformity(even, units).n === 3)
const nudged = new Map([[0, { lines: 5, bs: 12, size: 10 }], [1, { lines: 4, bs: 13, size: 10 }], [3, { lines: 6, bs: 14, size: 10 }]])
check('nudged leading: the spread shows', near(uniformity(nudged, units).spread, (Math.sqrt(2 / 3) * 0.1) / 1.3, 1e-9), `${uniformity(nudged, units).spread}`)

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
