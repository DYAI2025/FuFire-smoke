import type { OpenAPIV3_1 } from 'openapi-types'
import type { JSONSchema7 } from 'json-schema'
import type { EndpointMeta, HttpMethod } from './types.js'

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
type Method = (typeof METHODS)[number]

export function parseEndpoints(doc: OpenAPIV3_1.Document): EndpointMeta[] {
  const out: EndpointMeta[] = []
  const paths = doc.paths ?? {}
  for (const [p, item] of Object.entries(paths)) {
    if (!item) continue
    for (const m of METHODS) {
      const op = (item as Record<Method, OpenAPIV3_1.OperationObject | undefined>)[m]
      if (!op) continue

      const responseSchemas: Record<number, JSONSchema7> = {}
      for (const [code, resp] of Object.entries(op.responses ?? {})) {
        const respObj = resp as OpenAPIV3_1.ResponseObject
        const schema = respObj.content?.['application/json']?.schema as
          | JSONSchema7
          | undefined
        if (schema) {
          const numCode = Number(code)
          if (!Number.isNaN(numCode)) responseSchemas[numCode] = schema
        }
      }

      const reqBody = op.requestBody as OpenAPIV3_1.RequestBodyObject | undefined
      const requestSchema = reqBody?.content?.['application/json']?.schema as
        | JSONSchema7
        | undefined

      const meta: EndpointMeta = {
        path: p,
        method: m.toUpperCase() as HttpMethod,
        operationId: op.operationId ?? `${m}_${p}`,
        tags: op.tags ?? [],
        responseSchemas,
        authRequired: Boolean(op.security && op.security.length > 0),
        deprecated: Boolean(op.deprecated),
      }
      if (requestSchema) meta.requestSchema = requestSchema
      out.push(meta)
    }
  }
  return out
}
