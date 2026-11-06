// Equivalence with today on recorded material (stage 4a's exit): for every reply today's tests have today's readers judge
// (capture-setup.ts), the package's adapter reads the same reply for the same unit, typed, and the acceptance rule judges
// it; the verdict is compared with today's: readsBack for the PDF engine's units (its spans not `must` but the pairs its
// markers wire keeps), the protector's validate for the HTML page's blocks (every pair `must`). A comparison is made only
// where the adapter writes the unit's wire as today does, byte for byte or but for the DOM's white space (the two are
// counted apart); every other record is listed with why the wires differ. Run: npx tsx lab/translate/equivalence.ts <capture.jsonl> <out-dir>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, type Fetch, google, microsoft, type Piece, type UnitIn } from '../../packages/translate/src/index.ts'
import * as mt from '../../src/pdf-reader/engine/translate/mt.mjs'

type Rec = { src: 'pdf' | 'html' | 'web'; format: 'markers' | 'tags'; wire: string; reply: string; today: boolean; reason?: string | null; kind?: string | null; pieces?: TexPiece[]; test?: string | null; file?: string | null }
type TexPiece = { t: string; s?: string; src?: string; id?: number; sets?: number }

const [input, outDir] = process.argv.slice(2)
if (!input || !outDir) throw new Error('usage: equivalence.ts <capture.jsonl> <out-dir>')
const noFetch: Fetch = async () => {
  throw new Error('no network')
}
const MS = microsoft({ fetch: noFetch })
const GG = google({ fetch: noFetch })

// ---------------------------------------------------------------- a PDF unit's TeX pieces, typed as the source reader would
const SPACE = /^(?:~|\\ |\\[,;:!>]|\\(?:quad|qquad|enspace|thinspace|enskip|space)(?![A-Za-z@])|\\hspace\*?\s*\{[^{}]*\})\s*$/
const LINK = /^\\(?:href|hyperref|hyperlink|url)(?![A-Za-z])/
const kindOf = (src: string): string => {
  if (mt.DISPLAY.test(src)) return 'display'
  if (/^(?:\$|\\\(|\\ensuremath)/.test(src)) return 'math'
  if (/^\\(?:cite|citep|citet|citealp|citeauthor|citeyear|parencite|textcite|footcite|Citet)\b/.test(src)) return 'cite'
  if (/^\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|Sref|secref|figref)\b/.test(src)) return 'ref'
  return 'other'
}
const styleOf = (src: string): string =>
  LINK.test(src) ? 'link' : /textbf|bfseries/.test(src) ? 'bold' : /emph|textit|itshape/.test(src) ? 'italic' : /texttt/.test(src) ? 'mono' : 'other'

