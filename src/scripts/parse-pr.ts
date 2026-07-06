/**
 * parse-pr.ts — Parser Q&A do PR template
 *
 * Uso:
 *   CLI:  npx tsx src/scripts/parse-pr.ts < pr_body.txt
 *   API:  import { parsePRBody } from './parse-pr.js'
 *
 * Retorna JSON com os campos extraídos do template.
 */

export interface PRFields {
  linearId: string | null    // ex: "TWI-123"
  type: 'BUG' | 'FEATURE' | 'HOTFIX' | 'REFACTOR' | 'TASK' | null
  title: string | null       // título (demanda furtiva)
  epic: string | null        // slug do epic no Linear
  reason: string | null
  agents: string[]           // ex: ["agent:generate-code", "agent:security-review"]
  isAgentCreated: boolean    // body contém <!-- agent-created: true -->
  isStealth: boolean         // sem linearId e tem title
}

// [ \t]* (não \s*) depois dos dois-pontos: \s inclui \n, o que faria um campo vazio
// "roubar" o valor do campo seguinte na próxima linha.
const FIELD_RE = (key: string) =>
  new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm')

const AGENT_LABELS = new Set([
  'agent:generate-code',
  'agent:run-tests',
  'agent:security-review',
  'agent:deploy',
  'agent:code-review',
  'agent:create-specs',
])

export function parsePRBody(body: string): PRFields {
  const field = (key: string): string | null => {
    const m = FIELD_RE(key).exec(body)
    if (!m) return null
    const v = m[1].trim()
    return v === '' ? null : v
  }

  const linearId = field('LINEAR_ID')
  const rawType  = field('TYPE')?.toUpperCase() ?? null
  const title    = field('TITLE')
  const epic     = field('EPIC')
  const reason   = field('REASON')
  const rawAgents = field('AGENTS') ?? ''

  const type = (['BUG', 'FEATURE', 'HOTFIX', 'REFACTOR', 'TASK'] as const).find(
    t => t === rawType
  ) ?? null

  const agents = rawAgents
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(s => AGENT_LABELS.has(s))

  const isAgentCreated = body.includes('<!-- agent-created: true -->')
  const isStealth = !linearId && !!title

  return { linearId, type, title, epic, reason, agents, isAgentCreated, isStealth }
}

// ── CLI ────────────────────────────────────────────────────────────────────────

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1]?.endsWith('parse-pr.ts') || process.argv[1]?.endsWith('parse-pr.js')) {
  const chunks: Buffer[] = []
  process.stdin.on('data', c => chunks.push(c))
  process.stdin.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const result = parsePRBody(body)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  })
}
/* v8 ignore stop */
