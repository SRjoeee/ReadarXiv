// The permission warnings Chrome gives for the built manifest (Stage 5 Task 17 Step 4): the words a reader is shown when they
// install the extension, which the store listing's text (docs/RELEASE.md) must agree with. A reading, not an assertion: the
// build's manifest asked of `management.getPermissionWarningsByManifest` from one of the extension's own pages, with its host
// permissions as the build has them (production's, or a staging build's).
//
// Usage: pnpm build && node tests/e2e/probes/permission-warnings.mjs   (AXT_EXT_DIR: another build)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD, launchWithReader } from '../lib/extension.mjs'

const dir = process.env.AXT_EXT_DIR ?? BUILD
const manifest = readFileSync(join(dir, 'manifest.json'), 'utf8')
const { context, id } = await launchWithReader({ profile: 'permission-warnings', extension: dir })
try {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${id}/options.html`)
  const warnings = await page.evaluate(m => new Promise(resolve => chrome.management.getPermissionWarningsByManifest(m, resolve)), manifest)
  const parsed = JSON.parse(manifest)
  console.log(`host permissions: ${(parsed.host_permissions ?? []).join(', ')}`)
  console.log(`permissions: ${(parsed.permissions ?? []).join(', ')}`)
  console.log('the warnings Chrome gives at install:')
  for (const w of warnings) console.log(`  - ${w}`)
} finally {
  await context.close()
}
