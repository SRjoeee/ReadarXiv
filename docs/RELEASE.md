# Releasing

How a version of Read arXiv is cut, what is checked first, and the store listing. The maintainer performs the release acts (merging into `main`, tagging, publishing); nothing here happens on its own.

## The version and the tag

- `package.json` `version` is the extension's version (WXT writes it into the manifest); a version becomes real when its tag lands (`v0.4.1`, 2026-09-21, is the latest). Versions stay in the 0.x line while the project still changes often, and **the maintainer says when the minor number rises** (2026-09-18): an ordinary change, a new entry point included, goes to 0.4.x, and 0.5.0, the release that brings the PDF reader on the website's page files, was asked for. Versions follow semver as far as a browser extension can: a change a reader must know about is minor, a fix is patch, a change to a contract (the configuration schema migrated in a way an older version cannot read) is what makes a major.
- The release act is **an annotated tag `v<version>` on `main`**: `git tag -a v0.4.0 -m "Read arXiv 0.4.0"` on the merge commit, `git push origin v0.4.0`.
- **The build names the ref it was made from** (`scripts/build-ref.mjs`): a tag `v…` pointing at the built commit **that the repository already lists** (`git ls-remote --tags`; a tag created locally and not pushed is not trusted), else the commit itself, else `main`. It goes into the diagnostics a reader exports (issue #156), so the archive built *after* the tag is pushed says `v0.4.0` there and a report names the release it came from. Build the archive after tagging, never before.

## Cutting a release

The release commit is made **on the branch, before the merge**, so that the tree is clean at every step after it and the tagged commit carries the dated changelog and the recorded results.

1. On the release branch: `CHANGELOG.md`'s "unreleased" heading gets the date, and so does `PRIVACY.md`'s "Effective" line when the policy changed in this release. `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` — exit code green — then the browser suites on that build: `pnpm e2e`, `pnpm e2e:layout`, `pnpm e2e:a11y`, `pnpm e2e:local-endpoint`, `pnpm e2e:pdf`, `pnpm e2e:reader`, `pnpm e2e:framing`, `pnpm e2e:floating`, `pnpm e2e:popup`, `pnpm e2e:viewer` and `pnpm e2e:image` (the recogniser ships in the package: any platform). Record the counts in the pull request that cuts the release; the dated changelog is the release commit.
2. The release branch is merged into `main` with a merge commit (never squash). The merge commit is the release.
3. On the merge commit, with a clean tree, the gate once more (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`); then the annotated tag on it, and push the tag.
4. `pnpm build && pnpm zip` **after** the tag is pushed and with the tree still clean: the console line `[build] ref: v0.4.0` is the check (a build before the push, or on a dirty tree, stamps the commit or `main` instead). `wxt zip` builds again before it writes the archive, so `pnpm zip` ends with `scripts/check-output.mjs` on that build, as `pnpm build` does (`pnpm zip:staging` with the staging check): an archive whose command did not end green is not uploaded. The archive is `.output/readarxiv-0.4.0-chrome.zip`. It carries the project's `LICENSE` and `licenses/third-party.txt`, the notices of the npm packages in the bundle, written by the build from what was bundled (`docs/THIRD_PARTY.md`); `pnpm build` fails without them, and on a bundled package that has no licence text.
5. A GitHub release for the tag, with the archive attached and the changelog section as its notes.
6. The Chrome Web Store submission (below), with the privacy policy URL. Until it is listed, the README's "load unpacked" path is the install.

**Release day of 0.5.0, on the maintainer's go** (the archive built for review on `release/0.5.0` is not the release: it is built from a branch, not from the tag, and its hash is refreshed on release day). In this order:

1. Fill in the dates on the release branch: the `## 0.5.0` heading of `CHANGELOG.md` and the `Effective:` line of `PRIVACY.md`.
2. The gate, then the browser suites on that build (step 1 above): `pnpm e2e`, `pnpm e2e:layout`, `pnpm e2e:a11y`, `pnpm e2e:local-endpoint`, `pnpm e2e:pdf`, `pnpm e2e:reader`, `pnpm e2e:framing`, `pnpm e2e:floating`, `pnpm e2e:popup`, `pnpm e2e:viewer`, `pnpm e2e:image`. Record the counts in the pull request.
3. Merge the pull request into `main` with a merge commit.
4. Push the annotated tag `v0.5.0` on the merge commit.
5. `pnpm build && pnpm zip` from the tag with a clean tree; the console line must read `[build] ref: v0.5.0`. Build `pnpm zip:staging` too if a test build is wanted.
6. Put the new sha256 of the archive in the pull request and in the owner's upload kit, then submit to the store.

## The store listing

Category: Productivity. Language: English, with the Chinese description below. The short description is the manifest's `description` (`public/_locales/*/messages.json`) and must stay under 132 characters.

**Name**: Read arXiv

**Short description (EN)**: Bilingual arXiv papers: HTML translated in place, PDFs side by side with their translation, both easy to undo

**Short description (ZH)**: arXiv 论文双语阅读：HTML 原地翻译，PDF 原文与译文并排，随时可恢复原文

**Description (EN)**:

> Read arXiv translates arXiv's papers and keeps them working. HTML papers are translated in place — beside, under, or instead of the original — and formulas stay formulas, citations stay clickable, tables and footnotes stay where the author put them, and the original comes back node for node when you ask. PDF papers open in a reader that shows arXiv's PDF beside its translation, page for page: the figures and formulas as the author drew them, the text in fonts close to the original's, links that still work, and the two sides scrolling together.
>
> Rest on a sentence and its counterpart lights up on the other side; in translation-only mode the original sentence floats beside the line. The words inside figures are translated and overlaid in place — vector figures read exactly, bitmaps recognised in your browser by a model that comes with the extension: nothing to install, and an image never leaves your machine.
>
> Microsoft's translator works out of the box with no account. Add Google's, Chrome's built-in offline translator, or any OpenAI-compatible endpoint with your own key (OpenRouter, DeepSeek, a local Ollama). When a service fails mid-paper, the rest of the page falls back to a free one and the popup says so. Prompts and a glossary keep terminology consistent on the LLM services. 179 target languages; interface in English and Chinese.
>
> Paragraphs are sent to the service you choose; Chrome's built-in translation and a local endpoint keep them on your machine. Your API keys stay in the browser's extension storage. Translations are cached locally so a paper reopens at once.
>
> Chrome 131 or newer. Free software under GPL-3.0; source and issues at github.com/SRjoeee/ReadarXiv.

**Description (ZH)**:

> Read arXiv 翻译 arXiv 论文，并且让论文照常工作。HTML 论文就地翻译——译文在原文旁边、下面，或者只显示译文——公式还是公式，引用还能点，表格和脚注都在作者放的位置；随时一键恢复原文，页面逐节点回到翻译前。PDF 论文在阅读器里打开：左边是 arXiv 的原版 PDF，右边逐页对照译文，图和公式保持原样，字体与原文相近，链接照常可点，两边同步滚动。
>
> 鼠标停在一句话上，另一侧对应的句子同时高亮；只译文模式下，原文句子会浮在这一行旁边。图里的文字也会翻译并覆盖在原位——矢量图直接读取，位图由扩展自带的识别模型在浏览器里识别：无需安装任何东西，图片不会离开你的电脑。
>
> 默认使用微软翻译，无需账号。也可以用 Google 翻译、Chrome 内置的离线翻译，或者任何兼容 OpenAI 接口的服务（OpenRouter、DeepSeek、本机的 Ollama 等），填自己的密钥。翻译到一半服务失效时，剩下的页面会退到免费服务继续，弹窗会说明。提示词和术语表让 LLM 服务的术语前后一致。179 种目标语言；界面有中英文。
>
> 段落会发给你选定的服务；Chrome 内置翻译和本机端点让文字不出本机。API 密钥只保存在浏览器的扩展存储里。译文在本地缓存，再次打开同一篇论文即时显示。
>
> 需要 Chrome 131 或更新版本。GPL-3.0 自由软件；源码与问题反馈在 github.com/SRjoeee/ReadarXiv。

**Permission justifications** (the store asks for each):

| Permission | Why |
|---|---|
| `storage` | The reader's settings and the diagnostics ring |
| `contextMenus` | The "translate this page / show the original" item on arXiv pages |
| `offscreen` | The hidden page the figure recogniser runs in: recognising text in a bitmap figure is WebAssembly in a worker, which the service worker cannot host. Opened when a bitmap needs reading, closed by itself a minute after the last one |
| `https://arxiv.org/*` (host permission and content scripts) | The pages it translates, the bilingual link on abstract pages, and the floating button on abstract, PDF and full-text pages; the PDF reader downloads the paper's PDF from arXiv, and reads its abstract page for the paper's title and latest version |
| `https://readarxiv.com/*` (host permission and content script) | Read arXiv's website: the PDF reader downloads the files that describe a paper's pages, the fonts and word-breaking rules of the target language and, where needed, parts of the website's copy of the paper's PDF, sending the paper's identifier and version (the target language shows in what it downloads); and a content script sets one attribute on the website's pages, the extension's version, so the site knows the extension is installed (it reads nothing from the page and sends no message) |
| `https://edge.microsoft.com/*`, `https://translate-pa.googleapis.com/*`, `https://openrouter.ai/*` | The free translators and the most common LLM gateway |
| `https://*/*`, `http://*/*` (optional) | An endpoint the reader adds in the settings; each origin is asked for on its own, on the reader's click while adding the service (an address suggestion, the model list, Connect), and given back if the service is not added |

The dashboard asks for each **named** permission separately, but for **all host permissions at once**, in one "host permission justification" field (1 000 characters), and warns that host permissions may mean an in-depth review. What is pasted there covers every match pattern in the manifest of the production package. It names the production host `https://readarxiv.com/*` alone: the staging host is in the test package only (`pnpm zip:staging`), which is never submitted.

> Content scripts match https://arxiv.org/html/*, the papers it translates, https://arxiv.org/abs/* and https://arxiv.org/pdf/*, where it adds a floating button and opens its PDF reader. On https://readarxiv.com/*, its own website, a script sets one attribute, the extension's version; it reads nothing and sends nothing.
>
> Host permissions: https://arxiv.org/* lets the PDF reader download the paper's PDF and abstract page; https://readarxiv.com/* lets it download the paper's page files and the target language's fonts from its own website, sending the paper's id and version; https://edge.microsoft.com/*, https://translate-pa.googleapis.com/* and https://openrouter.ai/* are the translation endpoints the service worker calls, reachable whatever CORS headers they send.
>
> https://*/* and http://*/* are optional and never granted at install: a reader may add any OpenAI-compatible service, local ones over http included; Chrome asks for that one origin on the reader's click.

<!-- justification length: 976 characters (counted by script on the text above, line breaks as one character each; the field's limit is 1 000). Count again if the text changes -->

**The permission prompt the website's host brings.** `https://readarxiv.com/*` is a host permission and a content-script match; a content script's matches count among the hosts a copy may read. Chrome's own words: "When a new permission that triggers a warning is added, the extension will be disabled until the user accepts the new permission" ([permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)). What decides it is `ChromePermissionMessageProvider::IsHostPrivilegeIncrease` (Chromium): it compares the distinct hosts of the granted and the requested permissions, and a host no granted `*.domain` pattern covers is an increase, however many hosts there already are. So an installed copy that updates from 0.4.1 is disabled until its user accepts; that part is read from the source, not observed in an update. Measured on Chromium 153 (`management.getPermissionWarningsByManifest`, 2026-10-04, and on this release's production manifest, `tests/e2e/probes/permission-warnings.mjs`, 2026-10-17): the install-time warning is one, "Read and change your data on a number of websites", because the extension already holds four hosts. The cost lands on installed copies that update, and today it is close to none: the extension is installed unpacked from source, which does not update by itself, and the first store release carries the host from its first listing, so no store user sees an increase from it. Read the install warning again on the built package at the release cut. Why a content script and not `externally_connectable`, which brings no warning: DESIGN §4.0d.

**Privacy practices** (the store's questionnaire). What leaves the browser, and only when the reader translates a page: the text of the paper's blocks, to the translation service the reader selected. To an LLM service the reader added, each request also carries the selected prompt (a shipped one or the reader's own), the glossary entries that match the passage, and the paper's title, abstract and section heading as context (`providers/prompt.ts`); to Microsoft's and Google's web translators only the text; Chrome's built-in translator and a local endpoint keep everything on the machine. Words recognised inside figures are translated like any other text; the image itself is never uploaded (bitmaps are read by the recogniser inside the extension). When the PDF reader shows a translation, the paper's identifier and version (for example `2401.00418v2`) go to Read arXiv's own website, `readarxiv.com`, to download the files that describe the paper's pages (no cookie, no referrer, no paper text, no translation, no key, no diagnostics); the target language shows in the fonts and word-breaking rules downloaded, and the parts of the website's copy of the paper's PDF that are read show which pages were drawn. Those files are kept on the machine (at most 200 MB, the least recently opened papers first; the settings page shows and clears them). The extension stores settings, API keys and translations locally, uses no analytics, and collects nothing about the reader. **Data usage questionnaire** (the maintainer ticks): declare "Website content" (the paper's identifier sent to the developer's own server, `readarxiv.com`, to get the paper's files) and also "Web history" (when the reader opens a paper, `readarxiv.com` learns which paper, with its id and version: a page the user visited, within the store's definition of web history; declaring more than is needed costs a label on the listing, declaring less gets the item rejected), used for the extension's single purpose, not sold, not used for anything else; the translation services and the other existing ticks stay as they are. **On "remote code"** ("Are you using remote code?" — No): The extension downloads data from its own website — JSON, PDF and font files — and never code. Its scripts and its four WebAssembly files (ONNX Runtime's, for the figure recogniser, and PDF.js's three image and colour decoders: OpenJPEG, JBIG2, QCMS) ship in the package; `script-src` is `'self' 'wasm-unsafe-eval'`, which lets an extension page compile only the WebAssembly it ships.

**Privacy policy URL** (required: the extension handles website content and stores API keys): `https://github.com/SRjoeee/ReadarXiv/blob/main/PRIVACY.md`. It points at `main` so the listing always shows the policy in force; the file's history records every change. The questionnaire above and `PRIVACY.md` describe the same practices, and change together.

**Single purpose**: Reading arXiv papers bilingually: the HTML paper translated in place, and the PDF beside its translation.
