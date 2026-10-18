// @vitest-environment node
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { isOwnHost } from '../../lab/pdf/layer-lab/own-host.mjs'

// The layer lab's guard against DNS rebinding (lab/pdf/layer-lab/own-host.mjs, which serve.mjs applies before any route): the
// server listens on 127.0.0.1, but a page of another site whose name resolves there reaches it too, with its own name in
// `Host`. Only `127.0.0.1:<the server's port>` is the lab's own

describe("the lab's own host", () => {
  it('is exactly 127.0.0.1 and the server\'s port', () => {
    expect(isOwnHost('127.0.0.1:8093', 8093)).toBe(true)
    for (const host of [undefined, '', '127.0.0.1', '127.0.0.1:8094', '127.0.0.1:80930', 'localhost:8093', '[::1]:8093', '0.0.0.0:8093', 'evil.example:8093', 'evil.example', '127.0.0.1:8093.evil.example', ' 127.0.0.1:8093', '127.0.0.1:8093 ', '127.0.0.1:8093,evil.example', '127.0.0.1.evil.example:8093', '127.0.0.1:08093']) {
      expect(isOwnHost(host, 8093), String(host)).toBe(false)
    }
  })

  describe('applied as serve.mjs does, first in the request handler', () => {
    const servers: Server[] = []
    afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(done => { s.close(done); s.closeAllConnections() }))) })

    /** a server that answers 403 to a request of another host and counts those that reached its routes */
    async function lab(): Promise<{ port: number; reached: string[]; call: (host: string | undefined) => Promise<number> }> {
      const reached: string[] = []
      const server: Server = createServer((req, res) => {
        if (!isOwnHost(req.headers.host, (server.address() as AddressInfo).port)) { res.writeHead(403); res.end('forbidden'); return }
        reached.push(String(req.url))
        res.writeHead(200); res.end('ok')
      })
      servers.push(server)
      await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
      const port = (server.address() as AddressInfo).port
      const call = (host: string | undefined) => new Promise<number>((done, fail) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/fixtures', method: 'GET', headers: host === undefined ? {} : { host }, setHost: false }, res => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)) })
        req.on('error', fail)
        req.end()
      })
      return { port, reached, call }
    }

    it('answers 403 to a request that names another host, before any route is reached', async () => {
      const { port, reached, call } = await lab()
      expect(await call(`127.0.0.1:${port}`)).toBe(200)
      expect(reached).toEqual(['/api/fixtures'])
      for (const host of ['rebound.example', `rebound.example:${port}`, `localhost:${port}`, '127.0.0.1', `127.0.0.1:${port + 1}`]) {
        expect(await call(host), host).toBe(403)
      }
      expect(reached).toEqual(['/api/fixtures'])
    })
  })
})
