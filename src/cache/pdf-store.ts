// The PDF reader's cache of compiled translations (experiments/pdf-bilingual/REPORT.md, eighteenth addendum): one record
// per paper version and target language. The PDF is encrypted under a key the page cannot export — not DRM: it keeps a
// file from being copied out of the profile. Beyond a cap, the least recently opened go first. Every failure is a miss,
// as in the translation cache (./store.ts). Its own database, so that neither's schema or migrations touch the other's.
import Dexie, { type DexieOptions, type Table } from 'dexie'
import { atLeastAsGood, mergeFigures, type FigureEntry, type Now, type PdfRecord, type PdfRecordBody } from './pdf-record'

/** The small row eviction reads: no PDF, no units */
interface Entry {
  digest: string
  lang: string
  paper: string
  engine: string
  bytes: number
  createdAt: number
  openedAt: number
}
/** The record's body: what a copy is judged by, and what the figures' patches change */
interface Body {
  digest: string
  lang: string
  body: PdfRecordBody
}
/**
 * The encrypted PDF, in a table of its own: in one row with the body, a figures patch rewrote the whole PDF (up to about
 * 55 MB) and a write read it just to compare bodies (final review)
 */
interface Pdf {
  digest: string
  lang: string
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

class PdfDatabase extends Dexie {
  entries!: Table<Entry, [string, string]>
  bodies!: Table<Body, [string, string]>
  pdfs!: Table<Pdf, [string, string]>
  keys!: Table<{ id: string; key: CryptoKey }, string>

  constructor(name = 'axt-pdf', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({ entries: '[digest+lang], openedAt', bodies: '[digest+lang]', pdfs: '[digest+lang]', keys: 'id' })
  }
}

export function createPdfDb(name?: string, options?: DexieOptions): PdfDatabase {
  return new PdfDatabase(name, options)
}

/** About a hundred papers at the corpus's mean (REPORT, eighteenth addendum) */
export const PDF_CACHE_MAX_BYTES = 500 * 1024 * 1024

export interface PdfStore {
  get(digest: string, lang: string): Promise<PdfRecord | undefined>
  /** Written if at least as good as the stored copy (pdf-record.ts atLeastAsGood); whether it was */
  put(record: PdfRecordBody & { pdf: Uint8Array<ArrayBuffer> }, now: Now): Promise<boolean>
  /** The figures' entries merged into the stored record's by key (pdf-record.ts mergeFigures), the PDF untouched */
  patchFigures(digest: string, lang: string, figures: FigureEntry[]): Promise<void>
  touch(digest: string, lang: string): Promise<void>
  delete(digest: string, lang: string): Promise<void>
  clear(): Promise<void>
  usage(): Promise<{ count: number; bytes: number }>
}

/** A record's size as stored: the ciphertext, and its body's text as UTF-8 */
const sizeOf = (dataBytes: number, body: PdfRecordBody) => dataBytes + new TextEncoder().encode(JSON.stringify(body)).byteLength

export function createPdfStore(options: { db?: PdfDatabase; maxBytes?: number; clock?: () => number; warn?: (line: string) => void } = {}): PdfStore {
  const db = options.db ?? createPdfDb()
  const maxBytes = options.maxBytes ?? PDF_CACHE_MAX_BYTES
  const clock = options.clock ?? Date.now
  const warn = options.warn ?? ((line: string) => console.warn(line))

  /** The one key, made on first use: two pages making one at once, the first stored is the one both use */
  let keyP: Promise<CryptoKey> | null = null
  const theKey = () =>
    (keyP ??= (async () => {
      const stored = await db.keys.get('pdf')
      if (stored) return stored.key
      const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      await db.keys.add({ id: 'pdf', key: made }).catch(() => undefined)
      return (await db.keys.get('pdf'))!.key
    })().catch(e => {
      keyP = null
      throw e
    }))

  /** A record's rows removed together */
  const remove = (digest: string, lang: string) =>
    db.transaction('rw', db.entries, db.bodies, db.pdfs, async () => {
      await db.entries.delete([digest, lang])
      await db.bodies.delete([digest, lang])
      await db.pdfs.delete([digest, lang])
    })

  /**
   * Beyond the cap, the least recently opened first; the record just written stays even alone over it. Run inside the
   * write's transaction: two tabs evicting apart, each protecting its own record, could each remove the other's (Devin
   * on #298)
   */
  async function evict(keep: [string, string]) {
    const entries = await db.entries.orderBy('openedAt').toArray()
    let total = entries.reduce((sum, e) => sum + e.bytes, 0)
    for (const e of entries) {
      if (total <= maxBytes) break
      if (e.digest === keep[0] && e.lang === keep[1]) continue
      await remove(e.digest, e.lang)
      total -= e.bytes
    }
  }

  return {
    async get(digest, lang) {
      try {
        const [entry, row, pdf] = await Promise.all([db.entries.get([digest, lang]), db.bodies.get([digest, lang]), db.pdfs.get([digest, lang])])
        if (!entry || !row || !pdf) return undefined
        // the key read before the decryption's try: a key that cannot be read is a miss, not a record that does not
        // decrypt, which is deleted (final review)
        const key = await theKey()
        try {
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: pdf.iv }, key, pdf.data)
          return { ...row.body, pdf: new Uint8Array(plain), createdAt: entry.createdAt, openedAt: entry.openedAt }
        } catch (e) {
          // A record that does not decrypt (a torn write, its key gone with the site's data) is no copy
          warn(`[axt-pdf] a record did not decrypt and was deleted: ${(e as Error).message}`)
          await remove(digest, lang).catch(() => undefined)
          return undefined
        }
      } catch (e) {
        warn(`[axt-pdf] read failed: ${(e as Error).message}`)
        return undefined
      }
    },

