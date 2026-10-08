// The writing system a target is written in, which every rule of the engine is read by: the layout rules' scripts, the
// font roles, the units a target keeps, the TeX path's strategies. A module of its own, importing nothing.

/** the script a BCP 47 tag is written in: its likely script (zh-TW → Hant, sr → Cyrl) */
export const scriptOf = lang => new Intl.Locale(lang).maximize().script
