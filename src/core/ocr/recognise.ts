// The recogniser of bitmap figures (DESIGN §15.3): PP-OCRv6 tiny on ONNX Runtime, in whatever worker the host gives it —
// the extension's offscreen document, on the runtime's WebAssembly build, and the web's compile box, whose maker child runs
// the runtime's native CPU build under Node over the same three model files (PDF-READER §19.15; the two builds read the same
// text on 818 of 818 lines, DESIGN §15.4). No extension API here (hard rule 8): the runtime, its session options, the three
// model files and the host's canvases are handed in.
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
type SessionOptions = NonNullable<Parameters<typeof init>[0]['ortOption']>

/** A 2D canvas of the host's: the browser's OffscreenCanvas, or one a server's canvas library makes (@napi-rs/canvas) */
export type Surface = Pick<OffscreenCanvas, 'width' | 'height' | 'getContext'>
/** What a figure is drawn from: a decoded image (an ImageBitmap), or a surface holding its pixels */
export type Drawable = CanvasImageSource & { readonly width: number; readonly height: number }

export interface RecogniserAssets {
  /** ONNX Runtime, its WebAssembly paths and thread count already set by the host */
  ort: Ort
  /**
   * The sessions' options: the execution providers and threads of the runtime the host gives. Absent: the WebAssembly build's
   * (`wasm`, its threads set on `ort.env`), the extension's. The web's box gives onnxruntime-node's CPU provider, one thread
   */
  session?: SessionOptions
  detection: ArrayBuffer | Uint8Array
  recognition: ArrayBuffer | Uint8Array
  /** The recognition model's characters, one a line */
  dictionary: string
  /**
   * The host's canvases, which the recogniser and eSearch-OCR draw on: `canvas(width, height)` a blank 2D surface,
   * `imageData(data, width, height)` its pixel type. Absent: the browser's own, OffscreenCanvas and ImageData (the
   * extension's worker). A server has neither, and gives a canvas library's (the web's compile box: @napi-rs/canvas, Skia
   * as Chrome's canvas is)
   */
  canvas?: (width: number, height: number) => Surface
  imageData?: (data: Uint8ClampedArray, width: number, height: number) => ImageData
}

/** A figure's pixels, RGBA a pixel, as a decoder gives them (the server's: a PDF's image, PDF.js's decoding of it) */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Recogniser {
  recognise(image: Drawable): Promise<OcrLine[]>
  /** The same over a figure's pixels: put on a surface of the host's, and read as the page shows them, over white */
  recognisePixels(pixels: Pixels): Promise<OcrLine[]>
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

type Canvas = (width: number, height: number) => Surface
const browserCanvas: Canvas = (width, height) => new OffscreenCanvas(width, height)

function context2d(canvas: Canvas, width: number, height: number): OffscreenCanvasRenderingContext2D {
  const context = canvas(width, height).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!context) throw new Error('no 2d context')
  return context
}

function cut(canvas: Canvas, image: Drawable, quad: PixelQuad): ImageData {
  const { width, height, matrix } = cutOf(quad)
  const context = context2d(canvas, width, height)
  paper(context, width, height)
  context.imageSmoothingQuality = 'high'
  context.setTransform(...matrix)
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, width, height)
}

export async function createRecogniser(assets: RecogniserAssets): Promise<Recogniser> {
  const canvas = assets.canvas ?? browserCanvas
  const models = await init({
    ort: assets.ort,
    ortOption: assets.session ?? { executionProviders: ['wasm'] },
    det: { input: assets.detection },
    // The library's space recovery is for older models: over the 233 multi-word lines of the sample it changed nothing
    rec: { input: assets.recognition, decodeDic: assets.dictionary, optimize: { space: false } },
    // (the host's canvases, where it gives its own: the library makes its own surfaces and pixel data by them)
    ...(assets.canvas ? { canvas: assets.canvas } : {}),
    ...(assets.imageData ? { imageData: assets.imageData } : {}),
  })
  const recognise = async (image: Drawable): Promise<OcrLine[]> => {
    const scale = detectScale(image.width, image.height)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const reduced = context2d(canvas, width, height)
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
    const read = await models.rec(readings.map(r => ({ box: r.quad, img: cut(canvas, image, r.quad), style: { bg: [255, 255, 255], text: [0, 0, 0] } })))
    const byQuad = new Map<unknown, Reading>(readings.map(r => [r.quad, r]))
    for (const { box, text, mean } of read) Object.assign(byQuad.get(box) ?? {}, { text, conf: mean })
    return lines.flatMap(each => {
      const best = pick(each)
      if (!best?.text) return []
      const line: OcrLine = { text: best.text, conf: best.conf ?? 0, quad: normalise(best.quad, image.width, image.height) }
      return [best.turn ? { ...line, ...sideways(best.quad, best.turn, image.width) } : line]
    })
  }
  return {
    recognise,
    async recognisePixels({ data, width, height }) {
      // (put as they are, then drawn over white by `recognise` as every figure is: putImageData keeps a transparent pixel
      // transparent, and drawImage lays it on the paper, as the page shows it)
      const surface = canvas(width, height)
      const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D | null
      if (!context) throw new Error('no 2d context')
      const make = assets.imageData ?? ((d: Uint8ClampedArray, w: number, h: number) => new ImageData(d as Uint8ClampedArray<ArrayBuffer>, w, h))
      context.putImageData(make(data, width, height), 0, 0)
      return recognise(surface as unknown as Drawable)
    },
  }
}
