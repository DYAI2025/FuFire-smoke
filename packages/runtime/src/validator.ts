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

export type SchemaValidatorOptions = {
  /**
   * Optional root document whose `components.schemas` (or `definitions`) entries
   * become resolvable via `#/components/schemas/...` refs. Used when validating
   * partial schemas extracted from an OpenAPI document.
   */
  rootDoc?: { components?: { schemas?: Record<string, unknown> }; definitions?: Record<string, unknown> }
}

export class SchemaValidator {
  private ajv: Ajv
  /** Map from component name → assigned $id used inside AJV. */
  private componentIds = new Map<string, string>()
  constructor(opts: SchemaValidatorOptions = {}) {
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
    if (opts.rootDoc) {
      const schemas = opts.rootDoc.components?.schemas ?? opts.rootDoc.definitions ?? {}
      // First pass: assign each component a unique $id so refs can target it.
      for (const name of Object.keys(schemas)) {
        this.componentIds.set(name, `cs:${name}`)
      }
      // Second pass: rewrite refs inside each component, set $id, and register with AJV.
      for (const [name, raw] of Object.entries(schemas)) {
        const id = this.componentIds.get(name)!
        const rewritten = this.rewriteRefs(raw) as Record<string, unknown>
        rewritten.$id = id
        try {
          this.ajv.addSchema(rewritten)
        } catch {
          // duplicate or unsupported — skip; ref will fail loudly during compile
        }
      }
    }
  }

  validate(schema: object, payload: unknown): ValidationResult {
    const rewritten = this.rewriteRefs(schema)
    let compiled
    try {
      compiled = this.ajv.compile(rewritten)
    } catch (err) {
      const e = err as Error & { missingRef?: string }
      // Unresolvable $ref (e.g. spec has components.schemas empty). Record as a
      // single error rather than throwing — caller decides how to interpret.
      return {
        valid: false,
        errors: [
          {
            path: '/',
            message: `unresolvable $ref: ${e.missingRef ?? e.message}`,
            keyword: 'ref',
          },
        ],
      }
    }
    const ok = compiled(payload)
    return {
      valid: Boolean(ok),
      errors: (compiled.errors ?? []).map(this.toErr),
    }
  }

  /** Rewrite '#/components/schemas/X' (or '#/definitions/X') refs to registered $ids. */
  private rewriteRefs(schema: unknown): object {
    const out = JSON.parse(JSON.stringify(schema))
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) walk(child)
        return
      }
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>
        if (typeof o.$ref === 'string') {
          const m =
            /^#\/components\/schemas\/([^/]+)$/.exec(o.$ref) ??
            /^#\/definitions\/([^/]+)$/.exec(o.$ref)
          if (m) {
            const name = m[1]!
            const id = this.componentIds.get(name)
            if (id) o.$ref = id
          }
        }
        for (const v of Object.values(o)) walk(v)
      }
    }
    walk(out)
    return out as object
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
