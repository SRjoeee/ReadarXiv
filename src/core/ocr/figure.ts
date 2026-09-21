// One figure's bytes to the result the image pipeline reads (DESIGN §15.2): decoded as the browser shows it, counted
// for frames, recognised.
import type { OcrResult } from '@/shared/ocr'
import type { Recogniser } from './recognise'

/** How many frames the image has: over one it is an animation, and the page is showing some later frame than the one a recogniser would read */
async function framesOf(image: Blob): Promise<number> {
  if (typeof ImageDecoder === 'undefined' || !(await ImageDecoder.isTypeSupported(image.type))) return 1
  // The whole file at once: from a stream the count is only what has arrived so far
  const decoder = new ImageDecoder({ data: await image.arrayBuffer(), type: image.type })
  try {
    await decoder.tracks.ready
    return decoder.tracks.selectedTrack?.frameCount ?? 1
  } finally {
    decoder.close()
  }
}

/**
 * `recogniser` starts it, and is asked only once there is something to read: an animation — or a file that does not
 * decode — is answered without 14 MB of WebAssembly compiled and two models loaded, to be held for a minute, for a
 * figure that gets no overlay (Codex on #281)
 */
export async function readFigure(image: Blob, recogniser: () => Promise<Recogniser>): Promise<OcrResult> {
  // `createImageBitmap` turns the pixels by the file's EXIF orientation, as the page's <img> does: the corners come
  // out in the frame the reader sees
  const bitmap = await createImageBitmap(image)
  // One after the other, inside the `try`: counted beside the decoding, a count that rejected left a bitmap that had
  // decoded with nobody to close it (Devin on #281). The count is a few milliseconds
  try {
    const frames = await framesOf(image)
    const { width, height } = bitmap
    // An animation gets no overlay (§15.2), so there is nothing to read it for
    if (frames > 1) return { width, height, frames, lines: [] }
    return { width, height, frames, lines: await (await recogniser()).recognise(bitmap) }
  } finally {
    bitmap.close()
  }
}
