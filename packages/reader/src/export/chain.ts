// The translated PDF and the side-by-side PDF made in the page from what the reader holds: arXiv's bytes, the add-on (one
// incremental section over them: each translated unit's ink in optional content, every group on) and each page's laid Page
// (what the reader paints). Each file is arXiv's bytes, the add-on and ONE more incremental section of ours (the engine's
// object layer, `openObjects`, and section writer, `appendSection`), so nothing of the original is parsed whole or written
// again:
//
// - translation: each laid page's dict written again under its own number, its content one stream: the add-on's with the ink
//   of the groups the page turns off baked out (bake.ts), then the translation as real text (each served slice a Type0 font
//   over its CFF subset, fonts.ts and cff.ts), each crop the original's element ink (a form of the page's content with that
//   member's element and label groups alone, clipped as the reader cuts it), each link where the reader draws it. The
//   catalog's default view lists the groups turned off (a form the add-on wrapped inside keeps its own groups).
// - side by side: every page's dict written again under its own number (every destination and outline entry still points at
//   it), twice as wide: on the left a form of the original page's own content streams (arXiv's, which the add-on never
//   rewrites) with the page's own annotations; on the right the translated page as a form, its links moved by the page's
//   width. A page with nothing laid shows the original on both sides.
import {
  appendSection,
  openObjects,
  openWalker,
  type PdfArray,
  type PdfDict,
  type PdfLib,
  type PdfNumber,
  type PdfObject,
  type PdfRawStream,
  type PdfRef,
} from '@readarxiv/engine'
import type { Item, Page } from '../compose/page.ts'
import { cropsOf, faceScale } from '../compose/paint.ts'
import { type BakeStats, makeBaker, newBakeStats } from './bake.ts'
import { fontBodies, fontFileOf, type SfntFont } from './fonts.ts'

/** how a run's characters are drawn: the slice font and glyph of a code point in a face (the reader's rule: the first family
 *  of the font string whose face holds it), null for none; and each UTF-16 index's offset from the run's start at 100 px, as
 *  the browser sets the run (its kerning), for a run laid without per-character places */
export interface Glyphs {
  glyph(face: string, cp: number): { font: SfntFont; gid: number } | null
  offsets(face: string, text: string): number[]
}

export type ExportForm = 'translation' | 'side-by-side'

/** a file the export will not write: `glyphs`, a character of the translation that no slice of its face draws (a file with a
 *  hole where the reader shows a letter is no translation of the page; the reader's own rule draws such a run's element as
 *  the original's ink, so none is expected), `aborted`, the reader's cancel */
export class ExportRefusal extends Error {
  declare code: 'glyphs' | 'aborted'
  constructor(code: 'glyphs' | 'aborted', why: string) {
    super(why)
    this.code = code
  }
}

export interface ExportInput {
  /** arXiv's bytes and the add-on after them (the composed document the reader reads) */
  composed: Uint8Array
  /** where the add-on begins */
  seam: number
  /** each laid page, by its number */
  pages: ReadonlyMap<number, Page>
  glyphs: Glyphs
  /** the object layer (@cantoo/pdf-lib), given by the host */
  PL: PdfLib
  form: ExportForm
  /** a crop's margin round its ink, PDF units (the reader's: a device pixel at its scale) */
  px?: number
  /** told each page as it is done, and the fonts at the end */
  progress?: (done: number, of: number) => void
  /** the reader's cancel: the export stops at its next page (ExportRefusal 'aborted') */
  signal?: AbortSignal
}

export interface ExportStats {
  pages: number
  laidPages: number
  runs: number
  glyphs: number
  blanks: number
  missing: number
  ligatures: number
  crops: number
  links: number
  groupsOff: number
  membersUnheld: number
  rotated: number
  fonts: number
  /** fonts the subset refused, embedded whole, and their deflated bytes */
  fontsWhole: number
  fontBytesWhole: number
  /** fonts of TrueType outlines (CIDFontType2) */
  fontsTrueType: number
  fontBytes: number
  bake: BakeStats
  cropBake: BakeStats
  cropForms: number
  sectionBytes: number
  ms: Record<string, number>
}

const enc = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const f2 = (v: number) => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}
/** PDFDocEncoding's bytes whose characters are not their own code (ISO 32000-1 Annex D.2, as PDF.js's stringToPDFString
 *  reads them): 0x18 to 0x1F, 0x80 to 0x9E, 0xA0; 0x7F, 0x9F and 0xAD are their own */
const PDF_DOC: Readonly<Record<number, number>> = Object.fromEntries(
  [
    [0x18, [0x2d8, 0x2c7, 0x2c6, 0x2d9, 0x2dd, 0x2db, 0x2da, 0x2dc]],
    [
      0x80,
      [
        0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044, 0x2039, 0x203a, 0x2212, 0x2030, 0x201e, 0x201c,
        0x201d, 0x2018, 0x2019, 0x201a, 0x2122, 0xfb01, 0xfb02, 0x141, 0x152, 0x160, 0x178, 0x17d, 0x131, 0x142, 0x153,
        0x161, 0x17e,
      ],
    ],
    [0xa0, [0x20ac]],
  ].flatMap(([at, cps]) => (cps as number[]).map((cp, i) => [cp, (at as number) + i])),
)
const pdfDocByte = (cp: number): number | null =>
  PDF_DOC[cp] ?? (cp <= 0xff && !(cp >= 0x18 && cp <= 0x1f) && !(cp >= 0x80 && cp <= 0x9e) && cp !== 0xa0 ? cp : null)
