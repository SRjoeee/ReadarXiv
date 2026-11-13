// The byte store one reader holds (interfaces/host design-a §1.5): whole chunks of the objects its sources read, shared by
// every source of the same object (the left's document of arXiv's PDF and the composed document read the same chunks of it),
// one ask a chunk at most in flight, a run of chunks asked at once kept to CHUNKS_IN_FLIGHT, the least recently read let go
// past its bound. Carried from the website's `chunkStore` (readarxiv-web web/src/ranges.ts, 0bf496b5) without the read gate,
// the prefetch's budget and its release, which the rebuild drops (reader-hosts-data §16: the prefetch is not built).
//
// A chunk enters only from an answer its source checked, under the object's name the source gives (its address, entity-tag and
// length): a source bound to another object never takes it. In memory, for the reader's life.

/** PDF.js's own chunk, which every document here is opened with: every range a document asks is whole chunks of it */
export const CHUNK = 65_536
/** the most the store holds (bytes): 64 MiB is past a heavy paper's reads for a jump with both documents (2608.16117v1: the
 *  layer's 15 MB and the left's 4.5 to 5.6 MB, W ranges.ts) */
const STORE_BYTES = 64 * 2 ** 20
/** the chunks asked of the network at once, at most: 1 MiB in flight fills a 10 Mbit/s line and a 100 Mbit/s one at 80 ms */
export const CHUNKS_IN_FLIGHT = 16

export type ChunkFetch = (begin: number, end: number) => Promise<Uint8Array>

export interface ChunkStore {
  /**
   * Bytes [begin, end) of `object` (its `total` bytes): whole chunks taken from the store, those in flight waited for, the rest
   * asked of `fetch` (the source's own checked read), one ask a chunk. A range that is not whole chunks is asked of `fetch`
   * alone. The answer is a buffer of its own. A wait is let go with `signal`
   */
  read(
    object: string,
    total: number,
    begin: number,
    end: number,
    fetch: ChunkFetch,
    signal: AbortSignal,
  ): Promise<Uint8Array>
  /** the whole chunks of a read made outside the store (a source's first, before its length and tag were known), kept */
  keep(object: string, total: number, begin: number, bytes: Uint8Array): void
  /** the bytes held */
  readonly bytes: number
  /** the asks under way */
  readonly asking: number
}

/** `p`, or the read's let-go as soon as `signal` says it */
function within<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const off = () => reject(signal.reason)
    signal.addEventListener('abort', off, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', off)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', off)
        reject(e)
      },
    )
  })
}

/** how many rounds a read asks again the chunks another read's ask failed, before that failure is its own */
const OTHERS_ROUNDS = 3

