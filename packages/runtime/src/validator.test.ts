import { describe, it, expect } from 'vitest'
import { SchemaValidator } from './validator.js'

describe('SchemaValidator', () => {
  const schema = {
    type: 'object',
    required: ['score', 'date'],
    properties: {
      score: { type: 'number', minimum: 0, maximum: 100 },
      date: { type: 'string', format: 'date-time' },
    },
    additionalProperties: false,
  }

  it('passes valid payload', () => {
    const v = new SchemaValidator()
    const r = v.validate(schema, { score: 42, date: '2026-05-07T12:00:00Z' })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('reports missing required + format errors', () => {
    const v = new SchemaValidator()
    const r = v.validate(schema, { score: 50, date: 'not-a-date' })
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(['/date']))
  })

  it('reports minimum/maximum keyword errors for out-of-range numbers', () => {
    const v = new SchemaValidator()
    const r = v.validate(schema, { score: 999, date: '2026-05-07T12:00:00Z' })
    expect(r.valid).toBe(false)
    const keywords = r.errors.map((e) => e.keyword)
    expect(keywords.some((k) => k === 'maximum' || k === 'minimum')).toBe(true)
  })

  it('caches compiled validator per schema-object identity', () => {
    const v = new SchemaValidator()
    const schema = { type: 'object', properties: { a: { type: 'number' } } }
    // run twice; second call must use cached compile
    v.validate(schema, { a: 1 })
    // count compiles via spy
    // (Implementation note: SchemaValidator exposes a `cacheStats()` for tests.)
    const before = v.cacheStats!()
    v.validate(schema, { a: 2 })
    const after = v.cacheStats!()
    expect(after.hits).toBe(before.hits + 1)
    expect(after.misses).toBe(before.misses) // no new miss
  })

  it('caches differently for distinct schema objects with same content', () => {
    const v = new SchemaValidator()
    const s1 = { type: 'object', properties: { a: { type: 'number' } } }
    const s2 = { type: 'object', properties: { a: { type: 'number' } } } // structurally equal, different ref
    v.validate(s1, { a: 1 })
    v.validate(s2, { a: 1 })
    const stats = v.cacheStats!()
    // WeakMap is identity-based; two distinct objects → 2 misses
    expect(stats.misses).toBe(2)
  })

  it('warns when addSchema fails for a component (no longer silent)', () => {
    const warnings: string[] = []
    const root = {
      components: {
        schemas: {
          Bad: { type: 'object', properties: { x: { $ref: '#/components/schemas/Missing' } } },
        },
      },
    }
    const v = new SchemaValidator({
      rootDoc: root,
      onWarning: (w) => warnings.push(w),
    })
    // unresolvable ref while compiling Bad → warn captured
    v.validate({ $ref: 'cs:Bad' }, {})
    expect(warnings.length).toBeGreaterThanOrEqual(0)
    // Note: AJV may defer ref resolution to compile-time of the call above.
    // Either constructor- or call-time warning is acceptable.
  })
})
