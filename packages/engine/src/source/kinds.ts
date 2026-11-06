// The source reader's one table of what TeX's packages are, by name: each entry is a fact about a package that the paper
// need not ship (the image's TeX tree holds it), so its name is all the source shows of it. What the paper defines itself is
// never listed here: it is read from TeX's own answer (definitions.ts).
import type { LexRules } from './tokens.ts'

/** commands that read their text as \verb does (the kernel's \verb; listings' \lstinline [keys] then a delimiter or a group;
 *  minted's \mintinline [opts]{language} then the same) */
export const INLINE_CODE: ReadonlyMap<string, 'verb' | 'listing' | 'minted'> = new Map([
  ['verb', 'verb'],
  ['lstinline', 'listing'],
  ['mintinline', 'minted'],
])

/** environments a package reads line by line up to their \end: the kernel's and verbatim.sty's verbatim, fancyvrb's,
 *  listings', minted's, moreverb's, filecontents, the packages that write their lines out (asy, dot2tex, pythontex,
 *  sagetex), comment.sty's, tcolorbox's listings; acmart's comment environments (\excludecomment{CCSXML} and its kin in the
 *  class, which a paper need not ship). A star is the same environment's */
export const LINE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'verbatim',
  'Verbatim',
  'BVerbatim',
  'LVerbatim',
  'SaveVerbatim',
  'VerbatimOut',
  'lstlisting',
  'minted',
  'comment',
  'filecontents',
  'tcblisting',
  'tcboutputlisting',
  'verbatimwrite',
  'verbatimtab',
  'boxedverbatim',
  'asy',
  'asydef',
  'dot2tex',
  'pythontex',
  'pycode',
  'pyblock',
  'pyverbatim',
  'sagesilent',
  'sageblock',
  'sagecommandline',
  'acks',
  'CCSXML',
  'printonly',
  'screenonly',
  'anonsuppress',
])

const unstarred = (env: string) => (env.endsWith('*') ? env.slice(0, -1) : env)

/** the tokenizer's rules from the packages' table alone, and with the paper's own line environments */
export function lexRules(own: ReadonlySet<string> = new Set()): LexRules {
  return {
    inline: (name) => INLINE_CODE.get(name) ?? null,
    lineEnv: (env) => LINE_ENVIRONMENTS.has(unstarred(env)) || own.has(env) || own.has(unstarred(env)),
  }
}
export const LEX_RULES: LexRules = lexRules()
