import { describe, expect, it } from 'vitest'
import type { HelperStatus } from '@/shared/ocr'
import { helperStep } from '@/ui/helper-step'

const READY: HelperStatus = { state: 'ready', version: '1.2.0' }
const MISSING: HelperStatus = { state: 'not-installed', reason: 'Specified native messaging host not found.' }

describe('helperStep', () => {
  it('says nothing can be said until both the helper and the platform are known', () => {
    expect(helperStep(null, 'mac')).toBe('detecting')
    expect(helperStep(MISSING, null)).toBe('detecting')
    expect(helperStep(null, null)).toBe('detecting')
  })

  it('a helper that answers is ready, whatever the platform', () => {
    expect(helperStep(READY, 'mac')).toBe('ready')
    expect(helperStep(READY, 'other')).toBe('ready')
  })

  it('off macOS nothing is offered, whichever step would be next: the installer cannot run there (Codex on #157)', () => {
    expect(helperStep(MISSING, 'other')).toBe('mac-only')
    expect(helperStep({ state: 'permission-missing' }, 'other')).toBe('mac-only')
    expect(helperStep({ state: 'restarting' }, 'other')).toBe('mac-only')
  })

  it('on macOS: the permission first, then the wait for the fresh worker, then the install', () => {
    expect(helperStep({ state: 'permission-missing' }, 'mac')).toBe('allow')
    expect(helperStep({ state: 'restarting' }, 'mac')).toBe('enabling')
    expect(helperStep(MISSING, 'mac')).toBe('install')
    expect(helperStep({ state: 'not-installed' }, 'mac')).toBe('install')
  })
})
