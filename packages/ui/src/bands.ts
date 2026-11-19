// `@readarxiv/ui/bands`: the sentence highlight's built-in bands, as every host offers them and gives them to the reader: each
// its id (what a host's store keeps of the one chosen), its colour and its strength over the page (the share of its colour in
// the wash, which the reader's `bandPaint` clamps and writes). The first is the one a visitor starts on. A band's name is the
// catalogue's (`O.reading.builtInHighlights`, by id), never stored here. No module named, so that a host's pages take it with
// no pack and no control.

/** a built-in band of the highlight */
export interface BuiltInBand {
  readonly id: string
  readonly colour: string
  readonly opacity: number
}

/** the built-in bands, the first the default: Read Frog's green, and a sand and a sky picked against arXiv's white page and its
 *  dark reading */
export const BUILT_IN_BANDS: readonly BuiltInBand[] = Object.freeze([
  Object.freeze({ id: 'soft-green', colour: 'oklch(0.693 0.17 162.48)', opacity: 0.22 }),
  Object.freeze({ id: 'sand', colour: 'oklch(0.85 0.12 85)', opacity: 0.3 }),
  Object.freeze({ id: 'sky', colour: 'oklch(0.75 0.12 240)', opacity: 0.25 }),
])
