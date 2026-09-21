// The ref a build names, decided at build time by wxt.config.ts and carried into the diagnostics a reader exports
// (issue #156): a release tag pointing at this build's commit when there is one (docs/RELEASE.md), else the commit
// itself when the public repository holds it, `main` otherwise — so a report names a source anyone can look up. Pure,
// over a `run` that answers git; tests drive it with canned answers (tests/scripts/build-ref.test.ts).

/** The public repository a named ref must be found in */
export const REPOSITORY = 'SRjoeee/ReadarXiv'

/**
 * Is this fetch URL that repository on GitHub — https with or without a user, `git@github.com:`, `ssh://github.com/` —
 * and nothing else: a GitLab mirror or a local path ending in the same name cannot vouch for a commit a reader of the
 * report will look up on github.com (Codex on #214)
 */
export function isRepositoryRemote(url) {
  const repo = REPOSITORY.replace('/', '\\/')
  return new RegExp(`^(?:https?:\\/\\/(?:[^@\\/\\s]+@)?github\\.com\\/|git@github\\.com:|ssh:\\/\\/(?:[^@\\/\\s]+@)?github\\.com\\/)${repo}(?:\\.git)?\\/?$`, 'i').test(url)
}

/** A release tag: `v` and a version (docs/RELEASE.md) */
export const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/**
 * @param {(cmd: string) => string} run — runs a git command and answers its trimmed stdout; throws when git is not there
 * @returns {string} a release tag, a 40-digit commit, or `main`
 *
 * A tag only when the commit passes the branch check below **and the repository's copy of the tag points at this
 * commit** (`git ls-remote --tags` for the tag and its peeled `^{}` form — asked for the tag alone, git prints only
 * the tag object's line, so an annotated tag never matched and v0.4.0 was stamped with its commit — one round trip,
 * made only when a release tag points at HEAD): the branch check proves the commit is on GitHub, not the tag — a tag created locally and not yet pushed would send the reader's curl
 * to a 404 (Devin on #218), and one moved locally over an older published one would fetch the wrong sources (Codex).
 *
 * `main` for: a dirty tree; a HEAD that is not a commit; no remote whose fetch URL is the public repository; a
 * commit on none of that repository's branches — a pull_request checkout in CI carries `pull/<n>/merge`, whose merge
 * commit is on no branch (measured on #214's own CI run); a fork's remote may hold a commit github.com/SRjoeee/ReadarXiv
 * does not; each remote's symbolic `<remote>/HEAD` is no branch either
 */
export function readBuildRef(run) {
  try {
    if (run('git status --porcelain') !== '') return 'main'
    const head = run('git rev-parse HEAD')
    if (!/^[0-9a-f]{40}$/.test(head)) return 'main'
    const remotes = run('git remote -v').split('\n')
      .map(l => l.trim().split(/\s+/))
      .filter(([, url, kind]) => kind === '(fetch)' && url !== undefined && isRepositoryRemote(url))
      .map(([name]) => name)
    if (remotes.length === 0) return 'main'
    const branches = run(`git branch -r --contains ${head}`).split('\n').map(l => l.trim())
      .filter(l => remotes.some(r => l.startsWith(`${r}/`) && l !== `${r}/HEAD` && !l.startsWith(`${r}/HEAD -> `)))
    if (branches.length === 0) return 'main'
    const tag = run(`git tag --points-at ${head}`).split('\n').map(l => l.trim()).find(l => RELEASE_TAG.test(l))
    if (!tag) return head
    // The repository's copy of the tag must point at this very commit — a tag moved locally over an older one the
    // repository still holds would name the wrong sources (Codex on #218): the listing's direct
    // line (a lightweight tag) or its peeled `^{}` line (an annotated tag) has to name `head`. A lookup that cannot
    // reach the repository (offline) keeps the commit, which the branch check has already vouched for
    let published = false
    try {
      published = remotes.some(remote => run(`git ls-remote --tags ${remote} refs/tags/${tag} 'refs/tags/${tag}^{}'`).split('\n')
        .map(l => l.trim().split(/\s+/))
        .some(([sha, ref]) => sha === head && (ref === `refs/tags/${tag}` || ref === `refs/tags/${tag}^{}`)))
    } catch {
      return head
    }
    return published ? tag : head
  } catch {
    return 'main'
  }
}
