// What a language model is sent and how its reply is read, in the two request shapes a model entry names: Anthropic's
// Messages API (`anthropic-messages`) and the OpenAI chat form (`openai-chat`: OpenAI, OpenRouter, SiliconFlow and the
// rest). The request is the 11-06 LLM probe's (units keyed by a string id, typed tags, a JSON schema, reasoning off or
// minimal), written as our own code; its prompt gains the names sentence the probe measured on figure labels, the quote
// rule its cut unit asked for, and context rule v1: the paper's title and abstract, as context not to be translated.
//
// Paper text is hostile input: no tools in any request, `max_tokens` from the request's own size, the reply read only as
// translations by id. An entry's `reasoning` and `sampling` are its own data (the probe's per provider: Anthropic's
// `thinking` and `effort`, OpenRouter's `reasoning`, SiliconFlow's `enable_thinking`), spread at the body's top level
// (Anthropic's `effort` into `output_config`), never over a field of ours and never a tool.
import type { Lang } from '../contract.ts'
import type { ModelEntry } from '../policy.ts'
import { sha256Hex } from '../sha256.ts'

export type Shape = 'anthropic-messages' | 'openai-chat'
/** the fields of a model entry that change its text (design §1); a ModelEntry is one */
export type LlmEntry = Pick<ModelEntry, 'provider' | 'model' | 'upstream' | 'shape' | 'json' | 'reasoning' | 'sampling'>

/** the context a request carries: the paper's title and abstract, in the source language, not to be translated. A
 *  glossary kept across a paper's requests would be `context/2`, another producer */
export const CONTEXT_RULE = 'context/1'

/** each target the prompt names, by BCP-47, in English; `supports` reads it */
export const LLM_TARGETS: Readonly<Record<Lang, string>> = Object.freeze({
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  id: 'Indonesian',
  ms: 'Malay',
  cs: 'Czech',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  sv: 'Swedish',
  tr: 'Turkish',
  ru: 'Russian',
  bg: 'Bulgarian',
  uk: 'Ukrainian',
})

/** the Messages API version every request names (the probe's; Anthropic's versioning page lists a newer one) */
export const ANTHROPIC_VERSION = '2023-06-01'

/** what a reply reports it used: reasoning tokens are within the output tokens */
export interface Usage {
  inTokens: number
  outTokens: number
  reasoningTokens: number
}
export interface Reply {
  /** each unit's text by id, the first of an id kept; null where the reply holds no units object */
  units: ReadonlyMap<string, string> | null
  usage: Usage | null
  /** `length`: the reply stopped at its token limit (or the model's context), so the request was too large */
  stop: 'end' | 'length' | 'other'
  /** the upstream provider the reply names (OpenRouter's `provider`); null where none is named */
  upstream: string | null
}

/** the reply's schema: every unit by id with its text */
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['units'],
  additionalProperties: false,
} as const

/** the prompt, its target's name and its context lines given */
const promptOf = (target: string, context: readonly string[]): string =>
  [
    `You are a translation engine for academic papers. Translate the text of each unit in the input into ${target}. The units are consecutive parts (paragraphs, headings, captions, table cells, footnotes, bibliography entries) of one paper.`,
    ...(context.length ? ['', ...context] : []),
    '',
    'The input is a JSON object {"units": [{"id": ..., "text": ...}]}. A unit\'s text holds element tags, each with a letter for its kind and a number unique in the unit:',
    '- <m1/> an inline formula, <d2/> a displayed formula, <c3/> a citation, <r4/> a reference to a section, figure or equation, <f5/> a footnote mark, <u6/> a link, <x7/> another piece kept as it is: void tags, never translated;',
    "- <s8>…</s8> styled words (bold, italic, a colour, a link's words): translate the words inside and keep the tags around their translation.",
    'Keep every tag exactly once, with the same letter and number, in the place the translated sentence needs it; never translate, renumber, merge or add a tag. "&amp;", "&lt;" and "&gt;" stand for "&", "<" and ">": keep them as they are.',
    'Keep names (models, datasets, methods, tools, people), acronyms, identifiers and code exactly as written: never translate, transliterate, expand or explain them.',
    'Inside a text, write a quotation mark as “ ” or as an escaped \\", never as a bare ".',
    '',
    'Reply with a JSON object {"units": [{"id": ..., "text": ...}]} that has every input id exactly once, in the input\'s order, each with its unit\'s translation. Output the JSON object only.',
  ].join('\n')

/** context rule v1's lines: each part a JSON string, so that no quote or line break of it leaves its line */
const contextLinesOf = (title: string | undefined, abstract: string | undefined): string[] => {
  if (!title && !abstract) return []
  return [
    "The paper's title and abstract, as context, not to be translated:",
    ...(title ? [`Title: ${JSON.stringify(title)}`] : []),
    ...(abstract ? [`Abstract: ${JSON.stringify(abstract)}`] : []),
  ]
}

/** sha256 of the prompt's template, the context lines' template, the reply schema and the targets' names: inside every LLM
 *  translator's identity (llm.ts llmIdentityOf), so a change to any is another identity and its rows are asked again */
export const PROMPT_DIGEST: string = sha256Hex(
  JSON.stringify([
    promptOf('<target>', ['<context>']),
    contextLinesOf('<title>', '<abstract>'),
    REPLY_SCHEMA,
    Object.entries(LLM_TARGETS),
  ]),
)

