import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { wrapFinal } from '@/pdf-reader/engine/layout/wrap-final.mjs'
import { DOCUMENT_OPTIONS, deflate, inflate } from './ocg-pdfs'

// Today's wrapFinal over ocg-pdfs.ts's synthetic marked compiles, moved out of ocg-pdfs.ts (2026-11-16) so that the helper the
// kept tests read reaches none of today's engine: only today's tests import it, and the cut-over deletes it with them.

/** wrapFinal over bytes, the test's way: no marking's `follows` unless given (`follows: undefined` asks wrapFinal to make it of the units) */
export const wrapped = (bytes: Uint8Array, o: { units?: unknown[] | null; follows?: unknown; texts?: readonly string[] | null; inkless?: readonly string[] | null; names?: readonly string[] | null; bounds?: { groupsPage?: number; sequencesPage?: number; groupsDoc?: number } } = {}) => wrapFinal(bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS, units: (o.units ?? null) as never, texts: o.texts ?? null, inkless: o.inkless ?? null, names: o.names ?? null, ...('follows' in o ? { follows: o.follows as never } : { follows: null }), deflate, inflate, ...(o.bounds ? { bounds: o.bounds } : {}) } as never)
