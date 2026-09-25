// The status capsule (the reader's design, §6.6): the document area's bottom centre, 58 px up, above the pills. A status
// region present from the first paint, so that what it says later is announced; it rises in (240 ms) and leaves lighter
// (160 ms); a new state of the same kind changes its words in place. A load or a translation under way has no capsule:
// the progress line under the toolbar shows it (ProgressLine), and its words are said here. A notice has a chip and a
// close, the close remembered for the visit; the narrow window's words leave by themselves after 4 s. A paper that
// cannot be had as a bilingual PDF has no close: its HTML version is a link, opened where the settings say — a new tab,
// or this one, the reader's own or the PDF page it lies over (`_top`; a click lets a frame navigate its page). A
// failure never takes the focus; the card's reason is said in this region
import { Info, X } from 'lucide'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { type Capsule, capsuleOf, cardOf, spokenOf } from './status'
import { useReader } from './use-reader'

export function StatusCapsule({ controller, onChooseLanguage }: { controller: ReaderController; onChooseLanguage: () => void }) {
  const [closed, setClosed] = useState(false)
  const [narrowShown, setNarrowShown] = useState(false)
  const now = useReader(controller, s => capsuleOf(s, { closed, narrowShown }))
  // the card fills the translation's pane and takes no focus: its reason is said here, where it is announced
  const card = useReader(controller, cardOf)
  // a load or a translation under way: said here, shown by the progress line alone
  const spoken = useReader(controller, spokenOf)
  const sameTab = useReader(controller, s => s.settings?.reading.openIn === 'same-tab')
  // a capsule that goes is kept 160 ms, leaving (reader.css .capsule[data-out]); one that comes replaces it at once
  const [leaving, setLeaving] = useState<Capsule | null>(null)
  const last = useRef<Capsule | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: run as the capsule's words change, not on every render (capsuleOf makes a new object each time)
  useEffect(() => {
    if (!now && last.current) {
      setLeaving(last.current)
      const t = setTimeout(() => setLeaving(null), 160)
      last.current = null
      return () => clearTimeout(t)
    }
    last.current = now
    setLeaving(null)
  }, [now?.kind, now?.text])
  useEffect(() => {
    if (now?.kind !== 'narrow') return
    const t = setTimeout(() => setNarrowShown(true), 4000)
    return () => clearTimeout(t)
  }, [now?.kind])
  // the same kind with other words: the words fade in and the capsule's width eases to theirs (200 ms); one read of its
  // width when its words change, which is rare
  const box = useRef<HTMLDivElement>(null)
  const width = useRef<{ kind: string; w: number } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one read of the width as the words change
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !now) { width.current = null; return }
    const w = el.offsetWidth, before = width.current
    if (before && before.kind === now.kind && before.w !== w && !matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ width: `${before.w}px` }, { width: `${w}px` }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    width.current = { kind: now.kind, w }
  }, [now?.kind, now?.text])
  const capsule = now ?? leaving
  // words alone, no chip at the end: padded there as at the start (reader.css)
  const alone = capsule?.kind === 'narrow' || (capsule?.kind === 'unavailable' && !capsule.href)
  return (
    <div role="status" className="capsule-slot">
      {card && <span className="sr-only">{card.reason}</span>}
      {spoken && <span className="sr-only">{spoken}</span>}
      {capsule && (
        <div ref={box} key={capsule.kind} className="chrome capsule" data-kind={capsule.kind} data-alone={alone ? '' : undefined} data-out={now ? undefined : ''}>
          <Icon node={Info} size={15} />
          <span key={capsule.text} className="words">{capsule.text}</span>
          {capsule.kind === 'notice' && (
            <>
              <button type="button" data-action className="chip" onClick={controller.retry}>{S.failed.retry}</button>
              <button type="button" aria-label={R.status.close} className="close" onClick={() => setClosed(true)}>
                <Icon node={X} size={13} />
              </button>
            </>
          )}
          {capsule.kind === 'unavailable' && capsule.href && <a data-action className="chip" href={capsule.href} target={sameTab ? '_top' : '_blank'} rel="noopener">{R.status.useHtml}</a>}
          {capsule.kind === 'unsupported' && <button type="button" data-action className="chip" onClick={onChooseLanguage}>{R.status.chooseLanguage}</button>}
        </div>
      )}
    </div>
  )
}
