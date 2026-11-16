// A target's font roles as the rebuilt engine and typesetter give them: the role table (packages/engine src/fonts/font-roles.ts
// rolesFor), its CJK faces read from the typesetter's rule data (packages/typeset src/data/rules), as resolveRules reads that
// field (rules-for.ts: the language's where it names them, else its script's). Kept code only: it outlives today's engine,
// whose layout rules (rules/layout.mjs BUILTIN_RULES) it read until the cut-over's preparation (lane c1-rewrites)
import { type CjkFaces, type EnglishFamily, type RoleSet, rolesFor as roleTable } from '../../../packages/engine/src/fonts/font-roles.ts'
import { scriptOf } from '../../../packages/engine/src/fonts/script.ts'
import { LANGUAGES, SCRIPTS } from '../../../packages/typeset/src/data/rules/index.ts'

/** a target's CJK faces as the typesetter's rule data gives them: its language's where it names them, else its script's (null
 *  for an alphabet, and for a script the rules have none for) */
export function cjkFacesFor(target: string): CjkFaces | null {
  const language = Object.hasOwn(LANGUAGES, target) ? LANGUAGES[target] : undefined
  if (language && Object.hasOwn(language, 'cjkFaces')) return language.cjkFaces ?? null
  const script = scriptOf(target)
  return Object.hasOwn(SCRIPTS, script) ? (SCRIPTS[script]?.cjkFaces ?? null) : null
}

/** the role table's roles for a target and a paper's English family, its CJK faces the typesetter's rule data's */
export const rolesFor = (target: string, family: EnglishFamily): RoleSet => roleTable(target, family, cjkFacesFor(target))
