// buildPrompts' case table: what BUILD_PROMPTS_DIGEST (src/providers/prompt.ts) is the hash of. Each case is one call of
// buildPromptsWith over the table's own data (its own protocol, built-ins and target names, so that the digest reads the
// rules alone: the product's data is PROMPT_TEXT_DIGEST's, hashed at load), and its outcome the system prompt and the
// message. Each of buildPrompts' rules has a case whose outcome that rule alone decides. A change to a rule that changes an
// outcome fails tests/providers/prompt.test.ts until `pnpm digests --write` writes the new digest, and every LLM
// translator's identity moves with it: its stored answers and rows are asked again. No test runner is imported here: the
// script reads this module as it is (scripts/digests.ts).
import { sha256Hex } from '@readarxiv/translate'
import { BUILD_PROMPTS_DIGEST, type BuiltPrompts, buildPromptsWith, type PromptData } from '@/providers/prompt'
import type { PromptsConfig } from '@/providers/prompt-library'
import type { TranslateContext, TranslateRequest } from '@/providers/types'

/** the case table's data: names that cannot be the product's */
export const CASE_DATA: PromptData = {
  protocol: 'PROTOCOL',
  builtIns: {
    default: { id: 'default', name: 'D', systemPrompt: 'Default into {{targetLanguage}}.', prompt: 'Default: {{input}} | {{glossary}}' },
    house: { id: 'house', name: 'H', systemPrompt: 'House into {{targetLanguage}}.', prompt: 'House: {{input}} | {{glossary}}' },
  },
  names: { cmn: 'Name of cmn', jpn: 'Name of jpn' },
}

/** buildPrompts' rules (prompt.ts buildPromptsWith, prompt-library.ts selectPrompt, renderTemplate,
 *  resolvePromptReplacementValue, prompt.ts formatGlossary), in the order the code reads them */
export const RULES = [
  'the protocol block after the system prompt',
  'a built-in by its id before one of the reader\'s own',
  'the reader\'s own by its id',
  'the default for an id that names none',
  'the target written as its name',
  'a target the names do not hold written as its code',
  'the input written as its segments\' JSON',
  'a value the paper does not give: Not available',
  'a value of white space alone: Not available',
  'the glossary one entry a line',
  'no glossary: None',
  'every variable replaced in one pass',
  'the input added after a message that lacks it',
  'the input added where the message lacks it, whatever the system prompt holds',
  'the target line added where neither part names it',
  'the target line not added where either part names it',
  'the glossary added where neither part names it',
  'the glossary added only where there is one',
  'the glossary not added where either part names it',
  'the glossary before the target line, the target line before the message',
] as const
export type Rule = (typeof RULES)[number]

export interface PromptCase {
  rule: Rule
  request: TranslateRequest
  prompts: PromptsConfig
}

const ONE = [{ term: 'kernel', translation: 'Kern' }]
const FULL: TranslateContext = { paperTitle: 'A title', abstract: 'An abstract.', sectionTitle: 'A section', glossary: ONE }
const request = (context?: TranslateContext, target = 'cmn'): TranslateRequest => ({
  segments: [{ id: 's1', text: 'Let <x id="1"/> be.' }],
  source: 'en',
  target,
  ...(context ? { context } : {}),
})
const own = (systemPrompt: string, prompt: string, id = 'mine'): PromptsConfig => ({ promptId: id, patterns: [{ id, name: id, systemPrompt, prompt }] })
/** a prompt of the reader's own writing every variable: nothing is added to it */
const EVERY = own('Into {{targetLanguage}}.', '{{input}} / {{paperTitle}} / {{abstract}} / {{sectionTitle}} / {{glossary}}')

