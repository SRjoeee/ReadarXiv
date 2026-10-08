// The status capsule (the reader's design, §6.6): the document area's bottom centre, 58 px up, above the pills. A status
// region present from the first paint, so that what it says later is announced; it rises in (240 ms) and leaves lighter
// (160 ms); a new state of the same kind changes its words in place, moving with its box (Capsule, capsule-motion.ts).
// A load or a translation under way has no capsule: the progress line under the toolbar shows it (ProgressLine), and its
// words are said here. A notice has a close of its own, remembered for the visit (the partial notice's does not close the
// count of failed passages it stood before), and its retry chip where the run stopped for a reason a retry mends
// (status.ts capsuleOf); the sentence for a write storage refused (S-R-22) is one of them, an error that stays until it
// is closed or a later write lands. The narrow window's words leave by themselves after 5 s of being read, waiting while
// the pointer is over them or they hold the focus (the maintainer, 2026-10-01). Settings that cannot be read are said
// for as long as it is so, with the way to the settings page and no close (S-R-21). A paper that cannot be had as a bilingual PDF has no close: its HTML version is a link, opened where
// the settings say — a new tab, or this one, the reader's own or the PDF page it lies over (`_top`; a click lets a frame
// navigate its page). A failure never takes the focus; the card's reason is said in this region
import { Info, X } from 'lucide'
import { type FocusEvent, type HTMLAttributes, useEffect, useId, useRef, useState } from 'react'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from '@/ui/controls/Icon'
import { Capsule as Drawn } from './Capsule'
import { settingsUrl } from './links'
import { TippedButton } from './TippedButton'
import { type Capsule, capsuleOf, cardOf, spokenOf } from './status'
import { useReader } from './use-reader'

export function StatusCapsule({ controller, onChooseLanguage }: { controller: ReaderController; onChooseLanguage: () => void }) {
  // each closable notice is closed apart (status.ts Seen)
  const [closed, setClosed] = useState({ partial: false, notice: false })
  const [narrowShown, setNarrowShown] = useState(false)
  // the refused writes closed: a new refusal is told again
  const [refusalsSeen, setRefusalsSeen] = useState(0)
  const now = useReader(controller, s => capsuleOf(s, { partialClosed: closed.partial, noticeClosed: closed.notice, narrowShown, refusalsSeen }))
  // the card fills the translation's pane and takes no focus: its reason is said here, where it is announced
  const card = useReader(controller, cardOf)
  // a load or a translation under way: said here, shown by the progress line alone
  const spoken = useReader(controller, spokenOf)
  const sameTab = useReader(controller, s => s.settings?.reading.openIn === 'same-tab')
  // a capsule that goes is kept 160 ms, leaving (reader.css .capsule[data-out]); one that comes replaces it at once
  const [leaving, setLeaving] = useState<Capsule | null>(null)
  const last = useRef<Capsule | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: run as the capsule's words change (equal words are one object), not on every render (capsuleOf makes a new capsule each time)
  useEffect(() => {
    if (!now && last.current) {
      setLeaving(last.current)
      const t = setTimeout(() => setLeaving(null), 160)
      last.current = null
      return () => clearTimeout(t)
    }
    last.current = now
    setLeaving(null)
  }, [now?.kind, now?.words])
  const linger = useTimedLeave(now?.kind === 'narrow', NARROW_MS, () => setNarrowShown(true))
  const capsule = now ?? leaving
  // words alone, no chip at the end: padded there as at the start (reader.css)
  const alone = capsule?.kind === 'narrow' || (capsule?.kind === 'unavailable' && !capsule.href)
  // the capsule that leaves by itself holds nothing a keyboard can reach, so it is a stop of its own while it is shown: a
  // group its words name, whose focus holds it as the pointer does. The others are reached by
  // their actions
  const words = useId()
  const timed = capsule?.kind === 'narrow' && now !== null ? { tabIndex: 0, role: 'group', 'aria-labelledby': words } : {}
  const link = capsule && (capsule.kind === 'unavailable' || capsule.kind === 'partial') && capsule.href
  return (
    <div role="status" className="capsule-slot">
      {card && <span className="sr-only">{card.reason}</span>}
      {spoken && <span className="sr-only">{spoken}</span>}
      {capsule && (
        <Drawn key={capsule.kind} kind={capsule.kind} icon={Info} words={capsule.words} wordsId={words} alone={alone} out={now === null} {...timed} {...linger}
          // what follows the words, named by what it holds: another brings it in with the motion
          afterKey={`${link ? 'link' : ''}|${capsule.kind === 'notice' ? capsule.action : capsule.kind === 'unreadable' ? 'settings' : ''}`}
          after={
            capsule.kind === 'narrow' || (capsule.kind === 'unavailable' && !link) ? null : (
              <>
                {capsule.kind === 'unreadable' && <a data-action className="chip" href={settingsUrl()} target="_blank" rel="noopener">{S.settings}</a>}
                {capsule.kind === 'notice' && capsule.action === 'retry' && <button type="button" data-action className="chip" onClick={controller.retry}>{S.failed.retry}</button>}
                {link && <a data-action className="chip" href={link} target={sameTab ? '_top' : '_blank'} rel="noopener">{R.status.useHtml}</a>}
                {capsule.kind === 'unsupported' && <button type="button" data-action className="chip" onClick={onChooseLanguage}>{R.status.chooseLanguage}</button>}
                {(capsule.kind === 'notice' || capsule.kind === 'partial' || capsule.kind === 'saveFailed') && (
                  <TippedButton label={R.status.close} side="top" className="close" onClick={() => (capsule.kind === 'saveFailed' ? setRefusalsSeen(controller.getState().refusals) : setClosed(c => ({ ...c, [capsule.kind === 'partial' ? 'partial' : 'notice']: true })))}>
                    <Icon node={X} size={13} />
                  </TippedButton>
                )}
              </>
            )
          }
        />
      )}
    </div>
  )
}

/** how long the narrow window's words are read before they leave (S-R-14; the maintainer, 2026-10-01) */
export const NARROW_MS = 5000

/**
 * A capsule that leaves by itself after `ms` of being read: the time stands while the pointer is over it or it holds the
 * focus, and the rest of it runs once neither does (the maintainer, 2026-10-01). `on` starts it afresh, the pointer and
 * the focus as if elsewhere — a capsule just drawn has had neither — and `leave` is called once the time is out. The
 * handlers go on the capsule; the website's capsule leaves the same way
 */
export function useTimedLeave(on: boolean, ms: number, leave: () => void): HTMLAttributes<HTMLElement> {
  const at = useRef({ on: false, left: ms, since: 0, timer: 0, pointer: false, focus: false })
  const go = () => {
    const s = at.current
    if (!s.on || s.timer || s.pointer || s.focus) return
    s.since = Date.now()
    s.timer = window.setTimeout(() => { s.timer = 0; s.on = false; leave() }, s.left)
  }
  const stand = () => {
    const s = at.current
    if (!s.timer) return
    clearTimeout(s.timer)
    s.timer = 0
    s.left -= Date.now() - s.since
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: started as `on` turns, its handlers reading the ref
  useEffect(() => {
    if (!on) return
    Object.assign(at.current, { on: true, left: ms, pointer: false, focus: false })
    go()
    return () => { stand(); at.current.on = false }
  }, [on, ms])
  return {
    onPointerEnter: () => { at.current.pointer = true; stand() },
    onPointerLeave: () => { at.current.pointer = false; go() },
    onFocus: () => { at.current.focus = true; stand() },
    // a focus moved within the capsule does not count as gone
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      at.current.focus = false
      go()
    },
  }
}
