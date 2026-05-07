import Ajv, { type ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

export type ValidationError = {
  path: string
  message: string
  keyword: string
}

export type ValidationResult = {
  valid: boolean
  errors: ValidationError[]
}

export class SchemaValidator {
  private ajv: Ajv
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
  }

  validate(schema: object, payload: unknown): ValidationResult {
    const fn = this.ajv.compile(schema)
    const ok = fn(payload)
    return {
      valid: Boolean(ok),
      errors: (fn.errors ?? []).map(this.toErr),
    }
  }

  private toErr = (e: ErrorObject): ValidationError => {
    const required = (e.params as { missingProperty?: string } | undefined)?.missingProperty
    const path = required
      ? `${e.instancePath || ''}/${required}`
      : e.instancePath || '/'
    return {
      path,
      message: e.message ?? 'invalid',
      keyword: e.keyword,
    }
  }
}
