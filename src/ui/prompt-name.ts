// A prompt's name as the pages draw it (the maintainer, 2026-09-28: the built-ins named in the interface's language).
// The prompt library is the core's and may import no pack (the platform boundary), so its built-ins carry English
// names; the pack names them here (O.prompts.builtInNames), by id. One's own prompt keeps the name it was given
import { BUILT_IN_PROMPTS, type PromptTemplate } from '@/providers/prompt-library'
import { O } from './strings'

/** A built-in's name from the pack, one's own as stored. Own properties only: an id like "constructor" names nothing */
export function promptName(prompt: Pick<PromptTemplate, 'id' | 'name'>): string {
  if (!Object.hasOwn(BUILT_IN_PROMPTS, prompt.id)) return prompt.name
  const names: Readonly<Record<string, string>> = O.prompts.builtInNames
  return Object.hasOwn(names, prompt.id) ? names[prompt.id]! : prompt.name
}
