// lab/rules/vitest-setup.mjs: the recorder in a vitest worker (vitest.config.mts adds it to every project's setup files):
// each test named as the context of the cases it takes, each test file's record written when its tests end. Not shipped.
import { relative } from 'node:path'
import { afterAll, beforeEach, expect } from 'vitest'
import { install } from './recorder.mjs'

// (the input named here, not in the environment, which a test's child processes would inherit)
const rec = install({ input: 'tests' })
const fileOf = () => relative(process.cwd(), expect.getState().testPath ?? '')
beforeEach(() => {
  rec.context({ test: `${fileOf()} > ${expect.getState().currentTestName ?? ''}` })
})
afterAll(() => {
  rec.context({ test: null })
  rec.flush(`vitest-${fileOf().replace(/[/\\]/g, '_')}`)
})