/** the pairs today's markers wire keeps (two markers): the slots that are, or hold, a pair's open */
function keptPairs(kind: string, pieces: TexPiece[], notes: Set<string>): Set<number> {
  const kept = new Set<number>()
  // (the pieces as the front end gave them: `sets` 0 is not enumerable there)
  const own = pieces.map(p => {
    if (p.sets !== 0) return p
    const { sets: _, ...rest } = p
    return Object.defineProperty({ ...rest }, 'sets', { value: 0, enumerable: false })
  })
  const ser = mt.serialize({ kind, pieces: own }) as { slots: { t: string; id?: number; pieces?: TexPiece[] }[] }
  for (const s of ser.slots) {
    const opens = (s.t === 'edge' || s.t === 'run' ? (s.pieces ?? []) : [s]).filter(p => p.t === 'open' && p.id !== undefined)
    if (opens.length > 1 && s.t === 'edge') notes.add('today same-style neighbour pairs one span; one span each here (a limit of this conversion: the source reader types the span)')
    for (const p of opens) kept.add(p.id as number)
  }
  return kept
}
function typedOfTex(kind: string, pieces: TexPiece[]): { unit: UnitIn; notes: Set<string> } {
  const notes = new Set<string>()
  const kept = keptPairs(kind, pieces, notes)
  const runs = mt.formulaRuns(pieces) as Map<number, number>
  const opens = new Set(pieces.filter(p => p.t === 'open').map(p => p.id))
  const closes = new Set(pieces.filter(p => p.t === 'close').map(p => p.id))
  const root: Piece[] = []
  const stack: { id: number | null; content: Piece[]; dissolved: boolean }[] = [{ id: null, content: root, dissolved: false }]
  const top = () => stack[stack.length - 1] as (typeof stack)[number]
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k] as TexPiece
    if (p.t === 'text') {
      top().content.push({ t: 'text', s: mt.utf8(p.s ?? '') as string })
      continue
    }
    if (p.t === 'ph' || p.t === 'nested') {
      const last = runs.get(k)
      if (last !== undefined && last > k) {
        notes.add('a formula run as one element')
        top().content.push({ t: 'el', id: `e${k}`, kind: 'math' })
        k = last
        continue
      }
      const src = p.src ?? ''
      if (p.t === 'ph' && mt.isInkless(p)) {
        notes.add('a placeholder that sets no ink: no piece')
        continue
      }
      if (p.t === 'ph' && SPACE.test(src)) {
        notes.add("TeX's space (a tie) a marker today, text here")
        top().content.push({ t: 'text', s: src.startsWith('~') ? ' ' : ' ' })
        continue
      }
      const kd = p.t === 'nested' ? 'note-mark' : kindOf(src)
      const stop = kd === 'display' ? (mt.displayStop(src) as string | null) : null
      top().content.push(stop ? { t: 'el', id: `e${k}`, kind: kd, stop } : { t: 'el', id: `e${k}`, kind: kd })
      continue
    }
    if (p.t === 'open') {
      if (!closes.has(p.id)) {
        notes.add('a lone end: a marker where it stands today, no piece here (typed pieces nest)')
        continue
      }
      const dissolved = p.sets === 0
      if (dissolved) notes.add('an identity wrapper: no span')
      const content: Piece[] = []
      if (!dissolved) top().content.push({ t: 'span', id: `s${p.id}`, style: styleOf(p.src ?? ''), ...(kept.has(p.id as number) ? { must: true } : {}), content })
      stack.push({ id: p.id ?? null, content: dissolved ? top().content : content, dissolved })
      continue
    }
    if (p.t === 'close') {
      if (!opens.has(p.id)) {
        notes.add('a lone end: no piece')
        continue
      }
      if (stack.length > 1 && top().id === p.id) stack.pop()
    }
  }
  return { unit: { id: 'u', kind, content: root }, notes }
}

