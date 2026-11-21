// The old reader's store of layers as the released extension (0.5.2) keeps it, frozen for the version step's tests
// (paper-store.test.ts, hard rule 7): `axt-layer` at version 4, its schema and the rows its writes leave, copied from
// src/cache/layer-store.ts, which is v0.5.2's unchanged and goes with today's reader at the cut-over. The step to version 5
// and the way back (PDF-READER §9.3, docs/RELEASE.md) are proved against this schema, not against whatever the old store
// becomes. Only what those tests call: an object kept and read back by its digest, a catalog kept, the usage; the cap and
// its eviction, the read budget, and the product's silence on a failed write are left out (a fixture's write that fails
// throws, so that a test sees it).
import Dexie, { type DexieOptions, type Table } from 'dexie'

/** an object of a paper's layer, or our copy of its original, by digest (`paper`: the first paper that kept it, a hint
 *  alone: who holds an object is `refs`) */
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
  constructor(name: string, options?: DexieOptions) {
    super(name, options)
    // version 4 as 0.5.2 declares it: a store of an earlier version opens cleared
    this.version(4).stores({ objects: 'sha256, paper', papers: 'paper, openedAt', refs: '[paper+sha256], sha256, paper' }).upgrade(async tx => {
      await Promise.all(['objects', 'papers', 'refs'].map(t => tx.table(t).clear()))
    })
  }
}
export function createLayerDb(name: string, options?: DexieOptions): LayerDatabase {
  return new LayerDatabase(name, options)
}

const hexOf = (b: ArrayBuffer) => { let s = ''; for (const x of new Uint8Array(b)) s += x.toString(16).padStart(2, '0'); return s }
async function digestOf(bytes: Uint8Array): Promise<string> {
  return hexOf(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}
const copyOf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer

/** the old store's writes and reads as 0.5.2 makes them, on a version 4 database */
export function createLayerStore(o: { db: LayerDatabase; now?: () => number }) {
  const { db } = o
  const now = o.now ?? (() => Date.now())
  return {
    /** an object by its digest, its bytes checked against it; undefined for a miss or a mismatch */
    async object(sha256: string): Promise<Uint8Array | undefined> {
      const row = await db.objects.get(sha256)
      if (!row) return undefined
      const bytes = new Uint8Array(row.data)
      return bytes.length === row.bytes && (await digestOf(bytes)) === sha256 ? bytes : undefined
    },
    /** an object kept for `paper` once its bytes are checked against `sha256`: its row, the paper's ref to it, the paper's bytes */
    async putObject(paper: string, sha256: string, bytes: Uint8Array): Promise<void> {
      if ((await digestOf(bytes)) !== sha256) return
      await db.transaction('rw', db.objects, db.papers, db.refs, async () => {
        if (await db.refs.get([paper, sha256])) return
        if (!(await db.objects.get(sha256))) await db.objects.put({ sha256, paper, bytes: bytes.length, data: copyOf(bytes) })
        await db.refs.put({ paper, sha256 })
        const p = await db.papers.get(paper)
        await db.papers.put({ paper, openedAt: p?.openedAt ?? now(), bytes: (p?.bytes ?? 0) + bytes.length, catalog: p?.catalog ?? null })
      })
    },
    /** the last catalog read of a paper version, kept on its row */
    async putCatalog(paper: string, bytes: Uint8Array): Promise<void> {
      await db.transaction('rw', db.papers, async () => {
        const p = await db.papers.get(paper)
        await db.papers.put({ paper, openedAt: now(), bytes: (p?.bytes ?? 0) - (p?.catalog?.byteLength ?? 0) + bytes.length, catalog: copyOf(bytes) })
      })
    },
    /** the paper versions kept and their bytes */
    async usage(): Promise<{ count: number; bytes: number }> {
      let count = 0, bytes = 0
      await db.papers.each(p => { count++; bytes += p.bytes })
      return { count, bytes }
    },
  }
}
