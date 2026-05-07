import {
  loadOpenApi,
  parseEndpoints,
  scoreEndpoint,
  type RiskConfig,
} from '@fufire-tp/openapi'
import config from '../../../../configs/risk-scoring.json' with { type: 'json' }

export type InvFormat = 'table' | 'json'

export type InvOptions = {
  spec: string
  format?: InvFormat
}

export async function runInv(opts: InvOptions): Promise<void> {
  const doc = await loadOpenApi({ source: 'file', path: opts.spec })
  const cfg = config as RiskConfig
  const eps = parseEndpoints(doc).map((e) => ({
    path: e.path,
    method: e.method,
    operationId: e.operationId,
    tags: e.tags,
    authRequired: e.authRequired,
    deprecated: e.deprecated,
    risk: scoreEndpoint(e.path, cfg),
  }))

  const format: InvFormat = opts.format ?? 'table'
  if (format === 'json') {
    process.stdout.write(JSON.stringify(eps, null, 2) + '\n')
    return
  }

  for (const e of eps) {
    const score = e.risk.score.padEnd(6)
    const method = e.method.padEnd(6)
    const auth = e.authRequired ? 'Y' : 'N'
    process.stdout.write(`[${score}] ${method} ${e.path}  (auth:${auth})\n`)
  }
}
