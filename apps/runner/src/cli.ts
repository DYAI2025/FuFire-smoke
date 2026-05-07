import path from 'node:path'
import fs from 'node:fs'
import { runInv, type InvFormat } from './commands/inv.js'

const FALLBACK_SPEC =
  '/Users/benjaminpoersch/Projects/_TOOLZ/FuFirE_smoketest/FuFirE/spec/openapi/openapi.json'

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
  const relCandidate = path.resolve(
    process.cwd(),
    '../FuFirE/spec/openapi/openapi.json',
  )
  if (fs.existsSync(relCandidate)) return relCandidate
  return FALLBACK_SPEC
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
