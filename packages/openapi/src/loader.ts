import fs from 'node:fs/promises'
import type { OpenAPIV3_1 } from 'openapi-types'

export type LoaderInput =
  | { source: 'file'; path: string }
  | { source: 'url'; url: string; headers?: Record<string, string> }

export async function loadOpenApi(
  input: LoaderInput,
): Promise<OpenAPIV3_1.Document> {
  if (input.source === 'file') {
    const raw = await fs.readFile(input.path, 'utf8')
    return JSON.parse(raw) as OpenAPIV3_1.Document
  }
  const init: RequestInit = {}
  if (input.headers) init.headers = input.headers
  const res = await fetch(input.url, init)
  if (!res.ok) {
    throw new Error(`OpenAPI fetch failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as OpenAPIV3_1.Document
}
