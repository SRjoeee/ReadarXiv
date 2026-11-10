import { describe, expect, it } from 'vitest'
import { PROMPT_FILE_NAME, parsePromptFile, readPromptFile, serializePrompts } from '@/providers/prompt-file'

// The prompts file (UI.md S-O-61b, an external contract): an array of { name, systemPrompt, prompt } without ids
describe('prompt-file', () => {
  it('parsing: name and prompt required, systemPrompt defaults to empty', () => {
    const list = parsePromptFile(JSON.stringify([{ name: 'A', prompt: '{{input}}' }, { name: 'B', systemPrompt: 'S', prompt: 'P' }]))
    expect(list).toEqual([{ name: 'A', prompt: '{{input}}', systemPrompt: '' }, { name: 'B', systemPrompt: 'S', prompt: 'P' }])
  })

  it('rejects: not an array, missing name, missing prompt, not JSON', () => {
    expect(() => parsePromptFile('{"name":"A","prompt":"P"}')).toThrow(/badShape/)
    expect(() => parsePromptFile('[{"prompt":"P"}]')).toThrow(/badShape/)
    expect(() => parsePromptFile('[{"name":"A"}]')).toThrow(/badShape/)
    expect(() => parsePromptFile('[{"name":"","prompt":"P"}]')).toThrow(/badShape/)
    expect(() => parsePromptFile('nope')).toThrow(/notJson/)
  })

  it('export drops the id, import assigns one again; round-trips', () => {
    const patterns = [{ id: 'x', name: 'A', systemPrompt: 'S', prompt: 'P' }]
    const json = serializePrompts(patterns)
    expect(json).not.toContain('"id"')
    expect(parsePromptFile(json)).toEqual([{ name: 'A', systemPrompt: 'S', prompt: 'P' }])
    expect(PROMPT_FILE_NAME.endsWith('.json')).toBe(true)
  })

  it('keeps the contract: its name, other fields ignored, an empty list read as none, a file that cannot be read', async () => {
    expect(PROMPT_FILE_NAME).toBe('arxiv-translate_prompts.json')
    expect(parsePromptFile('[{"id":"p1","name":"A","prompt":"P","systemPrompt":"S","extra":1}]')).toEqual([{ name: 'A', systemPrompt: 'S', prompt: 'P' }])
    expect(parsePromptFile('[]')).toEqual([])
    expect(() => parsePromptFile('[{"name":"A","prompt":"P"},{"name":"B"}]')).toThrow(/badShape/)
    const unreadable = { text: () => Promise.reject(new Error('gone')) } as unknown as File
    await expect(readPromptFile(unreadable)).rejects.toMatchObject({ kind: 'notJson' })
    await expect(readPromptFile(new File(['[{"name":"A","prompt":"P"}]'], 'p.json'))).resolves.toEqual([{ name: 'A', prompt: 'P', systemPrompt: '' }])
  })
})
