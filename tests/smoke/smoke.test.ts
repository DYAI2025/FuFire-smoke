import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { loadOpenApi, parseEndpoints } from '@fufire-tp/openapi'
import { HttpClient } from '@fufire-tp/core'
import { Executor } from '@fufire-tp/runtime'
import fixtures from '../../fixtures/requests.json' with { type: 'json' }

const MOCK_PORT = 8081
const MOCK_BASE_URL = `http://localhost:${MOCK_PORT}`
const SPEC_PATH = path.resolve('specs/openapi-current.json')

function hasPython3(): boolean {
  try {
    execSync('python3 --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function hasFastapi(): boolean {
  try {
    execSync('python3 -c "import fastapi"', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const SKIP_SMOKE = process.env.SKIP_SMOKE === '1'
const PYTHON_OK = hasPython3() && hasFastapi()
const SHOULD_RUN = !SKIP_SMOKE && PYTHON_OK

let mock: ChildProcess | undefined

async function waitForReady(url: string, attempts = 50, intervalMs = 300): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (res.ok) return
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`mock server did not become ready at ${url} within ${attempts * intervalMs}ms`)
}

describe.skipIf(!SHOULD_RUN)('smoke: FuFirE mock server', () => {
  beforeAll(async () => {
    // cwd = repo parent, so we can reference FuFirE/tests/mock_server.py
    const cwd = path.resolve('..')
    mock = spawn('python3', ['FuFirE/tests/mock_server.py', '--port', String(MOCK_PORT)], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env },
    })
    mock.on('error', (e) => {
      // keep silent except in test failure path
      console.error('[mock spawn error]', e.message)
    })
    await waitForReady(`${MOCK_BASE_URL}/health`)
  })

  afterAll(() => {
    if (mock && !mock.killed) mock.kill('SIGTERM')
  })

  it('all calculate endpoints respond 200 with valid schema', async () => {
    const doc = await loadOpenApi({ source: 'file', path: SPEC_PATH })
    const allEndpoints = parseEndpoints(doc)
    const fixturePaths = Object.keys(fixtures)
    const targets = allEndpoints.filter(
      (e) => e.method === 'POST' && fixturePaths.includes(e.path),
    )

    expect(targets.length, 'expected fixtures to map to endpoints in spec').toBeGreaterThan(0)

    const ex = new Executor(
      new HttpClient({ baseUrl: MOCK_BASE_URL, apiKey: 'ff_test_key', timeoutMs: 10_000 }),
      { rootDoc: doc as { components?: { schemas?: Record<string, unknown> } } },
    )

    const summary: Array<{ path: string; status: number; statusOk: boolean; schemaOk: boolean; schemaErrors: number }> = []

    for (const ep of targets) {
      const payload = (fixtures as Record<string, unknown>)[ep.path]
      const r = await ex.runOne({ endpoint: ep, payload })
      summary.push({
        path: ep.path,
        status: r.status,
        statusOk: r.statusOk,
        schemaOk: r.schemaOk,
        schemaErrors: r.schemaResult.errors.length,
      })
      expect.soft(r.statusOk, `${ep.path} status ${r.status}`).toBe(true)
      expect.soft(
        r.schemaOk,
        `${ep.path} schema errors: ${JSON.stringify(r.schemaResult.errors.slice(0, 5))}`,
      ).toBe(true)
    }

    // Always log per-endpoint summary so the user sees mock-vs-spec drift even when test passes/fails.
    // eslint-disable-next-line no-console
    console.log('[smoke summary]', JSON.stringify(summary, null, 2))
  })
})
