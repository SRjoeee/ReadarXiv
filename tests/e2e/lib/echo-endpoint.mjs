// A local OpenAI-compatible endpoint that echoes: the translation of the browser checks that translate. It answers each
// segment it is sent with the same text after a prefix, placeholders untouched, so that validation passes and the prefix
// shows the text came from here (the pattern of local-endpoint.mjs, which this was taken from; that one sends no CORS header
// on purpose, since its subject is that, and so does this, the extension's worker needing none). The service chosen in the
// extension (options-page.mjs seedService, with the loopback's host permission granted: ext-copy.mjs) is this one, and the
// guard of the route table (route-table.mjs) allows no other translation service to be reached.
import { createServer } from 'node:http'

/** The user message carries JSON.stringify(segments) (src/providers/prompt.ts); try the longest valid array from the end backwards */
function segmentsFrom(prompt) {
  const start = prompt.indexOf('[{"id":')
  if (start < 0) return null
  const ends = []
  for (let i = prompt.indexOf(']', start); i >= 0; i = prompt.indexOf(']', i + 1)) ends.push(i + 1)
  for (const end of ends.reverse()) {
    try {
      const parsed = JSON.parse(prompt.slice(start, end))
      if (Array.isArray(parsed) && parsed.every(s => typeof s?.id === 'string' && typeof s?.text === 'string')) return parsed
    } catch {
      // this closing bracket is inside a string; try a shorter one
    }
  }
  return null
}

/** { baseURL, origin, seen: { post, models, origins }, close() }: the endpoint on the loopback, its requests counted */
export async function startEchoEndpoint({ mark = '[echo] ' } = {}) {
  const seen = { post: 0, models: 0, origins: new Set() }
  const server = createServer((req, res) => {
    seen.origins.add(req.headers.origin ?? '(none)')
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
        // left to the 400 below
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
  const origin = `http://127.0.0.1:${server.address().port}`
  return { baseURL: `${origin}/v1`, origin, seen, close: () => new Promise(done => { server.closeAllConnections(); server.close(() => done()) }) }
}
