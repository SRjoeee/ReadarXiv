// addon-manifest.mjs's types: the add-on's manifest as a reader reads it, for the readers, the remover and their tests
/** the remover's version: it enters the add-on's key (layout/remove.mjs re-exports it) */
export declare const REMOVAL: '4'
/** the add-on's bytes at most (the bytes after arXiv's), its manifest's bytes and values */
export declare const ADDON_CAP: number
export declare const ADDON_MANIFEST_CAP: number
export declare const ADDON_MANIFEST_VALUES: number
/** the add-on's manifest: per page whether it is removed (`ok`) or why not, and each unit's removed boxes (x0, y0, x1, y1
 *  stride 4, PDF units); the sets' places (each its page p at offset + p), or, compact, each page's own (`at`, the
 *  combined document's page by set); the kept ink under the page's units' rectangles (`dirty`, x0, y0, x1, y1 stride 4);
 *  the rules near the layout file's lines (`rules`, the same: layer-proto/removal.mjs pageRules); the check's crops'
 *  colours and outline table */
export interface RemovalManifest {
  schema: 1; removal: string; pages: number; sets: Record<string, number>
  page: Record<number, { ok: boolean; refused?: string; units?: Record<number, number[]>; at?: Record<string, number>; dirty?: number[]; rules?: number[] }>
  appended: number; stats: Record<string, number>; colours?: Record<string, number[]>
  /** the check's: each font's characters and their outline boxes, thousandths of an em (layout/ink.mjs outlineTable) */
  outlines?: Record<string, (string | number)[]>
}
/** a manifest already parsed, by every bound parseAddonManifest checks past JSON.parse; `pages` the paper's, `views`
 *  (where given) each page's x0, y0, x1, y1, a box then within its page's. Returns it as it is; throws LayoutRefusal */
export declare function checkAddonManifest(manifest: unknown, o: { pages: number; views?: readonly number[] | null }): RemovalManifest
/** the manifest read within bounds: schema 1, removal REMOVAL, pages the layout file's, sets, each page's entry (ok,
 *  refused at most 200 characters, at within the add-on's pages, dirty and rules finite numbers stride 4 within the
 *  page's view, units' boxes likewise); values counted before JSON.parse; throws LayoutRefusal */
export declare function parseAddonManifest(bytes: Uint8Array, o: { pages: number; views?: readonly number[] | null }): RemovalManifest
