// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { pagesOf, rangesOf, replacedWhy } from '@readarxiv/engine'
import { openObjects } from '@readarxiv/engine'
import { ORIG_PACKED, origObjects, pdfOf } from './helpers/delta-pdfs'

// Our base as an incremental update over arXiv's PDF (layout/delta.mjs; the delta contract's §2 to §4 and §14): the builder on
// synthetic documents of both cross-reference kinds, its determinism and its reuse, the structural proof and the mutations it
// must catch, and the remover's tail continuing the composed document

const ORIG_TABLE = pdfOf(origObjects(), { root: 1 })
const ORIG_STREAM = pdfOf(origObjects(), { root: 1, kind: 'stream', packed: ORIG_PACKED })
const latin = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('')
const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255)

describe('the object layer as PDF.js reads it (xref.mjs)', () => {
  it('reads a stream by its RESOLVED /Length: the image\'s indirect length, its last byte a carriage return, whole', () => {
    for (const bytes of [ORIG_TABLE, ORIG_STREAM]) {
      const O = openObjects(bytes, { PL, objectsMax: 1000, decodedMax: 1 << 20 })
      const img = O.lookup(PL.PDFRef.of(12, 0)) as { contents: Uint8Array }
      expect(img.contents.length).toBe(12)
      expect(img.contents.at(-1)).toBe(13)
      expect(O.pages().length).toBe(3)
    }
    // (where the object layer's own loader reads it one byte short)
    return PL.PDFDocument.load(ORIG_TABLE, { updateMetadata: false }).then(d => expect((d.context.lookup(PL.PDFRef.of(12, 0)) as unknown as { contents: Uint8Array }).contents.length).toBe(11))
  })

  it('refuses what it will not read safely: encrypted, hybrid, an entry off its object, a /Length not at endstream', () => {
    const swap = (b: Uint8Array, a: string, z: string) => enc(latin(b).replace(a, z))
    const open = (b: Uint8Array) => { try { openObjects(b, { PL, objectsMax: 1000, decodedMax: 1 << 20 }).pages(); return 'read' } catch (e) { return (e as { code?: string }).code } }
    expect(open(swap(ORIG_TABLE, '/Root 1 0 R', '/Root 1 0 R /Encrypt 9 0 R'))).toBe('delta-encrypted')
    expect(open(swap(ORIG_TABLE, '/Root 1 0 R', '/Root 1 0 R /XRefStm 9'))).toBe('delta-xref')
    const t = latin(ORIG_TABLE), i = t.indexOf(' 00000 n', t.indexOf('xref') + 30) - 10, off = Number(t.slice(i, i + 10))
    expect(open(enc(t.slice(0, i) + String(off - 1).padStart(10, '0') + t.slice(i + 10)))).toBe('delta-xref')
    const o = origObjects()
    o.set(13, { text: '9' })
    expect(() => openObjects(pdfOf(o, { root: 1 }), { PL, objectsMax: 1000, decodedMax: 1 << 20 }).lookup(PL.PDFRef.of(12, 0))).toThrow(/does not end at endstream/)
  })
})

describe('the replaced pages\' list', () => {
  it('ranges of pages, merged; the validator refuses every other shape', () => {
    expect(rangesOf([5, 1, 2, 3, 9, 3])).toEqual([[1, 3], [5, 5], [9, 9]])
    expect(pagesOf([[1, 3], [5, 5]])).toEqual([1, 2, 3, 5])
    expect(replacedWhy([[1, 3], [5, 5]], 5)).toBeNull()
    for (const bad of [null, [], [[0, 1]], [[2, 1]], [[1, 6]], [[3, 4], [1, 2]], [[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1.5, 2]], [[1]], Array.from({ length: 4097 }, (_, i) => [2 * i + 1, 2 * i + 1])]) expect(replacedWhy(bad, bad?.length === 4097 ? 10_000 : 5), JSON.stringify(bad)?.slice(0, 40)).not.toBeNull()
  })
})