/** the bytes of a text from the paper as PDF writes a string's or a name's, in the encoding a reader decodes back to it:
 *  PDFDocEncoding where every character has a byte there, else UTF-16BE with its byte order mark (ISO 32000-1 §7.9.2.2). A
 *  PDFDocEncoding text that would open as a byte order mark (þÿ, ÿþ, ï»¿) is UTF-16BE too: a reader would decode it as one */
const bytesOf = (s: string): number[] => {
  const doc = [...s].map((c) => pdfDocByte(c.codePointAt(0) as number))
  if (doc.every((b) => b !== null) && !/^(\u00fe\u00ff|\u00ff\u00fe|\u00ef\u00bb\u00bf)/.test(s)) return doc as number[]
  const out = [0xfe, 0xff]
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) >> 8, s.charCodeAt(i) & 255)
  return out
}
/** a PDF literal string of `s`: its bytes, a parenthesis and the backslash escaped, any byte outside ' ' to '~' by its octal
 *  code (ISO 32000-1 §7.3.4.2) — text of the paper's never written as PDF syntax */
const pdfStr = (s: string) =>
  `(${bytesOf(s)
    .map((b) =>
      b === 0x28 || b === 0x29 || b === 0x5c
        ? `\\${String.fromCharCode(b)}`
        : b < 0x20 || b > 0x7e
          ? `\\${b.toString(8).padStart(3, '0')}`
          : String.fromCharCode(b),
    )
    .join('')})`
