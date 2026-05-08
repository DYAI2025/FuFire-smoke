export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type HttpRequest = {
  method: HttpMethod
  path: string
  body?: unknown
  headers?: Record<string, string>
}

export type HttpResponse = {
  status: number
  body: unknown
  headers: Record<string, string>
  latencyMs: number
}

export type HttpClientConfig = {
  baseUrl: string
  apiKey?: string
  timeoutMs?: number
}

function joinUrl(baseUrl: string, p: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const tail = p.startsWith('/') ? p : `/${p}`
  return base + tail
}

export class HttpClient {
  constructor(private cfg: HttpClientConfig) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    /**
     * Headers precedence (last write wins):
     *   1. Content-Type: application/json — always set first.
     *   2. X-API-Key — only when `cfg.apiKey` is configured on the client.
     *   3. req.headers — INTENTIONALLY merged last so callers can override
     *      X-API-Key (and any other header) for negative-auth tests, e.g.
     *      verifying that a wrong / missing key yields 401. This is gewolltes
     *      Verhalten and not a bug; do not "harden" it without updating the
     *      auth-test suite (Sprint 6).
     */
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.cfg.apiKey ? { 'X-API-Key': this.cfg.apiKey } : {}),
      ...(req.headers ?? {}),
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000),
    }
    // body: undefined → omit; null → omit too (avoid sending the literal "null").
    if (req.body !== undefined && req.body !== null) {
      init.body = JSON.stringify(req.body)
    }

    const url = joinUrl(this.cfg.baseUrl, req.path)

    const t0 = performance.now()
    const res = await fetch(url, init)
    const latencyMs = performance.now() - t0

    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // leave as text
    }

    const headerObj: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headerObj[k] = v
    })

    return { status: res.status, body, headers: headerObj, latencyMs }
  }
}
