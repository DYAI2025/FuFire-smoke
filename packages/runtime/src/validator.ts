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
  /**
   * Optional warning sink. Defaults to `console.warn` with a `[SchemaValidator]`
   * prefix. Allows tests (and callers) to capture warnings raised during
   * `addSchema` failures or other recoverable issues.
   */
  onWarning?: (msg: string) => void
}

export class SchemaValidator {
  private ajv: Ajv
  /** Map from component name → assigned $id used inside AJV. */
  private componentIds = new Map<string, string>()
  /** Identity-keyed cache of compiled validator functions per schema object. */
  private cache = new WeakMap<object, (data: unknown) => boolean | Promise<unknown>>()
  private hits = 0
  private misses = 0
  private warn: (msg: string) => void

  constructor(opts: SchemaValidatorOptions = {}) {
    this.ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(this.ajv)
    this.warn = opts.onWarning ?? ((m) => console.warn(`[SchemaValidator] ${m}`))

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
        } catch (err) {
          this.warn(`addSchema failed for component "${name}": ${(err as Error).message}`)
        }
      }
    }
  }

  /** Test/inspection hook — returns running counts of cache hits/misses. */
  cacheStats() {
    return { hits: this.hits, misses: this.misses }
  }

  validate(schema: object, payload: unknown): ValidationResult {
    let compiled = this.cache.get(schema)
    if (compiled) {
      this.hits++
    } else {
      this.misses++
      const rewritten = this.rewriteRefs(schema)
      try {
        compiled = this.ajv.compile(rewritten) as (data: unknown) => boolean | Promise<unknown>
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
      this.cache.set(schema, compiled)
    }
    const ok = compiled(payload)
    return {
      valid: Boolean(ok),
      errors: ((compiled as { errors?: ErrorObject[] | null }).errors ?? []).map(this.toErr),
    }
  }

  /** Rewrite '#/components/schemas/X' (or '#/definitions/X') refs to registered $ids. */
  private rewriteRefs(schema: unknown): object {
    // structuredClone handles cycles natively; fall back to JSON for environments
    // that lack support (or types that aren't structured-cloneable).
    let cloned: unknown
    try {
      cloned = structuredClone(schema)
    } catch {
      cloned = JSON.parse(JSON.stringify(schema))
    }
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
    walk(cloned)
    return cloned as object
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
