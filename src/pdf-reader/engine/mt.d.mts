// mt.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'

/** a unit → the markers wire text, and the table from marker id back to the original piece */
export declare function serialize(u: SourceUnit): { wire: string; slots: unknown[]; lead: string; trail: string }
