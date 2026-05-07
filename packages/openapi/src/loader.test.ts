import { describe, it, expect } from 'vitest'
import { loadOpenApi } from './loader.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Versioned spec snapshot inside this repo (synced via scripts/sync-spec.sh)
const SPEC = path.resolve(__dirname, '../../../specs/openapi-current.json')

describe('loadOpenApi', () => {
  it('loads OpenAPI doc from local file', async () => {
    const doc = await loadOpenApi({ source: 'file', path: SPEC })
    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.paths).toBeDefined()
    expect(Object.keys(doc.paths!).length).toBeGreaterThanOrEqual(10)
  })

  it('rejects unreachable URL', async () => {
    await expect(
      loadOpenApi({ source: 'url', url: 'http://127.0.0.1:1/nope' }),
    ).rejects.toThrow()
  })

  it('rejects non-2xx URL response', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('nope', { status: 503, statusText: 'Service Unavailable' })) as unknown as typeof fetch
    try {
      await expect(
        loadOpenApi({ source: 'url', url: 'http://example.invalid/spec' }),
      ).rejects.toThrow(/503/)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
