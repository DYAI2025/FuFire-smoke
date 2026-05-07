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
})
