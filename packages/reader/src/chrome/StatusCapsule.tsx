// The status capsule (the reader's design, §6.6): the document area's bottom centre, 58 px up, above the pills. A status
// region present from the first paint, so that what it says later is announced; it rises in (240 ms) and leaves lighter
// (160 ms); a new state of the same kind changes its words in place, moving with its box (Capsule, capsule-motion.ts).
// A load or a translation under way has no capsule: the progress line under the toolbar shows it (ProgressLine), and its
// words are said here; a host that words a run's stages (the website's) has the capsule say them too, with the spinner, once
// the wait has lasted WAIT_SHOWN_MS (a wait the reader cannot perceive is not announced).
// A host's passing words (a toast: the website's "copied") come first, in its words and sign, alone, for their time.
// A notice has a close of its own, remembered for the visit, and its retry chip where the run stopped
// for a reason a retry mends
// (status.ts capsuleOf); the sentence for a write storage refused (S-R-22) is one of them, an error that stays until it
// is closed or a later write lands. The narrow window's words leave by themselves after 5 s of being read, waiting while
// the pointer is over them or they hold the focus (the maintainer, 2026-10-01). Settings that cannot be read are said
// for as long as it is so, with the way to the settings page and no close (S-R-21). A paper that cannot be had as a bilingual PDF has no close: its HTML version is a link, opened where
// the settings say — a new tab, or this one, the reader's own or the PDF page it lies over (`_top`; a click lets a frame
// navigate its page). A failure never takes the focus; the card's reason is said in this region
import { Check, CircleAlert, Clock, Info, type IconNode, X } from 'lucide'
import { type FocusEvent, type HTMLAttributes, useEffect, useId, useRef, useState } from 'react'
import { R, S, Icon } from '@readarxiv/ui'
import type { ReaderController } from './model.ts'
import { Capsule as Drawn } from './Capsule.tsx'
import { useClock } from './clock.ts'
import { linkable } from './links.ts'
import { useParts } from './parts.tsx'
import { TippedButton } from './TippedButton.tsx'
import { textOf } from './capsule-words.ts'
import {
  type Capsule,
  capsuleLook,
  capsuleOf,
  cardOf,
  dueAt,
  originalCardOf,
  retryOffered,
  type Sign,
  spokenOf,
} from './status.ts'
import { useReader } from './use-reader.ts'

/** a capsule's signs by name (status.ts Look); the spinner is the capsule's own */
const SIGNS: Readonly<Record<Exclude<Sign, 'spinner' | 'file'>, IconNode>> = {
  info: Info,
  check: Check,
  clock: Clock,
  alert: CircleAlert,
}

