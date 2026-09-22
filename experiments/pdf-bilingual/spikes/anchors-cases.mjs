// The heading cases anchors.mjs keeps, on made-up documents: a heading, which carries no marks, found between the
// marked units of the text around it (2608.02163, 2026-09-23). Exits non-zero on a failure.
//   node spikes/anchors-cases.mjs [path to anchors.mjs]
import assert from 'node:assert/strict'
const { anchorUnits, tokens } = await import(process.argv[2] ?? '../poc-reader/anchors.mjs')

/** words → the token stream anchors.mjs reads, one line of 10 per 12 points down page 1 */
function docOf(text) {
  return tokens(text).map((t, k) => ({ t: t.t, page: 1, x: 50 + (k % 10) * 20, y: 700 - Math.floor(k / 10) * 12, w: 18, h: 10, top: 708, bottom: 698 }))
}
const where = (doc, id, units, opts) => anchorUnits(doc, units, opts).get(id)?.tokens ?? null
const cases = []

// A heading whose words the paragraph before it also has: its own words in a row, not 3-grams picked out of that
// paragraph (Chinese: the heading's first four characters twice in the paragraph before it)
{
  const doc = docOf('甲乙深度研究丙丁深度研究戊己 深度研究基準 庚辛壬癸子丑寅卯辰巳')
  const units = [{ id: 0, text: '甲乙深度研究丙丁深度研究戊己' }, { id: 1, text: '深度研究基準' }, { id: 2, text: '庚辛壬癸子丑寅卯辰巳' }]
  cases.push(['heading beside the same words', () => assert.deepEqual(where(doc, 1, units, { bounds: new Map([['0', [0, 13]], ['2', [20, 29]]]) }), [14, 15, 16, 17, 18, 19])])
}
// A heading between two paragraphs in the text, with a caption between them in the source that TeX placed further on:
// the caption is no neighbour, else the heading is searched in a range that ends before it begins
{
  const doc = docOf('first paragraph of the text here Related Work second paragraph of the text there and a caption of the float')
  const units = [{ id: 0, text: 'first paragraph of the text here' }, { id: 1, text: 'a caption of the float' }, { id: 2, text: 'Related Work' }, { id: 3, text: 'second paragraph of the text there and' }]
  const bounds = new Map([['0', [0, 5]], ['1', [15, 19]], ['3', [8, 14]]])
  cases.push(['caption placed after the heading', () => assert.deepEqual(where(doc, 2, units, { bounds, floating: id => id === 1 }), [6, 7])])
}
// A run-in heading whose word comes twice between its neighbours — a table's row before it, then the heading itself,
// followed by its own text: the last place
{
  const doc = docOf('the paragraph before Round interval query Round t one the paragraph after it')
  const units = [{ id: 0, text: 'the paragraph before' }, { id: 1, text: 'Round' }, { id: 2, text: 'the paragraph after it' }]
  cases.push(['the heading word twice in the gap', () => assert.deepEqual(where(doc, 1, units, { bounds: new Map([['0', [0, 2]], ['2', [9, 12]]]) }), [6])])
}

let failed = 0
for (const [name, run] of cases) {
  try { run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0
