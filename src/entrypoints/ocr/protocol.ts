// What the offscreen document and its worker say to each other (DESIGN §15.3)
import type { ProviderErrorKind } from '@/providers/types'
import type { OcrResult } from '@/shared/ocr'

export interface OcrWorkerRequest {
  id: number
  /** The image bytes, base64-encoded, as they came from the page */
  image: string
  mime: string
}

export type OcrWorkerReply =
  /** `warm`: the recogniser has started in this worker — the runtime compiled, the models loaded. A figure that needed none of it (an animation) is answered without */
  | { id: number; ok: true; result: OcrResult; warm: boolean }
  | { id: number; ok: false; kind: ProviderErrorKind; message: string }
