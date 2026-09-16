import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// helper/install-remote.sh fetches the sources from the ref the popup's command names (issue #158): a commit hash is
// served by codeload at its bare path, a branch under refs/heads. AXT_HELPER_DRY_RUN prints the URL and stops
// before any download or platform check, so this runs anywhere

const SCRIPT = join(import.meta.dirname, '../../helper/install-remote.sh')
const ID = 'abcdefghijklmnopabcdefghijklmnop'
const run = (...args: string[]) => execFileSync('bash', [SCRIPT, ...args], { env: { ...process.env, AXT_HELPER_DRY_RUN: '1' }, stdio: 'pipe' }).toString().trim()

describe('helper/install-remote.sh', () => {
  it('a branch name fetches refs/heads/<branch>; no ref means main', () => {
    expect(run(ID, 'rebuild/v1')).toBe('https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/refs/heads/rebuild/v1')
    expect(run(ID)).toBe('https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/refs/heads/main')
  })

  it('a commit hash — what a pinned build passes — fetches that commit', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567'
    expect(run(ID, sha)).toBe(`https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/${sha}`)
  })

  it('a malformed extension id is refused before anything else', () => {
    expect(() => run('not-an-id', 'main')).toThrow(/Not a valid extension id/)
  })
})
