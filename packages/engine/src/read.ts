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
import type { Doc, DocGlyph, DocPage, DocTurned } from './doc.ts'
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
  /** made of each page's operator list before pageInk reads it (the wrap's alignment facts) */
  extra?: (OPS: Record<string, number>, ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }) => X
  /** read each page's annotations too (A's links) */
  annotations?: boolean
}

/** the document's pages, read; `info` its metadata */
export async function readPdf<X = never>(
  pdfjs: PdfJs,
  bytes: Uint8Array,
  o: ReadOptions<X> = {},
): Promise<{ doc: Doc; pages: ReadPage<X>[]; info: Record<string, unknown> | null }> {
  const task = pdfjs.getDocument({ ...(o.options ?? {}), data: bytes.slice() })
  const pages: ReadPage<X>[] = []
  let info: Record<string, unknown> | null = null
  try {
    const pdf = await task.promise
    info = ((await pdf.getMetadata?.().catch(() => null)) ?? null)?.info ?? null
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const ops = await page.getOperatorList()
      const extra = o.extra ? o.extra(pdfjs.OPS, ops) : null
      tagGlyphs(pdfjs.OPS, ops)
      const ink = pageInk(pdfjs.OPS, ops, page.commonObjs, {
        rotate: page.rotate ?? 0,
        indices: true,
        turned: o.turned ?? false,
        glyphsMax: GLYPHS_PAGE,
        boxesMax: BOXES_PAGE,
      })
      const annotations = o.annotations ? ((await page.getAnnotations?.().catch(() => [])) ?? []) : null
      const view = [...page.view] as [number, number, number, number]
      pages.push({ ...docPageOf(ink, view, page.rotate ?? 0), extra, annotations })
      page.cleanup()
    }
  } finally {
    await task.destroy().catch(() => {})
  }
  return { doc: { pages: pages.map((p) => p.page) }, pages, info }
}

/** each glyph of the operator list's shows given its code and font character, through its Unicode */
function tagGlyphs(
  OPS: Record<string, number>,
  ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
): void {
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue
    const arr = (ops.argsArray[i] as unknown[] | undefined)?.[0]
    if (!Array.isArray(arr)) continue
    for (let j = 0; j < arr.length; j++) {
      const g = arr[j] as { unicode?: unknown; originalCharCode?: unknown; fontChar?: unknown } | null
      if (g && typeof g === 'object' && typeof g.unicode === 'string')
        arr[j] = { ...g, unicode: `${g.unicode}${SEP}${g.originalCharCode ?? ''}${SEP}${g.fontChar ?? ''}` }
    }
  }
}

const split = (u: string): [string, number] => {
  const at = u.indexOf(SEP)
  if (at < 0) return [u, -1]
  const code = u.slice(at + SEP.length, u.indexOf(SEP, at + SEP.length))
  return [u.slice(0, at), code === '' ? -1 : Number(code)]
}

/** pageInk's result with each glyph's Unicode restored (and its blank flag read again from it), and the Doc page of it */
function docPageOf(
  ink: PageInk,
  view: [number, number, number, number],
  rotate: number,
): { page: DocPage; raw: PageInk | null } {
  const unread = ink.rotated
    ? 'rotated'
    : ink.capped
      ? 'capped'
      : ink.timedOut
        ? 'timedOut'
        : ink.degraded
          ? 'degraded'
          : null
  const glyphs: DocGlyph[] = []
  for (const g of ink.glyphs) {
    const [u, code] = split(g.u)
    g.u = u
    if (!/\S/.test(u)) g.blank = true
    else delete g.blank
    const font = String(g.font)
    glyphs.push({
      u,
      code,
      font,
      base: font.replace(/^[A-Z]{6}\+/, ''),
      x0: g.x0,
      x1: g.x1,
      y: g.y,
      top: g.top,
      bottom: g.bottom,
      size: g.size,
      ix0: g.ix0,
      ix1: g.ix1,
      n: g.n ?? -1,
      k: g.k ?? -1,
      form: !!g.form,
      blank: !!g.blank,
      fill: g.fill ?? -1,
      fid: (g as { fid?: number }).fid,
      pid: (g as { pid?: number }).pid,
      clipped: g.clipped,
      unseen: g.unseen,
    })
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
      base: font.replace(/^[A-Z]{6}\+/, ''),
      n: t.n,
      k: t.k,
      at: t.at,
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
    view,
    rotate,
    unread,
  }
  return { page, raw: unread ? null : ink }
}
