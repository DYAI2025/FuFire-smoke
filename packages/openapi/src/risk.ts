export type RiskScore = 'HIGH' | 'MEDIUM' | 'LOW'

export type RiskRule = {
  match: string
  score: RiskScore
  reason: string
}

export type RiskConfig = {
  rules: RiskRule[]
  default: RiskScore
}

export type ScoredEndpoint = {
  score: RiskScore
  reason: string
}

export function scoreEndpoint(path: string, cfg: RiskConfig): ScoredEndpoint {
  for (const r of cfg.rules) {
    if (path === r.match || path.startsWith(r.match)) {
      return { score: r.score, reason: r.reason }
    }
  }
  return { score: cfg.default, reason: 'default' }
}
