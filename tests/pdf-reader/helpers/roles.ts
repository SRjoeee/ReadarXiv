import { type EnglishFamily, type RoleSet, rolesFor as roleTable } from '@/pdf-reader/engine/rules/font-roles.mjs'
import { scriptOf } from '@/pdf-reader/engine/rules/script.mjs'
import { BUILTIN_RULES, type Script } from '@/pdf-reader/engine/rules/layout.mjs'

/** a target's CJK faces as the built-in layout rules give them: its language's where it names them, else its script's
 *  (null for an alphabet, and for a script the rules have none for) */
export function cjkFacesFor(target: string) {
  const language = (BUILTIN_RULES.languages as Record<string, { cjkFaces?: unknown } | undefined>)[target]
  if (language && 'cjkFaces' in language) return language.cjkFaces as ReturnType<typeof cjkFacesOf>
  return cjkFacesOf(scriptOf(target))
}
const cjkFacesOf = (script: string) => ((BUILTIN_RULES.scripts as Record<string, (typeof BUILTIN_RULES.scripts)[Script] | undefined>)[script]?.cjkFaces ?? null)

/** the role table's roles for a target and a paper's English family, its CJK faces the built-in layout rules' */
export const rolesFor = (target: string, family: EnglishFamily): RoleSet => roleTable(target, family, cjkFacesFor(target))
