// The languages the reader typesets: apart, so that the background's warm-up can
// read them without the typesetting's LaTeX parser, which a service worker's bundle cannot carry.

/** The languages whose typesetting the multi-language gate verifies (parked/lab/spikes/lang-gate.mjs). Until #295 takes up the
 *  others, the reader sets these alone: single language first. Compared by language and script, since a tag reaches
 *  here as the extension's language table gives it — zh-TW for Traditional Chinese — and a script can be lost on the
 *  way: Bosnian, Uzbek and Azerbaijani in Cyrillic come as bs, uz and az, which say Latin */
export const VERIFIED = ['zh', 'zh-Hant', 'ja', 'ko', 'de', 'es', 'fr', 'pt', 'ru']
const languageAndScript = tag => { const l = new Intl.Locale(tag).maximize(); return `${l.language}-${l.script}` }
export const verified = tag => VERIFIED.some(v => languageAndScript(v) === languageAndScript(tag))
