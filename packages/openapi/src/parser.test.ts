import { describe, it, expect, beforeAll } from 'vitest'
import { parseEndpoints } from './parser.js'
import { loadOpenApi } from './loader.js'
import type { EndpointMeta } from './types.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Versioned spec snapshot inside this repo (synced via scripts/sync-spec.sh)
const SPEC = path.resolve(__dirname, '../../../specs/openapi-current.json')

describe('parseEndpoints', () => {
  let endpoints: EndpointMeta[]

  beforeAll(async () => {
    const doc = await loadOpenApi({ source: 'file', path: SPEC })
    endpoints = parseEndpoints(doc)
  })

  it('finds POST /v1/calculate/bazi with response 200 schema and authRequired', () => {
    const ep = endpoints.find(
      (e) => e.path === '/v1/calculate/bazi' && e.method === 'POST',
    )
    expect(ep).toBeDefined()
    expect(ep!.responseSchemas[200]).toBeDefined()
    expect(ep!.authRequired).toBe(true)
  })

  it('marks unauthenticated /health endpoint as authRequired:false', () => {
    const health = endpoints.find(
      (e) => e.path === '/health' && e.method === 'GET',
    )
    expect(health).toBeDefined()
    expect(health!.authRequired).toBe(false)
  })

  it('extracts request schema for POST /v1/calculate/fusion', () => {
    const fusion = endpoints.find(
      (e) => e.path === '/v1/calculate/fusion' && e.method === 'POST',
    )
    expect(fusion).toBeDefined()
    expect(fusion!.requestSchema).toBeDefined()
  })
})
