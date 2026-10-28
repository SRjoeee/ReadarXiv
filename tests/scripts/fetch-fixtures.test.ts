import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCacheDir, ensureFixtures, readManifest } from '../../scripts/fetch-fixtures.mjs'

// The fixtures that are not in the repository (tests/fixtures/remote.json): present and verified, or a failure that
// says what to do — never a silently different file, never a half-written one

const BODY = Buffer.from('<html>the pinned bytes</html>')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const ENTRY = { path: 'tests/fixtures/arxiv/0000.00000.html', url: 'https://arxiv.org/html/0000.00000v1', sha256: sha(BODY), bytes: BODY.length }

let root: string
const file = () => join(root, ENTRY.path)
const serving = (body: Buffer, status = 200) => vi.fn(async () => new Response(new Uint8Array(body), { status })) as unknown as typeof fetch

beforeEach(() => {
  // (a machine that holds the CI token must not send these tests' requests to the bucket)
  vi.stubEnv('READARXIV_CI_TOKEN', '')
  vi.stubEnv('CF_ACCOUNT_ID', '')
  root = mkdtempSync(join(tmpdir(), 'axt-fixtures-'))
  mkdirSync(join(root, 'tests/fixtures'), { recursive: true })
  writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [ENTRY] }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('ensureFixtures', () => {
  it('a missing fixture is downloaded from the pinned URL, identified, verified and written whole', async () => {
    const fetchImpl = serving(BODY)
    expect(await ensureFixtures({ root, fetchImpl, gapMs: 0 })).toEqual({ verified: [], downloaded: [ENTRY.path] })
    expect(readFileSync(file())).toEqual(BODY)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(ENTRY.url)
    expect(new Headers(init.headers).get('user-agent')).toMatch(/ReadarXiv/)
    expect(readdirSync(join(root, 'tests/fixtures/arxiv'))).toEqual(['0000.00000.html'])
  })

  it("the machine's cache: a copy fetched once is found by the next run with no network, and only the pinned bytes are taken from it", async () => {
    const cacheDir = join(root, 'cache')
    await ensureFixtures({ root, cacheDir, fetchImpl: serving(BODY), gapMs: 0 })
    expect(readFileSync(join(cacheDir, ENTRY.sha256))).toEqual(BODY)
    // a fresh checkout of the same machine, arXiv unreachable (or serving other bytes)
    rmSync(file())
    const offline = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const log = vi.fn()
    expect(await ensureFixtures({ root, cacheDir, fetchImpl: offline, log, gapMs: 0 })).toEqual({ verified: [], downloaded: [ENTRY.path] })
    expect(readFileSync(file())).toEqual(BODY)
    expect(offline).not.toHaveBeenCalled()
    expect(log.mock.calls[0]![0]).toMatch(/from the machine's cache/)
    // a cached file that is not the pinned bytes is ignored, never copied, and arXiv is asked
    rmSync(file())
    writeFileSync(join(cacheDir, ENTRY.sha256), 'something else')
    const fetchImpl = serving(BODY)
    await ensureFixtures({ root, cacheDir, fetchImpl, gapMs: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(readFileSync(file())).toEqual(BODY)
    // a verified copy on disk seeds an empty cache
    const seeded = join(root, 'seeded')
    await ensureFixtures({ root, cacheDir: seeded, fetchImpl: offline, gapMs: 0 })
    expect(readFileSync(join(seeded, ENTRY.sha256))).toEqual(BODY)
  })

  it('a cache that cannot be written is no failure; by default there is none, and CI has none', async () => {
    const blocked = join(root, 'blocked')
    writeFileSync(blocked, 'a file where the cache directory should be')
    expect(await ensureFixtures({ root, cacheDir: join(blocked, 'sub'), fetchImpl: serving(BODY), gapMs: 0 })).toEqual({ verified: [], downloaded: [ENTRY.path] })
    expect(defaultCacheDir({ READARXIV_FIXTURE_CACHE: '/x/y' })).toBe('/x/y')
    expect(defaultCacheDir({ READARXIV_FIXTURE_CACHE: '' })).toBeNull()
    expect(defaultCacheDir({ CI: 'true' })).toBeNull()
    expect(defaultCacheDir({})).toMatch(/\.cache\/readarxiv\/fixtures$/)
  })

  it('a fixture already there and intact asks the network nothing', async () => {
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), BODY)
    const fetchImpl = serving(BODY)
    expect(await ensureFixtures({ root, fetchImpl, gapMs: 0 })).toEqual({ verified: [ENTRY.path], downloaded: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('other bytes than the pinned ones are refused and nothing is written: arXiv rendered the paper again', async () => {
    await expect(ensureFixtures({ root, fetchImpl: serving(Buffer.from('<html>rendered again</html>')), gapMs: 0 })).rejects.toThrow(/now serves other bytes.*Nothing was written/s)
    expect(existsSync(file())).toBe(false)
  })

  it('a file that is there but is not the pinned one is never replaced', async () => {
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), 'a candidate for a new pin')
    const fetchImpl = serving(BODY)
    await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/is not the pinned fixture/)
    expect(readFileSync(file(), 'utf8')).toBe('a candidate for a new pin')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('no network: tried three times, then a failure that says why the file is not in the repository and what to run', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/licence does not allow it.*fetch failed.*pnpm fixtures:fetch/s)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(existsSync(file())).toBe(false)
  })

  it('a 404 is final and says the pin needs moving, not that the network is missing — and a 503 is tried again', async () => {
    const gone = serving(BODY, 404)
    const refusal = ensureFixtures({ root, fetchImpl: gone, gapMs: 0 })
    await expect(refusal).rejects.toThrow(/HTTP 404.*nothing was written.*the pin needs moving/s)
    await expect(ensureFixtures({ root, fetchImpl: gone, gapMs: 0 })).rejects.not.toThrow(/Once arXiv can be reached/)
    expect(gone).toHaveBeenCalledTimes(2)
    let calls = 0
    const flaky = vi.fn(async () => (++calls === 1 ? new Response('', { status: 503 }) : new Response(new Uint8Array(BODY)))) as unknown as typeof fetch
    expect((await ensureFixtures({ root, fetchImpl: flaky, gapMs: 0 })).downloaded).toEqual([ENTRY.path])
  })

  it('a 429 waits as long as its Retry-After asks, then tries again', async () => {
    // The ordinary backoff is 0 here (gapMs), so the second one second can only be the header's
    let calls = 0
    const at: number[] = []
    const limited = vi.fn(async () => {
      at.push(performance.now())
      return ++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '1' } }) : new Response(new Uint8Array(BODY))
    }) as unknown as typeof fetch
    expect((await ensureFixtures({ root, fetchImpl: limited, gapMs: 0 })).downloaded).toEqual([ENTRY.path])
    expect(at).toHaveLength(2)
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(990)
  })

  it('a response whose final address is off arXiv is refused and nothing is written', async () => {
    const response = new Response(new Uint8Array(BODY))
    Object.defineProperty(response, 'redirected', { value: true })
    Object.defineProperty(response, 'url', { value: 'https://mirror.example.com/0000.00000v1' })
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch
    await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/ended at https:\/\/mirror\.example\.com.*outside arXiv/s)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(existsSync(file())).toBe(false)
  })

  it('bytes of the right size but another hash are refused as another page', async () => {
    const same = Buffer.from('<html>the pinned bytez</html>')
    expect(same.length).toBe(BODY.length)
    await expect(ensureFixtures({ root, fetchImpl: serving(same), gapMs: 0 })).rejects.toThrow(/a new rendering of the paper, or a page in its place/)
  })

  it('a manifest whose size is wrong for the right hash says the manifest is wrong — downloaded or already on disk', async () => {
    writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [{ ...ENTRY, bytes: BODY.length + 1 }] }))
    await expect(ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).rejects.toThrow(/records \d+ bytes .* the manifest's "bytes" is wrong/)
    expect(existsSync(file())).toBe(false)
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), BODY)
    const fetchImpl = serving(BODY)
    await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/the manifest's "bytes" is wrong/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('403 is final and not called a pin to move; 408 is tried again', async () => {
    const refused = serving(BODY, 403)
    await expect(ensureFixtures({ root, fetchImpl: refused, gapMs: 0 })).rejects.toThrow(/HTTP 403.*a retry will not change the answer/s)
    expect(refused).toHaveBeenCalledTimes(1)
    let calls = 0
    const slow = vi.fn(async () => (++calls === 1 ? new Response('', { status: 408 }) : new Response(new Uint8Array(BODY)))) as unknown as typeof fetch
    expect((await ensureFixtures({ root, fetchImpl: slow, gapMs: 0 })).downloaded).toEqual([ENTRY.path])
  })

  it('a Retry-After longer than a minute stops the download and says so; a short one never shortens the gap', async () => {
    const tooLong = vi.fn(async () => new Response('', { status: 503, headers: { 'retry-after': '120' } })) as unknown as typeof fetch
    await expect(ensureFixtures({ root, fetchImpl: tooLong, gapMs: 0 })).rejects.toThrow(/asks to wait 120 s/)
    expect(tooLong).toHaveBeenCalledTimes(1)
    let calls = 0
    const at: number[] = []
    const zero = vi.fn(async () => {
      at.push(performance.now())
      return ++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : new Response(new Uint8Array(BODY))
    }) as unknown as typeof fetch
    expect((await ensureFixtures({ root, fetchImpl: zero, gapMs: 300 })).downloaded).toEqual([ENTRY.path])
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(290)
  })

  it('a symbolic link in the fixture tree does not carry the write outside it — not the file, not a directory on the way', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'axt-outside-'))
    try {
      symlinkSync(outside, join(root, 'tests/fixtures/arxiv'))
      await expect(ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).rejects.toThrow(/through a symbolic link; nothing was written/)
      writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [{ ...ENTRY, path: 'tests/fixtures/arxiv/new/x.html' }] }))
      await expect(ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).rejects.toThrow(/through a symbolic link; nothing was written/)
      expect(readdirSync(outside)).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('a crashed run\'s old temporary file is cleared — even beside a file another run landed — and nothing but that exact name', async () => {
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), BODY)
    const hourAgo = new Date(Date.now() - 3_600_000)
    const at = (name: string, dir = false) => {
      const path = join(root, 'tests/fixtures/arxiv', name)
      if (dir) mkdirSync(path)
      else writeFileSync(path, 'half')
      utimesSync(path, hourAgo, hourAgo)
      return path
    }
    const old = at('0000.00000.html.123.aaaaaaaa.partial')
    const others = [at('0000.00000.html.partial'), at('0000.00000.html.bak.partial'), at('0000.00000.html.v2.html.9.bbbbbbbb.partial'), at('0000.00000.html.7.cccccccc.partial', true)]
    const fresh = join(root, 'tests/fixtures/arxiv/0000.00000.html.456.dddddddd.partial')
    writeFileSync(fresh, 'half')
    expect((await ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).verified).toEqual([ENTRY.path])
    expect(existsSync(old)).toBe(false)
    for (const path of [...others, fresh]) expect(existsSync(path), path).toBe(true)
  })

  it('a fixture directory that does not exist yet is created, not taken for a link out of the tree', async () => {
    writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [{ ...ENTRY, path: 'tests/fixtures/figures/x.png' }] }))
    expect((await ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).downloaded).toEqual(['tests/fixtures/figures/x.png'])
    expect(readFileSync(join(root, 'tests/fixtures/figures/x.png'))).toEqual(BODY)
  })

  it('a Retry-After in neither of its forms is ignored, not read as a date; an answer that is not the file has its body cancelled', async () => {
    let calls = 0
    let cancelled = false
    const odd = vi.fn(async () => {
      if (++calls > 1) return new Response(new Uint8Array(BODY))
      const body = new ReadableStream({ pull() {}, cancel() { cancelled = true } })
      return new Response(body, { status: 503, headers: { 'retry-after': 'hello 2030' } })
    }) as unknown as typeof fetch
    expect((await ensureFixtures({ root, fetchImpl: odd, gapMs: 0 })).downloaded).toEqual([ENTRY.path])
    expect(odd).toHaveBeenCalledTimes(2)
    expect(cancelled).toBe(true)
  })

  it('a partial file someone left is never written through: each run writes a name of its own, exclusively', async () => {
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    const victim = join(root, 'victim.txt')
    writeFileSync(victim, 'keep me')
    symlinkSync(victim, `${file()}.partial`)
    expect((await ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).downloaded).toEqual([ENTRY.path])
    expect(readFileSync(victim, 'utf8')).toBe('keep me')
    expect(readFileSync(file())).toEqual(BODY)
  })

  it('two runs fetching the same missing file at once both succeed, and the file is whole', async () => {
    const [a, b] = await Promise.all([
      ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 }),
      ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 }),
    ])
    expect([...a.downloaded, ...a.verified]).toEqual([ENTRY.path])
    expect([...b.downloaded, ...b.verified]).toEqual([ENTRY.path])
    expect(readFileSync(file())).toEqual(BODY)
    expect(readdirSync(join(root, 'tests/fixtures/arxiv'))).toEqual(['0000.00000.html'])
  })
})

