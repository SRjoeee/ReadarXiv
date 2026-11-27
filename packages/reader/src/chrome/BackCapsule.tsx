// The way back (link previews' §3.7, UI.md S-R-29): one capsule, its words S-R-29's, while a jump inside the paper can be gone back from —
// an arrow and its words, no page number, one state: it never shrinks and never changes, whatever the depth, and a press goes
// back one jump (the browser's Back and a scroll back to the place left do the same, the reader's jump stack). Side by side, at
// the document area's foot centre, on the pills' line and in their dress, moved with the area by the contents; with one pane
// shown (a narrow window, one display), the first segment of that pane's page pill (PagePill.tsx), which stays shown while it
// is, so that the capsule never changes shape under the thumb. It rises in and sinks out (reader.css); its name is its words.
import { Undo2 } from 'lucide'
import { useEffect, useState } from 'react'
import { Icon, R } from '@readarxiv/ui'
import type { ReaderController, ReaderState } from './model.ts'
import { useReader } from './use-reader.ts'

/** how long the capsule stays to sink out once there is no way back, ms (reader.css `--out`'s 160 ms, and a frame) */
const OUT_MS = 170

/** whether one pane alone is shown (the capsule then joins its pill), and which */
export const onePane = (s: Pick<ReaderState, 'narrow' | 'display'>): 'left' | 'right' | null =>
  s.display === 'original' ? 'left' : s.narrow || s.display === 'translation' ? 'right' : null

/** the capsule's button, alone or as a pill's segment */
export function BackButton({ controller, out = false }: { controller: ReaderController; out?: boolean }) {
  return (
    <button type="button" className="back" data-out={out || undefined} onClick={() => controller.back()}>
      <Icon node={Undo2} size={14} />
      <span>{R.back}</span>
    </button>
  )
}

/** the capsule alone, side by side: shown while there is a way back, then sinking out */
export function BackCapsule({ controller }: { controller: ReaderController }) {
  const { back, alone } = useReader(controller, (s) => ({ back: s.back, alone: onePane(s) !== null }))
  const want = back && !alone
  const [shown, setShown] = useState(want)
  useEffect(() => {
    if (want) {
      setShown(true)
      return
    }
    const t = setTimeout(() => setShown(false), OUT_MS)
    return () => clearTimeout(t)
  }, [want])
  if (!want && !shown) return null
  // (one pane shown at once takes it into its pill: no sinking capsule left beside it)
  if (alone) return null
  return (
    <div className="chrome back-slot">
      <BackButton controller={controller} out={!want} />
    </div>
  )
}
