// A PDF's ink read once through PDF.js, page by page, by pageInk with the wrap's options (indices, every painted glyph,
// GLYPHS_PAGE and BOXES_PAGE): the pages exactly as the wrap and today's ownership read them (`raw`, pageInk's own results,
// for the modules that take them as they are), and the same pages as the back half's Doc (each glyph with the character code
// and font PDF.js read it by). The one place the back half touches PDF.js; PDF.js itself is handed in, as the engine is
// handed its PDF libraries everywhere.
//
// pageInk copies a glyph's Unicode alone, so each glyph of the operator list carries its code and font character through it,
// joined to its Unicode by a separator no Unicode holds (U+FFFF U+FFFE U+FFFF: spike S1c found that S1's U+0000 is the
// Unicode of txexs's big parentheses), and the two are split again after it. pageInk reads a glyph's Unicode for one thing
// alone, whether it is blank, which is read again from the Unicode split off (the same test).
//
// With `mapped` (A17, today's pageChars2 `nu`), each font's own map is read once (PDF.js's toUnicode, which the document gives
// only opened with fontExtraProperties) and a glyph whose Unicode no character of that map gives, or one no Unicode stands for
// (private use, a replacement character, a control), is `nu`: its text is no reading of its glyph (2307.16209v1's newtx sum
// sign, which PDF.js reads by its code as "Í"). The glyph's state rides through pageInk on the same tag.
import type { Doc, DocGlyph, DocMarks, DocPage, DocTurned } from './doc.ts'
import { PageGlyph } from './glyph.ts'
import { BOXES_PAGE, GLYPHS_PAGE, type PageInk, pageInk } from './ink.types.ts'

/** what the back half needs of PDF.js: its getDocument and its operator codes */
export interface PdfJs {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> }
  OPS: Record<string, number>
}
export interface PdfDocument {
  numPages: number
  getPage(n: number): Promise<PdfPage>
  getMetadata?(): Promise<{ info?: Record<string, unknown> } | null>
}
export interface PdfPage {
  rotate?: number
  view: number[]
  commonObjs: { get(id: string): unknown }
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
  getAnnotations?(): Promise<unknown[]>
  cleanup(): void
}

const SEP = '￿￾￿'

/** one page as read: its Doc page, pageInk's own result (its Unicode restored), and what `extra` made of its operator list */
export interface ReadPage<X> {
  page: DocPage
  raw: PageInk | null
  extra: X | null
  annotations: unknown[] | null
}

export interface ReadOptions<X> {
  /** PDF.js's document options (cMaps, standard fonts, its worker) */
  options?: Record<string, unknown>
  /** pageInk's `turned` (the figures' reading) */
  turned?: boolean
  /** with `turned`: every painted path's lines kept (pageInk's `shapesAll`): arXiv's page, whose figures its own points do not tell */
  shapesAll?: boolean
  /** made of each page's operator list before pageInk reads it (the wrap's alignment facts) */
  extra?: (OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }) => X
  /** read each page's annotations too (A's links) */
  annotations?: boolean
  /** read each font's own map and mark the glyphs it gives no Unicode of (`nu`; opens the document with fontExtraProperties) */
  mapped?: boolean
}

/** a character no Unicode stands for: private use, a replacement character, a control (today's draw.mjs NO_UNICODE) */
const NO_UNICODE = /[\p{Co}\p{Cc}\uFFFD]/u
/** the characters a font's own map gives its glyphs, each value as written and as PDF.js's text layer normalises it (NFKC: a
 *  ligature read as its letters), or null where it has no map to read (an identity map, a Type 3 font): today's mappedOf */
export function mappedOf(font: unknown): Set<string> | null {
  const map = (font as { toUnicode?: { _map?: unknown } } | null)?.toUnicode?._map
  if (!Array.isArray(map)) return null
  const out = new Set<string>()
  for (const v of map)
    if (typeof v === 'string') for (const t of [v, v.normalize('NFKC')]) for (const ch of t) out.add(ch)
  return out
}
/** whether a glyph's Unicode is no reading of it: a character no Unicode stands for, or one its font's map (`mapped`) gives none
 *  of its glyphs (today's draw.mjs unmapped) */
export const unmapped = (u: string, mapped: Set<string> | null): boolean =>
  [...u].some((ch) => /\S/.test(ch) && (NO_UNICODE.test(ch) || (mapped !== null && !mapped.has(ch))))

