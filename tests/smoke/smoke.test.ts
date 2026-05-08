import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOpenApi, parseEndpoints } from '@fufire-tp/openapi'
import { HttpClient } from '@fufire-tp/core'
import { Executor } from '@fufire-tp/runtime'
import fixtures from '../../fixtures/requests.json' with { type: 'json' }

const MOCK_PORT = 8081
const MOCK_BASE_URL = `http://localhost:${MOCK_PORT}`

export function resolveRepoRoot(): string {
  // this file lives at <repo>/tests/smoke/smoke.test.ts
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

export function resolveSpecPath(): string {
  return path.resolve(resolveRepoRoot(), 'specs/openapi-current.json')
}

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

export function trackMockLifecycle() {
  let teardown = false
  let exitCode: number | null = null
  let exitSignal: NodeJS.Signals | null = null
  return {
    markTeardown() {
      teardown = true
    },
    handleExit(code: number | null, signal: NodeJS.Signals | null) {
      exitCode = code
      exitSignal = signal
    },
    crashed() {
      if (teardown) return false
      const badExit = exitCode !== null && exitCode !== 0
      const badSignal = exitSignal !== null && exitSignal !== 'SIGTERM'
      return badExit || badSignal
    },
    summary() {
      return `exit=${exitCode} signal=${exitSignal}`
    },
  }
}

export function buildMockEnv(src: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  const allow = ['PATH', 'HOME', 'LANG']
  for (const k of allow) if (src[k] !== undefined) out[k] = src[k]
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith('MOCK_') && v !== undefined) out[k] = v
  }
  return out
}

describe('repo-root resolution', () => {
  it('resolveRepoRoot returns the api-testing-platform directory', () => {
    const root = resolveRepoRoot()
    expect(root).toMatch(/api-testing-platform$/)
  })
  it('resolveSpecPath uses repo-root, not cwd', () => {
    const orig = process.cwd
    process.cwd = () => '/tmp'
    try {
      expect(resolveSpecPath()).toMatch(/api-testing-platform\/specs\/openapi-current\.json$/)
    } finally {
      process.cwd = orig
    }
  })
})

describe('mock lifecycle tracker', () => {
  it('captures premature exit code', () => {
    const tracker = trackMockLifecycle()
    tracker.handleExit(137, 'SIGKILL')
    expect(tracker.crashed()).toBe(true)
    expect(tracker.summary()).toMatch(/137|SIGKILL/)
  })
  it('does not flag normal SIGTERM teardown', () => {
    const tracker = trackMockLifecycle()
    tracker.markTeardown()
    tracker.handleExit(null, 'SIGTERM')
    expect(tracker.crashed()).toBe(false)
  })
})

describe('buildMockEnv', () => {
  it('whitelists only PATH, HOME, LANG, MOCK_*', () => {
    const src = {
      PATH: '/usr/bin',
      HOME: '/home/x',
      LANG: 'C',
      MOCK_SCENARIO: 'hilat',
      MOCK_LATENCY_MS: '50',
      FUFIRE_API_KEY: 'SECRET-MUST-NOT-LEAK',
      AWS_SECRET_ACCESS_KEY: 'AKIAxxx',
    }
    const out = buildMockEnv(src)
    expect(out).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/x',
      LANG: 'C',
      MOCK_SCENARIO: 'hilat',
      MOCK_LATENCY_MS: '50',
    })
    expect(out).not.toHaveProperty('FUFIRE_API_KEY')
    expect(out).not.toHaveProperty('AWS_SECRET_ACCESS_KEY')
  })
})

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
  const lifecycle = trackMockLifecycle()

  beforeAll(async () => {
    // cwd = repo parent, so we can reference FuFirE/tests/mock_server.py
    const cwd = path.resolve(resolveRepoRoot(), '..')
    mock = spawn('python3', ['FuFirE/tests/mock_server.py', '--port', String(MOCK_PORT)], {
      cwd,
      stdio: 'pipe',
      env: buildMockEnv(process.env),
    })
    mock.on('error', (e) => {
      // keep silent except in test failure path
      console.error('[mock spawn error]', e.message)
    })
    mock.on('exit', (code, signal) => lifecycle.handleExit(code, signal))
    await waitForReady(`${MOCK_BASE_URL}/health`)
  })

  afterAll(() => {
    lifecycle.markTeardown()
    if (mock && !mock.killed) mock.kill('SIGTERM')
  })

  it('all calculate endpoints respond 200 with valid schema', async () => {
    const doc = await loadOpenApi({ source: 'file', path: resolveSpecPath() })
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

    expect(lifecycle.crashed(), `mock crashed mid-test: ${lifecycle.summary()}`).toBe(false)
  })
})
