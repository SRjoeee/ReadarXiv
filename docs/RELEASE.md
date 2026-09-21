# Releasing

How a version of Read arXiv is cut, what is checked first, and the store listing. The maintainer performs the release acts (merging into `main`, tagging, publishing); nothing here happens on its own.

## The version and the tag

- `package.json` `version` is the extension's version (WXT writes it into the manifest); a version becomes real when its tag lands (`v0.4.1`, 2026-09-21, is the latest). Versions stay in the 0.x line while the project still changes often, and **the maintainer says when the minor number rises** (2026-09-18): an ordinary change, a new entry point included, goes to 0.4.x, and 0.5.0 waits to be asked for. Versions follow semver as far as a browser extension can: a change a reader must know about is minor, a fix is patch, a change to a contract (the configuration schema migrated in a way an older version cannot read) is what makes a major.
- The release act is **an annotated tag `v<version>` on `main`**: `git tag -a v0.4.0 -m "Read arXiv 0.4.0"` on the merge commit, `git push origin v0.4.0`.
- **The build names the ref it was made from** (`scripts/build-ref.mjs`): a tag `v…` pointing at the built commit **that the repository already lists** (`git ls-remote --tags`; a tag created locally and not pushed is not trusted), else the commit itself, else `main`. It goes into the diagnostics a reader exports (issue #156), so the archive built *after* the tag is pushed says `v0.4.0` there and a report names the release it came from. Build the archive after tagging, never before.

## Cutting a release

The release commit is made **on the branch, before the merge**, so that the tree is clean at every step after it and the tagged commit carries the dated changelog and the recorded results.

1. On the release branch: `CHANGELOG.md`'s "unreleased" heading gets the date, and so does `PRIVACY.md`'s "Effective" line when the policy changed in this release. `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` — exit code green — then the browser suites on that build: `pnpm e2e`, `pnpm e2e:layout`, `pnpm e2e:a11y`, `pnpm e2e:local-endpoint`, `pnpm e2e:pdf`, `pnpm e2e:floating` and `pnpm e2e:image` (the recogniser ships in the package: any platform). Record the counts in the pull request that cuts the release; the dated changelog is the release commit.
2. The release branch is merged into `main` with a merge commit (never squash). The merge commit is the release.
3. On the merge commit, with a clean tree, the gate once more (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`); then the annotated tag on it, and push the tag.
4. `pnpm build && pnpm zip` **after** the tag is pushed and with the tree still clean: the console line `[build] ref: v0.4.0` is the check (a build before the push, or on a dirty tree, stamps the commit or `main` instead). The archive is `.output/readarxiv-0.4.0-chrome.zip`. It carries the project's `LICENSE` and `licenses/third-party.txt`, the notices of the npm packages in the bundle, written by the build from what was bundled (`docs/THIRD_PARTY.md`); `pnpm build` fails without them, and on a bundled package that has no licence text.
5. A GitHub release for the tag, with the archive attached and the changelog section as its notes.
6. The Chrome Web Store submission (below), with the privacy policy URL. Until it is listed, the README's "load unpacked" path is the install.

## The store listing

Category: Productivity. Language: English, with the Chinese description below. The short description is the manifest's `description` (`public/_locales/*/messages.json`) and must stay under 132 characters.

**Name**: Read arXiv

**Short description (EN)**: Bilingual translation for arxiv.org/html that keeps the paper's structure and can be undone

**Short description (ZH)**: 面向 arxiv.org/html 的保结构、可逆双语翻译

**Description (EN)**:

> Read arXiv translates arXiv's HTML papers in place — beside, under, or instead of the original — and keeps the paper working: formulas stay formulas, citations stay clickable, tables and footnotes stay where the author put them, and the original comes back node for node when you ask.
>
> Rest on a sentence and its counterpart lights up on the other side; in translation-only mode the original sentence floats beside the line. The words inside figures are translated and overlaid in place — vector figures read exactly, bitmaps recognised in your browser by a model that comes with the extension: nothing to install, and an image never leaves your machine.
>
> Microsoft's translator works out of the box with no account. Add Google's, Chrome's built-in offline translator, or any OpenAI-compatible endpoint with your own key (OpenRouter, DeepSeek, a local Ollama). When a service fails mid-paper, the rest of the page falls back to a free one and the popup says so. Prompts and a glossary keep terminology consistent on the LLM services. 179 target languages; interface in English and Chinese.
>
> Paragraphs are sent to the service you choose; Chrome's built-in translation and a local endpoint keep them on your machine. Your API keys stay in the browser's extension storage. Translations are cached locally so a paper reopens at once.
>
> Chrome 131 or newer. arXiv's HTML papers only — PDFs are not translated. Free software under GPL-3.0; source and issues at github.com/SRjoeee/ReadarXiv.

**Description (ZH)**:

> Read arXiv 把 arXiv 的 HTML 论文就地翻译——译文在原文旁边、下面，或者只显示译文——并且让论文照常工作：公式还是公式，引用还能点，表格和脚注都在作者放的位置；随时一键恢复原文，页面逐节点回到翻译前。
>
> 鼠标停在一句话上，另一侧对应的句子同时高亮；只译文模式下，原文句子会浮在这一行旁边。图里的文字也会翻译并覆盖在原位——矢量图直接读取，位图由扩展自带的识别模型在浏览器里识别：无需安装任何东西，图片不会离开你的电脑。
>
> 默认使用微软翻译，无需账号。也可以用 Google 翻译、Chrome 内置的离线翻译，或者任何兼容 OpenAI 接口的服务（OpenRouter、DeepSeek、本机的 Ollama 等），填自己的密钥。翻译到一半服务失效时，剩下的页面会退到免费服务继续，弹窗会说明。提示词和术语表让 LLM 服务的术语前后一致。179 种目标语言；界面有中英文。
>
> 段落会发给你选定的服务；Chrome 内置翻译和本机端点让文字不出本机。API 密钥只保存在浏览器的扩展存储里。译文在本地缓存，再次打开同一篇论文即时显示。
>
> 需要 Chrome 131 或更新版本。只翻译 arXiv 的 HTML 论文，不翻译 PDF。GPL-3.0 自由软件；源码与问题反馈在 github.com/SRjoeee/ReadarXiv。

**Permission justifications** (the store asks for each):

| Permission | Why |
|---|---|
| `storage` | The reader's settings and the diagnostics ring |
| `contextMenus` | The "translate this page / show the original" item on arXiv pages |
| `offscreen` | The hidden page the figure recogniser runs in: recognising text in a bitmap figure is WebAssembly in a worker, which the service worker cannot host. Opened when a bitmap needs reading, closed by itself a minute after the last one |
| `https://arxiv.org/*` (content scripts) | The pages it translates, the bilingual link on abstract pages, and the floating button on abstract, PDF and full-text pages |
| `https://edge.microsoft.com/*`, `https://translate-pa.googleapis.com/*`, `https://openrouter.ai/*` | The free translators and the most common LLM gateway |
| `https://*/*`, `http://*/*` (optional) | An endpoint the reader adds in the settings; each origin is asked for on its own when saved |

The dashboard asks for each **named** permission separately, but for **all host permissions at once**, in one "host permission justification" field (1 000 characters), and warns that host permissions may mean an in-depth review. What is pasted there — as submitted for 0.4.0, the PDF pages added for 0.4.1 — covering every match pattern in the manifest:

> Content scripts match https://arxiv.org/html/* , the papers it translates; https://arxiv.org/abs/* , where it adds a link to the bilingual version; and https://arxiv.org/pdf/* , where it asks arXiv once whether the paper has an HTML version. On all three it shows a small floating button that opens the bilingual version or translates the page. No other site is matched.
>
> The three host permissions are the translation endpoints the service worker calls: https://edge.microsoft.com/* (Microsoft's web translator, the default engine), https://translate-pa.googleapis.com/* (Google's web translator) and https://openrouter.ai/* (a common OpenAI-compatible gateway). The permission is what lets the worker reach an endpoint whatever CORS headers it sends; without one the extension would depend on the endpoint's own Access-Control-Allow-Origin, which none of them promises.
>
> https://*/* and http://*/* are optional_host_permissions and are never granted at install. A reader may add any OpenAI-compatible service, including one on their own machine over http such as Ollama or LM Studio, so the origin is not known in advance. Chrome asks for that one origin on the reader's own click.

**Privacy practices** (the store's questionnaire). What leaves the browser, and only when the reader translates a page: the text of the paper's blocks, to the translation service the reader selected. To an LLM service the reader added, each request also carries the selected prompt (a shipped one or the reader's own), the glossary entries that match the passage, and the paper's title, abstract and section heading as context (`providers/prompt.ts`); to Microsoft's and Google's web translators only the text; Chrome's built-in translator and a local endpoint keep everything on the machine. Words recognised inside figures are translated like any other text; the image itself is never uploaded (bitmaps are read by the recogniser inside the extension). The extension stores settings, API keys and translations locally, uses no analytics and no remote code, and collects nothing about the reader. **On "remote code"**: the package holds one WebAssembly file (ONNX Runtime's, from the npm package) and two model files, all loaded from the package itself; `'wasm-unsafe-eval'` in the extension pages' policy is what lets the recogniser's own page compile that file, and `script-src` stays `'self'`.

**Privacy policy URL** (required: the extension handles website content and stores API keys): `https://github.com/SRjoeee/ReadarXiv/blob/main/PRIVACY.md`. It points at `main` so the listing always shows the policy in force; the file's history records every change. The questionnaire above and `PRIVACY.md` describe the same practices, and change together.

**Single purpose**: translating arXiv HTML papers in place.
