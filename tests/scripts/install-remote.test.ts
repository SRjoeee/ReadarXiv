import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

  it('a release tag — what a build made after tagging passes — fetches refs/tags/<tag>', () => {
    expect(run(ID, 'v1.0.0')).toBe('https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/refs/tags/v1.0.0')
    expect(run(ID, 'v1.0.0-rc.1')).toBe('https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/refs/tags/v1.0.0-rc.1')
  })

  it('a commit hash — what a pinned build passes — fetches that commit', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567'
    expect(run(ID, sha)).toBe(`https://codeload.github.com/SRjoeee/ReadarXiv/tar.gz/${sha}`)
  })

  it('copies onto the reader\'s machine only what the build needs: the smoke test\'s images stay out, and an earlier install\'s copy of them goes', () => {
    const script = readFileSync(SCRIPT, 'utf8')
    const copies = script.split('\n').filter(line => /^\s*(\[.*\]\s*&&\s*)?cp\b/.test(line))
    expect(copies).toHaveLength(1)
    expect(copies[0]).toContain('"$src/helper/Sources" "$src/helper/Package.swift" "$src/helper/LICENSE-macos-vision-ocr.txt" "$src/helper/register.sh"')
    expect(copies[0]).not.toContain('Tests')
    expect(script).toContain('rm -rf "$DIR/Sources" "$DIR/Tests"')
  })

  it('a malformed extension id is refused before anything else', () => {
    expect(() => run('not-an-id', 'main')).toThrow(/Not a valid extension id/)
  })
})
