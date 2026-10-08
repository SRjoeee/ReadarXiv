// A copy of the build with permissions pre-granted through its manifest. Chrome's permission prompts are native
// dialogs Playwright cannot click, and the grant flow is not what the suites test: local-endpoint pre-grants a host
// permission this way. **The build in .output is not touched**: the copy lives next to the profiles and is remade every run
//
// `contentMatches` ({ 'https://arxiv.org/html/*': ['http://127.0.0.1/html/*'] }) adds match patterns to every content
// script that already has the key, for the suites that serve a paper from 127.0.0.1 (lib/offline-arxiv.mjs). The match
// ignores the port, as a host permission does
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

export function copyWithGrants(src, dest, { permissions = [], hostPermissions = [], contentMatches = {} } = {}) {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
  const manifest = JSON.parse(readFileSync(`${dest}/manifest.json`, 'utf8'))
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), ...permissions])]
  // A permission cannot be both required and optional
  manifest.optional_permissions = (manifest.optional_permissions ?? []).filter(name => !permissions.includes(name))
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), ...hostPermissions])]
  for (const script of manifest.content_scripts ?? []) {
    for (const [existing, added] of Object.entries(contentMatches)) {
      if (script.matches?.includes(existing)) script.matches = [...new Set([...script.matches, ...added])]
    }
  }
  writeFileSync(`${dest}/manifest.json`, JSON.stringify(manifest, null, 2))
  return dest
}
