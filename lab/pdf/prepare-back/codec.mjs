// lab/pdf/prepare-back/codec.mjs: the host's deflate and bounded inflate as the back half's prepare takes them (its `deflate`
// and `inflate`), Node's zlib: one definition for the lab's hosts of the prepare that give it these two (prepare-back's runner,
// run.mjs, and lab/pdf/spikes/q1-check.mjs).
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { isMemoryError } from '@readarxiv/engine'

export const deflate = b => new Uint8Array(deflateSync(b))
// (the bounded inflate's refusal and a failed allocation thrown as they came: only a stream zlib refuses is read again raw. A
// failed allocation read again raw came back as a data error the wrap took for its page's: memory.mjs)
export const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE' || isMemoryError(e)) throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
