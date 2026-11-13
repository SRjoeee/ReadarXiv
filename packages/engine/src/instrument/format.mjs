// Moved into the engine package from src/pdf-reader/engine/layer-proto/format.mjs: the part of that module the moved front half calls, as it is; the rest
// stays there and imports this part back through its transition path.
/** a why's length at most, UTF-16 code units: the format's bound on a part's `layout.why` (PDF-READER §19.6); unmeasured */
export const WHY_MAX = 300
/** a why as a record holds it: a run of control characters (a TeX log's raw bytes, a terminal's escapes) one space, within
 *  WHY_MAX */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters a why is kept without
export const whyText = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, WHY_MAX)
