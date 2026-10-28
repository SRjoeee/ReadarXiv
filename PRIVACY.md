# Read arXiv privacy policy

Applies to Read arXiv 0.5.0 and later, until this file says otherwise. Effective: 2026-10-19 (0.5.0). Earlier versions of this policy are in the repository's history.

Read arXiv is a Chrome extension that translates arXiv's papers: HTML papers in the page you are reading, and PDFs beside the original in a reader of its own. This policy says what data the extension handles, where it goes, and what stays on your computer. arXiv, the Chrome Web Store, the translation services you use, Read arXiv's website and GitHub run their own services under their own policies.

## What the extension reads

The extension runs on `arxiv.org` pages: on HTML papers (`arxiv.org/html/…`) it reads the paper's text, structure, identifier and figures so it can translate them. On abstract and PDF pages it reads only the paper's identifier, to offer that paper's bilingual version; on a PDF page it asks arXiv itself, once each, whether the paper has an HTML version and whether its source can be read as a bilingual PDF (two `HEAD` requests). When you look a paper up in the extension's popup, by its identifier or address, the popup asks arXiv the same two questions about it. On all three it shows a small floating button, which you can hide or turn off in the settings. Nothing is translated until you ask: from that button, the extension's popup, its toolbar button, the right-click menu, the keyboard shortcut, or the link on the abstract page.

The extension also runs on the pages of Read arXiv's own website (`readarxiv.com`). There it reads nothing from the page and sends nothing: it sets one mark on the page, the extension's version, so the website can tell that the extension is installed.

## PDF papers and Read arXiv's website

When the PDF reader shows a translation of a paper, the extension sends the paper's arXiv identifier and version (for example `2401.00418v2`) to Read arXiv's website, `readarxiv.com`, to download the files that describe the paper's pages, or to ask for them to be made if no one has opened that paper before. No text of the paper, no translation, no API key and no diagnostics are sent there, and the requests carry no cookie.

The website fetches the paper's source and PDF from arXiv itself and makes these files: they say where each paragraph and figure is and how to draw a translation over it, hold no translation, and are the same for every reader. The extension downloads them, and also:

- the fonts the translation is drawn in, and the word-breaking rules of your target language, so the website learns which language you translate into; for Chinese, Japanese and Korean, the fonts come in parts by ranges of characters, and the parts downloaded show roughly which characters the translation uses;
- parts of the website's copy of arXiv's PDF: the end of the file (at most 256 KB), to check that the PDF arXiv gives your browser is the one the files were made from, and the parts the translated pages are drawn over while arXiv's PDF is still downloading or where it differs. The parts read show the website which pages of the paper were drawn.

Like any website, `readarxiv.com` and its host, Cloudflare, see ordinary network information, such as your IP address.

The PDF reader also asks arXiv itself, once a visit, for the paper's abstract page (for its title and latest version) and, when the bilingual version cannot be had, whether the paper has an HTML version; neither request carries a cookie. The original PDF always comes from arXiv.

The paragraphs of the PDF are translated as an HTML paper's are: by the service you chose (see below).

## Where the text goes

**The services you choose.** When a paper is translated, its passages and the target language are sent from your browser directly to the translation service selected in the settings. Read arXiv's website never receives them.

- **Microsoft's web translator** (`edge.microsoft.com`) is the default.
- **Google's web translator** (`translate-pa.googleapis.com`) can be chosen instead.
- **Chrome's built-in translator** translates on your computer, with language packs Chrome downloads; the text does not leave the machine.
- **An OpenAI-compatible service you add** (OpenRouter, DeepSeek, a local Ollama or LM Studio, any other address) receives each request with your API key for authentication. Your key goes only to the address of that service, including when the settings page lists the service's models, and a request carrying it never follows a redirect to another address. With the built-in prompts every request also carries the paper's title, its abstract, the current section heading and the glossary entries that occur in the passage, as context; a prompt you write yourself decides which of these it includes. A service that forwards requests to model providers, such as OpenRouter, passes them on under its own terms.

**Falling back.** If the selected service fails, the rest of the page is handed to one of the free services: Chrome's built-in translator when it can take over, otherwise Google's web translator. This is on by default, so a failure can send text to a service you did not pick — including when you chose a local one. You can turn it off in the settings; then only the selected service is used.

**Connection details.** Every service you connect to sees ordinary network information, such as your IP address. The built-in services use HTTPS. An address you add that starts with `http://` is not encrypted; use it only for a service on your own computer or a network you trust.

## Figures

For translating the words inside figures, vector figures are loaded again from the address the page shows them from (arXiv's own, on arXiv's pages; usually out of the browser's cache) and read on your computer. Text inside bitmap figures is recognised inside the extension, in your browser, by a recognition model that is part of the extension's package: nothing is downloaded for it, and the image goes nowhere. The words found in a figure are then translated like any other text, by the services above. Images are never uploaded to a translation service.

## What is stored on your computer

- **Settings**, in the extension's local storage: the services you added with their addresses, models and API keys, your prompts and glossary, your language, reading and appearance choices, and where the floating button sits and whether it shows. Extension storage is not an encrypted password store.
- **A record of refused keys**, in the extension's local storage: for each service of yours whose key the service refused, the service's identifier and the time, so that the extension stops sending that key until you give a new one. It holds no key, and is cleared once the service accepts a request again, its key or address changes, or it is removed.
- **A translation cache**, in the extension's IndexedDB database: translations and figure recognition results, filed under a hash of what was translated and how, so a paper you reopen appears at once. API keys are not part of the cache. Entries expire after 30 days; at most 20 000 are kept. Clearing the cache in the settings removes them; it leaves your settings as they are.
- **PDF papers' files**, in the extension's IndexedDB database: the page files of the PDF papers you read translated, and the website's copy of a paper's PDF where one was downloaded whole, so that a paper you reopen needs less from the website, and still opens when the website cannot be reached (the original itself always comes from arXiv). At most 200 MB; the papers opened least recently go first. The settings page shows how many papers are kept and clears them.
- **A diagnostics log**, in the browser's session storage, which ends when the browser closes: the last 500 lines about what the extension did — for example that a request failed, with the kind of failure and the HTTP status, or that the page was handed to another service — with block and paper identifiers and counts. It never contains page text, API keys or the messages services send back. It leaves your computer only if you export it from the settings page and share it yourself.

Uninstalling the extension removes its stored data through Chrome. It cannot remove anything a translation service has already received.

## What the extension does not do

It has no analytics, advertising or tracking, and it does not collect information about you. It does not sell or transfer data to third parties apart from the translation requests described above, does not use data for advertising, and does not use it to determine creditworthiness or for lending. It loads no code from outside the extension. The files it downloads from Read arXiv's website are data — JSON, PDF and font files — never code. Data is used only to translate the papers you ask it to translate. The extension's use of this data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your choices

You can choose the translation service, turn falling back off, remove a service and its key, withdraw the permissions granted for an added address, clear the cache, show the original page at any moment, and uninstall the extension. Showing the original stops translating that page; it does not recall requests already sent. What a service has received is governed by that service's policy.

## Contact and changes

Questions about privacy: open an issue at https://github.com/SRjoeee/ReadarXiv/issues. Issues are public, so do not include API keys or other private information. A security problem, such as a way an API key could leak, is reported privately instead, as [`SECURITY.md`](SECURITY.md) says. When the extension's handling of data changes, this file changes with it, and its history in the repository shows what changed and when.
