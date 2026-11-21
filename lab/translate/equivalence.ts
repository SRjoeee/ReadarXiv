// Equivalence with today on recorded material (stage 4a's exit): for every reply today's tests have today's readers judge
// (capture-setup.ts), the package's adapter reads the same reply for the same unit, typed, and the acceptance rule judges
// it; the verdict is compared with today's: readsBack for the PDF engine's units (its spans not `must` but the pairs its
// markers wire keeps), the protector's validate for the HTML page's blocks (every pair `must`). A comparison is made only
// where the adapter writes the unit's wire as today does, byte for byte or but for the DOM's white space (the two are
// counted apart); every other record is listed with why the wires differ. A disagreement of a class the package's owners
// chose (ACCEPTED: its cause, its test, its count) is listed apart; the run exits 1 on any other disagreement, or where an
// accepted class's count is not the one stated. Each record's unit is typed as today's engine reads it, frozen once
// (today-typed.ts, amendment 8.3) and read here: nothing of today's engine is loaded.
// Run: npx tsx lab/translate/equivalence.ts <capture.jsonl> <out-dir> <today-typed.json>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, type Fetch, google, microsoft, tagsWire, type UnitIn } from '../../packages/translate/src/index.ts'
import { keyOf, type Rec, recordsOf, typedOf } from './records.ts'

const [input, outDir, todayFile] = process.argv.slice(2)
if (!input || !outDir || !todayFile) throw new Error('usage: equivalence.ts <capture.jsonl> <out-dir> <today-typed.json>')
const todayTyped = typedOf(todayFile, input)
const noFetch: Fetch = async () => {
  throw new Error('no network')
}
const MS = microsoft({ fetch: noFetch })
// (the recorded replies answer wires whose elements are voids: Google's reader, the tags wire written with voids as today's
// was; Google itself now writes its elements as words and its groups as spans, packages/translate wire/tags.ts TagSpelling)
const GG = { ...google({ fetch: noFetch }), write: (u: UnitIn) => tagsWire.write(u) }

// ---------------------------------------------------------------- the comparison
const records = recordsOf(input)
/** the differences the package makes on purpose, each with its cause, the test that puts a disagreement in it (read from the
 *  record, not from the package's code) and the count on the capture (lanes/L6/capture.jsonl): a count other than this one
 *  is a change, as a disagreement of no class is */
