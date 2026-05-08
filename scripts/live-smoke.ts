#!/usr/bin/env bun
/**
 * Live smoke against the production FuFirE API.
 *
 * Reads FUFIRE_BASE_URL + FUFIRE_API_KEY from .env (Bun loads it automatically).
 * Runs each endpoint listed in fixtures/requests.json through the Executor and
 * prints a summary table. The API key is NEVER printed, never echoed, never
 * passed via CLI args — only via the X-API-Key header by HttpClient.
 *
 * Usage:
 *   bun run scripts/live-smoke.ts                 # uses fixtures/requests.json
 *   bun run scripts/live-smoke.ts --max-latency=2000   # warn if any > 2s
 */
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadOpenApi, parseEndpoints } from '@fufire-tp/openapi'
import { HttpClient, loadEnvConfig } from '@fufire-tp/core'
import { Executor } from '@fufire-tp/runtime'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const SPEC_PATH = path.join(repoRoot, 'specs/openapi-current.json')
const FIXTURES_PATH = path.join(repoRoot, 'fixtures/requests.json')

function maskKey(key: string | undefined): string {
  if (!key) return '<unset>'
  if (key.length < 6) return '***'
  return `${key.slice(0, 3)}…${key.slice(-2)} (${key.length} chars)`
}

function fmt(ms: number): string {
  return `${ms.toFixed(0).padStart(5, ' ')}ms`
}

async function main() {
  const cfg = loadEnvConfig()
  if (!cfg.liveBaseUrl) {
    console.error('FUFIRE_BASE_URL is not set (check .env)')
    process.exit(2)
  }
  if (!cfg.apiKey) {
    console.error('FUFIRE_API_KEY is not set (check .env)')
    process.exit(2)
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  FuFirE Live Smoke`)
  console.log(`  base: ${cfg.liveBaseUrl}`)
  console.log(`  key:  ${maskKey(cfg.apiKey)}`)
  console.log('═══════════════════════════════════════════════════════════════')

  // Read spec + fixtures
  if (!fs.existsSync(SPEC_PATH)) {
    console.error(`spec not found: ${SPEC_PATH}`)
    process.exit(2)
  }
  if (!fs.existsSync(FIXTURES_PATH)) {
    console.error(`fixtures not found: ${FIXTURES_PATH}`)
    process.exit(2)
  }
  const doc = await loadOpenApi({ source: 'file', path: SPEC_PATH })
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as Record<
    string,
    unknown
  >

  // Find endpoints we have fixtures for. The spec strips the /v1 prefix from
  // paths, fixtures use the full /v1/... — match both shapes.
  const fixturePaths = Object.keys(fixtures)
  const endpoints = parseEndpoints(doc)
  const targets = endpoints
    .filter((e) => e.method === 'POST')
    .filter((e) => fixturePaths.includes(e.path) || fixturePaths.includes(`/v1${e.path}`))

  if (targets.length === 0) {
    console.error('no matching endpoints between spec and fixtures')
    process.exit(2)
  }

  // Health probe first (no auth needed)
  const probe = new HttpClient({ baseUrl: cfg.liveBaseUrl, timeoutMs: 8_000 })
  const health = await probe.request({ method: 'GET', path: '/v1/health' })
  console.log(
    `  /v1/health: HTTP ${health.status} in ${fmt(health.latencyMs)}` +
      (health.status === 200 ? ' ✓' : ' ✗'),
  )
  console.log()

  // Authenticated runs
  const ex = new Executor(
    new HttpClient({
      baseUrl: cfg.liveBaseUrl,
      apiKey: cfg.apiKey,
      timeoutMs: 15_000,
    }),
    { rootDoc: doc as { components?: { schemas?: Record<string, unknown> } } },
  )

  const rows: Array<{
    path: string
    status: number
    latencyMs: number
    statusOk: boolean
    schemaOk: boolean
    schemaErr: string
  }> = []

  for (const ep of targets) {
    const fixtureKey = fixturePaths.includes(ep.path) ? ep.path : `/v1${ep.path}`
    const payload = fixtures[fixtureKey]
    try {
      const r = await ex.runOne({ endpoint: ep, payload })
      rows.push({
        path: ep.path,
        status: r.status,
        latencyMs: r.latencyMs,
        statusOk: r.statusOk,
        schemaOk: r.schemaOk,
        schemaErr: r.schemaResult.errors[0]?.keyword ?? '',
      })
    } catch (err) {
      rows.push({
        path: ep.path,
        status: -1,
        latencyMs: 0,
        statusOk: false,
        schemaOk: false,
        schemaErr: (err as Error).message.slice(0, 40),
      })
    }
  }

  // Print table
  const header = `${'path'.padEnd(28)} ${'status'.padStart(6)} ${'latency'.padStart(8)}  status  schema  notes`
  console.log(header)
  console.log('-'.repeat(header.length + 8))
  for (const r of rows) {
    const okS = r.statusOk ? '  ✓ ' : '  ✗ '
    const okV = r.schemaOk ? '  ✓ ' : '  ✗ '
    console.log(
      `${r.path.padEnd(28)} ${String(r.status).padStart(6)} ${fmt(r.latencyMs).padStart(8)}  ${okS}  ${okV}  ${r.schemaErr}`,
    )
  }

  // Aggregate
  const passed = rows.filter((r) => r.statusOk).length
  const schemaPassed = rows.filter((r) => r.schemaOk).length
  const p50 = (() => {
    const sorted = rows.map((r) => r.latencyMs).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  })()
  const p99 = (() => {
    const sorted = rows.map((r) => r.latencyMs).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.99)] ?? 0
  })()
  console.log()
  console.log(`status: ${passed}/${rows.length} 2xx`)
  console.log(`schema: ${schemaPassed}/${rows.length} valid`)
  console.log(`latency p50: ${fmt(p50)}, p99: ${fmt(p99)}`)
  if (passed === rows.length) console.log('\n✓ Live API smoke PASS (status-level)')
  else console.log('\n✗ Live API smoke FAIL — see rows with ✗')
}

await main()
