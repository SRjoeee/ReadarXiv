// The PDF reader's store of papers' layers on this machine (Stage 5 Task 10): the layer's objects by their digest (immutable:
// the address names the content), the last catalog read of each paper version, and our copies of arXiv's PDF where arXiv's
// bytes were not the layer's base. A paper opened again, or opened with our server out of reach, reads them here before the
// network. Every object is checked against its digest before it is kept and again each time it is read: bytes that are not the
// ones their digest names are a miss, and are dropped, so nothing corrupt is ever drawn. Beyond a cap, the papers opened least
// recently go first, their objects and copies with them. Every failure of a read, a slow read included, is a miss (a read that
// has not answered within its budget resolves as one, its late answer let go), and of a write, nothing kept: the store is
// never a reason a paper does not open. Its own database, so that no other store's schema or migrations touch it.
import Dexie, { type DexieOptions, type Table } from 'dexie'

/** the store's bytes at most (the plan's 200 MB: about 400 papers' layers at 0.5 MB, or fewer with copies of originals) */
export const LAYER_STORE_BYTES = 200 * 2 ** 20
/** how long a read may take before it is a miss: three times the store's slowest read measured on the heaviest object
 *  (lab/pdf/records/layer-extension.md) */
export const READ_BUDGET_MS = 1500
export const LAYER_DB = 'axt-layer'

/** an object of a paper's layer, or our copy of its original, by digest (`paper`: the first paper that kept it) */
interface ObjectRow { sha256: string; paper: string; bytes: number; data: ArrayBuffer }
/** a paper that holds an object: one digest may be two papers' (an object is named by its content), and it goes only once
 *  no paper holds it */
interface RefRow { paper: string; sha256: string }
/** a paper version: when it was last opened, the bytes its objects hold, its last catalog */
interface PaperRow { paper: string; openedAt: number; bytes: number; catalog: ArrayBuffer | null }

class LayerDatabase extends Dexie {
  objects!: Table<ObjectRow, string>
  papers!: Table<PaperRow, string>
  refs!: Table<RefRow, [string, string]>
  constructor(name = LAYER_DB, options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({ objects: 'sha256, paper', papers: 'paper, openedAt' })
    // which papers hold each object (version 1's objects are their first paper's alone, as `objects.paper` says)
    this.version(2).stores({ refs: '[paper+sha256], sha256, paper' })
  }
}
export function createLayerDb(name?: string, options?: DexieOptions): LayerDatabase {
  return new LayerDatabase(name, options)
}

export interface LayerStore {
  /** an object by its digest, its bytes checked against it; undefined for a miss, a mismatch (dropped) or a read past its budget */
  object(sha256: string): Promise<Uint8Array | undefined>
  /** an object kept for `paper` (`<id>v<n>`), once its bytes are checked against `sha256`; a mismatch is not kept */
  putObject(paper: string, sha256: string, bytes: Uint8Array): Promise<void>
  /** the last catalog read of a paper version, as it came (the reader reads it again with the engine's reader) */
  catalog(paper: string): Promise<Uint8Array | undefined>
  putCatalog(paper: string, bytes: Uint8Array): Promise<void>
  /** a paper version opened now: the last to be let go */
  opened(paper: string): Promise<void>
  /** the paper versions kept and their bytes, for the settings page */
  usage(): Promise<{ count: number; bytes: number }>
  clear(): Promise<void>
}

const hexOf = (b: ArrayBuffer) => { let s = ''; for (const x of new Uint8Array(b)) s += x.toString(16).padStart(2, '0'); return s }
async function digestOf(bytes: Uint8Array): Promise<string> {
  return hexOf(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}
const copyOf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer
/** a promise's answer, or `miss` once `ms` have gone by (its late answer let go) */
function within<T, M>(p: Promise<T>, ms: number, miss: M): Promise<T | M> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(miss), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(miss) })
  })
}

