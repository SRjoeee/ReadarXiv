// The shared types of image translation (DESIGN §15): the content side sends OCR requests, the background has them
// recognised, and both must agree on one shape. Neither Dexie nor a provider is imported here; the content bundle must not carry them (§8.0).
import type { ProviderErrorKind } from '@/providers/types'

/** Normalised corners, top-left origin: [top-left, top-right, bottom-right, bottom-left] (§15.3) */
export type Quad = [[number, number], [number, number], [number, number], [number, number]]

export interface OcrLine {
  text: string
  quad: Quad
  /** The recogniser's confidence, 0–1; the SVG path reads exactly and says 1 */
  conf: number
  /**
   * Text direction in radians, absent when upright. The SVG path (§15.5) reads it from the glyph
   * transform; the recogniser sets it on a line it read on its side, a quarter turn either way (§15.3).
   */
  angle?: number
  /**
   * The label's own box when it is not axis-aligned, as fractions of the figure's **width** —
   * `len` along the baseline, `thick` across it. The quad's axis-aligned bounds are bigger than a
   * tilted label and in two different scales (x of the width, y of the height), so they cannot
   * place it; these can, and a single axis keeps the two comparable (§15.5). Set whenever `angle`
   * is; absent means the overlay falls back to the axis-aligned box.
   */
  len?: number
  thick?: number
}

export interface OcrResult {
  width: number
  height: number
  lines: OcrLine[]
  /** The image's frame count; > 1 is an animation — the page shows some later frame than a recogniser would read — and gets no overlay */
  frames?: number
}

/** content → background: OCR one image. The bytes were hashed on the content side already; the background looks the cache up by the hash alone */
export interface OcrCall {
  /** The SHA-256 of the image bytes (shared/digest.ts) */
  imageHash: string
  /** The image bytes, base64-encoded */
  image: string
  mime: string
  /** The paper id; cache records are indexed by it (cleared together) */
  paper: string
  /** The session id: queued recognitions are withdrawn on restore / tab close */
  scope?: string
}

export type OcrMessageResponse =
  | { ok: true; result: OcrResult; cached: boolean }
  | { ok: false; error: { kind: ProviderErrorKind; message: string } }

/** The offscreen document's answer to the background (§15.3): the result, or why there is none */
export type OcrRunResponse =
  | { ok: true; result: OcrResult }
  | { ok: false; kind: ProviderErrorKind; message: string }

/** The image translation's progress (serialisable like Progress, for the popup): total, entered the viewport, done, failed */
export interface ImageProgress {
  total: number
  requested: number
  done: number
  failed: number
  /** Why it stopped after a configuration-level error (auth / no-key); the popup offers no futile retry by it */
  fatal?: string
}
