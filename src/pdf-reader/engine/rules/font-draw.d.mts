// font-draw.mjs's types (JavaScript until the engine's port)
import type { FaceId, RoleSet } from './font-roles.mjs'
/** whether every character of `text` (but white space and the default ignorable) is in one of `faces`' coverage or their fallbacks' */
export declare function canDraw(text: string, faces: readonly FaceId[], roles: RoleSet): boolean
