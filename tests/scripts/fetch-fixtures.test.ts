import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureFixtures, readManifest } from '../../scripts/fetch-fixtures.mjs'

// The fixtures that are not in the repository (tests/fixtures/remote.json): present and verified, or a failure that
// says what to do — never a silently different file, never a half-written one

const BODY = Buffer.from('<html>the pinned bytes</html>')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const ENTRY = { path: 'tests/fixtures/arxiv/0000.00000.html', url: 'https://arxiv.org/html/0000.00000v1', sha256: sha(BODY), bytes: BODY.length, for: 'tests' }

let root: string
const file = () => join(root, ENTRY.path)
const serving = (body: Buffer, status = 200) => vi.fn(async () => new Response(new Uint8Array(body), { status })) as unknown as typeof fetch

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'axt-fixtures-'))
  mkdirSync(join(root, 'tests/fixtures'), { recursive: true })
  writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [ENTRY] }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

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

  it('a redirect that leaves arXiv is refused and nothing is written', async () => {
    const response = new Response(new Uint8Array(BODY))
    Object.defineProperty(response, 'redirected', { value: true })
    Object.defineProperty(response, 'url', { value: 'https://mirror.example.com/0000.00000v1' })
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch
    await expect(ensureFixtures({ root, fetchImpl, gapMs: 0 })).rejects.toThrow(/redirected to https:\/\/mirror\.example\.com.*outside arXiv/s)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(existsSync(file())).toBe(false)
  })

  it('bytes of the right hash but not the recorded size cannot exist; bytes of the right size but another hash are refused as another page', async () => {
    const same = Buffer.from('<html>the pinned bytez</html>')
    expect(same.length).toBe(BODY.length)
    await expect(ensureFixtures({ root, fetchImpl: serving(same), gapMs: 0 })).rejects.toThrow(/a new rendering of the paper, or a page in its place/)
  })

  it('a symbolic link in the fixture tree does not carry the write outside it', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'axt-outside-'))
    try {
      symlinkSync(outside, join(root, 'tests/fixtures/arxiv'))
      await expect(ensureFixtures({ root, fetchImpl: serving(BODY), gapMs: 0 })).rejects.toThrow(/outside the fixture directories; nothing was written/)
      expect(readdirSync(outside)).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
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

  it('a consumer fetches only what it reads', async () => {
    const helper = { ...ENTRY, path: 'helper/Tests/Fixtures/x.png', for: 'helper-smoke' }
    writeFileSync(join(root, 'tests/fixtures/remote.json'), JSON.stringify({ fixtures: [ENTRY, helper] }))
    const fetchImpl = serving(BODY)
    expect((await ensureFixtures({ root, fetchImpl, gapMs: 0, for: 'tests' })).downloaded).toEqual([ENTRY.path])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(existsSync(join(root, helper.path))).toBe(false)
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
      [{ fixtures: [{ ...ENTRY, for: 'e2e' }] }, /"for" is not one of tests, helper-smoke/],
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
      // Only the tests' fixtures are fetched in CI; the helper's image is for a smoke test CI cannot run
      expect(cached.includes(entry.path), entry.path).toBe(entry.for === 'tests')
    }
  })

  it('no file the manifest names is tracked: the repository does not redistribute them', async () => {
    const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: join(import.meta.dirname, '../..'), encoding: 'utf8' }).split('\n'))
    for (const entry of await readManifest()) expect(tracked.has(entry.path), entry.path).toBe(false)
  })
})