// ---------------------------------------------------------------- an HTML block's wire, typed: voids elements, pairs `must` spans
const TAG = /<x\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:\/>|>\s*<\/x\s*>)|<t\s+id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*>|<\/t\s*>/g
const MARKER = /@@|@([a-z]+)#/g
const decodeHtml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b: string) =>
    b[0] === '#' ? String.fromCodePoint(b[1]?.toLowerCase() === 'x' ? Number.parseInt(b.slice(2), 16) : Number.parseInt(b.slice(1), 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[b.toLowerCase()] ?? m,
  )
function typedOfHtml(wire: string, format: 'markers' | 'tags'): { unit: UnitIn; order: number[] } {
  const root: Piece[] = []
  const stack: Piece[][] = [root]
  const order: number[] = []
  let last = 0
  const text = (s: string) => {
    if (s) (stack[stack.length - 1] as Piece[]).push({ t: 'text', s: decodeHtml(s) })
  }
  if (format === 'markers') {
    let buf = ''
    for (const m of wire.matchAll(MARKER)) {
      buf += wire.slice(last, m.index)
      last = (m.index ?? 0) + m[0].length
      if (m[0] === '@@') {
        buf += '@'
        continue
      }
      text(buf)
      buf = ''
      const n = mt.fromAlpha(m[1] as string) as number
      order.push(n)
      root.push({ t: 'el', id: `x${n}`, kind: 'other' })
    }
    text(buf + wire.slice(last))
  } else {
    for (const m of wire.matchAll(TAG)) {
      text(wire.slice(last, m.index))
      last = (m.index ?? 0) + m[0].length
      const v = m[1] ?? m[2] ?? m[3]
      const o = m[4] ?? m[5] ?? m[6]
      const here = stack[stack.length - 1] as Piece[]
      if (v !== undefined) {
        order.push(Number(v))
        here.push({ t: 'el', id: `x${v}`, kind: 'other' })
      } else if (o !== undefined) {
        order.push(Number(o))
        const content: Piece[] = []
        here.push({ t: 'span', id: `t${o}`, style: 'other', must: true, content })
        stack.push(content)
      } else if (stack.length > 1) stack.pop()
    }
    text(wire.slice(last))
  }
  return { unit: { id: 'u', content: root }, order }
}

// ---------------------------------------------------------------- the comparison
/** the web repository's reading table (readarxiv-web worker/tests/mt.test.ts, "an answer the reading takes": mt.mjs readsBack
 *  over each wire, the Workflow's accepts), its wires typed as the HTML page's are: its engine is not run here (the web
 *  worktree's submodule is not checked out), so its verdicts are quoted */
const WEB: [string, string, boolean][] = [
  ['@a# x @b#', 'y @b# z @a#', true],
  ['@a# x @b#', 'y @a# z', false],
  ['@a# x', '@a# @a# y', false],
  ['@a# x', '@a# @c# y', false],
  ['mail @@ host @a#', 'courriel @@ hôte @a#', true],
  ['text', '', false],
  ['The model @a# reads.', '\u6a21\u578b@a\u8bfb\u3002', true],
  ['@@@a# x', 'y @@@a#', true],
  ['mail @@ host @a#', 'mail @@@@ host @a#', true],
  ['mail @@ host @a#', 'mail @@ host', false],
]
const records: Rec[] = [
  ...readFileSync(input, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Rec),
  ...WEB.map(([wire, reply, today]): Rec => ({ src: 'web', format: 'markers', wire, reply, today, file: 'readarxiv-web worker/tests/mt.test.ts', test: 'the reading table' })),
]
const seen = new Set<string>()
type Row = { src: string; format: string; outcome: 'agree' | 'disagree' | 'agree, white space apart' | 'disagree, white space apart' | 'wire'; today: boolean; mine?: boolean; cause?: string; wire: string; mineWire?: string; reply: string; test?: string | null; file?: string | null; must?: boolean }
const rows: Row[] = []
for (const r of records) {
  const key = JSON.stringify([r.src, r.format, r.pieces ?? r.wire, r.reply])
  if (seen.has(key)) continue
  seen.add(key)
  if (r.src === 'pdf' && (r.pieces ?? []).some(p => p.src === mt.BACKREF_LIST)) continue
  const t = r.format === 'markers' ? MS : GG
  const typed = r.src === 'pdf' ? typedOfTex(r.kind ?? 'para', r.pieces ?? []) : { ...typedOfHtml(r.wire, r.format), notes: new Set<string>() }
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
  rows.push(
    mine === r.today
      ? { ...base, outcome: `agree${tail}` as Row['outcome'], mine }
      : { ...base, outcome: `disagree${tail}` as Row['outcome'], mine, cause: verdict.ok ? `taken here, refused today${r.reason ? ` (${r.reason})` : ''}` : `refused here (${verdict.why})${r.reason ? `, today ${r.reason}` : ''}` },
  )
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
const lines = [
  '# Equivalence with today on recorded material (lane L6)',
  '',
  `Input: ${records.length} records from today's tests (${seen.size} distinct). A verdict is compared only where the adapter writes today's wire, byte for byte or but for the DOM's white space (the rows "white space apart").`,
  '',
  '| source | wire | outcome | records |',
  '|---|---|---|---|',
  ...groups.map(([k, n]) => `| ${k.split('|').join(' | ')} | ${n} |`),
  '',
  '## Disagreements (the same wire, or one but for white space; different verdicts), each with its cause',
  '',
  ...rows
    .filter(r => r.outcome.startsWith('disagree'))
    .map(r => `- ${r.src}/${r.format}${r.must ? ' (must spans)' : ''}: today ${r.today ? 'takes' : 'refuses'}, here ${r.mine ? 'takes' : 'refuses'}: ${r.cause}. Wire \`${r.wire.slice(0, 160)}\`, reply \`${r.reply.slice(0, 160)}\`${r.test ? ` (${r.file ?? ''} › ${r.test})` : ''}`),
  '',
  '## Records whose wire differs, by cause',
  '',
  ...by(r => (r.outcome === 'wire' ? `${r.src}/${r.format}: ${(r.cause ?? '').replace(/ \(\d+ for \d+\)/g, '')}` : '')).filter(([k]) => k).map(([k, n]) => `- ${n} × ${k}`),
]
writeFileSync(join(outDir, 'equivalence.md'), `${lines.join('\n')}\n`)
writeFileSync(join(outDir, 'equivalence.json'), JSON.stringify(rows, null, 1))
console.log(groups.map(([k, n]) => `${k.split('|').join(' ')}: ${n}`).join('\n'))
