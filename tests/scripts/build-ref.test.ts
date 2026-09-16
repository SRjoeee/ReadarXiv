import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script the build config imports, deliberately dependency-free and untyped
import { isInstallerRemote, readBuildRef } from '../../scripts/build-ref.mjs'

// What the build stamps as the helper install ref (issue #158): the commit only when github.com/SRjoeee/ReadarXiv can serve it

const SHA = '0123456789abcdef0123456789abcdef01234567'
const git = (answers: Record<string, string>) => (cmd: string) => {
  if (cmd in answers) return answers[cmd]!
  throw new Error(`unexpected: ${cmd}`)
}
const clean = { 'git status --porcelain': '', 'git rev-parse HEAD': SHA }

describe('isInstallerRemote', () => {
  it('accepts the repository on github.com in the https, git@ and ssh:// spellings, with or without .git', () => {
    for (const url of ['https://github.com/SRjoeee/ReadarXiv.git', 'https://github.com/SRjoeee/ReadarXiv', 'https://alice@github.com/srjoeee/readarxiv.git', 'git@github.com:SRjoeee/ReadarXiv.git', 'ssh://git@github.com/SRjoeee/ReadarXiv.git']) {
      expect([url, isInstallerRemote(url)]).toEqual([url, true])
    }
  })

  it('rejects another host, another repository, and a local path — the same name elsewhere cannot vouch for a commit (Codex on #214)', () => {
    for (const url of ['https://gitlab.com/SRjoeee/ReadarXiv.git', '/Users/alice/mirrors/SRjoeee/ReadarXiv.git', 'https://github.com/alice/ReadarXiv.git', 'https://github.com/SRjoeee/ReadarXiv-fork.git', 'https://github.com.evil.example/SRjoeee/ReadarXiv.git']) {
      expect([url, isInstallerRemote(url)]).toEqual([url, false])
    }
  })
})

describe('readBuildRef', () => {
  const origin = 'origin\thttps://github.com/SRjoeee/ReadarXiv.git (fetch)\norigin\thttps://github.com/SRjoeee/ReadarXiv.git (push)'

  it('a clean tree whose commit is on a branch of the repository stamps the commit', () => {
    expect(readBuildRef(git({ ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '  origin/rebuild/v1' }))).toBe(SHA)
  })

  it('a dirty tree, a commit on no branch, a pull_request merge ref, a fork-only commit, a foreign remote, and no git all say main', () => {
    expect(readBuildRef(git({ ...clean, 'git status --porcelain': ' M src/x.ts' }))).toBe('main')
    expect(readBuildRef(git({ ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '' }))).toBe('main')
    expect(readBuildRef(git({ ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '  pull/214/merge' }))).toBe('main')
    expect(readBuildRef(git({ ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '  origin/HEAD -> origin/main' }))).toBe('main')
    const fork = `${origin}\nfork\thttps://github.com/alice/ReadarXiv.git (fetch)\nfork\thttps://github.com/alice/ReadarXiv.git (push)`
    expect(readBuildRef(git({ ...clean, 'git remote -v': fork, [`git branch -r --contains ${SHA}`]: '  fork/topic' }))).toBe('main')
    expect(readBuildRef(git({ ...clean, 'git remote -v': fork, [`git branch -r --contains ${SHA}`]: '  fork/topic\n  origin/topic' }))).toBe(SHA)
    expect(readBuildRef(git({ ...clean, 'git remote -v': 'mirror\thttps://gitlab.com/SRjoeee/ReadarXiv.git (fetch)', [`git branch -r --contains ${SHA}`]: '  mirror/main' }))).toBe('main')
    expect(readBuildRef(() => { throw new Error('git: command not found') })).toBe('main')
  })
})
