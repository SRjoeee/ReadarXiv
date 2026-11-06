// The OCR result's store key (DESIGN §15.2), apart from translation's: recognition is deterministic and varies with the
// image bytes, the type they were served as and the recogniser's version. **The type is an input**: the frames are
// counted by a decoder chosen by it, and a file served under a type that decoder does not know counts as one frame — so
// the same bytes under another type may be an animation, which is not read at all (Devin on #281)
import { sha256Hex } from '@/shared/digest'

/** Bumped when the OCR result's stored shape or the line-filtering premises change */
const OCR_KEY_VERSION = 1

export function ocrCacheKey(imageHash: string, mime: string, recogniserVersion: string): Promise<string> {
  return sha256Hex(JSON.stringify(['ocr', OCR_KEY_VERSION, imageHash, mime, recogniserVersion]))
}
