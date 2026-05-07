import path from 'node:path'
import fs from 'node:fs'
import { runInv, type InvFormat } from './commands/inv.js'

// Versioned in-repo spec snapshot (synced via scripts/sync-spec.sh).
// Path is resolved relative to repo root (cwd when invoked via bun run).
const REPO_SPEC = 'specs/openapi-current.json'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1)
    } else {
      out[a.slice(2)] = 'true'
    }
  }
  return out
}

function resolveSpec(specArg: string | undefined): string {
  if (specArg) return path.resolve(specArg)
  const repoCopy = path.resolve(process.cwd(), REPO_SPEC)
  if (fs.existsSync(repoCopy)) return repoCopy
  throw new Error(
    `OpenAPI spec not found at ${repoCopy}. Run scripts/sync-spec.sh or pass --spec=<path>.`,
  )
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  const args = parseArgs(process.argv.slice(3))

  if (cmd === 'inv') {
    const spec = resolveSpec(args['spec'])
    const fmt = (args['format'] as InvFormat | undefined) ?? 'table'
    await runInv({ spec, format: fmt })
    return
  }

  if (!cmd) {
    process.stderr.write('usage: runner <command> [--spec=...] [--format=table|json]\n')
    process.stderr.write('commands: inv\n')
    process.exit(2)
  }

  process.stderr.write(`unknown command: ${cmd}\n`)
  process.exit(2)
}

await main()