/** the system prompt for a target, under context rule v1 */
export function systemOf(target: Lang, context: { title?: string; abstract?: string } | undefined): string {
  const name = Object.hasOwn(LLM_TARGETS, target) ? LLM_TARGETS[target] : undefined
  if (name === undefined) throw new RangeError(`llm: no name for the target ${target}`)
  return promptOf(name, contextLinesOf(context?.title, context?.abstract))
}

/** a request's output limit: 256 and one token a wire character (the probe: about 0.47 output tokens a source character,
 *  zh), at most 16,000 */
export const maxTokensOf = (wireChars: number): number => Math.min(16_000, 256 + Math.max(0, wireChars))

/** fields an entry's data may not set: ours, and every tool or stream */
const OURS = new Set([
  'model',
  'max_tokens',
  'system',
  'messages',
  'output_config',
  'response_format',
  'provider',
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'stream',
  'metadata',
])
const extraOf = (o: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !OURS.has(k)))

/** one request's body, as the entry's shape writes it */
export function bodyOf(
  entry: LlmEntry,
  o: { system: string; units: readonly { id: string; text: string }[]; maxTokens: number },
): string {
  const user = JSON.stringify({ units: o.units })
  const { effort, ...reasoning } = entry.reasoning ?? {}
  if (entry.shape === 'anthropic-messages') {
    const output = {
      ...(effort !== undefined ? { effort } : {}),
      ...(entry.json === 'schema' ? { format: { type: 'json_schema', schema: REPLY_SCHEMA } } : {}),
    }
    return JSON.stringify({
      ...extraOf(reasoning),
      ...extraOf(entry.sampling),
      model: entry.model,
      max_tokens: o.maxTokens,
      system: o.system,
      messages: [{ role: 'user', content: user }],
      ...(Object.keys(output).length ? { output_config: output } : {}),
    })
  }
  return JSON.stringify({
    ...extraOf(entry.reasoning),
    ...extraOf(entry.sampling),
    model: entry.model,
    max_tokens: o.maxTokens,
    messages: [
      { role: 'system', content: o.system },
      { role: 'user', content: user },
    ],
    response_format:
      entry.json === 'schema'
        ? { type: 'json_schema', json_schema: { name: 'units', strict: true, schema: REPLY_SCHEMA } }
        : { type: 'json_object' },
    ...(entry.upstream?.length
      ? { provider: { order: [...entry.upstream], allow_fallbacks: false, require_parameters: true } }
      : {}),
  })
}

/** a request's headers, as its shape needs them; the host adds its own (a key's alias) */
export function headersOf(shape: Shape): Readonly<Record<string, string>> {
  return shape === 'anthropic-messages'
    ? { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION }
    : { 'content-type': 'application/json' }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const json = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** a reply text's units by id: the first of an id kept, an entry that is no `{ id, text }` of strings passed over */
function unitsOf(text: string): ReadonlyMap<string, string> | null {
  const v = json(text)
  if (!isObject(v) || !Array.isArray(v.units)) return null
  const out = new Map<string, string>()
  for (const u of v.units)
    if (isObject(u) && typeof u.id === 'string' && typeof u.text === 'string' && !out.has(u.id)) out.set(u.id, u.text)
  return out
}

/** a 2xx reply's body read as its shape writes it */
export function replyOf(shape: Shape, text: string): Reply {
  const b = json(text)
  if (!isObject(b)) return { units: null, usage: null, stop: 'other', upstream: null }
  const u = isObject(b.usage) ? b.usage : {}
  if (shape === 'anthropic-messages') {
    const content = Array.isArray(b.content) ? b.content : []
    const said = content
      .filter((c): c is Record<string, unknown> => isObject(c) && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('')
    const inTokens = count(u.input_tokens)
    const outTokens = count(u.output_tokens)
    const details = isObject(u.output_tokens_details) ? u.output_tokens_details : {}
    return {
      units: unitsOf(said),
      usage:
        inTokens !== null && outTokens !== null
          ? { inTokens, outTokens, reasoningTokens: count(details.thinking_tokens) ?? 0 }
          : null,
      // (the Messages API's stop reasons: `max_tokens` and `model_context_window_exceeded` stop the reply for its size)
      stop:
        b.stop_reason === 'end_turn'
          ? 'end'
          : b.stop_reason === 'max_tokens' || b.stop_reason === 'model_context_window_exceeded'
            ? 'length'
            : 'other',
      upstream: null,
    }
  }
  const choice = Array.isArray(b.choices) && isObject(b.choices[0]) ? b.choices[0] : {}
  const message = isObject(choice.message) ? choice.message : {}
  const content = typeof message.content === 'string' ? message.content : ''
  // (Qwen3 with thinking off on Workers AI files the whole answer under `reasoning_content` and leaves `content` empty:
  // the 11-06 probe)
  const reasoning =
    typeof message.reasoning_content === 'string'
      ? message.reasoning_content
      : typeof message.reasoning === 'string'
        ? message.reasoning
        : ''
  const said = content.trim() === '' && reasoning.trim() !== '' ? reasoning : content
  const inTokens = count(u.prompt_tokens)
  const outTokens = count(u.completion_tokens)
  const details = isObject(u.completion_tokens_details) ? u.completion_tokens_details : {}
  return {
    units: unitsOf(said),
    usage:
      inTokens !== null && outTokens !== null
        ? { inTokens, outTokens, reasoningTokens: count(details.reasoning_tokens) ?? 0 }
        : null,
    stop: choice.finish_reason === 'stop' ? 'end' : choice.finish_reason === 'length' ? 'length' : 'other',
    upstream: typeof b.provider === 'string' && b.provider ? b.provider : null,
  }
}