export const CASES: readonly PromptCase[] = [
  { rule: 'the protocol block after the system prompt', request: request(FULL), prompts: EVERY },
  {
    rule: 'a built-in by its id before one of the reader\'s own',
    request: request(FULL),
    prompts: own('Own house into {{targetLanguage}}.', 'Own house: {{input}} {{glossary}}', 'house'),
  },
  { rule: 'the reader\'s own by its id', request: request(FULL), prompts: own('Mine into {{targetLanguage}}.', 'Mine: {{input}} {{glossary}}') },
  { rule: 'the default for an id that names none', request: request(FULL), prompts: { promptId: 'gone', patterns: [] } },
  { rule: 'the target written as its name', request: request(FULL, 'jpn'), prompts: EVERY },
  { rule: 'a target the names do not hold written as its code', request: request(FULL, 'x-unheld'), prompts: EVERY },
  { rule: 'the input written as its segments\' JSON', request: request(FULL), prompts: own('Into {{targetLanguage}}.', '{{input}} {{glossary}}') },
  { rule: 'a value the paper does not give: Not available', request: request({ glossary: ONE }), prompts: EVERY },
  { rule: 'a value of white space alone: Not available', request: request({ ...FULL, paperTitle: '   ' }), prompts: EVERY },
  {
    rule: 'the glossary one entry a line',
    request: request({ ...FULL, glossary: [...ONE, { term: 'lattice', translation: 'Gitter' }] }),
    prompts: EVERY,
  },
  { rule: 'no glossary: None', request: request({ ...FULL, glossary: [] }), prompts: EVERY },
  { rule: 'every variable replaced in one pass', request: request({ ...FULL, paperTitle: '{{input}}' }), prompts: EVERY },
  { rule: 'the input added after a message that lacks it', request: request(FULL), prompts: own('Into {{targetLanguage}}.', 'Lacks it: {{glossary}}') },
  {
    rule: 'the input added where the message lacks it, whatever the system prompt holds',
    request: request(FULL),
    prompts: own('Into {{targetLanguage}}: {{input}}', 'Lacks it: {{glossary}}'),
  },
  { rule: 'the target line added where neither part names it', request: request(FULL), prompts: own('Translate.', '{{input}} {{glossary}}') },
  { rule: 'the target line not added where either part names it', request: request(FULL), prompts: own('Translate.', '{{input}} into {{targetLanguage}} {{glossary}}') },
  { rule: 'the glossary added where neither part names it', request: request(FULL), prompts: own('Into {{targetLanguage}}.', '{{input}}') },
  { rule: 'the glossary added only where there is one', request: request({ ...FULL, glossary: [] }), prompts: own('Into {{targetLanguage}}.', '{{input}}') },
  { rule: 'the glossary not added where either part names it', request: request(FULL), prompts: own('Into {{targetLanguage}} with {{glossary}}.', '{{input}}') },
  { rule: 'the glossary before the target line, the target line before the message', request: request(FULL), prompts: own('Translate.', 'Bare.') },
]

type Build = (data: PromptData, request: TranslateRequest, prompts: PromptsConfig) => BuiltPrompts
/** one case's outcome: the system prompt and the message, or what it threw */
export function outcomeOf(c: PromptCase, build: Build = buildPromptsWith): [string, string] | { threw: string } {
  try {
    const b = build(CASE_DATA, c.request, c.prompts)
    return [b.system, b.prompt]
  } catch (e) {
    return { threw: String(e) }
  }
}
/** The behaviour digest of buildPrompts' rules: the SHA-256 of every case's outcome, in the table's order */
export const buildPromptsDigestOf = (build: Build = buildPromptsWith): string => sha256Hex(JSON.stringify(CASES.map(c => outcomeOf(c, build))))

/** its entry in `pnpm digests` (scripts/digests.ts), beside the translate package's */
export const PROMPT_DIGESTS = [
  { name: 'BUILD_PROMPTS_DIGEST', file: 'src/providers/prompt.ts', literal: BUILD_PROMPTS_DIGEST, compute: async () => buildPromptsDigestOf() },
]
