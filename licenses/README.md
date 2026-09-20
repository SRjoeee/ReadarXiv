# Licence texts kept here

`scripts/third-party-notices.mjs` writes `licenses/third-party.txt` into every build from the packages that are
actually in the bundle, reading each one's licence file from `node_modules`. These are the texts it cannot find there:
four packages publish no licence file to npm, so theirs were taken from their repositories, unchanged, on 2026-09-21.
A bundled package with no text in either place stops the build and names the file to add here (`/` in a package's
name is written `__`).

| File | Package | Taken from |
|---|---|---|
| `wxt.txt` | `wxt` 0.21.4 (MIT) | `LICENSE` of github.com/wxt-dev/wxt at the tag `wxt-v0.21.4` |
| `@wxt-dev__browser.txt` | `@wxt-dev/browser` 0.2.8 (MIT) | the same repository's `LICENSE`, at `wxt-v0.21.4` — its `packages/browser` holds none of its own, and the package has no tag |
| `@wxt-dev__storage.txt` | `@wxt-dev/storage` 1.2.9 (MIT) | the same repository's `LICENSE` at the tag `storage-v1.2.9` |
| `@ai-sdk__provider-utils.txt` | `@ai-sdk/provider-utils` 5.0.36 (Apache-2.0) | `LICENSE` of github.com/vercel/ai at the tag `@ai-sdk/provider-utils@5.0.36` — byte for byte what its sibling `@ai-sdk/provider` publishes |
| `Apache-2.0.txt` | every package under Apache-2.0 | https://www.apache.org/licenses/LICENSE-2.0.txt — appended once: §4(a) asks for a copy of the licence, and the AI SDK's packages publish only its 552-byte notice, `@workflow/serde` a 73-byte pointer |

A text is kept by the package's name, not its version. When one of these is upgraded across a major version, look at
its repository's licence again.