export function StatusCapsule({
  controller,
  onChooseLanguage,
}: {
  controller: ReaderController
  onChooseLanguage: () => void
}) {
  // the notice of failed passages closed, at its count (status.ts Seen)
  const [noticeClosed, setNoticeClosed] = useState(0)
  const [narrowShown, setNarrowShown] = useState(false)
  // the refused writes closed: a new refusal is told again
  const [refusalsSeen, setRefusalsSeen] = useState(0)
  const parts = useParts()
  // the host's rule for the narrow window (parts.tsx `narrow`): where the switch shows it (the website's), its words are owed
  // only where a window that showed the paper side by side was narrowed while reading (narrowWatch)
  const pane = useReader(controller, (s) => ({
    narrow: s.narrow,
    display: s.display,
    pages: Math.max(s.sides.left.pages, s.sides.right.pages),
  }))
  const watch = useRef<NarrowWatch>({ readWide: false, narrowed: false })
  watch.current = narrowWatch(watch.current, pane)
  const owed = parts.narrow !== 'shown' || watch.current.narrowed
  // drawn again once a retry's time has come: its clock gives way, the host's words for it drop the time
  const clock = useClock(useReader(controller, (s) => dueAt(s, Date.now())))
  const wanted = useReader(controller, (s) =>
    capsuleOf(s, { noticeClosed, narrowShown: narrowShown || !owed, refusalsSeen }, parts.languages, parts.words, {
      retry: parts.retry,
      now: clock,
      ...(parts.linkOrigins ? { origins: parts.linkOrigins } : {}),
    }),
  )
  // a capsule that goes is kept 160 ms, leaving (reader.css .capsule[data-out]); one that comes replaces it at once
  const [leaving, setLeaving] = useState<Capsule | null>(null)
  // (a run's capsule once its wait has lasted WAIT_SHOWN_MS, where it begins with nothing on screen; at once where a capsule is,
  // the one leaving too: R4. Every other at once)
  const last = useRef<Capsule | null>(null)
  const now = useWaitShown(wanted, last.current !== null || leaving !== null)
  // the card fills the translation's pane and takes no focus: its reason is said here, where it is announced
  const card = useReader(controller, (s) => cardOf(s, parts.reason, parts.words))
  const originalCard = useReader(controller, (s) => originalCardOf(s, parts.reason, parts.words))
  // a load or a translation under way: said here, shown by the progress line alone
  const spoken = useReader(controller, spokenOf)
  const sameTab = useReader(controller, (s) => s.prefs?.links === 'same-tab')
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
  // a run's capsule (a host's words) says its stage once, with the count it starts at: the count that moves is not said again
  // (the website's), and the status line of the run is its own then, so that nothing is read twice
  const stageSaid = useRef<{ stage: string; words: string } | null>(null)
  if (now?.kind === 'progress' && stageSaid.current?.stage !== now.stage)
    stageSaid.current = { stage: now.stage, words: textOf(now.words) }
  if (now?.kind !== 'progress') stageSaid.current = null
  // a refusal's retry, offered unless the session asks again by itself or the host's rule withholds it until its time
  // (status.ts retryOffered)
  const retryNow = capsule?.kind === 'notNow' && retryOffered(capsule)
  // words alone, no chip at the end: padded there as at the start (reader.css)
  const alone =
    capsule?.kind === 'narrow' ||
    capsule?.kind === 'toast' ||
    (capsule?.kind === 'progress' && !capsule.show) ||
    (capsule?.kind === 'unavailable' && !capsule.href) ||
    (capsule?.kind === 'notNow' && !retryNow && !capsule.href)
  // the capsule that leaves by itself holds nothing a keyboard can reach, so it is a stop of its own while it is shown: a
  // group its words name, whose focus holds it as the pointer does. The others are reached by
  // their actions
  const words = useId()
  const timed =
    capsule?.kind === 'narrow' && now !== null ? { tabIndex: 0, role: 'group', 'aria-labelledby': words } : {}
  const link = capsule && (capsule.kind === 'unavailable' || capsule.kind === 'notNow') && capsule.href
  // the host's settings page, as every link the chrome draws from a host (chrome/links.ts)
  const settings = linkable(parts.settingsHref, parts.linkOrigins)
  // its sign by the host's rule (parts.tsx `signs`), at the time drawn
  const look = useReader(controller, (s) => (capsule ? capsuleLook(capsule, s, parts.signs, clock) : null))
  return (
    <div role="status" className="capsule-slot">
      {originalCard && <span className="sr-only">{originalCard.reason}</span>}
      {card && <span className="sr-only">{card.reason}</span>}
      {/* (a run's capsule says it, once it enters; while its wait is too short to be seen, nothing says it) */}
      {spoken && wanted?.kind !== 'progress' && <span className="sr-only">{spoken}</span>}
      {capsule && look && (
        <Drawn
          key={capsule.kind}
          kind={capsule.kind}
          icon={look.sign === 'spinner' ? 'spinner' : SIGNS[look.sign === 'file' ? 'info' : look.sign]}
          data-tone={look.tone}
          words={capsule.words}
          {...(capsule.kind === 'progress' ? { spoken: now === null ? '' : (stageSaid.current?.words ?? '') } : {})}
          wordsId={words}
          alone={alone}
          out={now === null}
          {...timed}
          {...linger}
          // what follows the words, named by what it holds: another brings it in with the motion
          afterKey={`${link ? 'link' : ''}|${capsule.kind === 'notice' ? capsule.action : capsule.kind === 'unreadable' ? 'settings' : retryNow ? 'retry' : capsule.kind === 'progress' ? 'show' : ''}`}
          after={
            alone ? null : (
              <>
                {capsule.kind === 'unreadable' && settings && (
                  <a data-action className="chip" href={settings} target="_blank" rel="noopener">
                    {S.settings}
                  </a>
                )}
                {capsule.kind === 'progress' && capsule.show && (
                  // the translation shown, as the reader's own choice of a display
                  <button
                    type="button"
                    data-action
                    className="chip"
                    onClick={() => controller.setDisplay('translation')}
                  >
                    {parts.words?.showTranslation}
                  </button>
                )}
                {((capsule.kind === 'notice' && capsule.action === 'retry') || retryNow) && (
                  <button type="button" data-action className="chip" onClick={controller.retry}>
                    {S.failed.retry}
                  </button>
                )}
                {link && (
                  <a data-action className="chip" href={link} target={sameTab ? '_top' : '_blank'} rel="noopener">
                    {(capsule.kind === 'unavailable' || capsule.kind === 'notNow') && capsule.label
                      ? capsule.label
                      : R.status.useHtml}
                  </a>
                )}
                {capsule.kind === 'unsupported' && (
                  <button type="button" data-action className="chip" onClick={onChooseLanguage}>
                    {R.status.chooseLanguage}
                  </button>
                )}
                {(capsule.kind === 'notice' || capsule.kind === 'saveFailed') && (
                  <TippedButton
                    label={R.status.close}
                    side="top"
                    className="close"
                    onClick={() =>
                      capsule.kind === 'saveFailed'
                        ? setRefusalsSeen(controller.getState().refusals)
                        : setNoticeClosed(controller.getState().failedUnits)
                    }
                  >
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
/** how long a run's wait lasts before its capsule enters (the coordinator's decision 3, 2026-11-11): a wait the reader cannot
 *  perceive is not announced. Of the family of the page's mark, which PDF.js shows after 400 ms (`--loading-icon-delay`), and of
 *  the translating marks' 0.3 s delay (styles.ts `--axt-tr-delay`) */
export const WAIT_SHOWN_MS = 400

/**
 * A run's capsule (a host's words for its stage) once its wait has lasted WAIT_SHOWN_MS: none before, and none at all for a wait
 * that ended sooner; once in, it stays through every change of its stage and words (a count that pauses and moves again, our
 * server heard again) until no run's capsule is wanted, when it leaves at once. The gate is for a wait that begins with nothing
 * on screen: where a capsule is (`showing`: the network's words, the failed passages' notice, a run's capsule still leaving) and
 * the state turns into a run, the capsule changes its words in place at once, never a hole of WAIT_SHOWN_MS (the flow-demo,
 * 2026-11-12; the coordinator's R4: the grace never makes a gap after a capsule that was showing). Every other capsule (a refusal,
 * a notice, a toast, an error) at once
 */
export function useWaitShown(wanted: Capsule | null, showing = false): Capsule | null {
  const since = useRef<number | null>(null)
  const shown = useRef(false)
  const [, redraw] = useState(0)
  const waits = wanted?.kind === 'progress'
  if (!waits) {
    since.current = null
    shown.current = false
  } else if (since.current === null) {
    since.current = Date.now()
    if (showing) shown.current = true
  }
  const left = waits && !shown.current ? (since.current as number) + WAIT_SHOWN_MS - Date.now() : 0
  if (waits && left <= 0) shown.current = true
  const pending = waits && !shown.current
  // biome-ignore lint/correctness/useExhaustiveDependencies: armed as the wait begins, its time read from the wait's start
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => redraw((n) => n + 1), left)
    return () => clearTimeout(t)
  }, [pending])
  return pending ? null : wanted
}

/** what the narrow window's words are owed by, where the switch shows the translation alone (the website's rule, its owner's of
 *  2026-11-03): a window that showed the paper side by side (`readWide`: some pages drawn, side by side on screen, the window wide)
 *  and was then narrowed while reading (`narrowed`) says that it shows the translation alone; a page opened in a narrow window
 *  says nothing (its switch shows the translation chosen), and widened again it says nothing either. What it has seen only grows */
export interface NarrowWatch {
  readWide: boolean
  narrowed: boolean
}
export function narrowWatch(was: NarrowWatch, now: { narrow: boolean; display: string; pages: number }): NarrowWatch {
  if (!now.narrow) {
    const readWide = was.readWide || (now.display === 'bilingual' && now.pages > 0)
    return readWide === was.readWide ? was : { readWide, narrowed: was.narrowed }
  }
  const narrowed = was.narrowed || was.readWide
  return narrowed === was.narrowed ? was : { readWide: was.readWide, narrowed }
}

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
    s.timer = window.setTimeout(() => {
      s.timer = 0
      s.on = false
      leave()
    }, s.left)
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
    return () => {
      stand()
      at.current.on = false
    }
  }, [on, ms])
  return {
    onPointerEnter: () => {
      at.current.pointer = true
      stand()
    },
    onPointerLeave: () => {
      at.current.pointer = false
      go()
    },
    onFocus: () => {
      at.current.focus = true
      stand()
    },
    // a focus moved within the capsule does not count as gone
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      at.current.focus = false
      go()
    },
  }
}
