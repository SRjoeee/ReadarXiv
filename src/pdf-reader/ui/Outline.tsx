// The contents (the reader's design, §6.3): the paper's headings as a folding tree, one 28 px row each, the translated
// title truncating, the original in its tooltip, the page at the end. The section being read — the last heading above
// the reading line, as the session places it — is marked and its branch opened as the reading moves; the rest folds as
// the reader leaves it
import { ChevronRight } from 'lucide'
import { useEffect, useMemo, useState } from 'react'
import { R } from '@/ui/strings'
import type { ReaderController } from '../controller'
import type { OutlineEntry } from '../outline'
import { Icon } from './icons'
import { useTip } from './tip'
import { useReader } from './use-reader'

export function Outline({ controller, open }: { controller: ReaderController; open: boolean }) {
  const state = useReader(controller)
  const entries = state.outline
  const parents = useMemo(() => entries.map((e, k) => { for (let p = k - 1; p >= 0; p--) if (entries[p]!.level < e.level) return p; return -1 }), [entries])
  const hasKids = (k: number) => parents.includes(k)
  // the section being read is the session's to say, by the reading line: a heading at a page's foot, gone to, is read
  // though PDF.js counts the next page as the one shown
  const current = entries.findIndex(e => e.id === state.currentHeading)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  // the section being read has its branch opened; what the reader folded elsewhere stays folded
  useEffect(() => {
    if (current < 0) return
    setExpanded(old => {
      const next = new Set(old)
      for (let p = parents[current]!; p >= 0; p = parents[p]!) next.add(p)
      return next.size === old.size ? old : next
    })
  }, [current, parents])
  const shownRow = (k: number): boolean => parents[k]! < 0 || (expanded.has(parents[k]!) && shownRow(parents[k]!))
  return (
    <aside className="chrome toc" aria-label={R.contents} hidden={!open}>
      <div className="toc-h">{R.contents}</div>
      <ul className="toc-list">
        {entries.map((e, k) => (
          <Row key={e.id} entry={e} hidden={!shownRow(k)} current={k === current} folds={hasKids(k)} expanded={expanded.has(k)}
            onFold={() => setExpanded(old => { const next = new Set(old); if (next.has(k)) next.delete(k); else next.add(k); return next })}
            onGo={() => controller.goToHeading(e.id)} />
        ))}
      </ul>
    </aside>
  )
}

function Row({ entry, hidden, current, folds, expanded, onFold, onGo }: { entry: OutlineEntry; hidden: boolean; current: boolean; folds: boolean; expanded: boolean; onFold: () => void; onGo: () => void }) {
  const { props, tip } = useTip(entry.original, undefined, { side: 'right' })
  return (
    <li data-entry={entry.id} data-level={entry.level} hidden={hidden}>
      <div className="entry" aria-current={current || undefined}>
        <button type="button" className={`fold${folds ? '' : ' leaf'}`} aria-expanded={folds ? expanded : undefined} aria-label={entry.title} tabIndex={folds ? 0 : -1} aria-hidden={folds ? undefined : 'true'} onClick={onFold}>
          <Icon node={ChevronRight} size={12} />
        </button>
        <a href={`#h${entry.id}`} onClick={e => { e.preventDefault(); onGo() }} {...props}>
          <span className="t">{entry.title}</span>
          {entry.page != null && <span className="p">{entry.page}</span>}
        </a>
        {tip}
      </div>
    </li>
  )
}
