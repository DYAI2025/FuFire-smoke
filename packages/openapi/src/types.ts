import type { JSONSchema7 } from 'json-schema'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type EndpointMeta = {
  path: string
  method: HttpMethod
  operationId: string
  tags: string[]
  requestSchema?: JSONSchema7
  responseSchemas: Record<number, JSONSchema7>
  authRequired: boolean
  deprecated: boolean
}
