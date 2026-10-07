# arXiv's style sheets, vendored for the offline accessibility audit

`pnpm e2e:a11y` (`tests/e2e/a11y.mjs`, DESIGN §7.4b) serves a paper of `tests/fixtures/arxiv/` from 127.0.0.1 and nothing
else of arxiv.org (issue #100). A fixture is LaTeXML's output without its layout: every colour, every size and the
sticky header come from the sheets arXiv serves under `/static/`, and axe's contrast rules judge a page by them. Without
these files the audit would run on a page nobody reads. `tests/e2e/lib/offline-arxiv.mjs` serves them at the paths
the fixtures link; everything else under `/static/` — scripts, fonts, images — answers 404.

## What is here

The tree below `static/` is the URL path below `https://arxiv.org/static/`, file for file, as arXiv served it on
**2026-10-08** (a request each, `User-Agent: ReadarXiv/0.1 (+https://readarxiv.org; research)`). The sheets are the
repository's own files, byte for byte: the same bytes as arXiv/arxiv-browse's `browse/static/css/` and arXiv/arxiv-base's
`arxiv/base/static/css/` at the `develop` branch of that day.

| File | Is | SHA-256 |
|---|---|---|
| `static/browse/0.3.4/css/arxiv-html-papers-20260823.css` | the sheet every fixture links; it only imports the two below | `849ed2ddc710d7f063cbc056c72530fbd49e86aede14645871ff54bb6bf0edeb` |
| `static/browse/0.3.4/css/ar5iv.0.9.1.min.css` | ar5iv's sheet, LaTeXML's classes (`ltx_*`) laid out | `116aa0b87f86053a0529880fdd4f99bffbbf385f715e398f9a8d18ab38f660c1` |
| `static/browse/0.3.4/css/arxiv-html-papers-theme-20260807.css` | arXiv's theme over it: colours, tokens, the dark theme | `9b76a14604669ad636382b8e73fc3102f9bd2faa93c6b9dfcadd1018fc388309` |
| `static/base/1.0.1/css/arxiv-header-footer.css` | arXiv's header and footer, the sticky bar over the paper | `cd672136812fb7d53d9e8e0364bafe945f18f57029165326903bb86f5a791b02` |

## Licence

MIT, as the two repositories they come from: **Copyright (c) 2026 arXiv, Inc.**, and for contributions made on or before
2026-06-30 Copyright (c) 2017-2025 Cornell University (Library). Redistribution is allowed with the notice kept, which
is why the licence texts of both repositories sit here unchanged: `LICENSE-arxiv-browse` (the `browse/` sheets) and
`LICENSE-arxiv-base` (the header and footer). Read from `https://github.com/arXiv/arxiv-browse/blob/develop/LICENSE` and
`https://github.com/arXiv/arxiv-base/blob/develop/LICENSE` on 2026-10-08. The ar5iv sheet is dginev/ar5iv-css (MIT) as
arXiv builds it. Nothing here is in the built extension, and the files are never GPL-licensed: they are test data under
their own licence. A sheet whose licence ever stops allowing this is removed, and the audit goes back to reading the page
from arxiv.org.

## When the names move

arXiv names a sheet by its date and replaces it: a paper captured later links a newer name, and `/static/…` answers 404 for the
old one in time. `tests/scripts/arxiv-css.test.ts` fails when a fixture links a sheet this tree does not hold (and when this
tree holds one no fixture reaches), so the drift cannot go unseen. To refresh:

```
node scripts/refresh-arxiv-css.mjs [tests/fixtures/arxiv/<paper>.html]
```

It reads the sheets the fixture links (default: 2410.00260), follows their `@import`s, downloads each into the same
path here — one request every three seconds, the project's user agent, no personal data — and deletes the sheets nothing
links. Then:

1. Run `pnpm test` (the test above) and `pnpm e2e:a11y`: a changed sheet can move the baseline, and the difference must
   still be empty and the forced-contrast check still fire.
2. Check the licences of both repositories once more (the two links above) and replace the `LICENSE-*` files if they changed.
3. Write the new date and hashes into the table above (`shasum -a 256 static/*/*/css/*.css`) and the date in the first paragraph of "What is here".

A refresh of an unchanged tree is a no-op. A new fixture whose sheets differ from the others' is a reason to refresh from
that fixture, not to keep both generations.
