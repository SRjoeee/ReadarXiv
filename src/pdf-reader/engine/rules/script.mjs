// The writing system a target is written in, which every rule of the engine is read by: the layout rules' scripts, the
// font roles, the units a target keeps, the TeX path's strategies. A module of its own, importing nothing.

/** the scripts already worked out, by tag: Intl.Locale's maximize is some microseconds a call, and the font roles ask it for every
 *  run of every unit laid (faceFor), one tag a reading. A handful of tags a page's life; the map is bounded all the same */
const SCRIPTS = new Map()
const SCRIPTS_MAX = 256
/** the script a BCP 47 tag is written in: its likely script (zh-TW → Hant, sr → Cyrl). A tag Intl.Locale refuses throws, as
 *  before, and is kept by nothing */
export const scriptOf = lang => {
  const known = SCRIPTS.get(lang)
  if (known !== undefined) return known
  const script = new Intl.Locale(lang).maximize().script
  if (SCRIPTS.size >= SCRIPTS_MAX) SCRIPTS.clear()
  SCRIPTS.set(lang, script)
  return script
}
