// The progress line along the toolbar's foot (the reader's design, §6.6; the maintainer, 2026-09-25): 2 px, quiet ink,
// its length the share of the process done — the PDF's download, the paragraphs translated, the final (status.ts lineOf):
// one line that never starts again (the maintainer, 2026-10-02). It grows by a transform, on the compositor; it fades
// out at the length it reached. Decorative: the capsule says in words what is under way, in the status region
import { useRef } from 'react'
import type { ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { firstOf, heldOf, lineOf } from './status.ts'
import { useReader } from './use-reader.ts'

/** a stage just begun still shows, as a sliver */
const START = 0.02

export function ProgressLine({ controller }: { controller: ReaderController }) {
  // (the original held by the host's rules while the paper is made: its load, as the website's page draws it)
  const { narrow, refusal } = useParts()
  // (the line both ways, with and without a first making before it in this process, and whether the paper is being made now)
  const line = useReader(controller, (s) => {
    const held = heldOf(s, { narrow, refusal })
    const plain = lineOf(s, held, false)
    return {
      on: plain.on,
      plain: plain.value,
      prepared: lineOf(s, held, true).value,
      making: s.phase === 'preparing' || firstOf(s),
    }
  })
  // the length it leaves at: the longest it had while on, so that it never runs back within a process (a run again
  // counts its paragraphs from what it has); a process begun after the line had left — a translation asked for once the
  // original was read — is a line of its own (key), from its start, rather than the last one shrinking back. A process that had
  // the paper's first making has the translation after it take what the prepare's stretch left (status.ts lineOf `prepared`)
  const last = useRef(START),
    runs = useRef(0),
    wasOn = useRef(false),
    prepared = useRef(false)
  if (line.on && !wasOn.current) {
    runs.current++
    last.current = START
    prepared.current = line.making
  } else if (line.making) prepared.current = true
  wasOn.current = line.on
  if (line.on) last.current = Math.max(last.current, prepared.current ? line.prepared : line.plain)
  return (
    <div
      key={runs.current}
      className="progress-line"
      aria-hidden="true"
      data-on={line.on || undefined}
      style={{ '--p': last.current } as React.CSSProperties}
    />
  )
}
