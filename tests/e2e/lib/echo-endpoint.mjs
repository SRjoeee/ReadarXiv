// The fake translation endpoint the e2e suites share: OpenAI-compatible, **deliberately sends no CORS header**, answers
// every preflight 405, and echoes each segment back behind a mark — placeholders untouched, so validation passes, and the
// mark lets a page show that a translation came from here and not from a fallback service. Requests that reach it leave
// from the extension's background (DESIGN §8.0); a request from a page would show in `seen.origins`, a preflight in
// `seen.options`. The local-endpoint suite's subject is that absence of CORS; the offline accessibility audit
// (a11y.mjs) and the reader's browser suite (reader.mjs) take it as the translation service, the extension's worker
// needing no CORS, and the route tables' guard allows no other translation service to be reached.
import { createServer } from 'node:http'

/** The user message carries JSON.stringify(segments) (src/providers/prompt.ts); try the longest valid array from the end backwards */
export function segmentsFrom(prompt) {
  const start = prompt.indexOf('[{"id":')
  if (start < 0) return null
  const ends = []
  for (let i = prompt.indexOf(']', start); i >= 0; i = prompt.indexOf(']', i + 1)) ends.push(i + 1)
  for (const end of ends.reverse()) {
    try {
      const parsed = JSON.parse(prompt.slice(start, end))
      if (Array.isArray(parsed) && parsed.every(s => typeof s?.id === 'string' && typeof s?.text === 'string')) return parsed
    } catch {
      // This closing bracket is inside a string; try a shorter one
    }
  }
  return null
}

/**
 * Starts the endpoint on a free port of 127.0.0.1: `{ port, baseURL, origin, seen, close }`. `seen` counts what reached
 * it: `post` (chat requests), `options` (preflights), `models` (model lists), `origins` (the Origin headers, '(none)' for a
 * request without one). `close()` ends its connections and resolves once it is down
 */
export async function startEchoEndpoint({ mark = '[echo] ' } = {}) {
  const seen = { post: 0, options: 0, models: 0, origins: new Set() }
  const server = createServer((req, res) => {
    seen.origins.add(req.headers.origin ?? '(none)')
    if (req.method === 'OPTIONS') {
      seen.options++
      res.writeHead(405).end()
      return
    }
    // the model list (the redesign's design, §6.3): the settings page's form lists this endpoint's one model
    if (req.method === 'GET' && req.url === '/v1/models') {
      seen.models++
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'local-echo', object: 'model' }] }))
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      seen.post++
      let segments = null
      try {
        const user = [...(JSON.parse(body).messages ?? [])].reverse().find(m => m.role === 'user')
        segments = segmentsFrom(typeof user?.content === 'string' ? user.content : '')
      } catch {
        // Left to the 400 below
      }
      if (!segments) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'segments not recognised' } }))
        return
      }
      const content = JSON.stringify({ segments: segments.map(s => ({ id: s.id, text: `${mark}${s.text}` })) })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        id: 'chatcmpl-echo', object: 'chat.completion', created: 0, model: 'local-echo',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const origin = `http://127.0.0.1:${port}`
  return { port, baseURL: `${origin}/v1`, origin, seen, close: () => new Promise(done => { server.closeAllConnections(); server.close(() => done()) }) }
}
