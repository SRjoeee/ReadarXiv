// The LLM request shapes, the prompt under context rule v1, and the reply's reading. Bodies and replies here are written
// for these tests; nothing is sent.
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_VERSION,
  bodyOf,
  CONTEXT_RULE,
  headersOf,
  type LlmEntry,
  LLM_TARGETS,
  maxTokensOf,
  PROMPT_DIGEST,
  replyOf,
  systemOf,
} from '../../src/adapters/llm-shapes.ts'

const haiku: LlmEntry = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  shape: 'anthropic-messages',
  json: 'schema',
  reasoning: { thinking: { type: 'disabled' }, effort: 'low' },
}
const routed: LlmEntry = {
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  upstream: ['baidu'],
  shape: 'openai-chat',
  json: 'schema',
  reasoning: { reasoning: { enabled: false } },
}
const units = [
  { id: '0', text: 'We have <m1/>.' },
  { id: '1', text: 'See <c1/>.' },
]
const parsed = (entry: LlmEntry, maxTokens = 512) =>
  JSON.parse(bodyOf(entry, { system: 'SYS', units, maxTokens })) as Record<string, unknown>
const FORBIDDEN = ['tools', 'tool_choice', 'stream', 'metadata', 'functions']

describe('bodyOf: anthropic-messages', () => {
  it('the probe’s request: model, max_tokens, system, one user message of the units, thinking off, effort low, a JSON schema', () => {
    const b = parsed(haiku, 3_256) as {
      model: string
      max_tokens: number
      system: string
      messages: { role: string; content: string }[]
      thinking: { type: string }
      output_config: { effort: string; format: { type: string; schema: unknown } }
    }
    expect(b.model).toBe('claude-haiku-5-5')
    expect(b.max_tokens).toBe(3_256)
    expect(b.system).toBe('SYS')
    expect(b.messages).toHaveLength(1)
    expect(b.messages[0]?.role).toBe('user')
    expect(JSON.parse(b.messages[0]?.content ?? '')).toEqual({ units })
    expect(b.thinking.type).toBe('disabled')
    expect(b.output_config.effort).toBe('low')
    expect(b.output_config.format.type).toBe('json_schema')
    for (const k of FORBIDDEN) expect(b, k).not.toHaveProperty(k)
  })
  it('an entry’s reasoning or sampling never names a field of ours, nor a tool', () => {
    const b = parsed({ ...haiku, reasoning: { tools: [{ name: 'x' }], model: 'other', stream: true, effort: 'low' } })
    expect(b.model).toBe('claude-haiku-5-5')
    for (const k of FORBIDDEN) expect(b, k).not.toHaveProperty(k)
  })
})

describe('bodyOf: openai-chat', () => {
  it('a strict JSON schema, a system message, the upstream pinned with fallbacks off; the entry’s reasoning top-level', () => {
    const b = parsed(routed) as {
      response_format: { type: string; json_schema: { name: string; strict: boolean } }
      messages: { role: string; content: string }[]
      provider: unknown
      reasoning: unknown
      max_tokens: number
    }
    expect(b.response_format.type).toBe('json_schema')
    expect(b.response_format.json_schema.strict).toBe(true)
    expect(b.response_format.json_schema.name).toBe('units')
    expect(b.messages[0]).toEqual({ role: 'system', content: 'SYS' })
    expect(JSON.parse(b.messages[1]?.content ?? '')).toEqual({ units })
    expect(b.provider).toEqual({ order: ['baidu'], allow_fallbacks: false, require_parameters: true })
    expect(b.reasoning).toEqual({ enabled: false })
    expect(b.max_tokens).toBe(512)
    for (const k of FORBIDDEN) expect(b, k).not.toHaveProperty(k)
  })
  it('JSON mode where the entry says object; sampling top-level; no upstream, no routing', () => {
    const b = parsed({ ...routed, json: 'object', upstream: undefined, sampling: { temperature: 0.2 } })
    expect(b.response_format).toEqual({ type: 'json_object' })
    expect(b.temperature).toBe(0.2)
    expect(b).not.toHaveProperty('provider')
  })
})

describe('maxTokensOf', () => {
  it('256 and one a wire character, at most 16,000', () => {
    expect(maxTokensOf(3_000)).toBe(3_256)
    expect(maxTokensOf(0)).toBe(256)
    expect(maxTokensOf(20_000)).toBe(16_000)
  })
})

describe('headersOf', () => {
  it('content-type, and anthropic-version for Anthropic: nothing else', () => {
    expect(ANTHROPIC_VERSION).toBe('2023-06-01')
    expect(headersOf('anthropic-messages')).toEqual({
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    })
    expect(headersOf('openai-chat')).toEqual({ 'content-type': 'application/json' })
  })
})

