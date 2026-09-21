// The recogniser of bitmap figures (DESIGN §15.3): PP-OCRv6 tiny on ONNX Runtime's WebAssembly build, in whatever
// worker the host gives it — the extension's offscreen document today, a web page's worker tomorrow. No extension
// API here (hard rule 8): the runtime and the three model files are handed in.
//
// Detection's postprocess and the decoding are eSearch-OCR's (`esearch-ocr`, Apache-2.0); two things are ours, both
// measured over 39 figures of 7 papers against Apple Vision (`research/browser-ocr/NOTES.md`, 2026-09-21):
// - **A line is cut from the original**, not from the reduced image detection ran on (geometry.ts).
// - **A tall line is read both ways round** and the more confident reading kept. PaddleOCR turns a tall crop
//   counter-clockwise and leaves the rest to a text-line orientation model; a chart's y-axis label reads from the
//   bottom up, so without that model it is read upside down — `slaselep` for `datasets` — and 5 of 52 words in
//   rotated labels came out right in the official SDK, 6 in eSearch-OCR, 1 in ppu-paddle-ocr. Read both ways, 48.
import { init } from 'esearch-ocr'
import type { OcrLine } from '@/shared/ocr'
import { cutOf, detectScale, isTall, normalise, type PixelQuad, sideways, turned } from './geometry'

type Ort = Parameters<typeof init>[0]['ort']

export interface RecogniserAssets {
  /** ONNX Runtime, its WebAssembly paths and thread count already set by the host */
  ort: Ort
  detection: ArrayBuffer
  recognition: ArrayBuffer
  /** The recognition model's characters, one a line */
  dictionary: string
}

export interface Recogniser {
  recognise(image: ImageBitmap): Promise<OcrLine[]>
}

export interface Reading {
  quad: PixelQuad
  /** Which way a tall line was turned to be read; an upright line has none */
  turn?: 'up' | 'down'
  text?: string
  conf?: number
}

/**
 * Of a line's readings — one, or the two ways round of a tall line, from the bottom up first — the one read with the
 * most confidence; of two equally confident the first, which is the way nine in ten rotated labels read (8.5 % of
 * glyphs at −90° against 0.1 % at +90° in the SVG corpus, §15.5). None when nothing was read
 */
export function pick(readings: readonly Reading[]): Reading | undefined {
  let best: Reading | undefined
  for (const reading of readings) if (reading.text && (!best || (reading.conf ?? 0) > (best.conf ?? 0))) best = reading
  return best
}

/**
 * White under the figure, as the page has it. A canvas starts transparent, which the models — three channels, no
 * alpha — read as black: a plot saved with a transparent ground came back with its black letters on black and not a
 * line found (measured: three labels read on white, none on transparent; Codex on #281). The cut gets it too, where a
 * turned line's corners reach past the image
 */
function paper(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
}

function cut(image: ImageBitmap, quad: PixelQuad): ImageData {
  const { width, height, matrix } = cutOf(quad)
  const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no 2d context')
  paper(context, width, height)
  context.imageSmoothingQuality = 'high'
  context.setTransform(...matrix)
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, width, height)
}

export async function createRecogniser(assets: RecogniserAssets): Promise<Recogniser> {
  const models = await init({
    ort: assets.ort,
    ortOption: { executionProviders: ['wasm'] },
    det: { input: assets.detection },
    // The library's space recovery is for older models: over the 233 multi-word lines of the sample it changed nothing
    rec: { input: assets.recognition, decodeDic: assets.dictionary, optimize: { space: false } },
  })
  return {
    async recognise(image) {
      const scale = detectScale(image.width, image.height)
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const reduced = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })
      if (!reduced) throw new Error('no 2d context')
      paper(reduced, width, height)
      reduced.drawImage(image, 0, 0, width, height)
      const found = await models.det(reduced.getImageData(0, 0, width, height))

      const lines = found.map(({ box }): Reading[] => {
        const quad = box.map(([x, y]) => [x * image.width / width, y * image.height / height]) as PixelQuad
        return isTall(quad) ? (['up', 'down'] as const).map(turn => ({ quad: turned(quad, turn), turn })) : [{ quad }]
      })
      const readings = lines.flat()
      if (readings.length === 0) return []
      // The library hands back the box it was given, and leaves out what it read with too little confidence: a
      // reading is found again by its own quad
      const read = await models.rec(readings.map(r => ({ box: r.quad, img: cut(image, r.quad), style: { bg: [255, 255, 255], text: [0, 0, 0] } })))
      const byQuad = new Map<unknown, Reading>(readings.map(r => [r.quad, r]))
      for (const { box, text, mean } of read) Object.assign(byQuad.get(box) ?? {}, { text, conf: mean })
      return lines.flatMap(each => {
        const best = pick(each)
        if (!best?.text) return []
        const line: OcrLine = { text: best.text, conf: best.conf ?? 0, quad: normalise(best.quad, image.width, image.height) }
        return [best.turn ? { ...line, ...sideways(best.quad, best.turn, image.width) } : line]
      })
    },
  }
}
