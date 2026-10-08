// verify.mjs's types, for the tests
import type { Row } from './upload.mjs'
export declare function verify(options: {
  base: string
  rows: Row[]
  indexText: string
  fetch: (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<Response>
  sample?: number
  rate?: number
  parallel?: number
  log?: (line: string) => void
}): Promise<{ checked: { site: number; tree: number; sampled: number }; failures: { key: string; what: string }[] }>