/** a store of whole chunks, `limit` bytes at most (its least recently read let go first) */
export function chunkStore(limit: number = STORE_BYTES): ChunkStore {
  /** the chunks held, least recently read first (a Map keeps insertion order: a chunk read is set again at its end) */
  const held = new Map<string, Uint8Array>()
  /** the chunks being read, by whichever read asked first */
  const coming = new Map<string, Promise<Uint8Array>>()
  let size = 0
  const keyOf = (object: string, i: number) => `${object}#${i}`
  const take = (key: string): Uint8Array | null => {
    const b = held.get(key)
    if (!b) return null
    held.delete(key)
    held.set(key, b)
    return b
  }
  const put = (key: string, b: Uint8Array) => {
    if (held.has(key)) return
    held.set(key, b)
    size += b.byteLength
    for (const [k, v] of held) {
      if (size <= limit) break
      held.delete(k)
      size -= v.byteLength
    }
  }
  /** whole chunks [i0, i1) of an object of `total` bytes: [begin, end) where it is that */
  const chunksOf = (total: number, begin: number, end: number): [number, number] | null => {
    if (begin % CHUNK !== 0 || (end % CHUNK !== 0 && end !== total) || end > total || end <= begin) return null
    return [begin / CHUNK, Math.ceil(end / CHUNK)]
  }
  const chunkEnd = (total: number, i: number) => Math.min((i + 1) * CHUNK, total)
  let asking = 0
  const queued: (() => void)[] = []
  const freed = () => {
    asking--
    queued.shift()?.()
  }
  /** `run` begun now where fewer than CHUNKS_IN_FLIGHT asks are under way, else once one ends */
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const go = () => {
      asking++
      let p: Promise<T>
      try {
        p = run()
      } catch (e) {
        p = Promise.reject(e)
      }
      return p.finally(freed)
    }
    if (asking < CHUNKS_IN_FLIGHT) return go()
    return new Promise<T>((resolve, reject) => {
      queued.push(() => {
        go().then(resolve, reject)
      })
    })
  }
  /** chunk i asked of `fetch`, kept, and told to whoever waits for it */
  const ask = (object: string, total: number, i: number, fetch: ChunkFetch): Promise<Uint8Array> => {
    const key = keyOf(object, i)
    const chunk = inTurn(() => fetch(i * CHUNK, chunkEnd(total, i))).then((bytes) => {
      put(key, bytes)
      return bytes
    })
    chunk
      .catch(() => {})
      .finally(() => {
        if (coming.get(key) === chunk) coming.delete(key)
      })
    coming.set(key, chunk)
    return chunk
  }
  return {
    get bytes() {
      return size
    },
    get asking() {
      return asking
    },
    keep(object, total, begin, bytes) {
      const c = chunksOf(total, begin, begin + bytes.byteLength)
      if (!c) return
      for (let i = c[0]; i < c[1]; i++)
        put(keyOf(object, i), bytes.slice((i - c[0]) * CHUNK, chunkEnd(total, i) - begin))
    },
    async read(object, total, begin, end, fetch, signal) {
      const c = chunksOf(total, begin, end)
      if (!c) return within(fetch(begin, end), signal)
      const [i0, i1] = c
      const lookup = (i: number) => take(keyOf(object, i)) ?? coming.get(keyOf(object, i)) ?? null
      const mine = new Set<number>()
      const parts: (Uint8Array | Promise<Uint8Array>)[] = []
      for (let i = i0; i < i1; i++) {
        const p = lookup(i)
        if (p) parts.push(p)
        else {
          mine.add(i)
          parts.push(ask(object, total, i, fetch))
        }
      }
      const got = await Promise.allSettled(parts.map((p) => within(Promise.resolve(p), signal)))
      // this read's own failures are its answer (a refusal, the network's); another read's (its document let go, its network)
      // are asked again here, by this read, a few rounds at most
      for (let k = 0; k < got.length; k++) {
        const g = got[k] as PromiseSettledResult<Uint8Array>
        if (g.status === 'rejected' && (mine.has(i0 + k) || signal.aborted)) throw g.reason
      }
      for (let round = 0; got.some((g) => g.status === 'rejected'); round++) {
        let lastError: unknown = null
        const again: [number, Promise<Uint8Array>, boolean][] = []
        for (let k = 0; k < got.length; k++) {
          if ((got[k] as PromiseSettledResult<Uint8Array>).status !== 'rejected') continue
          const p = lookup(i0 + k)
          if (p instanceof Uint8Array) got[k] = { status: 'fulfilled', value: p }
          else if (p) again.push([k, p, false])
          else again.push([k, ask(object, total, i0 + k, fetch), true])
        }
        const settled = await Promise.allSettled(again.map(([, p]) => within(p, signal)))
        settled.forEach((r, x) => {
          const [k, , own] = again[x] as [number, Promise<Uint8Array>, boolean]
          if (r.status === 'fulfilled') got[k] = r
          else if (own || signal.aborted) throw r.reason
          else lastError = r.reason
        })
        if (round >= OTHERS_ROUNDS && got.some((g) => g.status === 'rejected')) throw lastError
      }
      const out = new Uint8Array(end - begin)
      got.forEach((g, k) => {
        out.set((g as PromiseFulfilledResult<Uint8Array>).value, k * CHUNK)
      })
      return out
    },
  }
}
