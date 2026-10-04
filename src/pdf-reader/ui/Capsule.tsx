// The one capsule, the extension's and the website's (the reader's design, §6.6): an icon — the spinner for a run under
// way — its words, and what follows them (a chip, a close). The words are drawn in a cell of their own, which the motion
// owns (capsule-motion.ts), with the box's width: the words move with the box as one motion. The cell is hidden from
// assistive technology; a screen reader is told the words whole, or `spoken` where they are other words (a count said
// once a stage), in a line of its own, which changes only as that text does. `afterKey` names what follows the words:
// another key brings the new one in with the motion, and the old one leaves as a picture of it
import { type IconNode, Loader } from 'lucide'
import { type HTMLAttributes, type ReactNode, useLayoutEffect, useRef } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { capsuleMotion, type Motion } from './capsule-motion'
import { type CapsuleWords, textOf } from './capsule-words'

export interface CapsuleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  kind: string
  icon: IconNode | 'spinner'
  words: CapsuleWords
  /** what a screen reader is told, when not the words drawn (a count said once a stage) */
  spoken?: string
  wordsId?: string
  after?: ReactNode
  afterKey?: string
  out?: boolean
  alone?: boolean
}

export function Capsule({ kind, icon, words, spoken, wordsId, after, afterKey = '', out, alone, className, ...rest }: CapsuleProps) {
  const box = useRef<HTMLDivElement>(null), cell = useRef<HTMLSpanElement>(null), tail = useRef<HTMLSpanElement>(null)
  const motion = useRef<Motion | null>(null)
  /** what followed the words as last drawn, and its key */
  const last = useRef<{ key: string | null; el: HTMLElement | null } | null>(null)
  const follows = after === undefined || after === null || after === false ? null : after
  useLayoutEffect(() => {
    const m = capsuleMotion(box.current!, cell.current!)
    motion.current = m
    return () => {
      m.stop()
      motion.current = null
      last.current = null
    }
  }, [])
  // every render: the words, what follows them, or anything that moved the width the box needs (a label in another
  // language); the motion does nothing where nothing changed
  useLayoutEffect(() => {
    const key = follows === null ? null : afterKey, el = follows === null ? null : tail.current
    const before = last.current
    last.current = { key, el }
    const moved = before !== null && before.key !== key
    motion.current?.change(words, moved && el ? [el] : [], moved && before.el ? [before.el] : [])
  })
  return (
    <div ref={box} className={className ? `chrome capsule ${className}` : 'chrome capsule'} data-kind={kind} data-alone={alone ? '' : undefined} data-out={out ? '' : undefined} {...rest}>
      {icon === 'spinner' ? <Icon node={Loader} size={15} className="spin" /> : <Icon node={icon} size={15} />}
      <span ref={cell} className="words" aria-hidden="true" />
      <span id={wordsId} className="sr-only">{spoken ?? textOf(words)}</span>
      {follows !== null && <span key={afterKey} ref={tail} className="after">{follows}</span>}
    </div>
  )
}
