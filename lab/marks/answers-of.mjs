// lab/marks/answers-of.mjs: today's probe answers (lab/marks/answers.mjs) as markSource takes them: their sources (the inkless
// and apart macros' calls, the look-ahead pairs' keys) are today's engine's strings, UTF-8 bytes read latin1; SourceDoc's are
// Unicode. Not shipped.
const UTF8 = new TextDecoder()
export const unicodeOf = s => (typeof s === 'string' && /[\x80-\xff]/.test(s) && ![...s].some(c => c.charCodeAt(0) > 0xff) ? UTF8.decode(Uint8Array.from(s, c => c.charCodeAt(0))) : s)
export const answersOf = a => ({
  switches: a?.switches ? Object.fromEntries(Object.entries(a.switches).map(([k, v]) => [unicodeOf(k), v])) : null,
  inkless: a?.inkless?.map(unicodeOf) ?? null,
  complete: a?.complete ?? null,
  apart: a?.apart?.map(unicodeOf) ?? null,
  /** the text the probe showed each macro sets (readInkTexts' pairs: answers.json keeps them as pairs, or flat): a Map,
   *  source -> text. Until the fifth owner of stage 1b this read the pairs as a flat list, and every run took no text */
  texts: Array.isArray(a?.texts) ? new Map(Array.isArray(a.texts[0]) ? a.texts.map(([s, t]) => [unicodeOf(s), unicodeOf(t)]) : Array.from({ length: Math.floor(a.texts.length / 2) }, (_, j) => [unicodeOf(a.texts[2 * j]), unicodeOf(a.texts[2 * j + 1])])) : null,
})