/** the document's pages, read; `info` its metadata */
export async function readPdf<X = never>(
  pdfjs: PdfJs,
  bytes: Uint8Array,
  o: ReadOptions<X> = {},
): Promise<{ doc: Doc; pages: ReadPage<X>[]; info: Record<string, unknown> | null }> {
  const task = pdfjs.getDocument({
    ...(o.options ?? {}),
    ...(o.mapped ? { fontExtraProperties: true } : {}),
    data: bytes.slice(),
  })
  // (each font's map, read once a document: by its id in the page's common objects)
  const maps = new Map<string, Set<string> | null>()
  // (each font's name, and its name with its subset's tag taken off, one string a document: every glyph of a font holds the one,
  // pageInk's `names` and docPageOf's `bases`; read once a glyph, each held its own, 72 MiB of 2610.19159v1's two Docs, lane L9)
  const names = new Map<unknown, string>()
  const bases = new Map<string, string>()
  const pages: ReadPage<X>[] = []
  let info: Record<string, unknown> | null = null
  try {
    const pdf = await task.promise
    info = ((await pdf.getMetadata?.().catch(() => null)) ?? null)?.info ?? null
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const ops = await page.getOperatorList()
      const extra = o.extra ? o.extra(pdfjs.OPS, ops) : null
      tagGlyphs(
        pdfjs.OPS,
        ops,
        o.mapped
          ? (id) => {
              if (!maps.has(id)) {
                let font: unknown = null
                try {
                  font = page.commonObjs.get(id)
                } catch {}
                maps.set(id, mappedOf(font))
              }
              return maps.get(id) as Set<string> | null
            }
          : null,
      )
      const ink = pageInk(pdfjs.OPS, ops, page.commonObjs, {
        rotate: page.rotate ?? 0,
        indices: true,
        turned: o.turned ?? false,
        shapesAll: o.shapesAll ?? false,
        glyphsMax: GLYPHS_PAGE,
        boxesMax: BOXES_PAGE,
        names,
      })
      const annotations = o.annotations ? ((await page.getAnnotations?.().catch(() => [])) ?? []) : null
      const view = [...page.view] as [number, number, number, number]
      pages.push({ ...docPageOf(ink, view, page.rotate ?? 0, bases), extra, annotations })
      page.cleanup()
    }
  } finally {
    await task.destroy().catch(() => {})
  }
  return { doc: { pages: pages.map((p) => p.page) }, pages, info }
}

/** each glyph of the operator list's shows given its code and font character, through its Unicode; with `mapOf` (a font's
 *  map by its id), whether its Unicode is no reading of it, the font the shows are in followed through the graphics state
 *  (setFont; save and restore; a form's begin and end) */
function tagGlyphs(
  OPS: Record<string, number>,
  ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  mapOf: ((id: string) => Set<string> | null) | null,
): void {
  const stack: (Set<string> | null)[] = []
  let mapped: Set<string> | null = null
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    if (mapOf) {
      if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) stack.push(mapped)
      else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd)
        mapped = stack.length ? (stack.pop() ?? null) : mapped
      else if (fn === OPS.setFont) {
        const id = (ops.argsArray[i] as unknown[] | undefined)?.[0]
        mapped = typeof id === 'string' ? mapOf(id) : null
      }
    }
    if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue
    const arr = (ops.argsArray[i] as unknown[] | undefined)?.[0]
    if (!Array.isArray(arr)) continue
    for (let j = 0; j < arr.length; j++) {
      const g = arr[j] as { unicode?: unknown; originalCharCode?: unknown; fontChar?: unknown } | null
      if (g && typeof g === 'object' && typeof g.unicode === 'string') {
        const nu = mapOf && unmapped(g.unicode, mapped) ? '1' : ''
        arr[j] = { ...g, unicode: `${g.unicode}${SEP}${g.originalCharCode ?? ''}${SEP}${g.fontChar ?? ''}${SEP}${nu}` }
      }
    }
  }
}

const split = (u: string): [string, number, boolean] => {
  const at = u.indexOf(SEP)
  if (at < 0) return [u, -1, false]
  const at2 = u.indexOf(SEP, at + SEP.length)
  const code = u.slice(at + SEP.length, at2)
  const at3 = u.indexOf(SEP, at2 + SEP.length)
  return [u.slice(0, at), code === '' ? -1 : Number(code), at3 >= 0 && u.slice(at3 + SEP.length) === '1']
}

