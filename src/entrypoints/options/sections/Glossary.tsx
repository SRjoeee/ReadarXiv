// The glossary (the redesign's design, §6.3; T8): a table in place, source · translation, one pair a row, and one empty
// row at the end to add to — typing in it makes it a row and draws a new empty one; Enter goes on to it. Pasting lines
// of source-and-translation pairs splits them into rows. A row missing a side says so at the row once the focus has left it (today's
// reasons, without their line numbers). The table saves the rows that are whole, and only when they fit GLOSSARY_LIMITS
// (the schema refuses the rest, and a refused write would leave the reader looking at a glossary that is not stored,
// Codex on #157); over the limits it says so. It follows a glossary saved elsewhere unless a row of the reader's is
// unfinished (Codex on #185), and holds a draft while one is, while it is over the limits, or after a refused write
import { X } from 'lucide'
import { type ClipboardEvent, type FocusEvent, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { GLOSSARY_LIMITS, configSchema } from '@/config/schema'
import { GLOSSARY_SEPARATOR, type GlossaryEntry } from '@/providers/glossary'
import { Icon } from '@/ui/controls/Icon'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Status } from '../ui/Row'

interface Line { key: number; term: string; translation: string; left: boolean }
type Side = 'term' | 'translation'
/** the empty row's cells, in the map of cells */
const EMPTY = -1

