// colour.mjs's types
/** a CMYK colour (each 0 to 1) as PDF.js's DeviceCMYK turns it to RGB, 0xRRGGBB */
export declare function cmykToRgb(c: number, m: number, y: number, k: number): number
/** the fill of a driver's colour string (LaTeX's \current@color), 0xRRGGBB, or null where it is of no form known */
export declare function fillOfColour(s: string | null | undefined): number | null
