import { describe, expect, it } from 'vitest'
import { BUILT_IN_SERVICES } from '@/config/services'
import { WIRE_FORMATS, wireFormatOfProvider } from '@/providers/wire-formats'

const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }
const KINDS = ['openai-compat', ...BUILT_IN_SERVICES] as const

describe('wire-format metadata (#115)', () => {
  it('the table covers every engine kind (the three built-ins + OpenAI-compatible), so a new engine cannot be missed', () => {
    expect(Object.keys(WIRE_FORMATS).sort()).toEqual([...KINDS].sort())
  })

  it('the preferred format: markers for Microsoft, tags for the rest', () => {
    expect(wireFormatOfProvider('microsoft')).toBe('markers')
    for (const id of ['openai-compat', 'google-web', 'chrome-builtin', SVC.id] as const) {
      expect([id, wireFormatOfProvider(id)]).toEqual([id, 'tags'])
    }
  })
})
