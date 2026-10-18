// The progress line along the toolbar's foot (the reader's design, §6.6; the maintainer, 2026-09-25): 2 px, quiet ink,
// its length the share of the process done — the PDF's download, the paragraphs translated, the final (status.ts lineOf):
// one line that never starts again (the maintainer, 2026-10-02). It grows by a transform, on the compositor; it fades
// out at the length it reached. Decorative: the capsule says in words what is under way, in the status region
import { useRef } from 'react'
import type { ReaderController } from '../controller'
import { lineOf } from './status'
import { useReader } from './use-reader'

/** a stage just begun still shows, as a sliver */
const START = 0.02

export function ProgressLine({ controller }: { controller: ReaderController }) {
  const line = useReader(controller, lineOf)
  // the length it leaves at: the longest it had while on, so that it never runs back within a process (a run again
  // counts its paragraphs from what it has); a process begun after the line had left — a translation asked for once the
  // original was read — is a line of its own (key), from its start, rather than the last one shrinking back
  const last = useRef(START), runs = useRef(0), wasOn = useRef(false)
  if (line.on && !wasOn.current) { runs.current++; last.current = START }
  wasOn.current = line.on
  if (line.on) last.current = Math.max(last.current, line.value)
  return <div key={runs.current} className="progress-line" aria-hidden="true" data-on={line.on || undefined} style={{ '--p': last.current } as React.CSSProperties} />
}