    async put(record, now) {
      try {
        const { pdf, ...candidate } = record
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await theKey(), pdf)
        const t = clock()
        const written = await db.transaction('rw', db.entries, db.bodies, db.pdfs, async () => {
          const stored = await db.bodies.get([candidate.digest, candidate.lang])
          if (stored && !atLeastAsGood(candidate, stored.body, now)) return false
          // the figures another tab saved and this one did not see are kept
          const body = stored ? { ...candidate, figures: mergeFigures(stored.body.figures, candidate.figures) } : candidate
          const createdAt = (await db.entries.get([body.digest, body.lang]))?.createdAt ?? t
          await db.entries.put({ digest: body.digest, lang: body.lang, paper: body.paper, engine: body.engine, bytes: sizeOf(data.byteLength, body), createdAt, openedAt: t })
          await db.bodies.put({ digest: body.digest, lang: body.lang, body })
          await db.pdfs.put({ digest: body.digest, lang: body.lang, iv, data })
          await evict([body.digest, body.lang])
          return true
        })
        return written
      } catch (e) {
        warn(`[axt-pdf] write failed: ${(e as Error).message}`)
        return false
      }
    },

    async patchFigures(digest, lang, figures) {
      try {
        await db.transaction('rw', db.entries, db.bodies, async () => {
          const row = await db.bodies.get([digest, lang])
          const entry = await db.entries.get([digest, lang])
          if (!row || !entry) return
          const body = { ...row.body, figures: mergeFigures(row.body.figures, figures) }
          await db.bodies.put({ ...row, body })
          // the size less the old body, plus the new: the ciphertext's is unchanged
          await db.entries.put({ ...entry, bytes: entry.bytes - sizeOf(0, row.body) + sizeOf(0, body) })
        })
      } catch (e) {
        warn(`[axt-pdf] figures not saved: ${(e as Error).message}`)
      }
    },

    async touch(digest, lang) {
      try {
        await db.entries.update([digest, lang], { openedAt: clock() })
      } catch (e) {
        warn(`[axt-pdf] touch failed: ${(e as Error).message}`)
      }
    },

    async delete(digest, lang) {
      try {
        await remove(digest, lang)
      } catch (e) {
        warn(`[axt-pdf] delete failed: ${(e as Error).message}`)
      }
    },

    async clear() {
      try {
        await db.transaction('rw', db.entries, db.bodies, db.pdfs, async () => {
          await db.entries.clear()
          await db.bodies.clear()
          await db.pdfs.clear()
        })
      } catch (e) {
        warn(`[axt-pdf] clear failed: ${(e as Error).message}`)
      }
    },

    async usage() {
      try {
        const entries = await db.entries.toArray()
        return { count: entries.length, bytes: entries.reduce((sum, e) => sum + e.bytes, 0) }
      } catch {
        return { count: 0, bytes: 0 }
      }
    },
  }
}
