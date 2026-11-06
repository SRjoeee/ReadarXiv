// The typesetter's tests held to today's own engine at runtime (engine 065c1d973, read-only at AXT_TODAY): they import today's
// modules by computed paths, which the boundary gate refuses in a package, so they live here, beside the lab tools, and run
// by hand: node_modules/.bin/vitest run --config lab/typeset/vitest.config.ts (each skips where today's engine, the tap or the
// sweep cache is absent). The package's own tests (packages/typeset/tests) read only data.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: { name: 'typeset-today', environment: 'node', include: ['tests/**/*.test.ts'] },
})
