// A why as a record holds it: the format's bound on its length, a run of its control characters one space.
/** a why's length at most, UTF-16 code units: the format's bound on a part's `layout.why` (PDF-READER §19.6); unmeasured */
export const WHY_MAX = 300
/** a why as a record holds it: a run of control characters (a TeX log's raw bytes, a terminal's escapes) one space, within
 *  WHY_MAX */
export const whyText = (s: unknown) =>
  String(s ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters a why is kept without
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, WHY_MAX)
