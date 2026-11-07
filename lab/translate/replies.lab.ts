// Stage 4b, the checks' second round: live replies (live-html.ts's rows, which keep the wire, the reply and the raw item)
// read again offline, block by block, against the fixture each block came from.
//
// AXT_REPLIES=<package run>: each block's reply read as the chain reads it (the package's Microsoft adapter, the chain's
// `accept`), written back by the shim and rehydrated, as the page would show it; what a reader would see that the source
// does not hold: a `#` or `@` the source lacks, an element lost, doubled or out of the source's order, text of the reply
// that the reading dropped. Every block gets a record in AXT_REPORT (source wire, reply, the wire written back, the
// rendered text), to be read whole.
// AXT_SPACES=<today run>: for each non-plain space of a block's source wire (U+00A0 and the typographic spaces, counted
// apart), whether today's reply holds it where it stood: between the same two neighbours (a marker or a word), or beside
// the same marker on the same side.
// Run: AXT_REPLIES=… AXT_REPORT=… AXT_SPACES=… AXT_SPACES_OUT=… pnpm exec vitest run -c lab/translate/live.config.ts
// lab/translate/replies.lab.ts (each part runs where its input is given)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, microsoft } from '@readarxiv/translate'
import { expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { unitOfSegment } from '@/core/pipeline/units'
import { rehydrate, serialize, tokenize } from '@/core/protector'
import { wireOfContent } from '@/core/protector/units'

const DIR = join(import.meta.dirname, '../../tests/fixtures/arxiv')
type Row = { paper: string; id: string; wire?: string; reply?: string; raw?: string; error?: string }
const rowsOf = (file: string) => (JSON.parse(readFileSync(file, 'utf8')) as { rows: Row[] }).rows.filter(r => !r.error)

const ms = microsoft({ fetch: async () => { throw new Error('no network') } })
const visible = (frag: DocumentFragment) => {
  const div = document.createElement('div')
  div.append(frag)
  return div
}
const ids = (wire: string) => tokenize(wire, 'markers').flatMap(t => (t.kind === 'void' ? [t.id] : []))
const count = (s: string, c: string) => s.split(c).length - 1
/** the reply's words: its markers (read tolerantly: `@a`, `@a##`, `@a# #`) and every `#` taken out, white space too */
const wordsOfReply = (s: string) => s.replace(/@@/g, '@').replace(/@[a-z]+(?:[ \t]*#)*/g, '').replace(/#/g, '').replace(/\s+/g, '')

it.runIf(!!process.env.AXT_REPLIES)('the package\'s reading of live replies, rendered', () => {
  const rows = rowsOf(process.env.AXT_REPLIES as string)
  const byPaper = new Map<string, Row[]>()
  for (const r of rows) byPaper.set(r.paper, [...(byPaper.get(r.paper) ?? []), r])
  const tally: Record<string, number> = { blocks: 0, wireDiffers: 0, readNull: 0, refused: 0, accepted: 0, clean: 0, strayHash: 0, strayAt: 0, lost: 0, doubled: 0, order: 0, textDropped: 0 }
  const report: string[] = []
  for (const f of readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
    const paper = f.replace('.html', '')
    const mine = byPaper.get(paper)
    if (!mine) continue
    const doc = new DOMParser().parseFromString(readFileSync(join(DIR, f), 'utf8'), 'text/html')
    const blocks = extract(doc)
    for (const r of mine) {
      tally.blocks++
      const [bid, cell] = r.id.split('#c')
      const b = blocks.find(x => x.id === bid)
      if (!b) throw new Error(`no block ${r.id} in ${paper}`)
      const el = b.kind === 'text' ? b.el : b.cells[Number(cell)]?.el
      if (!el) throw new Error(`no cell ${r.id} in ${paper}`)
      const p = serialize(el, 'markers')
      const from = unitOfSegment({ id: r.id, text: p.text, block: b, protected: p } as never, 'markers')
      const wire = ms.write(from.unit, 'zh-Hans')
      const flags: string[] = []
      if (wire !== r.wire) { tally.wireDiffers++; flags.push('the wire differs from the one sent') }
      const original = visible(rehydrate(p.text, p, doc))
      const want = (original.textContent ?? '').replace(/\s+/g, ' ')
      const read = ms.read(from.unit, r.raw as string)
      let back = ''
      let shown = ''
      if (!read) { tally.readNull++; flags.push('not read') }
      else if (!accept(from.unit, read.content).ok) { tally.refused++; flags.push('refused') }
      else {
        tally.accepted++
        back = wireOfContent(read.content, from).wire
        const got = visible(rehydrate(back, p, doc))
        shown = (got.textContent ?? '').replace(/\s+/g, ' ')
        const source = ids(p.text)
        const out = ids(back)
        if (count(shown, '#') > count(want, '#')) { tally.strayHash++; flags.push('a # the source lacks') }
        if (count(shown, '@') > count(want, '@')) { tally.strayAt++; flags.push('an @ the source lacks') }
        if (source.some(id => !out.includes(id))) { tally.lost++; flags.push('an element lost') }
        if (out.some((id, i) => out.indexOf(id) !== i)) { tally.doubled++; flags.push('an element doubled') }
        if (out.join(',') !== source.filter(id => out.includes(id)).join(',')) { tally.order++; flags.push(`elements in another order: ${out.join(',')}`) }
        // the reply's words against the words the reading kept (text pieces only: the elements are the source's)
        const kept = read.content.length ? wordsOfReply(back.replace(/@[a-z]+#/g, '')) : ''
        const said = wordsOfReply(r.reply ?? '')
        if (kept.length < said.length) { tally.textDropped++; flags.push(`the reading dropped ${said.length - kept.length} of the reply's characters`) }
        if (flags.length === 0) tally.clean++
      }
      report.push([
        `## ${paper} ${r.id} — ${flags.length ? flags.join('; ') : 'clean'}`,
        `source:   ${p.text}`,
        `sent:     ${r.wire}`,
        `reply:    ${r.reply}`,
        `back:     ${back}`,
        `rendered: ${shown}`,
        '',
      ].join('\n'))
    }
  }
  writeFileSync(process.env.AXT_REPORT as string, `${JSON.stringify(tally)}\n\n${report.join('\n')}`)
  console.log(JSON.stringify(tally))
  expect(tally.blocks).toBe(rows.length)
})

/** the non-plain spaces, each counted apart */
const SPACES: Record<string, string> = { 'U+00A0': ' ', 'U+2009': ' ', 'U+2003': ' ', 'U+2005': ' ', 'U+2002': ' ', 'U+2006': ' ', 'U+202F': ' ', 'U+2007': ' ', 'U+2008': ' ', 'U+200A': ' ' }
/** what stands on each side of a space at `at`: the marker or the word (letters, digits, marks; else one character) */
function sides(s: string, at: number): { left: string; right: string } {
  const before = s.slice(0, at)
  const after = s.slice(at + 1)
  const left = /@[a-z]+#$/.exec(before)?.[0] ?? /[\p{L}\p{N}\p{M}]+$/u.exec(before)?.[0] ?? before.slice(-1)
  const right = /^@[a-z]+#/.exec(after)?.[0] ?? /^[\p{L}\p{N}\p{M}]+/u.exec(after)?.[0] ?? after.slice(0, 1)
  return { left, right }
}
const isMarker = (s: string) => /^@[a-z]+#$/.test(s)

it.runIf(!!process.env.AXT_SPACES)('today\'s replies: the non-plain spaces where they stood', () => {
  const rows = rowsOf(process.env.AXT_SPACES as string)
  const out: Record<string, { blocks: number; occurrences: number; replyHolds: number; blocksKeptAll: number; blocksKeptSome: number; kept: number; keptBesideMarker: number; besideMarker: number; replyCount: number; examples: string[] }> = {}
  for (const r of rows) {
    const src = r.wire as string
    const reply = r.reply as string
    for (const [name, ch] of Object.entries(SPACES)) {
      // by code units, as the slices of `sides` index (a code point index drifts past an astral character)
      const units = (s: string) => Array.from(s.matchAll(new RegExp(ch, 'g')), m => m.index ?? 0)
      const srcAt = units(src)
      if (!srcAt.length) continue
      const t = (out[name] ??= { blocks: 0, occurrences: 0, replyHolds: 0, blocksKeptAll: 0, blocksKeptSome: 0, kept: 0, keptBesideMarker: 0, besideMarker: 0, replyCount: 0, examples: [] })
      t.blocks++
      t.occurrences += srcAt.length
      const replySides = units(reply).map(i => sides(reply, i))
      t.replyCount += replySides.length
      if (replySides.length) t.replyHolds++
      let kept = 0
      for (const i of srcAt) {
        const { left, right } = sides(src, i)
        const marker = isMarker(left) || isMarker(right)
        if (marker) t.besideMarker++
        // the same two neighbours; or, beside a marker, the same marker on the same side (the word on its other side is
        // a translation's)
        const hit = replySides.some(x => (x.left === left && x.right === right) || (isMarker(left) && x.left === left) || (isMarker(right) && x.right === right))
        if (hit) {
          kept++
          if (marker) t.keptBesideMarker++
        }
      }
      t.kept += kept
      if (kept === srcAt.length) t.blocksKeptAll++
      else if (kept > 0) t.blocksKeptSome++
      if (replySides.length && t.examples.length < 4) {
        const i = srcAt[0] as number
        const j = units(reply)[0] as number
        t.examples.push(`${r.paper} ${r.id}: source ${JSON.stringify(src.slice(Math.max(0, i - 25), i + 25))} reply ${JSON.stringify(reply.slice(Math.max(0, j - 15), j + 15))}`)
      }
    }
  }
  writeFileSync(process.env.AXT_SPACES_OUT as string, JSON.stringify({ blocks: rows.length, bySpace: out }, null, 1))
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, examples: undefined }]))))
  expect(rows.length).toBeGreaterThan(0)
})
