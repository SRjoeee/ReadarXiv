# Review and merge

The reviewers of every pull request in this repository and in `readarxiv-web` are the two cloud reviewers configured on GitHub: **Codex** (`chatgpt-codex-connector[bot]`) and **CodeRabbit** (`coderabbitai[bot]`). They review on open and on every push. An Opus adversarial review is added, once, for changes to security, concurrency, data integrity or a core contract; it never replaces the two. Devin is not requested.

## Terminal signals

A merge waits for CI and for a terminal signal from each reviewer:

- a 👍 reaction on the pull request (no findings);
- a review with inline comments (findings);
- a usage-limit notice as an issue comment (no review this round).

👀 means the review is running. A fast failure or silence of one reviewer says nothing about the other. Watch four endpoints per pull request, paginated (`per_page=100`, `--paginate`): `pulls/<n>/reviews`, `pulls/<n>/comments` (inline, anchored by `original_commit_id`), `issues/<n>/comments`, `issues/<n>/reactions`; match the bot logins exactly and dedupe by comment id.

A review that has shown 👀 for a long time is re-triggered with one `@codex review` comment and given time. Merging without a reviewer's signal is an exception the coordinator grants explicitly, after a re-trigger failed, never a lane's own call.

## Fix rounds

Every push restarts the reviewers, and a push during a review does not start a second one: collect a round's fixes and push once. After a fix round on a security, concurrency, data-integrity or contract change, comment `@codex review` once and wait for its signal; other changes merge once the fix lands and CI is green.

## Findings

Verify each finding against a fixture, a probe or the code before adopting it. A real, reproducible defect on today's code path is fixed with a failing test first. A speculative, style or out-of-scope point is declined with a one-line reply by comment id (`pulls/<n>/comments/<id>/replies`). What is worth doing later goes to the debt issue (#299) with the thread link. When one instance of a class is fixed, sweep the repository for the class, then ask whether the fix itself has the same flaw.

## Merging

Merge commit, never squash. Feature work merges into `next`; `next` into `main`, and releases, only on the maintainer's explicit request. Stacked pull requests are rehearsed merged locally, then merged bottom-up, each downstream pull request retargeted (`gh pr edit --base`) before its base is merged and deleted. Documentation-only changes ride a related code pull request or merge directly with CI green; nothing is opened just to be reviewed.