/** a PDF name of `s`: its bytes, every one outside '!' to '~', a delimiter or '#' written #xx (ISO 32000-1 §7.3.5) */
const pdfName = (s: string) =>
  `/${bytesOf(s)
    .map((b) =>
      b < 0x21 || b > 0x7e || '()<>[]{}/%#'.includes(String.fromCharCode(b))
        ? `#${b.toString(16).toUpperCase().padStart(2, '0')}`
        : String.fromCharCode(b),
    )
    .join('')}`
/** a number of the paper's as PDF writes one, null where it is none */
const pdfNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? f2(v) : 'null')
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
/** the Latin ligatures a face may hold at their compatibility code points, longest first */
const LIGS: [string, number][] = [
  ['ffi', 0xfb03],
  ['ffl', 0xfb04],
  ['ff', 0xfb00],
  ['fi', 0xfb01],
  ['fl', 0xfb02],
]
/** a run's oblique slant (`skew`), as the reader draws it: 12° */
const OBLIQUE = Math.tan((12 * Math.PI) / 180)

async function deflate(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

/** one of the two files: arXiv's bytes and the add-on (the composed document, as given) and the section of ours after them */
export async function exportPdf(o: ExportInput): Promise<{ parts: Uint8Array[]; stats: ExportStats }> {
  const ms: Record<string, number> = {}
  let t = performance.now()
  const lap = (k: string) => {
    const n = performance.now()
    ms[k] = Math.round(n - t)
    t = n
  }
  const { composed, seam, PL } = o
  const bound = { PL, objectsMax: 5_000_000, decodedMax: 1 << 30 }
  const X = openObjects(composed, bound)
  const XO = openObjects(composed.subarray(0, seam), bound)
  // (the walk reads the composed document through X, as the file does: nothing of it loaded whole, engine openWalker)
  const baker = makeBaker(openWalker(X, { PL }))
  lap('objects')
  const { PDFRef, PDFDict, PDFArray, PDFName, PDFNumber, PDFRawStream } = PL
  const N = (n: string) => PDFName.of(n)
  const look = (v: PdfObject | undefined, D = X): PdfObject | undefined =>
    v instanceof PDFRef ? D.lookup(v as PdfRef) : v
  const lit = (v: PdfObject): string =>
    v instanceof PDFRef
      ? `${(v as PdfRef).objectNumber} ${(v as PdfRef).generationNumber} R`
      : v instanceof PDFDict
        ? `<<${(v as PdfDict)
            .entries()
            .map(([k, x]) => ` ${k.toString()} ${lit(x)}`)
            .join('')} >>`
        : v instanceof PDFArray
          ? `[${(v as PdfArray).asArray().map(lit).join(' ')}]`
          : v.toString()
  const nums = (v: PdfObject | undefined): number[] | null => {
    const a = look(v)
    if (!(a instanceof PDFArray)) return null
    return (a as PdfArray).asArray().map((x) => {
      const y = look(x)
      return y instanceof PDFNumber ? (y as PdfNumber).asNumber() : 0
    })
  }
  const dictOf = (v: PdfObject | undefined, D = X) => {
    const d = look(v, D)
    return d instanceof PDFDict ? (d as PdfDict) : undefined
  }
  const pages = X.pages()
  const opages = XO.pages()
  if (pages.length !== opages.length) throw new Error(`pages: composed ${pages.length}, original ${opages.length}`)

  // ---- the groups: each optional content group of ours by its name. Ours are those the add-on brought: a group the paper's
  // own catalog lists is the paper's, whatever its name, and stays as the paper set it
  const root = X.lookup(X.trailer.root as PdfRef) as PdfDict
  const rootRef = X.trailer.root as PdfRef
  const ocpV = root.get(N('OCProperties'))
  const ocp = dictOf(ocpV)
  const groupsOf = (D: typeof X, ocProps: PdfDict | undefined): PdfObject[] => {
    const a = ocProps ? look(ocProps.get(N('OCGs')), D) : undefined
    return a instanceof PDFArray ? (a as PdfArray).asArray() : []
  }
  const paperGroups = new Set(
    groupsOf(XO, dictOf((XO.lookup(XO.trailer.root as PdfRef) as PdfDict | undefined)?.get(N('OCProperties')), XO)).map(
      (r) => lit(r),
    ),
  )
  const groupRef = new Map<string, string>()
  const groupName = new Map<string, string>()
  for (const r of groupsOf(X, ocp)) {
    const s = dictOf(r)?.get(N('Name'))?.decodeText?.()
    if (s && r instanceof PDFRef && !paperGroups.has(lit(r))) {
      groupRef.set(s, lit(r))
      groupName.set(lit(r), s)
    }
  }

  // ---- the objects written, numbered from the document's size on
  let next = X.size
  const take = () => next++
  /** an object written: its number, its bytes, its generation (an object of the document's written again keeps its own) */
  type W = [number, Uint8Array] | [number, Uint8Array, number]
  const objs: W[] = []
  const objText = (n: number, body: string, g = 0) => enc(`${n} ${g} obj\n${body}\nendobj\n`)
  const objStream = (n: number, dict: string, data: Uint8Array) =>
    cat([enc(`${n} 0 obj\n<<${dict} /Length ${data.length} >>\nstream\n`), data, enc('\nendstream\nendobj\n')])
  const stats: ExportStats = {
    pages: pages.length,
    laidPages: 0,
    runs: 0,
    glyphs: 0,
    blanks: 0,
    missing: 0,
    ligatures: 0,
    crops: 0,
    links: 0,
    groupsOff: 0,
    membersUnheld: 0,
    rotated: 0,
    fonts: 0,
    fontsWhole: 0,
    fontBytesWhole: 0,
    fontsTrueType: 0,
    fontBytes: 0,
    bake: newBakeStats(),
    cropBake: newBakeStats(),
    cropForms: 0,
    sectionBytes: 0,
    ms,
  }

  // ---- fonts: every slice drawn, one Type0 font each, its glyphs gathered as the pages are drawn
  const fonts = new Map<string, { f: SfntFont; num: number; res: string; used: Map<number, [number, string]> }>()
  const fontOf = (f: SfntFont) => {
    let e = fonts.get(f.key)
    if (!e) {
      e = { f, num: take(), res: `AXTF${fonts.size}`, used: new Map() }
      fonts.set(f.key, e)
    }
    return e
  }
  const box = (i: number) => {
    const inh = pages[i]!.inherited
    return nums(inh.CropBox) ?? nums(inh.MediaBox) ?? [0, 0, 612, 792]
  }
  const streamsOf = (v: PdfObject | undefined, D: typeof X): PdfRawStream[] => {
    const c = look(v, D)
    if (c instanceof PDFRawStream) return [c as PdfRawStream]
    if (c instanceof PDFArray) return (c as PdfArray).asArray().map((x) => look(x, D) as PdfRawStream)
    return []
  }
  const decoded = (s: PdfRawStream) => PL.decodePDFRawStream(s).decode()
  /** a page's ours(prop) over the groups `off` turns off (every other group of ours left on) */
  const oursFor = (i: number, isOff: (name: string) => boolean) => {
    const props = dictOf(dictOf(pages[i]!.inherited.Resources)?.get(N('Properties')))
    return (prop: string): boolean | null => {
      const r = props?.get(N(prop))
      const nm = r ? groupName.get(lit(r)) : undefined
      return nm === undefined ? null : isOff(nm)
    }
  }

  // ---- arXiv's own objects, for the left half of a side-by-side page. The add-on writes some of them again under their numbers
  // (a page, its resources, a form it wraps the figure text of in our groups), which the default view then turns off: the left
  // half names, for each object its drawing reaches that reaches one the add-on wrote again, a copy of arXiv's revision of it
  // under a number of ours (an incremental update keeps every earlier revision: XO reads arXiv's bytes alone), and every other
  // object by its own number, the same in both revisions
  const keyOf = (r: PdfRef) => `${r.objectNumber} ${r.generationNumber}`
  const rewritten = (r: PdfRef) => {
    const e = X.entryOf(r.objectNumber)
    return !!e && e.t === 1 && e.off >= seam
  }
  /** each object of arXiv's reached so far: the references it holds */
  const edges = new Map<string, PdfRef[]>()
  const refsIn = (v: PdfObject | undefined, out: PdfRef[]) => {
    if (v instanceof PDFRef) out.push(v as PdfRef)
    else if (v instanceof PDFArray) for (const x of (v as PdfArray).asArray()) refsIn(x, out)
    else if (v instanceof PDFDict) for (const [, x] of (v as PdfDict).entries()) refsIn(x, out)
    else if (v instanceof PDFRawStream) refsIn((v as PdfRawStream).dict, out)
  }
  const reach = (start: PdfObject | undefined) => {
    const todo: PdfRef[] = []
    refsIn(start, todo)
    while (todo.length) {
      const r = todo.pop()!
      const k = keyOf(r)
      if (edges.has(k)) continue
      const out: PdfRef[] = []
      refsIn(XO.lookup(r), out)
      edges.set(k, out)
      todo.push(...out)
    }
  }
  /** the objects reached that reach one the add-on wrote again (themselves included): copied */
  let copied = new Set<string>()
  const taint = () => {
    const back = new Map<string, string[]>()
    for (const [k, out] of edges) for (const r of out) back.set(keyOf(r), [...(back.get(keyOf(r)) ?? []), k])
    const seen = new Set<string>()
    const todo = [...edges.keys()].filter((k) => {
      const [n, g] = k.split(' ').map(Number) as [number, number]
      return rewritten(PDFRef.of(n, g) as PdfRef)
    })
    while (todo.length) {
      const k = todo.pop()!
      if (seen.has(k)) continue
      seen.add(k)
      todo.push(...(back.get(k) ?? []))
    }
    copied = seen
  }
  const copyNum = new Map<string, number>()
  /** `v` written as arXiv's: a reference to an object copied names its copy */
  const litA = (v: PdfObject): string =>
    v instanceof PDFRef
      ? copied.has(keyOf(v as PdfRef))
        ? `${copyOf(v as PdfRef)} 0 R`
        : lit(v)
      : v instanceof PDFDict
        ? `<<${(v as PdfDict)
            .entries()
            .map(([k, x]) => ` ${k.toString()} ${litA(x)}`)
            .join('')} >>`
        : v instanceof PDFArray
          ? `[${(v as PdfArray).asArray().map(litA).join(' ')}]`
          : v.toString()
  /** arXiv's revision of `r` under a number of ours (its references to other copies remapped; a stream's bytes as they are) */
  function copyOf(r: PdfRef): number {
    const k = keyOf(r)
    const had = copyNum.get(k)
    if (had) return had
    const m = take()
    copyNum.set(k, m)
    const v = XO.lookup(r)
    if (v instanceof PDFRawStream) {
      const st = v as PdfRawStream
      const dict = st.dict
        .entries()
        .filter(([key]) => key.toString() !== '/Length')
        .map(([key, x]) => ` ${key.toString()} ${litA(x)}`)
        .join('')
      objs.push([m, objStream(m, dict, st.contents)])
    } else objs.push([m, objText(m, v ? litA(v) : 'null')])
    return m
  }

  // ---- the original pages as forms: their own content streams (raw where there is one)
  const formOf = new Map<number, number>()
  const originalForm = async (i: number): Promise<number> => {
    const had = formOf.get(i)
    if (had) return had
    const n = take()
    formOf.set(i, n)
    const op = opages[i]!
    const res = op.inherited.Resources
    reach(res)
    taint()
    const head = ` /Type /XObject /Subtype /Form /BBox [${box(i).map(f2).join(' ')}] /Resources ${res ? litA(res) : '<< >>'}`
    const ss = streamsOf(op.node.get(N('Contents')), XO)
    if (ss.length === 1) {
      const d = ss[0]!.dict
      const filt = d.get(N('Filter')),
        parms = d.get(N('DecodeParms'))
      objs.push([
        n,
        objStream(
          n,
          `${head}${filt ? ` /Filter ${litA(filt)}` : ''}${parms ? ` /DecodeParms ${litA(parms)}` : ''}`,
          ss[0]!.contents,
        ),
      ])
    } else
      objs.push([
        n,
        objStream(n, `${head} /Filter /FlateDecode`, await deflate(cat(ss.flatMap((s) => [decoded(s), enc('\n')])))),
      ])
    return n
  }

  /** a crop's source: the composed page's content with the ink of member `ord`'s element and label groups alone; the
   *  original page's form where the page holds no group of the member, or its walk is refused */
  const cropForms = new Map<string, number>()
  const cropForm = async (i: number, ord: number): Promise<number> => {
    const key = `${i}:${ord}`
    const had = cropForms.get(key)
    if (had) return had
    const want = new Set([`axt:${ord}.${i + 1}.e`, `axt:${ord}.${i + 1}.l`])
    const kept = [...want].some((g) => groupRef.has(g))
      ? baker.bake(
          i,
          oursFor(i, (nm) => !want.has(nm)),
          stats.cropBake,
          true,
        )
      : null
    if (!kept) {
      const f = await originalForm(i)
      cropForms.set(key, f)
      return f
    }
    const n = take()
    cropForms.set(key, n)
    const res = pages[i]!.inherited.Resources
    objs.push([
      n,
      objStream(
        n,
        ` /Type /XObject /Subtype /Form /BBox [${box(i).map(f2).join(' ')}] /Resources ${res ? lit(res) : '<< >>'} /Filter /FlateDecode`,
        await deflate(kept),
      ),
    ])
    stats.cropForms++
    return n
  }

  const destsByName = !!dictOf(dictOf(root.get(N('Names')))?.get(N('Dests')))
  /** a link's annotation, its box moved by (dx, dy) */
  const linkBody = (l: Page['links'][number], dx: number, dy = 0): string => {
    const [b, to, , border] = l
    let target: string
    if ('url' in to) target = `/A << /S /URI /URI ${pdfStr(encodeURI(to.url).replace(/%25/g, '%'))} >>`
    else if (to.dest.startsWith('[')) {
      // (an explicit destination: a page's reference, its fit's name, its numbers; anything else null)
      const d = JSON.parse(to.dest) as unknown[]
      const items = (Array.isArray(d) ? d : []).map((x) => {
        if (x && typeof x === 'object' && 'num' in x) {
          const { num, gen } = x as { num: unknown; gen?: unknown }
          return Number.isInteger(num) && (num as number) > 0
            ? `${num} ${Number.isInteger(gen) && (gen as number) >= 0 ? gen : 0} R`
            : 'null'
        }
        if (x && typeof x === 'object' && 'name' in x && typeof (x as { name: unknown }).name === 'string')
          return pdfName((x as { name: string }).name)
        return pdfNum(x)
      })
      target = `/Dest [${items.join(' ')}]`
    } else {
      const name = JSON.parse(to.dest) as unknown
      const s = typeof name === 'string' ? name : String(to.dest)
      target = destsByName ? `/Dest ${pdfStr(s)}` : `/Dest ${pdfName(s)}`
    }
    const bd = border
      ? ` /C [${[16, 8, 0].map((s) => f2(((border[1] >> s) & 255) / 255)).join(' ')}] /BS << /W ${f2(border[0])}${border[2] === 'dashed' ? ' /S /D' : border[2] === 'underline' ? ' /S /U' : ''} >>`
      : ' /Border [0 0 0]'
    return `<< /Type /Annot /Subtype /Link /Rect [${f2(b[0] + dx)} ${f2(b[1] + dy)} ${f2(b[2] + dx)} ${f2(b[3] + dy)}]${bd} ${target} >>`
  }

  /** a laid page's drawing: its runs as text, its crops as the original's ink, the fonts and forms it names */
  const drawing = async (page: Page): Promise<{ ops: string; xobj: Map<string, number>; fontsUsed: Set<string> }> => {
    const out: string[] = []
    const xobj = new Map<string, number>()
    const fontsUsed = new Set<string>()
    // (each crop drawn where it stands in its line, between the words before and after it, so that a reader that reads a page's
    // text in its stream's order reads a formula's own glyphs in their sentence: cropsOf gives one a crop item, in the same
    // order the lines hold them)
    const px = o.px ?? 0.375
    const crops = cropsOf(page, { x: px, y: px })
    let nextCrop = 0
    const drawCrop = async (c: (typeof crops)[number]) => {
      stats.crops++
      const fn = await cropForm(c.from - 1, c.ord)
      const nm = `AXTC${c.from}_${c.ord}`
      xobj.set(nm, fn)
      const k = (c.at[2] - c.at[0]) / (c.src[2] - c.src[0] || 1)
      const tx = c.at[0] - k * c.src[0],
        ty = c.at[1] - k * c.src[1]
      const clip = (c.clip ?? [c.at])
        .map((r) => `${f2(r[0])} ${f2(r[1])} ${f2(r[2] - r[0])} ${f2(r[3] - r[1])} re`)
        .join(' ')
      out.push(`q ${clip} W n ${f2(k)} 0 0 ${f2(k)} ${f2(tx)} ${f2(ty)} cm /${nm} Do Q`)
    }
    for (const m of page.members) {
      if (m.state !== 'laid') continue
      for (const [y, x0, , items] of m.lines)
        for (const it of items as Item[]) {
          if ('src' in it) {
            const c = crops[nextCrop++]
            if (c) await drawCrop(c)
            continue
          }
          stats.runs++
          const size = it.size * faceScale(it.face)
          const track = it.track ?? 0
          const s = it.s
          const offs = it.dx?.length ? null : o.glyphs.offsets(it.face, s)
          // (each glyph: its CID in its font and its offset along the run)
          const gs: { e: ReturnType<typeof fontOf>; cid: number; x: number }[] = []
          let ci = 0
          for (let i = 0; i < s.length; ) {
            const cp = s.codePointAt(i) as number
            const w = cp > 0xffff ? 2 : 1
            const at = it.dx?.length
              ? (it.dx[it.dx.length === s.length ? i : ci] ?? it.dx[it.dx.length - 1]!)
              : offs![i]! * (it.size / 100) + ci * track
            let g = o.glyphs.glyph(it.face, cp)
            let text = String.fromCodePoint(cp)
            let span = w
            if (g && !track && !it.dx?.length)
              for (const [seq, lig] of LIGS) {
                if (!s.startsWith(seq, i)) continue
                const lg = g.font.cmap.get(lig)
                if (lg) {
                  g = { font: g.font, gid: lg }
                  text = seq
                  span = seq.length
                  stats.ligatures++
                }
                break
              }
            if (!g) {
              if (/\s/.test(text)) stats.blanks++
              else stats.missing++
            } else {
              const e = fontOf(g.font)
              const cid = g.font.cid(g.gid)
              if (!e.used.has(cid)) e.used.set(cid, [g.gid, text])
              gs.push({ e, cid, x: at })
              stats.glyphs++
            }
            i += span
            ci += [...text].length
          }
          if (!gs.length) continue
          const [ux, uy] = it.dir ?? [1, 0]
          const rise = it.rise ?? 0
          const along = it.dir ? it.x - x0 : 0
          const px = it.dir ? x0 + along * ux - rise * uy : it.x
          const py = it.dir ? y + along * uy + rise * ux : y + rise
          const sk = it.skew ? OBLIQUE : 0
          const lin = [ux, uy, sk * ux - uy, sk * uy + ux].map(f2).join(' ')
          const fill = it.fill ?? 0
          out.push(`BT ${[16, 8, 0].map((sh) => f2(((fill >> sh) & 255) / 255)).join(' ')} rg`)
          // (a TJ a font, each glyph moved to its place from where the one before it left the pen)
          let k = 0
          while (k < gs.length) {
            const e = gs[k]!.e
            fontsUsed.add(e.res)
            out.push(`/${e.res} ${f2(size)} Tf`)
            const start = gs[k]!.x
            out.push(`${lin} ${f2(px + start * ux)} ${f2(py + start * uy)} Tm`)
            let pen = start
            const parts: string[] = []
            for (; k < gs.length && gs[k]!.e === e; k++) {
              const g = gs[k]!
              const adj = -((g.x - pen) * 1000) / size
              if (Math.abs(adj) > 0.05) parts.push(f2(adj))
              parts.push(`<${hex4(g.cid)}>`)
              pen = g.x + (e.f.advance(e.used.get(g.cid)![0]) / e.f.upem) * size
            }
            out.push(`[${parts.join(' ')}] TJ`)
          }
          out.push('ET')
        }
    }
    // (a crop the lines do not reach in their order, none expected: drawn after them)
    for (; nextCrop < crops.length; nextCrop++) await drawCrop(crops[nextCrop]!)
    return { ops: out.join('\n'), xobj, fontsUsed }
  }

  /** a resources dict with fonts and forms of ours beside its own */
  const merged = (res: PdfObject | undefined, fontsUsed: Set<string>, xobj: Map<string, number>): string => {
    const d = dictOf(res)
    const keep = (d?.entries() ?? []).filter(([k]) => k.toString() !== '/Font' && k.toString() !== '/XObject')
    const sub = (key: string, extra: string[]) => {
      const own = (dictOf(d?.get(N(key)))?.entries() ?? []).map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      return own.length || extra.length ? ` /${key} <<${own.join('')}${extra.join('')} >>` : ''
    }
    const fe = [...fontsUsed].map((r) => ` /${r} ${[...fonts.values()].find((e) => e.res === r)!.num} 0 R`)
    const xe = [...xobj].map(([k, n]) => ` /${k} ${n} 0 R`)
    return `<<${keep.map(([k, v]) => ` ${k.toString()} ${lit(v)}`).join('')}${sub('Font', fe)}${sub('XObject', xe)} >>`
  }
  const pageEntries = (node: PdfDict, drop: string[]) =>
    node
      .entries()
      .filter(([k]) => !drop.includes(k.toString()))
      .map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      .join('')
  const annotsOf = (node: PdfDict): { others: PdfObject[]; links: PdfObject[] } => {
    const a = look(node.get(N('Annots')))
    const others: PdfObject[] = [],
      links: PdfObject[] = []
    for (const r of a instanceof PDFArray ? (a as PdfArray).asArray() : [])
      (look(dictOf(r)?.get(N('Subtype')))?.toString() === '/Link' ? links : others).push(r)
    return { others, links }
  }
  /** an annotation of the page copied as an object of ours, its box (and its quadrilaterals) moved by (dx, dy) */
  const movedAnnot = (r: PdfObject, dx: number, dy: number): string | null => {
    const d = dictOf(r)
    if (!d) return null
    const at = (k: string) => nums(d.get(N(k)))
    const rect = at('Rect') ?? [0, 0, 0, 0]
    const quads = at('QuadPoints')
    const an = take()
    const rest = d
      .entries()
      .filter(([k]) => !['/Rect', '/P', '/QuadPoints'].includes(k.toString()))
      .map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      .join('')
    const q = quads ? ` /QuadPoints [${quads.map((v, k) => f2(v + (k % 2 ? dy : dx))).join(' ')}]` : ''
    objs.push([
      an,
      objText(
        an,
        `<<${rest} /Rect [${f2(rect[0]! + dx)} ${f2(rect[1]! + dy)} ${f2(rect[2]! + dx)} ${f2(rect[3]! + dy)}]${q} >>`,
      ),
    ])
    return `${an} 0 R`
  }
  /**
   * Where a side-by-side page's two copies stand, as it shows: the page keeps its /Rotate, and the copies are laid along the
   * axis it shows across, the original first. Turned 90 degrees a page shows its user space's y across (its top to the right),
   * so the translation stands a page's height above the original; turned 180 or 270, the axis it shows across runs the other
   * way, so the original stands a page's width (or height) along it and the translation at the page's own place.
   */
  const sidesOf = (b: number[], rotate: number) => {
    const W = b[2]! - b[0]!,
      H = b[3]! - b[1]!
    const across = rotate % 180 ? ([0, H] as const) : ([W, 0] as const)
    return rotate >= 180
      ? { left: across, right: [0, 0] as const, across }
      : { left: [0, 0] as const, right: across, across }
  }
  /** a side-by-side page: its box twice as wide as it shows, the left form and the right form where they stand, their
   *  annotations */
  const writeSide = (
    num: number,
    g: number,
    node: PdfDict,
    b: number[],
    left: number,
    right: number,
    ann: string[],
    at: ReturnType<typeof sidesOf>,
  ) => {
    const c = take()
    // (a copy at the page's own place is drawn where it stands, unmoved)
    const move = (x: number, y: number) => (x || y ? `1 0 0 1 ${f2(x)} ${f2(y)} cm ` : '')
    const [lx, ly] = at.left,
      [rx, ry] = at.right,
      [ax, ay] = at.across
    objs.push([c, objStream(c, '', enc(`q ${move(lx, ly)}/AXTL Do Q q ${move(rx, ry)}/AXTR Do Q\n`))])
    // (every box the page shows by written on it, twice as wide as it shows: its media and crop boxes, whatever it inherits,
    // and its own bleed, trim and art boxes where it has them)
    const wide = (r: number[]) => `[${f2(r[0]!)} ${f2(r[1]!)} ${f2(r[2]! + ax)} ${f2(r[3]! + ay)}]`
    const own = ['BleedBox', 'TrimBox', 'ArtBox']
      .map((k) => [k, nums(node.get(N(k)))] as const)
      .filter((x): x is readonly [string, number[]] => !!x[1] && x[1].length === 4)
      .map(([k, r]) => ` /${k} ${wide(r)}`)
      .join('')
    objs.push([
      num,
      objText(
        num,
        `<<${pageEntries(node, ['/Contents', '/Resources', '/Annots', '/MediaBox', '/CropBox', '/TrimBox', '/BleedBox', '/ArtBox'])} /MediaBox ${wide(b)} /CropBox ${wide(b)}${own} /Contents ${c} 0 R /Resources << /XObject << /AXTL ${left} 0 R /AXTR ${right} 0 R >> >>${ann.length ? ` /Annots [${ann.join(' ')}]` : ''} >>`,
        g,
      ),
      g,
    ])
  }

  const off: string[] = []
  const side = o.form === 'side-by-side'
  const stop = () => {
    if (o.signal?.aborted) throw new ExportRefusal('aborted', 'the export was cancelled')
  }
  for (let i = 0; i < pages.length; i++) {
    stop()
    const n = i + 1
    const pn = pages[i]!
    const node = pn.node
    const num = pn.ref.objectNumber
    const gen = pn.ref.generationNumber
    const b = box(i)
    const r = look(pn.inherited.Rotate)
    const turn = r instanceof PDFNumber ? (r as PdfNumber).asNumber() : 0
    const rotate = turn % 90 ? 0 : ((turn % 360) + 360) % 360
    if (rotate) stats.rotated++
    const at = sidesOf(b, rotate)
    // (the paper's own annotations, where the original stands: as they are at the page's place, else copies moved to it)
    const ownAt = (rs: PdfObject[]) =>
      at.left[0] || at.left[1]
        ? rs.map((r) => movedAnnot(r, at.left[0], at.left[1])).filter((x): x is string => !!x)
        : rs.map(lit)
    const p0 = o.pages.get(n)
    // (a member whose groups the document does not hold stays the original's, as the reader shows it)
    let page: Page | null = null
    const pageOff = new Set<string>()
    if (p0) {
      const members = p0.members.map((m) => {
        if (m.state !== 'laid' || !m.off) return m
        const names = ([1, 2, 4] as const)
          .filter((bit) => m.off & bit)
          .map((bit) => `axt:${m.ord}.${n}.${bit === 1 ? 't' : bit === 2 ? 'e' : 'l'}`)
        if (names.every((g) => groupRef.has(g))) {
          for (const g of names) {
            off.push(groupRef.get(g)!)
            pageOff.add(g)
          }
          return m
        }
        stats.membersUnheld++
        return { ...m, state: 'kept' as const, lines: [] }
      })
      if (members.some((m) => m.state === 'laid')) page = { ...p0, members }
    }
    const { others, links: oLinks } = annotsOf(node)
    if (page) {
      stats.laidPages++
      const d = await drawing(page)
      const res = merged(pn.inherited.Resources, d.fontsUsed, d.xobj)
      // (the add-on's streams with the groups the page turns off baked out, then ours)
      const kept =
        baker.bake(
          i,
          oursFor(i, (nm) => pageOff.has(nm)),
          stats.bake,
        ) ?? cat(streamsOf(node.get(N('Contents')), X).flatMap((s) => [decoded(s), enc('\n')]))
      const zb = await deflate(cat([enc('q\n'), kept, enc(`\nQ\n${d.ops}\n`)]))
      if (!side) {
        const mine = take()
        objs.push([mine, objStream(mine, ' /Filter /FlateDecode', zb)])
        // (its links as the reader draws them, in place of the page's own link annotations)
        const tl: number[] = []
        for (const l of page.links) {
          const an = take()
          objs.push([an, objText(an, linkBody(l, 0))])
          tl.push(an)
          stats.links++
        }
        const ann = [...others.map(lit), ...tl.map((x) => `${x} 0 R`)]
        objs.push([
          num,
          objText(
            num,
            `<<${pageEntries(node, ['/Contents', '/Resources', '/Annots'])} /Contents ${mine} 0 R /Resources ${res}${ann.length ? ` /Annots [${ann.join(' ')}]` : ''} >>`,
            gen,
          ),
          gen,
        ])
      } else {
        const left = await originalForm(i)
        const tf = take()
        objs.push([
          tf,
          objStream(
            tf,
            ` /Type /XObject /Subtype /Form /BBox [${b.map(f2).join(' ')}] /Resources ${res} /Filter /FlateDecode`,
            zb,
          ),
        ])
        const sl: string[] = []
        for (const l of page.links) {
          const an = take()
          objs.push([an, objText(an, linkBody(l, at.right[0], at.right[1]))])
          sl.push(`${an} 0 R`)
          stats.links++
        }
        writeSide(num, gen, node, b, left, tf, [...ownAt([...oLinks, ...others]), ...sl], at)
      }
    } else if (side) {
      // the original on both sides, its links copied onto the right
      const left = await originalForm(i)
      const sl: string[] = []
      for (const r of oLinks) {
        const an = movedAnnot(r, at.right[0], at.right[1])
        if (!an) continue
        sl.push(an)
        stats.links++
      }
      writeSide(num, gen, node, b, left, left, [...ownAt([...oLinks, ...others]), ...sl], at)
    }
    o.progress?.(i + 1, pages.length + 1)
  }
  lap('pages')
  if (stats.missing) throw new ExportRefusal('glyphs', `${stats.missing} characters no slice of their face draws`)
  stop()

  // ---- the fonts, written once their glyphs are known: each subset to the glyphs drawn
  for (const e of fonts.values()) {
    const ids = { type0: e.num, cidFont: take(), desc: take(), file: take(), toUni: take() }
    const file = fontFileOf(e.f, new Set([...e.used.values()].map((u) => u[0])))
    const z = await deflate(file.bytes)
    stats.fontBytes += z.length
    if (e.f.kind === 'ttf') stats.fontsTrueType++
    if (file.whole) {
      stats.fontsWhole++
      stats.fontBytesWhole += z.length
    }
    const body = fontBodies(e.f, e.used, ids)
    objs.push(
      [ids.type0, objText(ids.type0, body.type0)],
      [ids.cidFont, objText(ids.cidFont, body.cidFont)],
      [ids.desc, objText(ids.desc, body.desc)],
      [ids.file, objStream(ids.file, `${file.dict} /Filter /FlateDecode`, z)],
      [ids.toUni, objStream(ids.toUni, ' /Filter /FlateDecode', await deflate(enc(body.toUnicode)))],
    )
  }
  stats.fonts = fonts.size
  lap('fonts')

  // ---- the catalog: the laid units' groups off in the default view
  stats.groupsOff = off.length
  if (ocp) {
    // (the paper's own default view kept as it set it — its base state, its groups on and off —, ours turned off and out of the
    // ON list the add-on put them in)
    const d = dictOf(ocp.get(N('D')))
    const refs = (k: string) => {
      const a = d ? look(d.get(N(k))) : undefined
      return a instanceof PDFArray ? (a as PdfArray).asArray().map((r) => lit(r)) : []
    }
    const offSet = new Set(off)
    const on = refs('ON').filter((r) => !offSet.has(r))
    const offAll = [...refs('OFF').filter((r) => !offSet.has(r)), ...off]
    const dKeep = (d?.entries() ?? []).filter(([k]) => !['/ON', '/OFF'].includes(k.toString()))
    const ocpBody = `<<${ocp
      .entries()
      .filter(([k]) => k.toString() !== '/D')
      .map(([k, v]) => ` ${k.toString()} ${lit(v)}`)
      .join(
        '',
      )} /D <<${dKeep.map(([k, v]) => ` ${k.toString()} ${lit(v)}`).join('')}${on.length ? ` /ON [${on.join(' ')}]` : ''} /OFF [${offAll.join(' ')}] >> >>`
    if (ocpV instanceof PDFRef) {
      const r = ocpV as PdfRef
      objs.push([r.objectNumber, objText(r.objectNumber, ocpBody, r.generationNumber), r.generationNumber])
    } else
      objs.push([
        rootRef.objectNumber,
        objText(
          rootRef.objectNumber,
          `<<${pageEntries(root, ['/OCProperties'])} /OCProperties ${ocpBody} >>`,
          rootRef.generationNumber,
        ),
        rootRef.generationNumber,
      ])
  }
  const section = appendSection({
    end: composed.length,
    objects: objs.map(([n, b, g]) => [n, g ?? 0, b]),
    kind: X.kind,
    prev: X.startxref,
    size: next,
    trailer: { root: String(X.trailer.root), info: X.trailer.info?.toString(), id: X.trailer.id?.toString() },
  }).bytes
  stats.sectionBytes = section.length
  lap('write')
  o.progress?.(pages.length + 1, pages.length + 1)
  return { parts: [composed, section], stats }
}
