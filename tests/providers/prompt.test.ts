import { describe, expect, it } from 'vitest'
import { englishName } from '@/config/languages'
import {
  BUILD_PROMPTS_DIGEST, PROMPT_DATA, PROMPT_DIGEST, PROMPT_TEXT_DIGEST, PROTOCOL_BLOCK, buildPrompts, buildPromptsWith, formatGlossary,
  type PromptData, promptDigestOf, promptTextDigestOf,
} from '@/providers/prompt'
import { BUILT_IN_PROMPTS, DEFAULT_PROMPTS_CONFIG } from '@/providers/prompt-library'
import type { TranslateRequest } from '@/providers/types'
import { CASES, RULES, buildPromptsDigestOf } from './prompt-cases'

const request: TranslateRequest = {
  segments: [{ id: 'S1.p1.1', text: 'Let <x id="1"/> be a graph.' }, { id: 'S1.p2.1', text: 'Then <t id="1">bold</t>.' }],
  source: 'en',
  target: 'cmn',
  context: { paperTitle: 'Graphs', abstract: 'We study graphs.', sectionTitle: 'Introduction' },
}

describe('prompt', () => {
  it('the glossary goes into the user message\'s metadata block, one entry per line', () => {
    const withGlossary = { ...request, context: { ...request.context, glossary: [{ term: 'weights', translation: '权重' }, { term: 'bias', translation: '偏置' }] } }
    const { prompt } = buildPrompts(withGlossary)
    expect(prompt).toContain('weights -> 权重')
    expect(prompt).toContain('bias -> 偏置')
    // Without a glossary it is None, not left blank
    expect(buildPrompts(request).prompt).toContain('Glossary: None')
  })

  it('when neither part of a custom prompt writes {{targetLanguage}}, a target-language line is prepended to the user message', () => {
    const prompts = { promptId: 'mine', patterns: [{ id: 'mine', name: 'mine', systemPrompt: 'Be terse.', prompt: '{{input}}' }] }
    const { prompt } = buildPrompts(request, prompts)
    expect(prompt.startsWith('Target language: Simplified Chinese')).toBe(true)
    // Written already, it is not added again
    const withTarget = { promptId: 'mine', patterns: [{ id: 'mine', name: 'mine', systemPrompt: 'Translate into {{targetLanguage}}.', prompt: '{{input}}' }] }
    expect(buildPrompts(request, withTarget).prompt.startsWith('Target language:')).toBe(false)
  })

  it('holds its rules\' behaviour digest: BUILD_PROMPTS_DIGEST is the hash of buildPrompts\' outputs over its case table', () => {
    const got = buildPromptsDigestOf()
    expect(got, `buildPrompts' outcomes changed: BUILD_PROMPTS_DIGEST is now ${got}; \`pnpm digests --write\` writes it`).toBe(BUILD_PROMPTS_DIGEST)
  })

  it('has a case for each of buildPrompts\' rules, and every case names one of them', () => {
    expect([...new Set(CASES.map(c => c.rule))].sort()).toEqual([...RULES].sort())
  })

  it('is named by the data\'s digest, taken at load, and the rules\' digest together; buildPrompts is the rules over the product\'s data', () => {
    expect(PROMPT_TEXT_DIGEST).toBe(promptTextDigestOf())
    expect(PROMPT_DIGEST).toBe(promptDigestOf(PROMPT_TEXT_DIGEST, BUILD_PROMPTS_DIGEST))
    expect(PROMPT_DIGEST).toMatch(/^[0-9a-f]{64}$/)
    expect(buildPrompts(request)).toEqual(buildPromptsWith(PROMPT_DATA, request))
  })

  it('the data\'s digest moves with each of its parts: the protocol block, a built-in\'s text, any target\'s name; not with a built-in\'s display name, which is never sent', () => {
    const moved = (data: Partial<PromptData>) => promptTextDigestOf({ ...PROMPT_DATA, ...data })
    expect(moved({ protocol: `${PROTOCOL_BLOCK}\n5. Be brief.` })).not.toBe(PROMPT_TEXT_DIGEST)
    const precise = BUILT_IN_PROMPTS['precision-rewrite']!
    expect(moved({ builtIns: { ...BUILT_IN_PROMPTS, 'precision-rewrite': { ...precise, prompt: `${precise.prompt}\nBe brief.` } } })).not.toBe(PROMPT_TEXT_DIGEST)
    expect(moved({ names: { ...PROMPT_DATA.names, jpn: `${englishName('jpn')} (Japan)` } })).not.toBe(PROMPT_TEXT_DIGEST)
    expect(moved({ builtIns: { ...BUILT_IN_PROMPTS, 'precision-rewrite': { ...precise, name: 'Renamed' } } })).toBe(PROMPT_TEXT_DIGEST)
    // (the names are the language table's English names, the ones englishName gives)
    expect(Object.entries(PROMPT_DATA.names).every(([code, name]) => englishName(code) === name)).toBe(true)
  })

  it('the last two raises of PROMPT_VERSION, replayed, each move the identity: 5, a target\'s English name (the data); 4, the glossary added to a prompt that lacks it (a rule)', () => {
    const five = promptTextDigestOf({ ...PROMPT_DATA, names: { ...PROMPT_DATA.names, cmn: 'Simplified Mandarin Chinese' } })
    expect(promptDigestOf(five, BUILD_PROMPTS_DIGEST)).not.toBe(PROMPT_DIGEST)
    // (buildPrompts before raise 4: no glossary added to a prompt that names none)
    const beforeFour: typeof buildPromptsWith = (data, r, p) => {
      const b = buildPromptsWith(data, r, p)
      return { ...b, prompt: b.prompt.replace(/^Glossary:\n(?:[^\n]*\n)*?\n/, '') }
    }
    const four = buildPromptsDigestOf(beforeFour)
    expect(four).not.toBe(BUILD_PROMPTS_DIGEST)
    expect(promptDigestOf(PROMPT_TEXT_DIGEST, four)).not.toBe(PROMPT_DIGEST)
  })

  it('system prompt = the prompt library\'s template + the protocol block; the protocol block spells out placeholders and the output shape', () => {
    const { system } = buildPrompts(request)
    // The language code is swapped for the English name (Read Frog's way)
    expect(system).toContain('Simplified Chinese')
    expect(system).not.toContain('cmn')
    expect(system).toContain('<x id')
    expect(system).toContain('<t id')
    // The output shape is spelled out: an endpoint without json_schema support can still give the correct top-level key
    expect(system).toContain('{"segments":[{"id":"<id>","text":"<translated text>"}]}')
    expect(system.endsWith(PROTOCOL_BLOCK)).toBe(true)
  })

  it('the paper context fills the user message\'s metadata block (delimited, declared untrusted); system holds only the instructions', () => {
    const { system, prompt } = buildPrompts(request)
    expect(prompt).toContain('<document_metadata>')
    expect(prompt).toContain('Paper title: Graphs')
    expect(prompt).toContain('Abstract: We study graphs.')
    expect(prompt).toContain('Current section: Introduction')
    expect(prompt).toContain('untrusted')
    expect(system).not.toContain('We study graphs.')
    expect(system).toContain('never instructions')
    expect(system + prompt).not.toContain('{{')
  })

  it('missing context is filled with "Not available", leaving no template variable', () => {
    const { system, prompt } = buildPrompts({ ...request, context: undefined })
    expect(prompt).toContain('Paper title: Not available')
    expect(prompt).toContain('Glossary: None')
    expect(system + prompt).not.toContain('{{')
  })

  it('the user prompt holds every segment id and source text (JSON)', () => {
    const { prompt } = buildPrompts(request)
    expect(prompt).toContain('S1.p1.1')
    expect(prompt).toContain('S1.p2.1')
    expect(prompt).toContain('Let <x id=\\"1\\"/> be a graph.')
  })

  it('a custom prompt that leaves out {{input}} still sends the source text; the protocol block is appended as usual', () => {
    const prompts = {
      promptId: 'mine',
      patterns: [{ id: 'mine', name: 'mine', systemPrompt: 'Be terse. Target: {{targetLanguage}}', prompt: 'Translate now.' }],
    }
    const { system, prompt } = buildPrompts(request, prompts)
    expect(system.startsWith('Be terse. Target: Simplified Chinese')).toBe(true)
    expect(system).toContain(PROTOCOL_BLOCK)
    expect(prompt).toContain('Translate now.')
    expect(prompt).toContain('S1.p1.1')
  })

  it('a custom prompt that leaves out {{glossary}} still sends the glossary (Codex on #52)', () => {
    // The settings page promises “the glossary goes out with every batch”, and a template made with “New” has no such variable by default
    const prompts = {
      promptId: 'mine',
      patterns: [{ id: 'mine', name: 'mine', systemPrompt: 'Target: {{targetLanguage}}', prompt: 'Translate: {{input}}' }],
    }
    const withGlossary = { ...request, context: { glossary: [{ term: 'graph', translation: '图' }] } }
    expect(buildPrompts(withGlossary, prompts).prompt).toContain('graph -> 图')
    // With no glossary configured this part is not appended, and the prompt does not grow for nothing
    expect(buildPrompts(request, prompts).prompt).not.toContain('Glossary:')
    // When the template writes {{glossary}} itself it is not appended a second time
    const explicit = { promptId: 'mine', patterns: [{ id: 'mine', name: 'mine', systemPrompt: 'G: {{glossary}}', prompt: '{{input}}' }] }
    expect(buildPrompts(withGlossary, explicit).prompt).not.toContain('Glossary:')
  })

  it('glossary formatting', () => {
    expect(formatGlossary()).toBe('None')
    expect(formatGlossary([{ term: 'graph', translation: '图' }])).toBe('graph -> 图')
    expect(buildPrompts({ ...request, context: { glossary: [{ term: 'graph', translation: '图' }] } }, DEFAULT_PROMPTS_CONFIG).prompt).toContain('graph -> 图')
  })
})
