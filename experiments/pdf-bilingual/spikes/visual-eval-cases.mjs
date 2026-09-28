// experiments/pdf-bilingual/spikes/visual-eval-cases.mjs
// Cases for visual-eval-lib.mjs: suspicious pages and catalog entries. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/visual-eval-cases.mjs
import { catalogEntry, COLUMNS, overfullCount, PAPERS, PARAMS, suspiciousPages } from './visual-eval-lib.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

check('corpus sizes', PAPERS.zh.length === 25 && ['ja', 'ko', 'de', 'ru'].every(l => PAPERS[l].length === 8))
check('parameters per language', PARAMS.zh.em === 1.3 && PARAMS.ja.min === 1.05 && PARAMS.de.em === 1.05 && PARAMS.ru.min === 1)
check('column labels', COLUMNS.map(c => c.label).join('|') === "Original|Today|Fit|Locked|Locked, H's rules|H|Today before 09-28")

const s = suspiciousPages({
  events: { breaks: [{ page: 4 }], gaps: [{ page: 2, pt: 10 }, { page: 3, pt: 40 }, { page: 3, pt: 30 }] },
  leads: new Map([[7, 1.1], [8, 1.25]]),
  min: 1.1,
  lockedMarks: { marks: new Map([['7s', { page: 5, x: 0, y: 0 }], ['8s', { page: 6, x: 0, y: 0 }]]) },
  lockedCompare: { offPage: [{ i: 9, page: 8, origPage: 7 }] },
})
check('small gaps ignored', !s.some(x => x.page === 2))
check('one entry per page and kind', s.filter(x => x.page === 3).length === 1, JSON.stringify(s))
check('kinds found', ['forced break', 'large gap', 'tight leading', 'drift'].every(k => s.some(x => x.kind === k)), JSON.stringify(s))
check('pages 1-based and sorted', JSON.stringify(s.map(x => x.page)) === JSON.stringify([3, 4, 6, 9]), JSON.stringify(s.map(x => x.page)))
check('overfull counted', overfullCount('Overfull \\vbox (3pt too high) has occurred while \\output is active\nOverfull \\hbox (1pt too wide)\nOverfull \\vbox (1pt too high)\n') === 2)

const entry = catalogEntry({ paper: 'p', cls: 'article', columns: [{ key: 'original', pages: 10 }, { key: 'today', pages: 11 }, { key: 'locked', pages: null }], numbers: { today: { units: 0, samePage: 0 } }, failed: { locked: '! Undefined control sequence.' }, flags: [], translation: { untranslated: 3 } })
check('failed column kept, numbers null', entry.pages.locked === null && entry.locked === null && entry.failed.locked.startsWith('!'))
check('untranslated carried', entry.untranslated === 3)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
