// The progress line along the toolbar's foot (the reader's design, §6.6; the maintainer, 2026-09-25): 2 px, quiet ink,
// its length the share done — the PDF's download while the reader loads, the paragraphs translated while a translation
// runs. It grows by a transform, on the compositor; it fades out at the length it reached. Decorative: the capsule says
// in words what is under way, in the status region
import { useRef } from 'react'
import type { ReaderController } from '../controller'
import { lineOf } from './status'
import { useReader } from './use-reader'

/** a stage just begun still shows, as a sliver */
const START = 0.02

export function ProgressLine({ controller }: { controller: ReaderController }) {
  const line = useReader(controller, lineOf)
  // the length it leaves at: the last one it had while on
  const last = useRef(START)
  if (line.on) last.current = Math.max(START, line.value)
  // a stage is a line of its own (key): the translation's starts afresh rather than the download's shrinking back
  return <div key={line.stage} className="progress-line" aria-hidden="true" data-on={line.on || undefined} style={{ '--p': last.current } as React.CSSProperties} />
}
