// A page's operator list read in the pieces PDF.js's worker sends it, none of them held once read: the one place the engine
// reaches inside PDF.js (lane op-stream, 2026-11-10).
//
// WHY. PDF.js's getOperatorList answers a page's list as one object, every operation of the page in it at once. A page of paths
// holds hundreds of thousands (2610.40394v1 page 23: 510,506 operations): its list was 93 MiB held, the heap at 372-381 MiB inside
// that one call, for arXiv's PDF and for our compile alike, and that call decided the paper's memory limit in the box. Every reader
// of the list (ink.mjs inkReader, remove.mjs alignReader, read.ts's glyph tags) reads it front to back in one pass, so none needs
// it whole.
//
// WHAT. PDF.js's worker already sends a list in pieces (its OperatorList.CHUNK_SIZE, 1,000 operations), and the page's proxy
// appends each to the list it answers (api.js PDFPageProxy._renderPageChunk). There is no public way to have them: the request
// the proxy sends is made of its private fields (#pagesMapper's page id), and its stream is not handed out. So readOps asks for
// the list as ever (getOperatorList: PDF.js's own request, intent and page id), and for that call takes the page's
// _renderPageChunk, which hands each piece to the reader and PDF.js an empty piece with the same end (`lastChunk`): the list PDF.js
// answers is empty, and its call ends as ever. A piece is handed on once each font its operations set (setFont, a graphics
// state's Font) is resolved in the document's common objects, as PDF.js's canvas waits on a dependency: the worker sends a font
// before the operation that sets it, and the proxy resolves it a few microtasks after (FontLoader.bind); a reader of the whole
// list read it after the list had ended. Once the list has ended no piece waits: a font not resolved then is one the whole
// list's reader did not find either.
//
// BUMPING PDFJS: tests/pdf-reader/op-stream.test.ts reads a page in pieces through the installed PDF.js and fails, loudly, where
// the page has no _renderPageChunk or the list no longer passes through it. Read api.js's getOperatorList, _pumpOperatorList and
// _renderPageChunk again (still each piece, in order, then the end?), and the commonobj handler's Font (still resolved after
// the font is sent?), and set OPS_PDFJS.

/** the PDF.js readOps was made for */
export const OPS_PDFJS = '6.3.289'

/** a reader of a page's operator list in pieces: each piece after the one before (fnArray and argsArray alike, of one length),
 *  then its answer */
export interface OpsReader<X> {
  read(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): void
  end(): X
}

/** a piece of a page's operator list as PDF.js's worker sends it (OperatorList.flush) */
interface Piece {
  fnArray: ArrayLike<number>
  argsArray: ArrayLike<unknown>
  length: number
  lastChunk: boolean
  separateAnnots?: unknown
}

/** a page as readOps reads it: PDF.js's page proxy */
export interface OpsPage {
  getOperatorList(): Promise<unknown>
  commonObjs: { has(id: string): boolean; get(id: string, callback?: (data: unknown) => void): unknown }
  _renderPageChunk?: (piece: Piece, intentState: unknown) => void
}

/** the fonts a piece's operations set (setFont; a graphics state's Font), by their ids in the common objects */
function fontsOf(OPS: Record<string, number>, fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): string[] {
  const ids: string[] = []
  for (let i = 0; i < fnArray.length; i++) {
    const a = argsArray[i] as unknown[] | undefined
    if (fnArray[i] === OPS.setFont) {
      if (typeof a?.[0] === 'string') ids.push(a[0])
    } else if (fnArray[i] === OPS.setGState && Array.isArray(a?.[0])) {
      for (const e of a[0] as unknown[])
        if (Array.isArray(e) && e[0] === 'Font' && Array.isArray(e[1]) && typeof e[1][0] === 'string') ids.push(e[1][0])
    }
  }
  return ids
}

/** the page's operator list handed to `take` piece by piece, in order, each once the fonts it sets are resolved; PDF.js holds
 *  none of it, and readOps none once handed on. Throws what `take` threw (no piece handed on after it), PDF.js's own failure to
 *  read the page, and a page PDF.js does not give in pieces (no _renderPageChunk; a list it had made before, answered whole) */
export async function readOps(
  page: OpsPage,
  OPS: Record<string, number>,
  take: (fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>) => void,
): Promise<void> {
  const own = page._renderPageChunk
  if (typeof own !== 'function')
    throw new Error(
      `PDF.js's page has no _renderPageChunk (readOps was made for PDF.js ${OPS_PDFJS}): read opstream.ts again`,
    )
  const had = Object.hasOwn(page, '_renderPageChunk')
  let queue: Promise<void> = Promise.resolve()
  let last = false
  let failed = false
  let error: unknown = null
  // (the list's end, once PDF.js has answered it: no piece waits for a font past it)
  let ended = false
  let end = (): void => {}
  const listEnd = new Promise<void>((resolve) => (end = resolve))
  const resolved = (id: string): Promise<unknown> =>
    Promise.race([new Promise((resolve) => page.commonObjs.get(id, resolve)), listEnd])
  page._renderPageChunk = function (this: OpsPage, piece: Piece, intentState: unknown) {
    if (piece.lastChunk) last = true
    const { fnArray, argsArray } = piece
    queue = queue.then(async () => {
      if (failed) return
      for (const id of fontsOf(OPS, fnArray, argsArray)) if (!ended && !page.commonObjs.has(id)) await resolved(id)
      try {
        take(fnArray, argsArray)
      } catch (e) {
        failed = true
        error = e
      }
    })
    own.call(
      this,
      { fnArray: [], argsArray: [], length: 0, lastChunk: piece.lastChunk, separateAnnots: piece.separateAnnots },
      intentState,
    )
  }
  try {
    await page.getOperatorList()
    ended = true
    end()
    await queue
  } finally {
    if (had) page._renderPageChunk = own
    else delete page._renderPageChunk
  }
  if (failed) throw error
  if (!last)
    throw new Error(`PDF.js answered the page's operator list whole, not in pieces (readOps, PDF.js ${OPS_PDFJS})`)
}
