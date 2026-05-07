import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Executor } from './executor.js'
import { HttpClient } from '@fufire-tp/core'
import type { EndpointMeta } from '@fufire-tp/openapi'
describe('Executor.runOne', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('runs a smoke check and reports schema-valid + status-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"score":42}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const ep: EndpointMeta = {
      path: '/v1/x',
      method: 'POST',
      operationId: 'x',
      tags: [],
      responseSchemas: {
        200: {
          type: 'object',
          required: ['score'],
          properties: { score: { type: 'number' } },
        },
      },
      authRequired: false,
      deprecated: false,
    }
    const ex = new Executor(new HttpClient({ baseUrl: 'http://x' }))
    const result = await ex.runOne({ endpoint: ep, payload: {} })
    expect(result.passed).toBe(true)
    expect(result.statusOk).toBe(true)
    expect(result.schemaOk).toBe(true)
    expect(result.schemaResult.errors).toEqual([])
  })
})
