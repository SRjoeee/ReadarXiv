import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script the build config imports, deliberately dependency-free and untyped
import { isInstallerRemote, readBuildRef } from '../../scripts/build-ref.mjs'

// What the build stamps as the helper install ref (issue #158): the commit only when github.com/SRjoeee/ReadarXiv can serve it

const SHA = '0123456789abcdef0123456789abcdef01234567'
const git = (answers: Record<string, string>) => (cmd: string) => {
  if (cmd in answers) return answers[cmd]!
  throw new Error(`unexpected: ${cmd}`)
}
const clean = { 'git status --porcelain': '', 'git rev-parse HEAD': SHA, [`git tag --points-at ${SHA}`]: '' }

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

  it('a release tag pointing at that commit stamps the tag once the repository lists it; other tags do not count; an unpushed tag and a tag on a commit the repository does not hold are not trusted', () => {
    const onBranch = { ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '  origin/main' }
    const listed = (tag: string) => ({ [`git ls-remote --tags origin refs/tags/${tag} 'refs/tags/${tag}^{}'`]: `${SHA}\trefs/tags/${tag}` })
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0', ...listed('v1.0.0') }))).toBe('v1.0.0')
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v0.3.0-mvp\nv1.0.0', ...listed('v0.3.0-mvp') }))).toBe('v0.3.0-mvp')
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'nightly\nrelease-candidate' }))).toBe(SHA)
    // created locally, not pushed: the repository answers nothing for it (Devin on #218)
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0', [`git ls-remote --tags origin refs/tags/v1.0.0 'refs/tags/v1.0.0^{}'`]: '' }))).toBe(SHA)
    // an annotated tag answers with the tag object too; the peeled line names this commit
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0', [`git ls-remote --tags origin refs/tags/v1.0.0 'refs/tags/v1.0.0^{}'`]: `deadbeef\trefs/tags/v1.0.0\n${SHA}\trefs/tags/v1.0.0^{}` }))).toBe('v1.0.0')
    // the repository's tag of that name points at another commit — moved locally over a published one (Codex on #218)
    const other = 'fedcba9876543210fedcba9876543210fedcba98'
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0', [`git ls-remote --tags origin refs/tags/v1.0.0 'refs/tags/v1.0.0^{}'`]: `${other}\trefs/tags/v1.0.0` }))).toBe(SHA)
    expect(readBuildRef(git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0', [`git ls-remote --tags origin refs/tags/v1.0.0 'refs/tags/v1.0.0^{}'`]: `deadbeef\trefs/tags/v1.0.0\n${other}\trefs/tags/v1.0.0^{}` }))).toBe(SHA)
    // the lookup cannot reach the repository: the commit, which the branch check vouched for, not main (Codex on #218)
    const offline = git({ ...onBranch, [`git tag --points-at ${SHA}`]: 'v1.0.0' })
    expect(readBuildRef((cmd: string) => { if (cmd.startsWith('git ls-remote')) throw new Error('could not read from remote'); return offline(cmd) })).toBe(SHA)
    expect(readBuildRef(git({ ...clean, 'git remote -v': origin, [`git branch -r --contains ${SHA}`]: '', [`git tag --points-at ${SHA}`]: 'v1.0.0' }))).toBe('main')
  })

  it('against a real repository, an annotated release tag pushed to it stamps the tag (the canned answers above once assumed a peeled line git does not print)', () => {
    // v0.4.0 was built with its install command pinned to the commit: `git ls-remote --tags origin refs/tags/v0.4.0`
    // prints only the tag object's line, never the peeled `^{}` one, so an annotated tag never matched. Real git here,
    // in a scratch clone of a scratch bare repository; only `git remote -v` is answered as the installer's repository
    const root = mkdtempSync(join(tmpdir(), 'axt-build-ref-'))
    try {
      const sh = (cwd: string, cmd: string) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      const bare = join(root, 'origin.git')
      const work = join(root, 'work')
      sh(root, `git init -q --bare ${bare}`)
      sh(root, `git clone -q ${bare} ${work}`)
      const identity = '-c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false -c tag.gpgsign=false'
      writeFileSync(join(work, 'file.txt'), 'x\n')
      sh(work, 'git add file.txt')
      sh(work, `git ${identity} commit -q -m first`)
      sh(work, 'git push -q origin HEAD:main')
      sh(work, 'git fetch -q origin')
      sh(work, `git ${identity} tag -a v9.9.9 -m release`)
      const head = sh(work, 'git rev-parse HEAD')
      const run = (cmd: string) => (cmd === 'git remote -v' ? origin : sh(work, cmd))
      // Created locally, not yet pushed: the repository does not list it, so the commit
      expect(readBuildRef(run)).toBe(head)
      sh(work, 'git push -q origin v9.9.9')
      expect(readBuildRef(run)).toBe('v9.9.9')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
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
