// The ref the popup's helper install command fetches from (issue #158), decided at build time by wxt.config.ts:
// the commit this build is made from when a reader's curl to the installer's repository can find it, `main`
// otherwise. Pure, over a `run` that answers git; tests drive it with canned answers (tests/scripts/build-ref.test.ts).

/** The repository the copied install command fetches from (ui/strings.ts writes the same name into the command) */
export const INSTALLER_REPO = 'SRjoeee/ReadarXiv'

/**
 * Is this fetch URL that repository on GitHub — https with or without a user, `git@github.com:`, `ssh://github.com/` —
 * and nothing else: a GitLab mirror or a local path ending in the same name cannot vouch for a commit the command will
 * fetch from github.com (Codex on #214)
 */
export function isInstallerRemote(url) {
  const repo = INSTALLER_REPO.replace('/', '\\/')
  return new RegExp(`^(?:https?:\\/\\/(?:[^@\\/\\s]+@)?github\\.com\\/|git@github\\.com:|ssh:\\/\\/(?:[^@\\/\\s]+@)?github\\.com\\/)${repo}(?:\\.git)?\\/?$`, 'i').test(url)
}

/**
 * @param {(cmd: string) => string} run — runs a git command and answers its trimmed stdout; throws when git is not there
 * @returns {string} a 40-digit commit, or `main`
 *
 * `main` for: a dirty tree; a HEAD that is not a commit; no remote whose fetch URL is the installer's repository; a
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
      .filter(([, url, kind]) => kind === '(fetch)' && url !== undefined && isInstallerRemote(url))
      .map(([name]) => name)
    if (remotes.length === 0) return 'main'
    const branches = run(`git branch -r --contains ${head}`).split('\n').map(l => l.trim())
      .filter(l => remotes.some(r => l.startsWith(`${r}/`) && l !== `${r}/HEAD` && !l.startsWith(`${r}/HEAD -> `)))
    return branches.length > 0 ? head : 'main'
  } catch {
    return 'main'
  }
}
