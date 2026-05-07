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

export class HttpClient {
  constructor(private cfg: HttpClientConfig) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
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
    if (req.body !== undefined) {
      init.body = JSON.stringify(req.body)
    }

    const t0 = performance.now()
    const res = await fetch(this.cfg.baseUrl + req.path, init)
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
