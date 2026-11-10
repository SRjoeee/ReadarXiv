// The thinking switch of an OpenAI-compatible service (DESIGN §8.2: off by default; the switch under the service
// form's More, UI.md S-O-30). There is no standard field for it: each vendor names its own, so an endpoint is known by
// its host and given its vendor's field; an endpoint not known here is sent no field at all, since an unknown field can
// be refused, and on and off are then the same request (llm.ts keeps the switch out of such a translator's identity).
// Each field as the vendor's documentation states it (read 2026-11-07):
// - OpenRouter, "Reasoning Tokens" (https://openrouter.ai/docs/use-cases/reasoning-tokens): `reasoning.effort: "none"`
//   "disables reasoning entirely"; `reasoning.enabled: true` enables it at the default effort.
// - DeepSeek, "Thinking Mode" (https://api-docs.deepseek.com/guides/thinking_mode): `thinking: { type: "enabled" |
//   "disabled" }`, on by default; base URL https://api.deepseek.com.
// - Alibaba Cloud Model Studio, "Use deep thinking models via API"
//   (https://www.alibabacloud.com/help/en/model-studio/deep-thinking): `enable_thinking`, a boolean outside the OpenAI
//   standard; its OpenAI-compatible endpoints, "Call Qwen models via OpenAI API"
//   (https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope): a workspace's
//   `{WorkspaceId}.<region>.maas.aliyuncs.com`, and the earlier `dashscope.aliyuncs.com`, `dashscope-intl.aliyuncs.com`,
//   `cn-hongkong.dashscope.aliyuncs.com`.
// - SiliconFlow, "Chat completions" (https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions,
//   https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions): `enable_thinking`, a boolean, on by
//   default; base URLs https://api.siliconflow.cn/v1 and https://api.siliconflow.com/v1.

export type ThinkingMode = 'enabled' | 'disabled'

type Fields = (on: boolean) => Record<string, unknown>

const openRouter: Fields = on => ({ reasoning: on ? { enabled: true } : { effort: 'none' } })
const deepSeek: Fields = on => ({ thinking: { type: on ? 'enabled' : 'disabled' } })
const enableThinking: Fields = on => ({ enable_thinking: on })

/** each vendor's hosts: a name matched whole, or a domain (leading dot) matched by its subdomains */
const VENDORS: ReadonlyArray<readonly [hosts: readonly string[], fields: Fields]> = [
  [['openrouter.ai'], openRouter],
  [['api.deepseek.com'], deepSeek],
  [['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', '.dashscope.aliyuncs.com', '.maas.aliyuncs.com'], enableThinking],
  [['api.siliconflow.cn', 'api.siliconflow.com'], enableThinking],
]

const matches = (host: string, pattern: string) => (pattern.startsWith('.') ? host.endsWith(pattern) : host === pattern)

/** The fields a request to `baseURL` carries for the thinking mode: the vendor's own, or none for an endpoint not known */
export function thinkingBodyFields(baseURL: string, mode: ThinkingMode): Record<string, unknown> {
  let host: string
  try {
    host = new URL(baseURL).hostname.replace(/\.$/, '')
  } catch {
    return {}
  }
  const vendor = VENDORS.find(([hosts]) => hosts.some(pattern => matches(host, pattern)))
  return vendor ? vendor[1](mode === 'enabled') : {}
}
