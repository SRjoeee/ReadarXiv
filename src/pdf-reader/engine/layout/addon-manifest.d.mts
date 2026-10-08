// addon-manifest.mjs's types: the add-on's manifest as a reader reads it, for the readers, the remover and their tests
/** the remover's version: it enters the add-on's key and a bundle's; a manifest names it, and a reader reads that for its shape
 *  alone (layout/remove.mjs re-exports it) */
export declare const REMOVAL: '5'
/** the add-on's bytes at most (the bytes after arXiv's), its manifest's bytes and values */
export declare const ADDON_CAP: number
export declare const ADDON_MANIFEST_CAP: number
export declare const ADDON_MANIFEST_VALUES: number
/** a refused page's reason at most, in code units */
export declare const REFUSED_MAX: number
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
 *  (where given) each page's x0, y0, x1, y1, a box then within its page's; `shipped`, the shipped add-on's form alone (no
 *  check's set, outline table nor colours). Returns it as it is; throws LayoutRefusal */
export declare function checkAddonManifest(manifest: unknown, o: { pages: number; views?: readonly number[] | null; shipped?: boolean }): RemovalManifest
/** the manifest read within bounds: schema 1, removal a version token (any remover's), pages the layout file's, sets, each page's entry (ok,
 *  refused at most 200 characters, at within the add-on's pages, dirty and rules finite numbers stride 4 within the
 *  page's view, units' boxes likewise); values counted before JSON.parse; throws LayoutRefusal */
export declare function parseAddonManifest(bytes: Uint8Array, o: { pages: number; views?: readonly number[] | null; shipped?: boolean }): RemovalManifest
/** boxes x0, y0, x1, y1 (stride 4) on page `page` (1-based): finite, none empty, within the page's view by 1 where `views` is given (4 × pages numbers),
 *  else within the coordinate bound; throws LayoutRefusal at the number that breaks it */
export declare function checkBoxes(boxes: unknown, page: number, views: readonly number[] | null, path: string): number[]
