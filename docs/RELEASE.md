# Releasing

How a version of Read arXiv is cut, what is checked first, and the store listing. The maintainer performs the release acts (merging into `main`, tagging, publishing); nothing here happens on its own.

## The version and the tag

- `package.json` `version` is the extension's version (WXT writes it into the manifest); `0.4.0` is the next version and becomes real when the tag lands. Versions stay in the 0.x line while the project still changes often: fixes go to 0.4.x, features to 0.5.0. Versions follow semver as far as a browser extension can: a change a reader must know about is minor, a fix is patch, a change to a contract (the configuration schema is migrated, the helper protocol version-negotiated) is what makes a major.
- The release act is **an annotated tag `v<version>` on `main`**: `git tag -a v0.4.0 -m "Read arXiv 0.4.0"` on the merge commit, `git push origin v0.4.0`.
- **The helper install follows the tag.** The build stamps the ref the popup's install command fetches from (`scripts/build-ref.mjs`): a tag `v…` pointing at the built commit **that the repository already lists** (`git ls-remote --tags`; a tag created locally and not pushed is not trusted), else the commit itself, else `main`. So the archive built *after* the tag is pushed carries `v0.4.0` in its install command, and a reader who installs the helper gets exactly the helper of the extension they run. Build the archive after tagging, never before.

## Cutting a release

The release commit is made **on the branch, before the merge**, so that the tree is clean at every step after it and the tagged commit carries the dated changelog and the recorded results.

1. On the release branch: `CHANGELOG.md`'s "unreleased" heading gets the date. `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` — exit code green — then the browser suites on that build: `pnpm e2e`, `pnpm e2e:layout`, `pnpm e2e:a11y`, `pnpm e2e:local-endpoint`, and `pnpm e2e:image` on a Mac with the helper. Record the counts in the pull request that cuts the release; the dated changelog is the release commit.
2. The release branch is merged into `main` with a merge commit (never squash). The merge commit is the release.
3. On the merge commit, with a clean tree, the gate once more (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`); then the annotated tag on it, and push the tag.
4. `pnpm build && pnpm zip` **after** the tag is pushed and with the tree still clean: the console line `[build] helper install ref: v0.4.0` is the check (a build before the push, or on a dirty tree, stamps the commit or `main` instead). The archive is `.output/readarxiv-0.4.0-chrome.zip`.
5. A GitHub release for the tag, with the archive attached and the changelog section as its notes.
6. The Chrome Web Store submission (below). Until it is listed, the README's "load unpacked" path is the install.
7. `helper/README.md`'s one-line command is the same script the popup shows; a reader on the release reaches it through the popup, stamped with the tag.

## The store listing

Category: Productivity. Language: English, with the Chinese description below. The short description is the manifest's `description` (`public/_locales/*/messages.json`) and must stay under 132 characters.

**Name**: Read arXiv

**Short description (EN)**: Bilingual translation for arxiv.org/html that keeps the paper's structure and can be undone

**Short description (ZH)**: 面向 arxiv.org/html 的保结构、可逆双语翻译

**Description (EN)**:

> Read arXiv translates arXiv's HTML papers in place — beside, under, or instead of the original — and keeps the paper working: formulas stay formulas, citations stay clickable, tables and footnotes stay where the author put them, and the original comes back node for node when you ask.
>
> Rest on a sentence and its counterpart lights up on the other side; in translation-only mode the original sentence floats beside the line. The words inside figures are translated and overlaid in place — vector figures with nothing to install, bitmaps on macOS through a small local helper.
>
> Microsoft's translator works out of the box with no account. Add Google's, Chrome's built-in offline translator, or any OpenAI-compatible endpoint with your own key (OpenRouter, DeepSeek, a local Ollama). When a service fails mid-paper, the rest of the page falls back to a free one and the popup says so. Prompts and a glossary keep terminology consistent on the LLM services. 179 target languages; interface in English and Chinese.
>
> Paragraphs are sent to the service you choose; Chrome's built-in translation and a local endpoint keep them on your machine. Your API keys stay in the browser's extension storage. Translations are cached locally so a paper reopens at once.
>
> Chrome 131 or newer. arXiv's HTML papers only — PDFs are not translated. Free software under GPL-3.0; source and issues at github.com/SRjoeee/ReadarXiv.

**Description (ZH)**:

> Read arXiv 把 arXiv 的 HTML 论文就地翻译——译文在原文旁边、下面，或者只显示译文——并且让论文照常工作：公式还是公式，引用还能点，表格和脚注都在作者放的位置；随时一键恢复原文，页面逐节点回到翻译前。
>
> 鼠标停在一句话上，另一侧对应的句子同时高亮；只译文模式下，原文句子会浮在这一行旁边。图里的文字也会翻译并覆盖在原位——矢量图无需安装任何东西，位图在 macOS 上通过一个本地小程序识别。
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
| `alarms` | Waking a fresh service worker after the reader grants the helper permission at runtime |
| `nativeMessaging` (optional) | Talking to the local macOS helper that recognises text in bitmap figures; asked only when the reader clicks "allow" |
| `https://arxiv.org/*` (content scripts) | The pages it translates, and the bilingual link on abstract pages |
| `https://edge.microsoft.com/*`, `https://translate-pa.googleapis.com/*`, `https://openrouter.ai/*` | The free translators and the most common LLM gateway |
| `https://*/*`, `http://*/*` (optional) | An endpoint the reader adds in the settings; each origin is asked for on its own when saved |

**Privacy practices** (the store's questionnaire). What leaves the browser, and only when the reader translates a page: the text of the paper's blocks, to the translation service the reader selected. To an LLM service the reader added, each request also carries the selected prompt (a shipped one or the reader's own), the glossary entries that match the passage, and the paper's title, abstract and section heading as context (`providers/prompt.ts`); to Microsoft's and Google's web translators only the text; Chrome's built-in translator and a local endpoint keep everything on the machine. Words recognised inside figures are translated like any other text; the image itself is never uploaded (bitmaps are read by the local helper). The extension stores settings, API keys and translations locally, uses no analytics and no remote code, and collects nothing about the reader.

**Single purpose**: translating arXiv HTML papers in place.
