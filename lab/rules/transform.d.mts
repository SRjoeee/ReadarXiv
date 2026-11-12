// transform.mjs's types
import type { Edit, SiteMap } from './sites.mjs'

export declare function instrument(map: SiteMap, path: string, text: string): string | null
export declare function applyEdits(text: string, edits: Edit[]): string
