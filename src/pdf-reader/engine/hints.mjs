// What the TeX page is told a visit will use (its protocol 2 hints), in a module that imports nothing: the reader's
// compilers send them (session.mjs), and the warm-up downloads ahead what they name for the target language
// (entrypoints/ocr/main.ts) — the offscreen document cannot load the typesetting's modules, whose chunk brings the
// reader's session with it. The rule is scripts.mjs's, kept equal to strategiesFor by tests/pdf-reader/tex-hints.test.ts:
// a CJK script goes to XeLaTeX with xeCJK and its faces; an alphabet stays with the paper's own engine.

/** the scripts whose first strategy is XeLaTeX with xeCJK, setting the script's faces (scripts.mjs CJK's keys) */
export const CJK_SCRIPTS = ['Hans', 'Hant', 'Jpan', 'Kore']
const scriptOf = lang => new Intl.Locale(lang).maximize().script
/** classic LaTeX is compiled by pdfLaTeX */
const engineOf = name => (name === 'latex' ? 'pdflatex' : name)

/**
 * The engines — the paper's own (the font probe, the marked original) and the first strategy's for the language —
 * and the CJK script whose faces that strategy sets. `own`: the marked original's compiler, the paper as it is in its
 * own engine alone
 */
export function texHints(meta, lang, own = false) {
  const engine = engineOf(meta.compiler)
  const cjk = !own && CJK_SCRIPTS.includes(scriptOf(lang))
  return { engines: [...new Set([engine, cjk ? 'xelatex' : engine].filter(Boolean))], fonts: cjk ? [scriptOf(lang)] : [] }
}
