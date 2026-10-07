// A prompt's name as the pages draw it (Task 103b, the maintainer's choice): a built-in's from the pack, in the
// interface's language — the prompt library, the core's, names them in English and may import no pack — and one's own
// as it was given, even when it reads like a built-in's
import { afterEach, describe, expect, it } from 'vitest'
import { LOCALES } from '@/locales'
import { BUILT_IN_PROMPTS, DEFAULT_PROMPT_ID, PRECISION_REWRITE_PROMPT_ID } from '@/providers/prompt-library'
import { promptName } from '@/ui/prompt-name'
import { setLocale } from '@/ui/strings'

const DEFAULT = BUILT_IN_PROMPTS[DEFAULT_PROMPT_ID]!
const REWRITE = BUILT_IN_PROMPTS[PRECISION_REWRITE_PROMPT_ID]!

describe('promptName', () => {
  afterEach(() => setLocale('en'))

  it('names a built-in from the pack of the interface\'s language', () => {
    setLocale('zh-CN')
    const names = LOCALES['zh-CN'].O.prompts.builtInNames
    expect([promptName(DEFAULT), promptName(REWRITE)]).toEqual([names.default, names['precision-rewrite']])
    expect([promptName(DEFAULT), promptName(REWRITE)]).not.toContain(DEFAULT.name)
    setLocale('en')
    expect([promptName(DEFAULT), promptName(REWRITE)]).toEqual(['Default', 'Precision rewrite'])
  })

  it('every built-in has its name in every pack', () => {
    for (const pack of Object.values(LOCALES)) expect(Object.keys(pack.O.prompts.builtInNames).sort()).toEqual(Object.keys(BUILT_IN_PROMPTS).sort())
  })

  it('names one\'s own as stored, a name like a built-in\'s too, and an id like "constructor" as nothing built in', () => {
    setLocale('zh-CN')
    expect(promptName({ id: 'p-mine', name: 'Default' })).toBe('Default')
    expect(promptName({ id: 'p-mine', name: 'Mine' })).toBe('Mine')
    expect(promptName({ id: 'constructor', name: 'Odd' })).toBe('Odd')
  })
})
