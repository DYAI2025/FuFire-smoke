import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpClient } from './http.js'

describe('HttpClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches X-API-Key when configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const c = new HttpClient({ baseUrl: 'http://x', apiKey: 'KEY' })
    await c.request({ method: 'GET', path: '/v1/health' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callArgs = fetchSpy.mock.calls[0]!
    expect(callArgs[0]).toBe('http://x/v1/health')
    const init = callArgs[1] as RequestInit
    expect(init.headers).toMatchObject({ 'X-API-Key': 'KEY', 'Content-Type': 'application/json' })
  })

  it('returns parsed JSON body and latencyMs >= 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const c = new HttpClient({ baseUrl: 'http://x' })
    const r = await c.request({ method: 'GET', path: '/health' })
    expect(r.status).toBe(200)
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
    expect(r.body).toEqual({ ok: true })
  })

  it('does not attach X-API-Key when apiKey is undefined', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    const c = new HttpClient({ baseUrl: 'http://x' })
    await c.request({ method: 'GET', path: '/health' })
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    expect(init.headers).not.toHaveProperty('X-API-Key')
  })

  it('joins baseUrl + path safely (handles missing/extra slash)', async () => {
    // mockImplementation so each call gets a fresh Response (Response.body can only be read once).
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
    // baseUrl WITHOUT trailing slash, path WITH leading slash → exactly one slash
    await new HttpClient({ baseUrl: 'http://x.test' }).request({ method: 'GET', path: '/v1/health' })
    expect(fetchSpy.mock.calls.at(-1)![0]).toBe('http://x.test/v1/health')
    // baseUrl WITH trailing slash + path WITH leading slash → still single slash
    await new HttpClient({ baseUrl: 'http://x.test/' }).request({ method: 'GET', path: '/v1/health' })
    expect(fetchSpy.mock.calls.at(-1)![0]).toBe('http://x.test/v1/health')
    // path with query string stays intact
    await new HttpClient({ baseUrl: 'http://x.test' }).request({ method: 'GET', path: '/v1/transit/now?limit=5' })
    expect(fetchSpy.mock.calls.at(-1)![0]).toBe('http://x.test/v1/transit/now?limit=5')
  })

  it('null body is sent as empty (not the literal string "null")', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    await new HttpClient({ baseUrl: 'http://x' }).request({ method: 'POST', path: '/v1/x', body: null })
    const init = fetchSpy.mock.calls.at(-1)![1] as RequestInit
    expect(init.body).toBeUndefined()
  })
})
