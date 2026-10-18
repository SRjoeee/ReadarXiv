// src/pdf-reader/engine/layer-proto/break-room.mjs
// TeX's room after a forced break, read from the layout file's lines, one place: the drawing leaves it after the line the
// break ends (tex.mjs forcedBreaks, layer2.mjs breakLines), and the layer gate's measure slotsSkipped credits it (the gate
// imports this file: lab/pdf/spikes/layer-gate/measure.mjs fileIndexOf). Imports nothing.

/** a frame's pitch: the median of the gaps between two of its text lines next to each other, its breaks' gaps aside (the
 *  caller's: a break's gap is its own room, not the frame's pitch); null where there is none */
export function pitchOf(gaps) {
  const g = gaps.filter(v => v > 0).sort((a, b) => a - b)
  return g.length ? (g[(g.length - 1) >> 1] + g[g.length >> 1]) / 2 : null
}

/** two lines' distance with no break between them, as TeX sets it: the pitch, or, where the pitch would set the next line's
 *  top nearer the line before's foot than \lineskiplimit, that line's depth, the next line's height and \lineskip
 *  (`lineskip`, the paper's [\lineskip, \lineskiplimit], the layout file's; null: the pitch). Never under the pitch */
export function naturalOf(pitch, depth, height, lineskip) {
  return lineskip && pitch - depth - height < lineskip[1] ? Math.max(pitch, depth + height + lineskip[0]) : pitch
}

/** the room a forced break leaves, in pitches: its gap less the two lines' natural distance, over the pitch, never under 0,
 *  to a thousandth (1 for `\\ \\`, whose second break sets an empty line; 0 for a lone `\\`; 0.63 for `\vspace{0.3cm}\\` at a
 *  pitch of 13.6) */
export function roomOf(gap, pitch, natural) {
  return Math.max(0, Math.round(((gap - natural) / pitch) * 1000) / 1000)
}
