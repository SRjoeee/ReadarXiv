// The controls of the workflow rules (tests/scripts/workflow-rules.ts, held by tests/scripts/ci-workflows.test.ts): ci.yml with
// one thing in it that a rule is for, each a workflow text the named rule must refuse. Among them every spelling of YAML or of an
// expression that could carry what a rule refuses past a reader that reads text: a quoted key, a flow mapping, a block at another
// indentation, a scalar in another style, an anchor, an alias, a tag, an escape, the bracket form or another case of a context.

/** a control: the rule that must refuse `text`, and what `text` holds */
export interface Control { rule: string; what: string; text: string }

/** a GitHub Actions expression (a plain string with one in it is a lint warning) */
const EXPR = (inner: string) => `\${{ ${inner} }}`
const SHA = 'b906affcce14559ad1aafd4ab0e942779e9f58b1'
/** (a commit of no action: the control needs the pinned form alone) */
const SCRIPT = '0'.repeat(40)

/** the controls over `ci` (ci.yml's text, which obeys every rule) */
export function controlsOf(ci: string): Control[] {
  const once = (from: string | RegExp, to: string) => {
    const out = ci.replace(from, to)
    if (out === ci) throw new Error(`a control's change does not apply: ${String(from)}`)
    return out
  }
  /** a line of the extension job (its timeout, the job's last key before its steps), and of the reader job's */
  const inExtension = (lines: string) => once('    timeout-minutes: 45\n', `    timeout-minutes: 45\n${lines}`)
  const inReader = (lines: string) => once('    timeout-minutes: 30\n', `    timeout-minutes: 30\n${lines}`)
  /** the reader job's last step's script (the harness), replaced */
  const asScript = (run: string) => once('run: node packages/reader/e2e/run.mjs', run)
  const c = (rule: string, what: string, text: string): Control => ({ rule, what, text })
  return [
    // the runner
    c('hosted runners', "a job on a runner of the maintainer's, by a flow sequence", once('runs-on: ubuntu-24.04', 'runs-on: [self-hosted, macOS, ARM64, lab-data]')),
    c('hosted runners', 'a runner by an expression (a matrix value)', once('runs-on: ubuntu-24.04', `runs-on: ${EXPR('matrix.os')}`)),
    c('hosted runners', "a runner's own label under a quoted key", once('    runs-on: ubuntu-24.04', '    "runs-on": lab-data')),
    c('hosted runners', "a runner's own label in a block sequence", once('    runs-on: ubuntu-24.04', '    runs-on:\n      - lab-data')),
    c('hosted runners', 'a runner by an alias', once('    runs-on: ubuntu-24.04', '    runs-on: *runner')),
    // the events
    c('events', 'pull_request_target', once('\n  pull_request:\n', '\n  pull_request:\n  pull_request_target:\n')),
    c('events', 'a comment on an issue', once('\n  pull_request:\n', '\n  pull_request:\n  issue_comment:\n    types: [created]\n')),
    c('events', 'the events as a flow sequence', once('on:\n  push:\n    branches: [main, rebuild/v2]\n  pull_request:\n', 'on: [push, issues]\n')),
    c('events', 'the event as a string', once('on:\n  push:\n    branches: [main, rebuild/v2]\n  pull_request:\n', 'on: issues\n')),
    c('events', 'an event under a quoted key', once('\n  pull_request:\n', '\n  pull_request:\n  "issues":\n')),
    c('events', 'the `on` key quoted', once('\non:\n', '\n"on":\n')),
    // the secrets
    c('secrets', "a secret in a job's environment", inReader(`    env:\n      TOKEN: ${EXPR('secrets.ANY')}\n`)),
    c('secrets', "a secret in a job's environment, by the bracket form", inReader(`    env:\n      TOKEN: ${EXPR("secrets['READARXIV_CI_TOKEN']")}\n`)),
    c('secrets', "a secret in a job's environment, the context in capitals", inReader(`    env:\n      TOKEN: ${EXPR('SECRETS.ANY')}\n`)),
    c('secrets', "every secret at once, in a step's environment", asScript(`run: node packages/reader/e2e/run.mjs\n        env:\n          ALL: ${EXPR('toJSON(secrets)')}`)),
    c('secrets', "a secret in an action's input, spelt as an environment's entry", once('          node-version: 22\n', `          node-version: 22\n          TOKEN: ${EXPR('secrets.ANY')}\n`)),
    c('secrets', 'a secret handed to the steps after through GITHUB_ENV', once('run: node scripts/fetch-fixtures.mjs', 'run: echo "T=$READARXIV_CI_TOKEN" >> "$GITHUB_ENV"')),
    c('secrets', 'a secret in a script', asScript(`run: echo "${EXPR('secrets.ANY')}"`)),
    c('secrets', 'an expression in a script', asScript(`run: echo "${EXPR('github.event.pull_request.title')}"`)),
    c('secrets', 'an expression in a script in a folded block', asScript(`run: >-\n          echo "${EXPR('github.event.pull_request.title')}"`)),
    c('secrets', 'an expression in a script as a single-quoted flow string', asScript(`run: 'echo "${EXPR('github.event.pull_request.title')}"'`)),
    c('secrets', 'an expression in a script whose block has an indentation indicator', asScript(`run: |2\n          echo "${EXPR('github.event.pull_request.title')}"`)),
    c('secrets', 'an expression in a script in double quotes over two lines', asScript(`run: "echo\n          ${EXPR('github.event.pull_request.title')}"`)),
    // (the secrets' reader sees no `${{` behind an escape: a script in double quotes, whose escapes YAML reads first, is refused
    // as a form)
    c('forms', 'an expression in a script, its dollar an escape of a double-quoted scalar', asScript('run: "echo \\x24{{ github.event.pull_request.title }}"')),
    // the actions
    c('actions', "a third party's action", once('run: corepack enable', `uses: pnpm/action-setup@${SHA} # v4.3.0`)),
    c('actions', 'an action by its tag', once(/uses: actions\/checkout@[0-9a-f]{40} # v4\.4\.0/, 'uses: actions/checkout@v4')),
    c('actions', "a GitHub action not listed, one that runs its input as a script", once('run: corepack enable', `uses: actions/github-script@${SCRIPT} # v7.0.1`)),
    c('actions', "a third party's action under a quoted key", once('run: corepack enable', `"uses": pnpm/action-setup@${SHA} # v4.3.0`)),
    c('actions', "a third party's action in a flow-mapped step", once('run: corepack enable', `{ uses: pnpm/action-setup@${SHA}, with: { version: 10 } }`)),
    // the permissions
    c('permissions', 'a write at the top', once('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n')),
    c('permissions', "a job's write not listed", inExtension('    permissions:\n      pull-requests: write\n')),
    c('permissions', "a job's write in a flow mapping", inExtension('    permissions: { contents: read, pull-requests: write }\n')),
    c('permissions', "a job's blanket write", inExtension('    permissions: write-all\n')),
    c('permissions', "the workflow's permissions in a flow mapping with a write", once('permissions:\n  contents: read\n', 'permissions: { contents: read, actions: write }\n')),
    c('permissions', "a job's write under a quoted key", inExtension('    "permissions":\n      pull-requests: write\n')),
    c('permissions', "a job's write spaced otherwise", inExtension('    permissions:\n      pull-requests:   write\n')),
    c('permissions', "a job's write quoted", inExtension("    permissions:\n      pull-requests: 'write'\n")),
    // the checkout
    c('checkout', 'a checkout that keeps its credential', once(/( {6}- uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n) {10}persist-credentials: false\n/, '$1          fetch-depth: 1\n')),
    c('checkout', "a checkout that keeps its credential, in a job whose steps stand at another indentation after one that does not",
      `${ci}  more:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n        with:\n          persist-credentials: false\n  again:\n    runs-on: ubuntu-24.04\n    steps:\n    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n`),
    // the lab's tiers
    c('tiers', 'the full tier', asScript('run: pnpm release-check --tier full')),
    c('tiers', 'the full tier, spaced otherwise', asScript('run: pnpm release-check  --tier  full')),
    c('tiers', 'a tier named by a variable', asScript('run: pnpm release-check --tier "$TIER"')),
    // the forms no reader reads
    c('forms', 'an anchor', inReader('    env: &shared\n      CI: "1"\n')),
    c('forms', 'a merge of an alias', inReader('    env:\n      <<: *shared\n')),
    c('forms', 'a tag', once('    timeout-minutes: 30\n', '    timeout-minutes: !!int "30"\n')),
    // a line led by `#` inside a block scalar is the scalar's text, not a YAML comment: GitHub reads its expressions (in a script,
    // before the shell sees a comment there)
    c('secrets', "an expression in a script's shell comment", asScript(`run: |\n          # ${EXPR('github.event.pull_request.title')}\n          node packages/reader/e2e/run.mjs`)),
    c('secrets', "a secret in a script's shell comment", asScript(`run: |\n          # ${EXPR('secrets.ANY')}\n          node packages/reader/e2e/run.mjs`)),
    c('secrets', "a secret in a step's environment's value written as a block, its line led by #", asScript(`run: node packages/reader/e2e/run.mjs\n        env:\n          NOTE: |\n            # ${EXPR('secrets.ANY')}`)),
    c('secrets', "a secret in an action's input written as a block, its line led by #", once('          node-version: 22\n', `          node-version: 22\n          note: |\n            # ${EXPR('secrets.ANY')}\n`)),
    // the two browser jobs hold nothing
    c('browser jobs', 'a variable by the bracket form', inReader(`    env:\n      X: ${EXPR("vars['ANY']")}\n`)),
    c('browser jobs', "the job's token by the bracket form", inReader(`    env:\n      X: ${EXPR("github['token']")}\n`)),
    c('browser jobs', "a variable in a job's environment's value written as a block, its line led by #", inReader(`    env:\n      X: |\n        # ${EXPR("vars['ANY']")}\n`)),
    c('browser jobs', "the job's token in an if written as a block, its line led by #", asScript(`run: node packages/reader/e2e/run.mjs\n        if: |\n          # ${EXPR('github.token')}\n          true`)),
    c('browser jobs', "the job's token, the context in capitals", inReader(`    env:\n      X: ${EXPR('GITHUB.TOKEN')}\n`)),
  ]
}
