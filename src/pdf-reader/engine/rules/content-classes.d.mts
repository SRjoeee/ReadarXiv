// content-classes.mjs's types
export type Toggle = 'always' | 'heads' | 'tables' | 'figures' | 'references' | 'names' | 'never'
export type ClassId = 'body' | 'generated' | 'contents' | 'notes' | 'orphan' | 'heads' | 'tables' | 'figures' | 'ocr' | 'references' | 'index' | 'names' | 'math' | 'code' | 'symbols'
export interface ClassPolicy {
  /** the reader's toggle the class is shown under */
  readonly toggle: Toggle
  /** what exists today: translated and drawn, accounted for with no path yet, or kept as the original's by design */
  readonly state: 'built' | 'planned' | 'never'
  /** whether the ledger can give a glyph this class */
  readonly glyphs: boolean
  /** what its text and its place are read from */
  readonly truth: string
}
/** the reader's toggles, in the settings' order */
export declare const TOGGLES: readonly Toggle[]
/** the kind of a figure's ink unit */
export declare const FIGURE_KIND: 'inkfigures'
/** the kind of a bitmap figure's label (layout/bitmap-text.mjs) */
export declare const OCR_KIND: 'inkocr'
/** each class's policy, in code order */
export declare const CLASSES: Readonly<Record<ClassId, ClassPolicy>>
/** the classes by their code */
export declare const CLASS_IDS: readonly ClassId[]
/** a class's code */
export declare const CLASS_CODE: Readonly<Record<ClassId, number>>
/** a unit's class by its kind */
export declare const UNIT_CLASS: Readonly<Record<string, ClassId>>
/** a unit's class: of the front end's unit, of the bundle's, or of a kind; null for none */
export declare function unitClass(u: string | { kind?: unknown } | readonly unknown[] | null | undefined): ClassId | null
/** each toggle's default where a reader has set none */
export declare const TOGGLE_DEFAULTS: Readonly<Record<Exclude<Toggle, 'always' | 'never'>, boolean>>
/** whether a class is shown translated under a reader's toggles turned on */
export declare function shownTranslated(cls: string, on: ReadonlySet<string> | null | undefined): boolean
/** the toggles on under a reader's `classes` ({ [toggle]: boolean } over TOGGLE_DEFAULTS; null, the defaults) */
export declare function classesOn(classes: Partial<Record<Exclude<Toggle, 'always' | 'never'>, boolean>> | null | undefined): Set<Toggle>
/** whether a unit is shown translated under the toggles on: its class's */
export declare function unitShown(u: string | { kind?: unknown } | readonly unknown[] | null | undefined, on: ReadonlySet<string> | null | undefined): boolean
