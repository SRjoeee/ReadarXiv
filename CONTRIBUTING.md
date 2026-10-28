# Contributing to Read arXiv

Bug reports, ideas and questions are welcome as [issues](https://github.com/SRjoeee/ReadarXiv/issues). A security problem is reported privately instead: see [`SECURITY.md`](SECURITY.md).

## Pull requests from outside the project are by arrangement

Read arXiv's code is published here under GPL-3.0, and its copyright holder also uses his own code in Read arXiv's website, which is closed source. `docs/THIRD_PARTY.md` ("Who holds the copyright") explains why that works for his code and not for anyone else's: code you write stays yours, so without a licence from you, the website could not use it.

So before you write a change you would like merged:

1. Open an issue that describes it, and wait for the maintainer to say he would take it.
2. Your pull request includes this sentence, as a comment on it or in its description, with your name:

   > I wrote this contribution, or have the right to submit it. I license it under GPL-3.0-only, and I also grant SRjoeee, the copyright holder of Read arXiv, a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, copy, modify, sublicense and distribute it under any terms, including in closed-source software.

A Developer Certificate of Origin sign-off (`Signed-off-by`) alone is not enough: it certifies where a change comes from, but grants nothing beyond the licence the change is made under. A pull request without the grant is closed unmerged. You keep the copyright of what you wrote.

## Working on the code

Read [`CLAUDE.md`](CLAUDE.md) first: it records the rules this codebase is built under, and a change that breaks one is not right however well it is written. The design is `docs/DESIGN.md`, the interface `docs/UI.md`. A pull request passes `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, the steps CI runs.
