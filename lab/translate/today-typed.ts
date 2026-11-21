// Today's typing of the equivalence check's records, written once (amendment 8.3 of the refactor's design: today's answers
// frozen before the cut-over deletes today's engine): each distinct record's unit as the translate package's adapters are
// handed it, typed by today's own reading of it (a PDF unit's TeX pieces through today's wire, mt.mjs: the pairs its markers
// keep, its formula runs, its inkless placeholders, its display stops, its text's characters; an HTML block's wire with
// today's marker letters), and the PDF units today's wire never sends. equivalence.ts reads the file in place of today's
// engine; this module is today's engine's and goes with it at the cut-over.
// Run: npx tsx lab/translate/today-typed.ts <capture.jsonl> <out.json>
import { writeFileSync } from 'node:fs'
import type { Piece, UnitIn } from '../../packages/translate/src/index.ts'
import * as mt from '../../src/pdf-reader/engine/translate/mt.mjs'
import { keyOf, recordsOf, type TexPiece, type Typed, typedFile } from './records.ts'

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

// ---------------------------------------------------------------- the records typed, each distinct one once, in order
const [input, out] = process.argv.slice(2)
if (!input || !out) throw new Error('usage: today-typed.ts <capture.jsonl> <out.json>')
const seen = new Set<string>()
const typed: [string, Typed][] = []
for (const r of recordsOf(input)) {
  const key = keyOf(r)
  if (seen.has(key)) continue
  seen.add(key)
  if (r.src === 'pdf' && (r.pieces ?? []).some(p => p.src === mt.BACKREF_LIST)) typed.push([key, { skip: true }])
  else if (r.src === 'pdf') {
    const t = typedOfTex(r.kind ?? 'para', r.pieces ?? [])
    typed.push([key, { unit: t.unit, notes: [...t.notes] }])
  } else {
    const t = typedOfHtml(r.wire, r.format)
    typed.push([key, { unit: t.unit, notes: [], order: t.order }])
  }
}
writeFileSync(out, `${JSON.stringify(typedFile(input, typed))}\n`)
console.log(`today's typing of ${seen.size} distinct records (${typed.filter(([, t]) => 'skip' in t).length} today's wire never sends) written to ${out}`)
