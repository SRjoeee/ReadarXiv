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
})
