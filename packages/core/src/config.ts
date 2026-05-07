/**
 * Loads environment configuration from Bun.env or process.env.
 * Never logs the API key.
 */
export type EnvConfig = {
  liveBaseUrl: string | undefined
  mockBaseUrl: string
  apiKey: string | undefined
}

function readEnv(name: string): string | undefined {
  // Prefer Bun.env when running under Bun, else process.env
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bunEnv = (globalThis as any).Bun?.env as Record<string, string | undefined> | undefined
  if (bunEnv && name in bunEnv) {
    const v = bunEnv[name]
    if (v !== undefined && v !== '') return v
  }
  const v = process.env[name]
  return v !== undefined && v !== '' ? v : undefined
}

export function loadEnvConfig(): EnvConfig {
  return {
    liveBaseUrl: readEnv('FUFIRE_BASE_URL'),
    mockBaseUrl: readEnv('MOCK_BASE_URL') ?? 'http://localhost:8081',
    apiKey: readEnv('FUFIRE_API_KEY'),
  }
}