describe('a manifest that names anything but a fixture of arXiv\'s is refused before a byte is fetched (Devin on #229)', () => {
  const withEntry = (entry: Partial<typeof ENTRY>) => writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [{ ...ENTRY, ...entry }] }))

  for (const path of ['../outside.html', 'tests/fixtures/../../outside.html', '/tmp/outside.html', 'src/core/rules/latexml.ts', 'tests/fixtures/./arxiv/x.html']) {
    it(`the path ${path}`, async () => {
      withEntry({ path })
      const fetchImpl = serving(BODY)
      await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/is not a plain path inside/)
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  }

  it('a malformed manifest says what is wrong with it', async () => {
    const cases: [unknown, RegExp][] = [
      [{}, /no "fixtures" array/],
      [{ fixtures: [{ ...ENTRY, sha256: 42 }] }, /as strings/],
      [{ fixtures: [{ ...ENTRY, sha256: 'abc' }] }, /64 lowercase hex digits/],
      [{ fixtures: [{ ...ENTRY, bytes: '12' }] }, /"bytes" is not a positive integer/],
      [{ fixtures: [ENTRY, ENTRY] }, /is named twice/],
    ]
    for (const [manifest, message] of cases) {
      writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify(manifest))
      const fetchImpl = serving(BODY)
      await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(message)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('an address that is not arxiv.org over https', async () => {
    for (const url of ['http://arxiv.org/html/0000.00000v1', 'https://arxiv.org.example.com/html/0000.00000v1', 'file:///etc/hosts']) {
      withEntry({ url })
      const fetchImpl = serving(BODY)
      await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/is not an https:\/\/arxiv\.org\/ address/)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})

describe('the manifest', () => {
  it('pins a version in every URL; every path is one git ignores, and every one the tests read is one CI keeps between runs', async () => {
    const root = join(import.meta.dirname, '../..')
    const ignored = readFileSync(join(root, '.gitignore'), 'utf8').split('\n')
    const cached = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8').split('\n').map(line => line.trim())
    const entries = await readManifest()
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.url, entry.path).toMatch(/^https:\/\/arxiv\.org\/html\/\d{4}\.\d{5}v\d+(\/|$)/)
      expect(entry.sha256, entry.path).toMatch(/^[0-9a-f]{64}$/)
      expect(ignored, entry.path).toContain(`/${entry.path}`)
      expect(cached, entry.path).toContain(entry.path)
    }
  })

  it('CI restores and saves the same cache: one key, one path list — two that differ never hit', () => {
    const ci = readFileSync(join(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')
    const blockOf = (action: string) => {
      const at = ci.indexOf(`uses: ${action}@`)
      expect(at, action).toBeGreaterThan(-1)
      const rest = ci.slice(at).split('\n').slice(1)
      const end = rest.findIndex(line => /^\s*- /.test(line))
      return rest.slice(0, end < 0 ? undefined : end).join('\n').trim()
    }
    expect(blockOf('actions/cache/save')).toBe(blockOf('actions/cache/restore'))
    // the key names every input of the step that fills the cache: the pins and the code that decides where the bytes come from, so
    // that a change to how fixtures arrive is exercised cold on its own pull request
    const key = /key: (remote-fixtures-pr-\$\{\{ hashFiles\((.*)\) \}\})/.exec(blockOf('actions/cache/restore'))
    expect(key, 'the cache key').not.toBeNull()
    expect(key![2]!.split(',').map(f => f.trim().replace(/^'|'$/g, ''))).toEqual(['tests/fixtures/remote.json', 'scripts/fetch-fixtures.mjs', 'scripts/r2-read.mjs'])
  })

  it('the script takes no argument and refuses one, rather than fetch on a mistyped command', () => {
    for (const args of [['--for', 'tests'], ['--fro'], ['x'], ['--', '--for', 'tests'], ['--', '--']]) {
      let status: number | null = 0
      try {
        execFileSync(process.execPath, [join(import.meta.dirname, '../../scripts/fetch-fixtures.mjs'), ...args], { stdio: 'pipe' })
      } catch (e) {
        status = (e as { status: number | null }).status
      }
      expect([args.join(' '), status]).toEqual([args.join(' '), 2])
    }
  })

  it('no file the manifest names is tracked: the repository does not redistribute them', async () => {
    const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: join(import.meta.dirname, '../..'), encoding: 'utf8' }).split('\n'))
    for (const entry of await readManifest()) expect(tracked.has(entry.path), entry.path).toBe(false)
  })
})

