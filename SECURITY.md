# Security

Read arXiv keeps its readers' API keys and sends their papers' text to the translation services they choose, so a flaw in it can cost a reader more than a wrong translation.

## Reporting a vulnerability

Report it privately, through GitHub's private vulnerability reporting: open the repository's [Security tab](https://github.com/SRjoeee/ReadarXiv/security) and choose **Report a vulnerability** (the form is at https://github.com/SRjoeee/ReadarXiv/security/advisories/new). Only the maintainer sees the report.

Do not open a public issue, pull request or discussion about it, and do not put a real API key in the report: describe how a key could leak, or use one you have revoked.

Helpful in a report: the version of Read arXiv (`chrome://extensions` shows it), Chrome's version, the steps that show the problem, and what an attacker gains.

## What is in scope

- The Chrome extension in this repository: its pages, its content scripts, its background, the PDF reader.
- The PDF reader's engine (`src/pdf-reader/engine/`), which Read arXiv's website also runs.
- Read arXiv's website, `readarxiv.com`: its code is not public, but a report about it is welcome here too.

Problems in arXiv, in the translation services or in Chrome itself belong to their owners.

## What to expect

The maintainer works on Read arXiv alone. He acknowledges a report within a week, says whether he can reproduce it, and keeps the report private until a fixed version is released. The fix is described in `CHANGELOG.md` and, where it helps readers, in a published advisory that credits the reporter unless they ask otherwise. Only the latest version on the Chrome Web Store receives fixes.
