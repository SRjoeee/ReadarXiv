// The seam the image pipeline reads through (DESIGN §15.3): one interface, today one implementation — the recogniser
// in the offscreen document (`recogniser.ts`). A hosted recognition service plugs in here when it is built; the OCR
// service (`ocr.ts`) and the cache key do not know which one answers. Cancellation is by scope, as everywhere in the
// background (DESIGN §8.5).
import type { ProviderErrorKind } from '@/providers/types'
import type { OcrResult } from '@/shared/ocr'

export interface OcrBackend {
  /** The build that answers. The OCR cache key is computed from it (DESIGN §15.2) */
  readonly version: string
  /** Recognise one image */
  ocr(request: { image: string; mime: string }, scope?: string): Promise<OcrResult>
  /** Drop the scope's queued and in-flight recognitions (they reject as `aborted`); returns how many */
  cancel(scope: string): number
}

/** What a backend rejects with: a kind the wire error and the image run's policy understand */
export class OcrBackendError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string) {
    super(message)
    this.name = 'OcrBackendError'
  }
}
