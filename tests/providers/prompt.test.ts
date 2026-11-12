import { describe, expect, it } from 'vitest'
import { englishName } from '@/config/languages'
import { PROMPT_DIGEST, PROTOCOL_BLOCK, buildPrompts, formatGlossary, promptDigestOf } from '@/providers/prompt'
import { BUILT_IN_PROMPTS, DEFAULT_PROMPTS_CONFIG } from '@/providers/prompt-library'
import type { TranslateRequest } from '@/providers/types'

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

  it('is named by its digest, taken at load: a SHA-256 of what the model is sent besides the request and a prompt of its own', () => {
    expect(PROMPT_DIGEST).toMatch(/^[0-9a-f]{64}$/)
    expect(promptDigestOf()).toBe(PROMPT_DIGEST)
  })

  it('its digest moves with each part of what the model is sent: the protocol block, a built-in prompt, any target\'s English name (PROMPT_VERSION 5\'s change), buildPrompts\' own rules (4\'s: the glossary added to a prompt that lacks it)', () => {
    expect(promptDigestOf({ protocol: `${PROTOCOL_BLOCK}\n5. Be brief.` })).not.toBe(PROMPT_DIGEST)
    const precise = BUILT_IN_PROMPTS['precision-rewrite']!
    expect(promptDigestOf({ builtIns: { ...BUILT_IN_PROMPTS, 'precision-rewrite': { ...precise, prompt: `${precise.prompt}\nBe brief.` } } })).not.toBe(PROMPT_DIGEST)
    expect(promptDigestOf({ nameOf: code => (code === 'cmn' ? 'Simplified Mandarin Chinese' : englishName(code)) })).not.toBe(PROMPT_DIGEST)
    // (a target other than the one the probes are rendered for: its name is in the digest too)
    expect(promptDigestOf({ nameOf: code => (code === 'jpn' ? `${englishName(code)} (Japan)` : englishName(code)) })).not.toBe(PROMPT_DIGEST)
    const noGlossaryAdded: typeof buildPrompts = (r, p) => {
      const b = buildPrompts(r, p)
      return { ...b, prompt: b.prompt.replace(/^Glossary:\n[^\n]*\n\n/, '') }
    }
    expect(promptDigestOf({ build: noGlossaryAdded })).not.toBe(PROMPT_DIGEST)
    // (the same parts, the same digest: it is a function of them alone)
    expect(promptDigestOf({ protocol: PROTOCOL_BLOCK, builtIns: BUILT_IN_PROMPTS, nameOf: englishName, build: buildPrompts })).toBe(PROMPT_DIGEST)
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