describe('systemOf: context rule v1', () => {
  it('the title and abstract as context not to be translated', () => {
    const s = systemOf('zh-Hans', { title: 'Attention Is All You Need', abstract: 'The dominant …' })
    expect(CONTEXT_RULE).toBe('context/1')
    expect(s).toContain('Attention Is All You Need')
    expect(s).toContain('The dominant …')
    expect(s).toContain('not to be translated')
    expect(s).toContain('Simplified Chinese')
  })
  it('no context, none of it; the probe’s rules and the two added sentences', () => {
    const s = systemOf('zh-Hans', undefined)
    expect(s).not.toContain('not to be translated')
    expect(s).not.toContain('Attention')
    expect(s).toContain('<m1/> an inline formula')
    expect(s).toContain(
      'Keep names (models, datasets, methods, tools, people), acronyms, identifiers and code exactly as written: never translate, transliterate, expand or explain them.',
    )
    expect(s).toContain('quotation mark')
  })
  it('a target the prompt cannot name throws; every named target is in English', () => {
    expect(() => systemOf('xx', undefined)).toThrow()
    expect(LLM_TARGETS['zh-Hans']).toBe('Simplified Chinese')
    for (const name of Object.values(LLM_TARGETS)) expect(name).toMatch(/^[A-Za-z ()]+$/)
  })
  it('a title that holds quotes and line breaks stays inside its JSON string', () => {
    const s = systemOf('de', { title: 'A "quoted"\nTitle' })
    expect(s).toContain(JSON.stringify('A "quoted"\nTitle'))
  })
  it('PROMPT_DIGEST is held: a change to the prompt is a new identity, never silent', () => {
    expect(PROMPT_DIGEST).toBe('6ae83428551583c4468603bd876dbf761ca0640fb1cd1b56b13ca733de7a1473')
  })
})

describe('replyOf', () => {
  it('anthropic: the text blocks’ JSON by id, usage, stop', () => {
    const body = {
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: '{"units":[{"id":"0","text":"A"}]}' },
      ],
      usage: { input_tokens: 15, output_tokens: 1 },
      stop_reason: 'end_turn',
      model: 'claude-haiku-5-5',
    }
    const r = replyOf('anthropic-messages', JSON.stringify(body))
    expect([...(r.units ?? new Map())]).toEqual([['0', 'A']])
    expect(r.usage).toEqual({ inTokens: 15, outTokens: 1, reasoningTokens: 0 })
    expect(r.stop).toBe('end')
    expect(r.upstream).toBeNull()
    expect(replyOf('anthropic-messages', JSON.stringify({ ...body, stop_reason: 'max_tokens' })).stop).toBe('length')
    expect(
      replyOf('anthropic-messages', JSON.stringify({ ...body, stop_reason: 'model_context_window_exceeded' })).stop,
    ).toBe('length')
    expect(replyOf('anthropic-messages', JSON.stringify({ ...body, stop_reason: 'refusal' })).stop).toBe('other')
    const thinking = {
      ...body,
      usage: { input_tokens: 15, output_tokens: 9, output_tokens_details: { thinking_tokens: 8 } },
    }
    expect(replyOf('anthropic-messages', JSON.stringify(thinking)).usage).toEqual({
      inTokens: 15,
      outTokens: 9,
      reasoningTokens: 8,
    })
  })
  it('openai-chat: the message content, usage with reasoning, the finish reason, the upstream', () => {
    const body = {
      provider: 'Baidu',
      choices: [
        { message: { content: '{"units":[{"id":"1","text":"B"},{"id":"1","text":"C"}]}' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 2 } },
    }
    const r = replyOf('openai-chat', JSON.stringify(body))
    expect([...(r.units ?? new Map())]).toEqual([['1', 'B']])
    expect(r.usage).toEqual({ inTokens: 20, outTokens: 5, reasoningTokens: 2 })
    expect(r.stop).toBe('end')
    expect(r.upstream).toBe('Baidu')
    const cut = { ...body, choices: [{ ...body.choices[0], finish_reason: 'length' }] }
    expect(replyOf('openai-chat', JSON.stringify(cut)).stop).toBe('length')
  })
  it('openai-chat: an empty content with the JSON in reasoning_content (Qwen3 on Workers AI) is read', () => {
    const body = {
      choices: [
        { message: { content: null, reasoning_content: '{"units":[{"id":"0","text":"A"}]}' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }
    expect([...(replyOf('openai-chat', JSON.stringify(body)).units ?? new Map())]).toEqual([['0', 'A']])
  })
  it('a text that is not JSON, or lacks units, reads no units; its usage still read', () => {
    const notJson = {
      content: [{ type: 'text', text: 'Sure! Here you go' }],
      usage: { input_tokens: 3, output_tokens: 4 },
      stop_reason: 'end_turn',
    }
    const r = replyOf('anthropic-messages', JSON.stringify(notJson))
    expect(r.units).toBeNull()
    expect(r.usage).toEqual({ inTokens: 3, outTokens: 4, reasoningTokens: 0 })
    const noUnits = { ...notJson, content: [{ type: 'text', text: '{"translations":[]}' }] }
    expect(replyOf('anthropic-messages', JSON.stringify(noUnits)).units).toBeNull()
    const nothing = replyOf('openai-chat', '<html>')
    expect(nothing).toEqual({ units: null, usage: null, stop: 'other', upstream: null })
  })
})
