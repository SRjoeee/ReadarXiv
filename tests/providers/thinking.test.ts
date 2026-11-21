import { describe, expect, it } from 'vitest'
import { thinkingBodyFields } from '@/providers/thinking'

// Each vendor's field as its documentation states it (the pages are cited in src/providers/thinking.ts)
describe('thinkingBodyFields', () => {
  it('OpenRouter: off → reasoning.effort none; on → reasoning.enabled', () => {
    expect(thinkingBodyFields('https://openrouter.ai/api/v1', 'disabled')).toEqual({ reasoning: { effort: 'none' } })
    expect(thinkingBodyFields('https://openrouter.ai/api/v1', 'enabled')).toEqual({ reasoning: { enabled: true } })
  })

  it('DeepSeek official: thinking.type', () => {
    expect(thinkingBodyFields('https://api.deepseek.com/v1', 'disabled')).toEqual({ thinking: { type: 'disabled' } })
    expect(thinkingBodyFields('https://api.deepseek.com', 'enabled')).toEqual({ thinking: { type: 'enabled' } })
  })

  it('the boolean switches of Alibaba Bailian / SiliconFlow and the like: enable_thinking', () => {
    expect(thinkingBodyFields('https://dashscope.aliyuncs.com/compatible-mode/v1', 'disabled')).toEqual({ enable_thinking: false })
    expect(thinkingBodyFields('https://api.siliconflow.cn/v1', 'disabled')).toEqual({ enable_thinking: false })
    expect(thinkingBodyFields('https://dashscope.aliyuncs.com/compatible-mode/v1', 'enabled')).toEqual({ enable_thinking: true })
    expect(thinkingBodyFields('https://api.siliconflow.com/v1', 'enabled')).toEqual({ enable_thinking: true })
  })

  it("Model Studio's other regions and its workspaces' endpoints", () => {
    for (const url of [
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      'https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1',
      'https://ws-1a2b.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    ]) expect(thinkingBodyFields(url, 'disabled'), url).toEqual({ enable_thinking: false })
  })

  it('knows a host whole: a look-alike or another service of the same cloud is sent nothing', () => {
    expect(thinkingBodyFields('https://openrouter.ai.example.com/v1', 'disabled')).toEqual({})
    expect(thinkingBodyFields('https://notopenrouter.ai/v1', 'disabled')).toEqual({})
    expect(thinkingBodyFields('https://oss-cn-beijing.aliyuncs.com/v1', 'disabled')).toEqual({})
    expect(thinkingBodyFields('https://OpenRouter.AI/api/v1', 'disabled')).toEqual({ reasoning: { effort: 'none' } })
  })

  it('unknown endpoints (OpenAI, Ollama, local) send no field, to avoid being refused', () => {
    expect(thinkingBodyFields('https://api.openai.com/v1', 'disabled')).toEqual({})
    expect(thinkingBodyFields('http://localhost:11434/v1', 'disabled')).toEqual({})
    expect(thinkingBodyFields('not a url', 'disabled')).toEqual({})
  })
})
