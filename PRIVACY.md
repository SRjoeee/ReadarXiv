# Read arXiv privacy policy

Applies to Read arXiv 0.4.0 and later, until this file says otherwise. Effective: 2026-09-17 (0.4.0). Earlier versions of this policy are in the repository's history.

Read arXiv is a Chrome extension that translates arXiv's HTML papers in the page you are reading. This policy says what data the extension handles, where it goes, and what stays on your computer. arXiv, the Chrome Web Store, the translation services you use and GitHub run their own services under their own policies.

## What the extension reads

The extension runs on `arxiv.org` pages: on HTML papers (`arxiv.org/html/…`) it reads the paper's text, structure, identifier and figures so it can translate them, and on abstract pages it adds a link to the bilingual version. Nothing is translated until you ask: from the extension's popup, its toolbar button, the right-click menu, the keyboard shortcut, or that link.

## Where the text goes

**The services you choose.** When a paper is translated, its passages and the target language are sent from your browser directly to the translation service selected in the settings. Read arXiv runs no server of its own, and nothing passes through one.

- **Microsoft's web translator** (`edge.microsoft.com`) is the default.
- **Google's web translator** (`translate-pa.googleapis.com`) can be chosen instead.
- **Chrome's built-in translator** translates on your computer, with language packs Chrome downloads; the text does not leave the machine.
- **An OpenAI-compatible service you add** (OpenRouter, DeepSeek, a local Ollama or LM Studio, any other address) receives each request with your API key for authentication. With the built-in prompts every request also carries the paper's title, its abstract, the current section heading and the glossary entries that occur in the passage, as context; a prompt you write yourself decides which of these it includes. A service that forwards requests to model providers, such as OpenRouter, passes them on under its own terms.

**Falling back.** If the selected service fails, the rest of the page is handed to one of the free services: Chrome's built-in translator when it can take over, otherwise Google's web translator. This is on by default, so a failure can send text to a service you did not pick — including when you chose a local one. You can turn it off in the settings; then only the selected service is used.

**Connection details.** Every service you connect to sees ordinary network information, such as your IP address. The built-in services use HTTPS. An address you add that starts with `http://` is not encrypted; use it only for a service on your own computer or a network you trust.

## Figures

For translating the words inside figures, vector figures are loaded from arXiv and read on your computer. Text inside bitmap figures is recognised only on macOS, through a separate helper program you install yourself and a permission Chrome asks you to grant; the image goes to that helper on your computer, which uses Apple's on-device text recognition. The words found in a figure are then translated like any other text, by the services above. Images are never uploaded to a translation service.

## What is stored on your computer

- **Settings**, in the extension's local storage: the services you added with their addresses, models and API keys, your prompts and glossary, your language, reading and appearance choices. Extension storage is not an encrypted password store.
- **A translation cache**, in the extension's IndexedDB database: translations and figure recognition results, filed under a hash of what was translated and how, so a paper you reopen appears at once. API keys are not part of the cache. Entries expire after 30 days; at most 20 000 are kept. Clearing the cache in the settings removes them; it leaves your settings as they are.
- **A diagnostics log**, in the browser's session storage, which ends when the browser closes: the last 500 lines about what the extension did — for example that a request failed, with the kind of failure and the HTTP status, or that the page was handed to another service — with block and paper identifiers and counts. It never contains page text, API keys or the messages services send back. It leaves your computer only if you export it from the settings page and share it yourself.

Uninstalling the extension removes its stored data through Chrome. It does not remove the separate macOS helper, and it cannot remove anything a translation service has already received.

## What the extension does not do

It has no analytics, advertising or tracking, and it does not collect information about you. It does not sell or transfer data to third parties apart from the translation requests described above, does not use data for advertising, and does not use it to determine creditworthiness or for lending. It loads no code from outside the extension. Data is used only to translate the papers you ask it to translate. The extension's use of this data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your choices

You can choose the translation service, turn falling back off, remove a service and its key, withdraw the permissions granted for an added address or for the helper, clear the cache, show the original page at any moment, and uninstall the extension. Showing the original stops translating that page; it does not recall requests already sent. What a service has received is governed by that service's policy.

## Contact and changes

Questions about privacy: open an issue at https://github.com/SRjoeee/ReadarXiv/issues. Issues are public, so do not include API keys or other private information. When the extension's handling of data changes, this file changes with it, and its history in the repository shows what changed and when.
