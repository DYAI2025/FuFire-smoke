import type { EndpointMeta } from '@fufire-tp/openapi'
import type { HttpClient } from '@fufire-tp/core'
import { SchemaValidator, type ValidationResult } from './validator.js'

export type RunResult = {
  endpoint: EndpointMeta
  status: number
  latencyMs: number
  statusOk: boolean
  schemaOk: boolean
  schemaResult: ValidationResult
  passed: boolean
  body: unknown
}

export class Executor {
  private validator = new SchemaValidator()
  constructor(private http: HttpClient) {}

  async runOne(args: { endpoint: EndpointMeta; payload?: unknown }): Promise<RunResult> {
    const r = await this.http.request({
      method: args.endpoint.method,
      path: args.endpoint.path,
      body: args.endpoint.method === 'GET' ? undefined : args.payload,
    })
    const expectedSchema = args.endpoint.responseSchemas[r.status]
    const schemaResult: ValidationResult = expectedSchema
      ? this.validator.validate(expectedSchema, r.body)
      : { valid: true, errors: [] }
    const statusOk = r.status >= 200 && r.status < 300
    const schemaOk = schemaResult.valid
    return {
      endpoint: args.endpoint,
      status: r.status,
      latencyMs: r.latencyMs,
      statusOk,
      schemaOk,
      schemaResult,
      passed: statusOk && schemaOk,
      body: r.body,
    }
  }
}