/** pageInk's result with each glyph's Unicode restored (and its blank flag read again from it), and the Doc page of it */
function docPageOf(
  ink: PageInk,
  view: [number, number, number, number],
  rotate: number,
  bases: Map<string, string> = new Map(),
): { page: DocPage; raw: PageInk | null } {
  /** a font's name with its subset's tag taken off, one string a font (the reader's table) */
  const baseOf = (font: string): string => {
    let b = bases.get(font)
    if (b === undefined) {
      b = font.replace(/^[A-Z]{6}\+/, '')
      bases.set(font, b)
    }
    return b
  }
  const unread = ink.rotated
    ? 'rotated'
    : ink.capped
      ? 'capped'
      : ink.timedOut
        ? 'timedOut'
        : ink.degraded
          ? 'degraded'
          : null
  // (each glyph's coordinates in the page's one array, glyph.ts PageGlyph: a field of its own each was a heap number of 16 bytes)
  const c = new Float64Array(unread ? 0 : 8 * ink.glyphs.length)
  const glyphs: DocGlyph[] = []
  for (const g of ink.glyphs) {
    const [u, code, nu] = split(g.u)
    g.u = u
    if (!/\S/.test(u)) g.blank = true
    else delete g.blank
    if (unread) continue
    const font = String(g.font)
    const o = 8 * glyphs.length
    c[o] = g.x0
    c[o + 1] = g.x1
    c[o + 2] = g.y
    c[o + 3] = g.top
    c[o + 4] = g.bottom
    c[o + 5] = g.size
    c[o + 6] = g.ix0
    c[o + 7] = g.ix1
    glyphs.push(
      new PageGlyph(c, o, {
        u,
        code,
        font,
        base: baseOf(font),
        n: g.n ?? -1,
        k: g.k ?? -1,
        form: !!g.form,
        blank: !!g.blank,
        fill: g.fill ?? -1,
        fid: (g as { fid?: number }).fid,
        pid: (g as { pid?: number }).pid,
        clipped: g.clipped,
        unseen: g.unseen,
        ...(nu ? { nu: true as const } : {}),
        ...((g as { along?: number }).along !== undefined ? { along: (g as { along?: number }).along } : {}),
      }),
    )
  }
  const turned: DocTurned[] = []
  for (const t of ink.turned ?? []) {
    const [u, code] = split(t.u)
    t.u = u
    if (!/\S/.test(u)) t.blank = true
    else delete t.blank
    const font = String(t.font)
    turned.push({
      u,
      code,
      base: baseOf(font),
      n: t.n,
      k: t.k,
      at: t.at,
      box: t.box,
      ox: t.ox,
      oy: t.oy,
      ex: t.ex,
      ey: t.ey,
      ux: t.ux,
      uy: t.uy,
      size: t.size,
      ascent: t.ascent,
      descent: t.descent,
      form: !!t.form,
      fill: t.fill ?? -1,
    })
  }
  const page: DocPage = {
    glyphs: unread ? [] : glyphs,
    boxes: unread ? [] : Array.from(ink.boxes),
    kinds: unread ? [] : Array.from(ink.paths ?? []),
    boxAt: unread ? [] : Array.from(ink.boxAt),
    turned: unread ? [] : turned,
    points: unread
      ? []
      : ink.points.map((x) => ({
          name: /[A-Z]/.test(x.name) ? x.name.toLowerCase() : x.name,
          glyph: x.glyph,
          box: x.box,
        })),
    ...(unread ? {} : marksOf(ink)),
    view,
    rotate,
    unread,
  }
  return { page, raw: unread ? null : ink }
}

/** the page's points pageInk keeps apart (DocMarks), where it has any: none on a page no marked compile set (arXiv's) */
function marksOf(ink: PageInk): { marks?: DocMarks } {
  const lower = (x: { name: string; glyph: number; box: number }) => ({
    name: /[A-Z]/.test(x.name) ? x.name.toLowerCase() : x.name,
    glyph: x.glyph,
    box: x.box,
  })
  const paras = (ink.paras ?? []).map(lower)
  const paraEnds = (ink.paraEnds ?? []).map((x) => ({ ...lower(x), point: x.point, para: x.para }))
  const regions = (ink.regions ?? []).map((r) => ({ kind: r.kind, from: r.from, to: r.to }))
  const pictures = (ink.pictures ?? []).map(lower)
  if (!paras.length && !paraEnds.length && !regions.length && !pictures.length) return {}
  return { marks: { paras, paraEnds, regions, pictures } }
}
