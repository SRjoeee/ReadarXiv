// The contents (the reader's design, §6.3): the paper's headings, every level shown, each entry its number in a column of its
// own, the translated title (two lines at most) and the original under it (one line), hierarchy by indentation alone: a
// level's number column starts under its parent's title. A row jumps both sides to its heading and stays unmarked: no entry is
// marked as the one being read (the maintainer, 2026-11-26: a press jumps, nothing stays selected)
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { R, useTip } from '@readarxiv/ui'
import type { OutlineEntry, ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { useReader } from './use-reader.ts'

/** a level's number column where none of its entries has a number and a deeper level follows: one step of indentation */
const STEP = '14px'

export function Outline({
  controller,
  open,
  onGone,
  onEscape,
}: {
  controller: ReaderController
  open: boolean
  /** a row gone to: whether the contents closed for it (laid over the document), the focus then the page's where the reader
   *  holds a target for it, else the contents button's (App.tsx) */
  onGone?: () => boolean
  /** Escape pressed in the contents */
  onEscape?: () => void
}) {
  const { languages } = useParts()
  const { outline: entries, lang } = useReader(controller, (s) => ({
    outline: s.outline,
    lang: s.prefs ? languages.tag(s.prefs.target) : undefined,
  }))
  // the three number columns, then the titles': a level's column as wide as its widest number (the browser's measure, every
  // row's number of the level in it: the list a grid, each entry on its subgrid), so that its titles start on one edge and the
  // level under it starts there. A level no entry of which has a number keeps the step a deeper level is indented by
  const numbered = useMemo(() => {
    const has = [false, false, false]
    for (const e of entries) if (e.number) has[e.level - 1] = true
    return has
  }, [entries])
  const deepest = entries.reduce((d, e) => Math.max(d, e.level), 0)
  const tracks = numbered.map((n, k) => (n ? 'auto' : k + 1 < deepest ? STEP : '0px'))
  return (
    // closed, inert, not hidden: out of the tab order and the accessibility tree, still displayed, so that the style
    // sheet slides it (a hidden sidebar is display: none, which no transition leaves)
    <aside
      id="axt-contents"
      className="chrome toc"
      aria-label={R.contents}
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onEscape) {
          e.preventDefault()
          onEscape()
        }
      }}
    >
      <div className="toc-h">{R.contents}</div>
      <ul className="toc-list" style={{ gridTemplateColumns: `${tracks.join(' ')} minmax(0, 1fr)` } as CSSProperties}>
        {entries.map((e) => (
          <Row
            key={e.id}
            entry={e}
            lang={lang}
            numbered={numbered[e.level - 1]!}
            onGo={() => {
              const closed = onGone?.() ?? false
              controller.goToHeading(e.id, closed ? { focus: true } : undefined)
            }}
          />
        ))}
      </ul>
    </aside>
  )
}

function Row({
  entry,
  lang,
  numbered,
  onGo,
}: {
  entry: OutlineEntry
  lang: string | undefined
  numbered: boolean
  onGo: () => void
}) {
  // the original whole in the tooltip, its line being cut at the sidebar's edge
  const { props, tip } = useTip(entry.original, undefined, { side: 'right' })
  const translated = entry.title !== entry.original
  return (
    <li data-entry={entry.id} data-level={entry.level}>
      {/* one link the row: named by what it shows, in order, the number, the translation and the original, each title in the
          language it is in (WCAG 2.5.3, 3.1.2) */}
      <a
        href={`#h${entry.id}`}
        onClick={(e) => {
          e.preventDefault()
          onGo()
        }}
        {...props}
      >
        {numbered && <span className="n">{entry.number}</span>}
        <span className="tt">
          {/* a heading not yet translated: its original in the translation's place, in the paper's language, once */}
          <span className="t" lang={translated ? lang : 'en'}>
            {entry.title}
          </span>
          {translated && (
            <span className="o" lang="en">
              {entry.original}
            </span>
          )}
        </span>
      </a>
      {tip}
    </li>
  )
}
