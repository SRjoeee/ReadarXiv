// The faces a reader paints translations in (no state outside a reader, design §4.5): each a FontFace of its own family name,
// made from bytes read through the reader's fetch (a font is fetched as data, never imported: Chromium keeps a failed import()
// failed for the page's life, W faces.ts:10-13), added to the document while the reader lives and taken out with it, and a class
// a run is drawn with. A face the table names a local family for (a test's, a system's) is that family.
//
// Loaded in waves (layer-side.mjs warmPages, docs/PDF-READER.md §11.8): the faces asked together are read in the order asked
// (the page in the middle of the view first), WAVE_SLOTS at a time, so that a wave does not hold the original's reads behind
// it; each asked once. A face whose answer is a 4xx other than 408 and 429 is never asked again (W faces.ts:69-72); any other
// failure (the network, a 5xx, a 408 or 429) is forgotten, and asked again by the next wave that wants it.
import type { Fetch } from '../bytes/source.ts'
import type { FaceId } from './page.ts'

export interface FaceEntry {
  /** where its font file is read (through the reader's fetch); none: `local` */
  src?: string
  /** a family the browser has, used as it is */
  local?: string
  weight?: string
  style?: string
  /** families after it, for characters it lacks */
  fallback?: string
}
export type FaceTable = Readonly<Record<FaceId, FaceEntry>>
/** how many faces a wave reads at a time (layer-side.mjs WAVE_SLOTS) */
export const WAVE_SLOTS = 4

export interface Faces {
  /** the class a run of `id` is drawn with */
  classOf(id: FaceId): string
  /** the CSS family a run of `id` is measured and drawn in */
  familyOf(id: FaceId): string
  /** the faces loaded (each once), in the order given, WAVE_SLOTS at a time; a face that cannot be read is left to its
   *  fallback, and told */
  ready(ids: Iterable<FaceId>): Promise<void>
  /** the faces asked of the network, and the most read at once (the probe's) */
  readonly asked: number
  readonly most: number
  dispose(): void
}

let readers = 0
export function createFaces(o: {
  table: FaceTable
  fetch: Fetch
  root: HTMLElement
  warn?(what: string, e: unknown): void
  /** a face lost: its passages drawn in its fallback for good (an answer no ask would mend), or again after it was asked once
   *  more (a failure that may pass, met twice): told once a face */
  lost?(id: FaceId): void
}): Faces {
  const rid = ++readers
  const sheet = document.createElement('style')
  o.root.append(sheet)
  const classes = new Map<FaceId, string>()
  const loading = new Map<FaceId, Promise<void>>()
  /** the faces whose read failed once, and those told lost */
  const failed = new Set<FaceId>(),
    told = new Set<FaceId>()
  const added: FontFace[] = []
  /** let go: a face whose read ends after is not added (it would outlive the reader in the document) */
  let gone = false
  /** the reads waiting for a slot, and the slots taken */
  const waiting: (() => void)[] = []
  let busy = 0,
    asked = 0,
    most = 0
  const slot = () =>
    new Promise<void>((go) => {
      if (busy < WAVE_SLOTS) {
        busy++
        most = Math.max(most, busy)
        go()
      } else waiting.push(go)
    })
  const free = () => {
    const next = waiting.shift()
    if (next) next()
    else busy--
  }
  class Answer extends Error {
    readonly status: number
    constructor(status: number) {
      super(`answered ${status}`)
      this.status = status
    }
  }
  /** a 4xx other than 408 and 429: the face is not there, and will not be (asking again would only fail again) */
  const lasting = (e: unknown) =>
    e instanceof Answer && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429
  const familyOf = (id: FaceId) => {
    const e = o.table[id]
    return e?.local
      ? `${JSON.stringify(e.local)}${e.fallback ? `, ${e.fallback}` : ''}`
      : `"axt-${rid}-${id.replace(/[^a-z0-9-]/gi, '_')}"${e?.fallback ? `, ${e.fallback}` : ''}`
  }
  const classOf = (id: FaceId) => {
    let c = classes.get(id)
    if (c) return c
    c = `axt-f${rid}-${classes.size}`
    classes.set(id, c)
    const e = o.table[id] ?? {}
    sheet.sheet?.insertRule(
      `.${c}{font-family:${familyOf(id)};font-weight:${e.weight ?? 'normal'};font-style:${e.style ?? 'normal'}}`,
    )
    return c
  }
  return {
    classOf,
    familyOf,
    ready(ids) {
      const waits: Promise<void>[] = []
      for (const id of ids) {
        const e = o.table[id]
        if (!e?.src) continue
        let p = loading.get(id)
        if (!p) {
          const mine: Promise<void> = (async () => {
            await slot()
            try {
              asked++
              const r = await o.fetch(e.src as string)
              if (!r.ok) throw new Answer(r.status)
              const face = new FontFace(`axt-${rid}-${id.replace(/[^a-z0-9-]/gi, '_')}`, await r.arrayBuffer(), {
                weight: e.weight ?? 'normal',
                style: e.style ?? 'normal',
              })
              await face.load()
              if (gone) return
              document.fonts.add(face)
              added.push(face)
            } finally {
              free()
            }
          })().catch((err) => {
            o.warn?.(`the face ${id}`, err)
            if (!gone && !told.has(id) && (lasting(err) || failed.has(id))) {
              told.add(id)
              o.lost?.(id)
            }
            failed.add(id)
            // (a failure that may pass is forgotten: the next wave that wants the face asks it again)
            if (!lasting(err) && loading.get(id) === mine) loading.delete(id)
          })
          p = mine
          loading.set(id, p)
        }
        waits.push(p)
      }
      return Promise.all(waits).then(() => {})
    },
    get asked() {
      return asked
    },
    get most() {
      return most
    },
    dispose() {
      gone = true
      for (const f of added) document.fonts.delete(f)
      added.length = 0
      sheet.remove()
    },
  }
}
