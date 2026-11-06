// The faces a reader paints translations in (no state outside a reader, design §4.5): each a FontFace of its own family name,
// made from bytes read through the reader's fetch (a font is fetched as data, never imported: Chromium keeps a failed import()
// failed for the page's life, W faces.ts:10-13), added to the document while the reader lives and taken out with it, and a class
// a run is drawn with. A face the table names a local family for (a test's, a system's) is that family.
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

export interface Faces {
  /** the class a run of `id` is drawn with */
  classOf(id: FaceId): string
  /** the CSS family a run of `id` is measured and drawn in */
  familyOf(id: FaceId): string
  /** the faces loaded (each once); a face that cannot be read is left to its fallback, and told */
  ready(ids: Iterable<FaceId>): Promise<void>
  dispose(): void
}

let readers = 0
export function createFaces(o: {
  table: FaceTable
  fetch: Fetch
  root: HTMLElement
  warn?(what: string, e: unknown): void
}): Faces {
  const rid = ++readers
  const sheet = document.createElement('style')
  o.root.append(sheet)
  const classes = new Map<FaceId, string>()
  const loading = new Map<FaceId, Promise<void>>()
  const added: FontFace[] = []
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
          p = (async () => {
            const r = await o.fetch(e.src as string)
            if (!r.ok) throw new Error(`the face ${id} answered ${r.status}`)
            const face = new FontFace(`axt-${rid}-${id.replace(/[^a-z0-9-]/gi, '_')}`, await r.arrayBuffer(), {
              weight: e.weight ?? 'normal',
              style: e.style ?? 'normal',
            })
            await face.load()
            document.fonts.add(face)
            added.push(face)
          })().catch((err) => o.warn?.(`the face ${id}`, err))
          loading.set(id, p)
        }
        waits.push(p)
      }
      return Promise.all(waits).then(() => {})
    },
    dispose() {
      for (const f of added) document.fonts.delete(f)
      added.length = 0
      sheet.remove()
    },
  }
}
