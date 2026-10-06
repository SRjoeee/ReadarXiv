// fonts.mjs's types: the original's fonts and the faces v0 draws in (ported from the prototype at 9e56fca)

/** a PDF font's class as its PostScript name tells it */
export interface FontClass {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
  /** the Latin family the browser should use: times, cm, palatino, charter, libertine, helvetica, cmss, courier, cmtt */
  design: string
  /** whether the name says anything (a Type 3 or renamed subset does not) */
  known: boolean
  name: string
}
/** a run's style: a font class without the name */
export interface Style { fam: string; bold?: boolean; italic?: boolean; caps?: boolean; design?: string; color?: string; known?: boolean }
/** the face a run is drawn in: a CSS family list, its weight and style, an oblique's skew, what its slant became */
export interface Face { family: string; weight: number; style: 'normal' | 'italic'; oblique: number; stand: string; caps?: boolean }
export declare function classifyFont(name: string, fallbackFamily?: string): FontClass
/** class, weight and slant: what the style match compares */
export declare const styleKey: (s: Style) => string
export declare const CJK_TARGETS: ReadonlySet<string>
export declare const scriptOfTarget: (to: string) => string
export declare const OBLIQUE_DEG: number
/** a run's face by its style, its class ('cjk' or 'latin') and the target */
export declare function faceOf(st: Style, cls: 'cjk' | 'latin', to: string): Face
/** a face's canvas font string at `px` */
export declare const fontString: (face: Face, px: number) => string
/** the web faces (Latin Modern) a set of designs needs, loaded once; `urlOf` gives a face file's URL by its name */
export declare function loadWebFaces(designs: readonly string[], urlOf?: (file: string) => string): Promise<unknown>