/** the markers a text follows with a `#` (its `@@` read first): a marker's own closer then a `#`, white space between */
const hashAfter = (s: string): Set<string> => new Set([...s.replace(/@@/g, '').matchAll(/@([a-z]+)#[ \t]*#/g)].map(m => m[1] as string))
const ACCEPTED: { name: string; cause: string; count: number; test: (r: Rec, why: string | null) => boolean }[] = [
  {
    // (3 until 96d7f1daa, lane style-wire, round 8 B8: a `#` right after a marker is the text's own where the wire sets one
    // there, as today reads it; since then the capture's `@@a @a##` and `case @a##3 holds` echoes agree)
    name: 'a `#` of its own',
    cause:
      "a block whose text holds a `#` of its own, a reply with a `#` right after a marker where the wire sets none there: refused here, taken today. Microsoft's doubled closer (`@a##`) and the text's own `#` moved beside the marker cannot be told apart, and either way a reader would see one `#` too many or too few; the reply goes to the next translator (stage 4b, lanes/L6-translate.md \"Stage 4b, checks\", check 1; packages/translate/src/wire/markers.ts readMarkers)",
    count: 1,
    test: (r, why) => {
      if (r.format !== 'markers' || !r.today || why !== 'unread' || !r.wire.replace(/@@|@[a-z]+#/g, '').includes('#')) return false
      const wire = hashAfter(r.wire)
      return [...hashAfter(r.reply)].some(m => !wire.has(m))
    },
  },
]
const seen = new Set<string>()
type Outcome = 'agree' | 'disagree' | 'accepted' | 'wire'
type Row = { src: string; format: string; outcome: Outcome | `${Exclude<Outcome, 'wire'>}, white space apart`; today: boolean; mine?: boolean; cause?: string; accepted?: string; wire: string; mineWire?: string; reply: string; test?: string | null; file?: string | null; must?: boolean }
const rows: Row[] = []
for (const r of records) {
  const key = keyOf(r)
  if (seen.has(key)) continue
  seen.add(key)
  const frozen = todayTyped(r)
  if (!frozen) throw new Error(`${todayFile} holds no typing of a record of ${input} (${key.slice(0, 160)}): today's typing is of another capture`)
  // (a PDF unit today's wire never sends: its back-reference list)
  if ('skip' in frozen) continue
  const t = r.format === 'markers' ? MS : GG
  const typed = { unit: frozen.unit, notes: new Set(frozen.notes), ...(frozen.order ? { order: frozen.order } : {}) }
  const unit = typed.unit
  const must = JSON.stringify(unit.content).includes('"must":true')
  const mineWire = t.write(unit, 'zh-Hans')
  const base = { src: r.src, format: r.format, today: r.today, wire: r.wire, reply: r.reply, test: r.test, file: r.file, must }
  // (a wire equal but for white space numbers its markers alike: the HTML page sends the DOM's white space as it stands,
  // the adapters collapse it; such a reply is compared too, and counted apart)
  const loose = mineWire !== r.wire && mineWire.replace(/\s+/g, '') === r.wire.replace(/\s+/g, '')
  if (mineWire !== r.wire && !loose) {
    rows.push({ ...base, outcome: 'wire', mineWire, cause: wireCause(r, typed, mineWire) })
    continue
  }
  const got = t.read(unit, r.format === 'markers' ? JSON.stringify({ text: r.reply }) : r.reply)
  const verdict = got ? accept(unit, got.content) : { ok: false as const, why: 'unread' as const }
  const mine = verdict.ok
  const tail = loose ? ', white space apart' : ''
  if (mine === r.today) {
    rows.push({ ...base, outcome: `agree${tail}`, mine })
    continue
  }
  const cause = verdict.ok ? `taken here, refused today${r.reason ? ` (${r.reason})` : ''}` : `refused here (${verdict.why})${r.reason ? `, today ${r.reason}` : ''}`
  const accepted = ACCEPTED.find(a => a.test(r, verdict.ok ? null : verdict.why))
  rows.push(accepted ? { ...base, outcome: `accepted${tail}`, mine, cause, accepted: accepted.name } : { ...base, outcome: `disagree${tail}`, mine, cause })
}

function wireCause(r: Rec, typed: { unit: UnitIn; notes: Set<string>; order?: number[] }, mine: string): string {
  const count = (w: string) => (r.format === 'markers' ? (w.match(/@[a-z]+#/g) ?? []).length : (w.match(/<x |<t /g) ?? []).length)
  const causes: string[] = [...typed.notes]
  if (typed.order?.some((n, i) => n !== i + 1)) causes.push('ids not in order 1..n on the HTML wire')
  if (r.src === 'html' && r.format === 'markers' && /@[a-z]+#\s*@[a-z]+#/.test(r.wire)) causes.push('side-by-side elements one marker here (the PDF wire\'s rule, now the one Microsoft adapter\'s), one each on the HTML page')
  if (r.src === 'html' && r.format === 'tags' && /<t id="\d+">\s*(?:<x id="\d+"\/>\s*)+<\/t>/.test(r.wire)) causes.push('a span holding no text one void here, a pair around its elements on the HTML page')
  if (count(mine) < count(r.wire)) causes.push(`fewer markers here (${count(mine)} for ${count(r.wire)})`)
  if (count(mine) > count(r.wire)) causes.push(`more markers here (${count(mine)} for ${count(r.wire)})`)
  return causes.join('; ') || 'other'
}

// ---------------------------------------------------------------- the report
const by = (f: (r: Row) => string) => {
  // (causes listed without their counts' numbers, so that one cause is one line)
  const m = new Map<string, number>()
  for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const groups = by(r => `${r.src}|${r.format}|${r.outcome}`)
const line = (r: Row) => `${r.src}/${r.format}${r.must ? ' (must spans)' : ''}: today ${r.today ? 'takes' : 'refuses'}, here ${r.mine ? 'takes' : 'refuses'}: ${r.cause}. Wire \`${r.wire.slice(0, 160)}\`, reply \`${r.reply.slice(0, 160)}\`${r.test ? ` (${r.file ?? ''} › ${r.test})` : ''}`
const disagree = rows.filter(r => r.outcome.startsWith('disagree'))
const classes = ACCEPTED.map(a => ({ ...a, rows: rows.filter(r => r.accepted === a.name) }))
const off = classes.filter(c => c.rows.length !== c.count)
const pass = disagree.length === 0 && off.length === 0
const compared = rows.filter(r => r.outcome !== 'wire').length
const verdict = `${pass ? 'PASS' : 'FAIL'}: ${compared} compared, ${compared - disagree.length - classes.reduce((n, c) => n + c.rows.length, 0)} agree, ${classes.map(c => `${c.rows.length} of the accepted class "${c.name}" (stated ${c.count})`).join(', ')}, ${disagree.length} disagreements of no class`
const lines = [
  '# Equivalence with today on recorded material (lane L6)',
  '',
  `Input: ${records.length} records from today's tests (${seen.size} distinct). A verdict is compared only where the adapter writes today's wire, byte for byte or but for the DOM's white space (the rows "white space apart").`,
  '',
  `**${verdict}.**`,
  '',
  '| source | wire | outcome | records |',
  '|---|---|---|---|',
  ...groups.map(([k, n]) => `| ${k.split('|').join(' | ')} | ${n} |`),
  '',
  '## Accepted differences (the package\'s on purpose), each with its cause and count',
  '',
  '| class | cause | stated | found |',
  '|---|---|---|---|',
  ...classes.map(c => `| ${c.name} | ${c.cause} | ${c.count} | ${c.rows.length} |`),
  '',
  ...classes.flatMap(c => c.rows.map(r => `- ${c.name}: ${line(r)}`)),
  '',
  '## Disagreements (the same wire, or one but for white space; different verdicts) of no accepted class, each with its cause',
  '',
  ...disagree.map(r => `- ${line(r)}`),
  '',
  '## Records whose wire differs, by cause',
  '',
  ...by(r => (r.outcome === 'wire' ? `${r.src}/${r.format}: ${(r.cause ?? '').replace(/ \(\d+ for \d+\)/g, '')}` : '')).filter(([k]) => k).map(([k, n]) => `- ${n} × ${k}`),
]
writeFileSync(join(outDir, 'equivalence.md'), `${lines.join('\n')}\n`)
writeFileSync(join(outDir, 'equivalence.json'), JSON.stringify(rows, null, 1))
console.log(groups.map(([k, n]) => `${k.split('|').join(' ')}: ${n}`).join('\n'))
console.log(verdict)
if (!pass) process.exitCode = 1