export function createLayerStore(o: { db?: LayerDatabase; maxBytes?: number; budgetMs?: number; now?: () => number } = {}): LayerStore {
  const db = o.db ?? createLayerDb()
  const maxBytes = o.maxBytes ?? LAYER_STORE_BYTES, budget = o.budgetMs ?? READ_BUDGET_MS, now = o.now ?? (() => Date.now())
  /** papers over the cap let go, least recently opened first, never `keep` (the one being opened) */
  async function evict(keep: string) {
    let total = 0
    await db.papers.each(p => { total += p.bytes })
    if (total <= maxBytes) return
    for (const p of await db.papers.orderBy('openedAt').toArray()) {
      if (total <= maxBytes) break
      if (p.paper === keep) continue
      await db.transaction('rw', db.objects, db.papers, db.refs, async () => {
        // the objects it holds (and those version 1 kept for it alone) go once no other paper holds them
        const held = new Set([...(await db.refs.where('paper').equals(p.paper).primaryKeys()).map(k => k[1]), ...(await db.objects.where('paper').equals(p.paper).primaryKeys())])
        await db.refs.where('paper').equals(p.paper).delete()
        for (const sha256 of held) if (!(await db.refs.where('sha256').equals(sha256).count())) await db.objects.delete(sha256)
        await db.papers.delete(p.paper)
      })
      total -= p.bytes
    }
  }
  async function readObject(sha256: string): Promise<Uint8Array | undefined> {
    const row = await db.objects.get(sha256)
    if (!row) return undefined
    const bytes = new Uint8Array(row.data)
    if (bytes.length === row.bytes && (await digestOf(bytes)) === sha256) return bytes
    // bytes that are not the ones their digest names: never drawn, and gone, from every paper that held them
    await db.transaction('rw', db.objects, db.papers, db.refs, async () => {
      await db.objects.delete(sha256)
      const holders = new Set([row.paper, ...(await db.refs.where('sha256').equals(sha256).primaryKeys()).map(k => k[0])])
      await db.refs.where('sha256').equals(sha256).delete()
      for (const paper of holders) {
        const p = await db.papers.get(paper)
        if (p) await db.papers.put({ ...p, bytes: Math.max(0, p.bytes - row.bytes) })
      }
    }).catch(() => {})
    return undefined
  }
  return {
    object: sha256 => within(readObject(sha256), budget, undefined),
    async putObject(paper, sha256, bytes) {
      try {
        if (bytes.length > maxBytes || (await digestOf(bytes)) !== sha256) return
        await db.transaction('rw', db.objects, db.papers, db.refs, async () => {
          // held by this paper already: nothing to do; another paper's: this one holds it too, and counts its bytes (each
          // paper counts what it holds, so the cap is kept conservatively)
          if (await db.refs.get([paper, sha256])) return
          const kept = await db.objects.get(sha256)
          if (kept?.paper === paper) return
          if (!kept) await db.objects.put({ sha256, paper, bytes: bytes.length, data: copyOf(bytes) })
          await db.refs.put({ paper, sha256 })
          const p = await db.papers.get(paper)
          await db.papers.put({ paper, openedAt: p?.openedAt ?? now(), bytes: (p?.bytes ?? 0) + bytes.length, catalog: p?.catalog ?? null })
        })
        await evict(paper)
      } catch { /* nothing kept */ }
    },
    catalog: paper => within(db.papers.get(paper).then(p => (p?.catalog ? new Uint8Array(p.catalog) : undefined)), budget, undefined),
    async putCatalog(paper, bytes) {
      try {
        await db.transaction('rw', db.papers, async () => {
          const p = await db.papers.get(paper)
          await db.papers.put({ paper, openedAt: now(), bytes: (p?.bytes ?? 0) - (p?.catalog?.byteLength ?? 0) + bytes.length, catalog: copyOf(bytes) })
        })
        await evict(paper)
      } catch { /* nothing kept */ }
    },
    async opened(paper) {
      try { await db.papers.update(paper, { openedAt: now() }) } catch { /* the order of eviction only */ }
    },
    async usage() {
      let count = 0, bytes = 0
      await db.papers.each(p => { count++; bytes += p.bytes })
      return { count, bytes }
    },
    async clear() {
      await db.transaction('rw', db.objects, db.papers, db.refs, async () => { await db.objects.clear(); await db.papers.clear(); await db.refs.clear() })
    },
  }
}
