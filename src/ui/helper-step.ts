// Where the reader stands with the image-recognition helper (DESIGN §15.3–15.5): one decision, shown by the popup
// under its image row (UI.md S-P-86…88) and by the settings page in its image section (S-O-86). It used to be written
// out on each surface, and the order of the questions is the part that must not drift: a finding on one ladder
// (Codex on #157: the installer offered where it cannot run) is a finding on both.
import type { HelperStatus } from '@/shared/ocr'

export type HelperStep =
  /** Not asked yet, or the platform not known yet: nothing can be said */
  | 'detecting'
  | 'ready'
  /** The installer exits at once on anything but macOS, so offering it elsewhere would be a path that cannot work */
  | 'mac-only'
  /** The optional permission comes before the install command (§15.3) */
  | 'allow'
  /** Granted into a worker that was already running: a fresh one is on its way (background/helper-restart.ts) */
  | 'enabling'
  | 'install'

export function helperStep(helper: HelperStatus | null, platform: 'mac' | 'other' | null): HelperStep {
  if (helper === null || platform === null) return 'detecting'
  // A helper that answers is ready wherever it runs; the platform only decides what is offered when it does not
  if (helper.state === 'ready') return 'ready'
  if (platform !== 'mac') return 'mac-only'
  if (helper.state === 'permission-missing') return 'allow'
  if (helper.state === 'restarting') return 'enabling'
  return 'install'
}
