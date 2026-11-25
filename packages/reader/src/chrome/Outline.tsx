// The contents (the reader's design, §6.3): the paper's headings, every level shown, each entry its number in a column of its
// own, the translated title (two lines at most) and the original under it (one line), hierarchy by indentation alone: each
// level 12 px in from its parent, its number column as wide as its widest number, so that its titles share one edge. A row
// jumps both sides to its heading and stays unmarked: no entry is marked as the one being read: a press jumps, nothing stays
// selected (§6.3)
import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { R, useTip } from '@readarxiv/ui'
import type { OutlineEntry, ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { useReader } from './use-reader.ts'

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
  // each level's number column: as wide as its widest number as drawn (measured once the entries or the faces change), so
  // that the level's titles start on one edge; none where no entry of the level has a number
  const list = useRef<HTMLUListElement>(null)
  const [widths, setWidths] = useState<readonly number[]>([0, 0, 0])
  useLayoutEffect(() => {
    const measure = () => {
      const w = [0, 0, 0]
      for (const n of list.current?.querySelectorAll<HTMLElement>('[data-level] > a > .n > span') ?? []) {
        const level = Number(n.closest<HTMLElement>('[data-level]')?.dataset.level) || 1
        w[level - 1] = Math.max(w[level - 1]!, Math.ceil(n.getBoundingClientRect().width))
      }
      setWidths((was) => (was.every((x, k) => x === w[k]) ? was : w))
    }
    measure()
    let live = true
    void document.fonts?.ready.then(() => live && measure())
    return () => {
      live = false
    }
  }, [entries])
  const numbered = [1, 2, 3].map((l) => entries.some((e) => e.level === l && e.number))
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
      <ul
        ref={list}
        className="toc-list"
        style={Object.fromEntries(widths.map((w, k) => [`--n${k + 1}`, `${w}px`])) as CSSProperties}
      >
        {entries.map((e) => (
          <Row
            key={e.id}
            entry={e}
            lang={lang}
            numbered={numbered[e.level - 1]!}
            onGo={() => {
              const closed = onGone?.() ?? false
              if (closed) controller.goToHeading(e.id, { focus: true })
              else controller.goToHeading(e.id)
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
        {numbered && (
          <span className="n">
            <span>{entry.number}</span>
          </span>
        )}
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
