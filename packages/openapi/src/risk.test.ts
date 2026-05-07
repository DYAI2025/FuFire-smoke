import { describe, it, expect } from 'vitest'
import { scoreEndpoint, type RiskConfig } from './risk.js'
import config from '../../../configs/risk-scoring.json' with { type: 'json' }

const cfg = config as RiskConfig

describe('scoreEndpoint', () => {
  it('marks /v1/calculate/fusion HIGH', () => {
    const r = scoreEndpoint('/v1/calculate/fusion', cfg)
    expect(r.score).toBe('HIGH')
    expect(r.reason).toMatch(/fusion/i)
  })

  it('marks /v1/profile/abc as LOW', () => {
    expect(scoreEndpoint('/v1/profile/abc', cfg).score).toBe('LOW')
  })

  it('falls back to default LOW for unknown path', () => {
    const r = scoreEndpoint('/some/unknown/path', cfg)
    expect(r.score).toBe('LOW')
    expect(r.reason).toBe('default')
  })
})