/** The whole rows, trimmed; a later row of a term wins, in the first one's place (providers/glossary.ts's rule) */
export function entriesOf(lines: readonly { term: string; translation: string }[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = []
  const at = new Map<string, number>()
  for (const line of lines) {
    const term = line.term.trim()
    const translation = line.translation.trim()
    if (!term || !translation) continue
    const i = at.get(term)
    if (i === undefined) {
      at.set(term, out.length)
      out.push({ term, translation })
    } else out[i] = { term, translation }
  }
  return out
}
const same = (a: readonly GlossaryEntry[], b: readonly GlossaryEntry[]) => a.length === b.length && a.every((e, i) => e.term === b[i]!.term && e.translation === b[i]!.translation)
const fits = (entries: readonly GlossaryEntry[]) => configSchema.shape.glossary.safeParse(entries).success
const issueOf = (line: Line): 'emptySource' | 'emptyTarget' | null => {
  const term = line.term.trim()
  const translation = line.translation.trim()
  if (!term && !translation) return null
  return !term ? 'emptySource' : !translation ? 'emptyTarget' : null
}

export function GlossaryTable({ data }: { data: OptionsData }) {
  const { config, patch } = data
  const ids = useId()
  const nextKey = useRef(0)
  const toLines = (entries: readonly GlossaryEntry[]): Line[] => entries.map(e => ({ key: nextKey.current++, term: e.term, translation: e.translation, left: false }))
  const [lines, setLines] = useState<Line[]>(() => toLines(config?.glossary ?? []))
  /** the glossary this table last wrote or last took: a stored value equal to it is not news */
  const own = useRef<readonly GlossaryEntry[]>(config?.glossary ?? [])
  /** writes not landed yet: while one is out, the store is behind the reader */
  const pending = useRef(0)
  const [failed, setFailed] = useState(false)
  const cells = useRef(new Map<string, HTMLInputElement>())
  /** the cell a new row's first letter went into: it takes the focus once drawn */
  const focusNext = useRef<string | null>(null)
  const entries = entriesOf(lines)
  const over = !fits(entries)
  const unfinished = lines.some(line => issueOf(line) !== null)
  const held = unfinished || over || failed
  useEffect(() => (held ? drafts.hold() : undefined), [held])

  const stored = config?.glossary
  // the stored glossary, when it is news: never the reader's own writes coming back, never over their unfinished rows
  const quiet = useRef({ held, pending })
  quiet.current = { held, pending }
  // biome-ignore lint/correctness/useExhaustiveDependencies: followed as the stored glossary changes; the rest is read as of then
  useEffect(() => {
    if (!stored || same(stored, own.current) || quiet.current.pending.current > 0 || quiet.current.held) return
    own.current = stored
    setLines(toLines(stored))
  }, [stored])
  useLayoutEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = null
    const cell = cells.current.get(id)
    cell?.focus()
    cell?.setSelectionRange(cell.value.length, cell.value.length)
  })

  const change = (after: Line[]) => {
    setLines(after)
    const next = entriesOf(after)
    if (same(next, own.current) || !fits(next)) return
    own.current = next
    pending.current++
    patch(latest => ({ ...latest, glossary: next })).then(() => setFailed(false), () => setFailed(true)).finally(() => { pending.current-- })
  }
  const set = (key: number, side: Side, value: string) => change(lines.map(line => (line.key === key ? { ...line, [side]: value } : line)))
  const begin = (side: Side, value: string) => {
    const line: Line = { key: nextKey.current++, term: '', translation: '', left: false, [side]: value }
    focusNext.current = `${line.key}:${side}`
    change([...lines, line])
  }
  const remove = (key: number) => {
    const at = lines.findIndex(line => line.key === key)
    const neighbour = lines[at + 1] ?? lines[at - 1]
    cells.current.get(neighbour ? `${neighbour.key}:term` : `${EMPTY}:term`)?.focus()
    change(lines.filter(line => line.key !== key))
  }
  const leave = (key: number, e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setLines(ls => ls.map(line => (line.key === key && !line.left ? { ...line, left: true } : line)))
  }
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/\r?\n/.test(text.trim())) return
    e.preventDefault()
    const pasted = text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => {
      const at = s.search(GLOSSARY_SEPARATOR)
      return { key: nextKey.current++, term: at < 0 ? s : s.slice(0, at).trim(), translation: at < 0 ? '' : s.slice(at + 1).trim(), left: true }
    })
    change([...lines, ...pasted])
  }
  const enter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    cells.current.get(`${EMPTY}:term`)?.focus()
  }
  const cellRef = (key: number, side: Side) => (el: HTMLInputElement | null) => {
    if (el) cells.current.set(`${key}:${side}`, el)
    else cells.current.delete(`${key}:${side}`)
  }
  const max = { term: GLOSSARY_LIMITS.term, translation: GLOSSARY_LIMITS.translation }

  return (
    <div className="o-gloss">
      <div className="o-gloss-row o-gloss-head" aria-hidden="true"><span>{O.glossary.source}</span><span>{O.glossary.target}</span><span /></div>
      {lines.map((line, i) => {
        const issue = line.left ? issueOf(line) : null
        const issueId = `${ids}-${line.key}`
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: catches the row's own inputs losing focus (bubbled blur), not an interaction of its own
          <div key={line.key} className="o-gloss-line" onBlur={e => leave(line.key, e)}>
            <div className="o-gloss-row">
              {(['term', 'translation'] as const).map(side => (
                <input key={side} ref={cellRef(line.key, side)} value={line[side]} maxLength={max[side]} autoComplete="off" spellCheck={false}
                  aria-label={`${side === 'term' ? O.glossary.source : O.glossary.target} ${i + 1}`}
                  aria-invalid={issue === (side === 'term' ? 'emptySource' : 'emptyTarget') || undefined} aria-describedby={issue ? issueId : undefined}
                  onChange={e => set(line.key, side, e.target.value)} onPaste={paste} onKeyDown={enter} />
              ))}
              <button type="button" className="o-gloss-remove" aria-label={O.glossary.remove(i + 1)} onClick={() => remove(line.key)}><Icon node={X} size={14} /></button>
            </div>
            {issue && <div id={issueId} className="o-gloss-issue"><Status tone="alert">{O.glossary.issue[issue]}</Status></div>}
          </div>
        )
      })}
      <div className="o-gloss-line">
        <div className="o-gloss-row">
          {(['term', 'translation'] as const).map(side => (
            <input key={side} ref={cellRef(EMPTY, side)} value="" maxLength={max[side]} autoComplete="off" spellCheck={false}
              placeholder={side === 'term' ? O.glossary.source : O.glossary.target} aria-label={side === 'term' ? O.glossary.source : O.glossary.target}
              onChange={e => begin(side, e.target.value)} onPaste={paste} />
          ))}
          <span />
        </div>
      </div>
      {over && <p className="o-gloss-note"><Status tone="alert">{O.glossary.tooBig}</Status></p>}
    </div>
  )
}