// The pinned bytes are also kept in the private bucket under their digest (`fixtures/<sha256>`), read before arXiv where the CI
// token and the account are set. A stand-in for Cloudflare's token-verify endpoint, the bucket and arXiv, every request recorded.
describe('the bucket', () => {
  const ACCOUNT = '612fe563f8ba720019ffa3b35269aaa4'
  const TOKEN = 'cf-token-that-must-never-be-printed'
  const KEY_ID = '0123456789abcdef0123456789abcdef'
  const VERIFY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/verify`
  const BODY2 = Buffer.from('<html>the second pinned page</html>')
  const ENTRY2 = { path: 'tests/fixtures/arxiv/0000.00001.html', url: 'https://arxiv.org/html/0000.00001v1', sha256: sha(BODY2), bytes: BODY2.length }
  const keyOf = (entry: { sha256: string }) => `https://${ACCOUNT}.r2.cloudflarestorage.com/readarxiv-ci/fixtures/${entry.sha256}`
  const ENV = { READARXIV_CI_TOKEN: TOKEN, CF_ACCOUNT_ID: ACCOUNT }
  const NOW = new Date('2026-10-13T08:30:15.123Z')
  type Init = { headers?: Record<string, string> }

  /** what each address answers: a status and a body, or a throw; the bucket holds both pins unless an override says otherwise */
  function world(over: Record<string, () => Response> = {}) {
    const requests: { url: string; init: Init }[] = []
    const answers: Record<string, () => Response> = {
      [VERIFY_URL]: () => Response.json({ success: true, result: { id: KEY_ID, status: 'active' } }),
      [keyOf(ENTRY)]: () => new Response(new Uint8Array(BODY)),
      [keyOf(ENTRY2)]: () => new Response(new Uint8Array(BODY2)),
      [ENTRY.url]: () => new Response(new Uint8Array(BODY)),
      [ENTRY2.url]: () => new Response(new Uint8Array(BODY2)),
      ...over,
    }
    const fetchImpl = (async (url: string, init: Init) => {
      requests.push({ url, init })
      const answer = answers[url]
      if (!answer) throw new Error(`unexpected request to ${url}`)
      return answer()
    }) as unknown as typeof fetch
    const count = (pick: (url: string) => boolean) => requests.filter(r => pick(r.url)).length
    return {
      fetchImpl, requests,
      verifies: () => count(url => url === VERIFY_URL),
      bucket: () => count(url => url.includes('.r2.cloudflarestorage.com/')),
      arxiv: () => count(url => url.startsWith('https://arxiv.org/')),
    }
  }
  const twoPins = () => writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [ENTRY, ENTRY2] }))
  const run = (w: ReturnType<typeof world>, over: Record<string, unknown> = {}) => {
    const lines: string[] = []
    const done = ensureFixtures({ root, fetchImpl: w.fetchImpl, gapMs: 0, retryMs: 0, env: ENV, now: () => NOW, log: line => lines.push(line), ...over })
    return { lines, done }
  }
  /** every secret-bearing value a line or an error could carry */
  const leaks = (text: string, w: ReturnType<typeof world>) => [TOKEN, sha(Buffer.from(TOKEN)), ...w.requests.map(r => r.init.headers?.authorization).filter((a): a is string => !!a && !a.startsWith('Bearer')), ...w.requests.map(r => /Signature=([0-9a-f]+)/.exec(r.init.headers?.authorization ?? '')?.[1]).filter((v): v is string => !!v)].filter(v => text.includes(v))

  it('a hit is signed, digest-checked and written whole, asks arXiv nothing, and derives the credentials once for the whole run', async () => {
    twoPins()
    const w = world()
    const { lines, done } = run(w)
    expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path, ENTRY2.path] })
    expect(readFileSync(file())).toEqual(BODY)
    expect(readFileSync(join(root, ENTRY2.path))).toEqual(BODY2)
    expect(w.verifies()).toBe(1)
    expect(w.bucket()).toBe(2)
    expect(w.arxiv()).toBe(0)
    expect(w.requests.filter(r => r.url === VERIFY_URL).map(r => r.init.headers)).toEqual([{ authorization: `Bearer ${TOKEN}` }])
    for (const r of w.requests.filter(r => r.url.includes('r2.cloudflarestorage'))) {
      expect(Object.keys(r.init.headers ?? {}).sort()).toEqual(['authorization', 'x-amz-content-sha256', 'x-amz-date'])
      expect(r.init.headers?.['x-amz-date']).toBe('20261013T083015Z')
    }
    expect(readdirSync(join(root, 'tests/fixtures/arxiv')).sort()).toEqual(['0000.00000.html', '0000.00001.html'])
    expect(lines).toEqual([
      `fetched ${ENTRY.path} (${BODY.length} bytes) from the bucket (fixtures/${ENTRY.sha256}): HTTP 200`,
      `fetched ${ENTRY2.path} (${BODY2.length} bytes) from the bucket (fixtures/${ENTRY2.sha256}): HTTP 200`,
    ])
    expect(leaks(lines.join('\n'), w)).toEqual([])
  })

  it.each([
    ['a 404', () => new Response('', { status: 404 }), /bucket fixtures\/[0-9a-f]{64}: HTTP 404; reading arXiv instead/],
    ['a 403', () => new Response('', { status: 403 }), /bucket fixtures\/[0-9a-f]{64}: HTTP 403; reading arXiv instead/],
    ['a server error that does not clear', () => new Response('', { status: 503 }), /bucket fixtures\/[0-9a-f]{64}: HTTP 503; reading arXiv instead/],
    ['bytes that are not the pinned ones', () => new Response('<html>something else</html>'), /bucket fixtures\/[0-9a-f]{64}: HTTP 200, but the bytes are not the pinned ones; nothing was written, reading arXiv instead/],
    ['the right digest and another size is no pin either', () => new Response(new Uint8Array(Buffer.concat([BODY, Buffer.from(' ')]))), /the bytes are not the pinned ones/],
    ['a request that fails', () => { throw new TypeError('fetch failed') }, /bucket fixtures\/[0-9a-f]{64}: the request failed; reading arXiv instead/],
  ])('%s: one line naming the status and the key, nothing of the bad bytes written, and arXiv is read', async (_name, answer, line) => {
    const w = world({ [keyOf(ENTRY)]: answer })
    const { lines, done } = run(w)
    expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path] })
    expect(readFileSync(file())).toEqual(BODY)
    expect(w.arxiv()).toBe(1)
    const said = lines.filter(l => l.startsWith('bucket'))
    expect(said).toHaveLength(1)
    expect(said[0]).toMatch(line)
    expect(said[0]).toContain(ENTRY.sha256)
    expect(lines).toContain(`fetched ${ENTRY.path} (${BODY.length} bytes) from ${ENTRY.url}: HTTP 200`)
    expect(readdirSync(join(root, 'tests/fixtures/arxiv'))).toEqual(['0000.00000.html'])
    expect(leaks(lines.join('\n'), w)).toEqual([])
  })

  it('when arXiv serves other bytes too, the run fails with arXiv\'s own message and writes nothing', async () => {
    const w = world({ [keyOf(ENTRY)]: () => new Response('', { status: 404 }), [ENTRY.url]: () => new Response('<html>rendered again</html>') })
    const { done } = run(w)
    await expect(done).rejects.toThrow(/now serves other bytes.*Nothing was written/s)
    expect(existsSync(file())).toBe(false)
  })

  it('a token that cannot be verified says so once, and every fixture then goes to arXiv without another request to the bucket', async () => {
    twoPins()
    const w = world({ [VERIFY_URL]: () => Response.json({ success: false }, { status: 401 }) })
    const { lines, done } = run(w)
    expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path, ENTRY2.path] })
    expect(w.verifies()).toBe(1)
    expect(w.bucket()).toBe(0)
    expect(w.arxiv()).toBe(2)
    expect(lines.filter(l => l.startsWith('bucket'))).toEqual(['bucket: the token is not an active Account API token of this account (HTTP 401); reading arXiv instead'])
    expect(leaks(lines.join('\n'), w)).toEqual([])
  })

  it('a token with white space in it, or an account that is no account id, says so without the token and reads arXiv', async () => {
    for (const env of [{ ...ENV, READARXIV_CI_TOKEN: `${TOKEN}\n` }, { ...ENV, CF_ACCOUNT_ID: 'nope' }]) {
      rmSync(join(root, 'tests/fixtures/arxiv'), { recursive: true, force: true })
      const w = world()
      const { lines, done } = run(w, { env })
      expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path] })
      expect(w.verifies() + w.bucket()).toBe(0)
      expect(lines.filter(l => l.startsWith('bucket'))).toHaveLength(1)
      expect(lines.join('\n')).not.toContain(TOKEN)
      expect(lines.join('\n')).not.toContain(sha(Buffer.from(`${TOKEN}\n`)))
    }
  })

  it.each([
    ['no token', { CF_ACCOUNT_ID: ACCOUNT }],
    ['no account', { READARXIV_CI_TOKEN: TOKEN }],
    ['an empty token', { ...ENV, READARXIV_CI_TOKEN: '' }],
    ['neither', {}],
  ])('%s: no request to the bucket and none to verify, only arXiv', async (_name, env) => {
    const w = world()
    const { lines, done } = run(w, { env })
    expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path] })
    expect(w.verifies() + w.bucket()).toBe(0)
    expect(w.arxiv()).toBe(1)
    expect(lines.filter(l => l.startsWith('bucket'))).toEqual([])
  })

  it('every fixture on disk: no request of any kind, the credentials not even derived, and nothing logged', async () => {
    twoPins()
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), BODY)
    writeFileSync(join(root, ENTRY2.path), BODY2)
    const w = world()
    const { lines, done } = run(w)
    expect(await done).toEqual({ verified: [ENTRY.path, ENTRY2.path], downloaded: [] })
    expect(w.requests).toEqual([])
    expect(lines).toEqual([])
  })

  it('one missing, one on disk: the credentials are derived for the missing one only', async () => {
    twoPins()
    mkdirSync(join(root, 'tests/fixtures/arxiv'), { recursive: true })
    writeFileSync(file(), BODY)
    const w = world()
    const { done } = run(w)
    expect(await done).toEqual({ verified: [ENTRY.path], downloaded: [ENTRY2.path] })
    expect(w.verifies()).toBe(1)
    expect(w.bucket()).toBe(1)
  })

  it('the bucket for one fixture and arXiv for the other: the gap is arXiv\'s, so none is waited before the only arXiv request', async () => {
    twoPins()
    const w = world({ [keyOf(ENTRY2)]: () => new Response('', { status: 404 }) })
    const started = Date.now()
    const { lines, done } = run(w, { gapMs: 400 })
    expect(await done).toEqual({ verified: [], downloaded: [ENTRY.path, ENTRY2.path] })
    expect(Date.now() - started).toBeLessThan(380)
    expect(lines.at(-1)).toBe(`fetched ${ENTRY2.path} (${BODY2.length} bytes) from ${ENTRY2.url}: HTTP 200`)
  })

  it('a token, its digest, a signature or an authorization value is in no line, whatever the bucket does', async () => {
    const outcomes: (() => Response)[] = [
      () => new Response('', { status: 403 }),
      () => new Response('<html>other</html>'),
      () => { throw new TypeError(`fetch failed for ${TOKEN}`) },
    ]
    for (const answer of outcomes) {
      rmSync(join(root, 'tests/fixtures/arxiv'), { recursive: true, force: true })
      const w = world({ [keyOf(ENTRY)]: answer })
      const { lines, done } = run(w)
      await done
      expect(leaks(lines.join('\n'), w)).toEqual([])
    }
    // and the errors of a run that fails altogether
    rmSync(join(root, 'tests/fixtures/arxiv'), { recursive: true, force: true })
    const w = world({ [keyOf(ENTRY)]: () => new Response('', { status: 403 }), [ENTRY.url]: () => new Response('', { status: 404 }) })
    const { lines, done } = run(w)
    const message = String(((await done.catch((e: Error) => e)) as Error).message)
    expect(message).toMatch(/pin needs moving/)
    expect(leaks([message, ...lines].join('\n'), w)).toEqual([])
  })
})
