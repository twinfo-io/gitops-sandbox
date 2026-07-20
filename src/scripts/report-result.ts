/**
 * report-result.ts — Feedback loop determinístico: resultado do agent → Linear
 *
 * Roda APÓS o Claude CLI no workflow (if: always()). Garante que o Linear
 * sempre recebe status do agent, mesmo se Claude falhar ou não completar.
 *
 * Env vars (injetadas pelo GitHub Actions):
 *   LINEAR_API_KEY   — obrigatório
 *   ISSUE_ID         — ex: TWI-123
 *   AGENT_LABEL      — ex: agent:generate-code
 *   AGENT_STATUS     — "success" | "failure"
 *   RUN_URL          — URL do GitHub Actions run (opcional)
 *   AGENT_SUMMARY    — resumo de até 500 chars do que o agent fez (opcional)
 *   SEMANTIC_COMMENT — bloco de achado do semantic-check.ts, se houver (opcional, TWI-350/E15)
 *   SANITIZE_COMMENT — bloco de achado do sanitize-check.ts, se houver (opcional, TWI-882/E17)
 */

import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncConfig {
  linear: {
    teamId: string
    projectId: string
    states: Record<string, string>
  }
}

export type AgentStatus = 'success' | 'failure'

export interface ReportInput {
  issueId: string
  agentLabel: string
  status: AgentStatus
  runUrl: string | null
  summary: string | null
  durationSeconds: string | null
  tokensIn: string | null
  tokensOut: string | null
  costUsd: string | null
  semanticComment: string | null
  sanitizeComment: string | null
}

// ── State machine: agent × status → Linear state ─────────────────────────────

export function targetState(agentLabel: string, status: AgentStatus): string {
  if (status === 'failure') return 'todo'

  const map: Record<string, string> = {
    'agent:generate-code':   'inProgress', // PR aberto, aguarda review humano
    'agent:run-tests':       'done',        // testes passaram
    'agent:security-review': 'inProgress', // findings criados como sub-issues
    'agent:deploy':          'done',        // deploy executado
    'agent:code-review':     'inProgress', // sub-issues criadas, humano revisa
    'agent:create-specs':    'inProgress',
    'agent:suggest-tests':   'inProgress', // sugestões postadas, humano decide se implementa
    'agent:generate-tests':  'inProgress', // PR com testes reais aberto, aguarda review humano
  }

  // skill:* → inProgress (humano revisa output)
  if (agentLabel.startsWith('skill:')) return 'inProgress'

  return map[agentLabel] ?? 'inProgress'
}

// ── Linear API ────────────────────────────────────────────────────────────────

async function linearQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) throw new Error('LINEAR_API_KEY env var não definida')

  const resp = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  const json = await resp.json() as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Linear API retornou resposta vazia')
  return json.data
}

async function resolveIssueId(identifier: string): Promise<string> {
  const data = await linearQuery<{ issueSearch: { nodes: Array<{ id: string }> } }>(
    `query($term: String!) {
      issueSearch(query: $term, first: 1) {
        nodes { id }
      }
    }`,
    { term: identifier }
  )
  const issue = data.issueSearch.nodes[0]
  if (!issue) throw new Error(`Issue ${identifier} não encontrada no Linear`)
  return issue.id
}

async function postComment(issueId: string, body: string): Promise<void> {
  await linearQuery(
    `mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) { success }
    }`,
    { input: { issueId, body } }
  )
}

async function updateStatus(issueId: string, stateId: string): Promise<void> {
  await linearQuery(
    `mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`,
    { id: issueId, input: { stateId } }
  )
}

// ── Monta comentário ──────────────────────────────────────────────────────────

export function buildComment(input: ReportInput): string {
  const icon  = input.status === 'success' ? '✅' : '❌'
  const label = input.agentLabel
  const runLink = input.runUrl ? `[Ver run →](${input.runUrl})` : null

  const lines: string[] = [
    `## ${icon} Agent \`${label}\` — ${input.status === 'success' ? 'Concluído' : 'Falhou'}`,
    '',
  ]

  if (input.summary) {
    lines.push('**Resumo:**', input.summary, '')
  }

  const notes: Record<string, Record<AgentStatus, string>> = {
    'agent:generate-code': {
      success: 'PR aberto. Aguardando review humano antes do merge.',
      failure: 'Falha ao gerar código. Verifique os logs e reaplique a label para tentar novamente.',
    },
    'agent:run-tests': {
      success: 'Todos os testes passaram.',
      failure: 'Testes falharam. Verifique os logs para detalhes.',
    },
    'agent:security-review': {
      success: 'Findings criados como sub-issues com labels de severidade.',
      failure: 'Review de segurança falhou. Verifique os logs.',
    },
    'agent:deploy': {
      success: 'Deploy executado com sucesso.',
      failure: 'Deploy falhou. Verifique os logs e o pipeline.',
    },
    'agent:code-review': {
      success: 'Sub-issues criadas para cada finding. Labels agent:generate-code aplicadas nos corrigíveis.',
      failure: 'Code review falhou. Verifique os logs.',
    },
    'agent:suggest-tests': {
      success: 'Sugestões de teste postadas no comentário. Nenhum arquivo foi criado ou commitado — implementação fica a critério humano.',
      failure: 'Falha ao sugerir testes. Verifique os logs.',
    },
    'agent:generate-tests': {
      success: 'PR aberto com testes reais cobrindo o gap identificado. Aguardando review humano antes do merge.',
      failure: 'Falha ao gerar testes. Verifique os logs.',
    },
  }

  const note = notes[label]?.[input.status]
  if (note) lines.push(`> ${note}`, '')

  // Observability (TWI-301 / E8): custo/duração/tokens, quando disponíveis, ficam
  // registrados aqui também — trilha visível mesmo sem abrir o job summary do GH Actions.
  const isKnown = (v: string | null): v is string => !!v && v !== 'n/a'
  if ([input.durationSeconds, input.tokensIn, input.tokensOut, input.costUsd].some(isKnown)) {
    const parts: string[] = []
    if (isKnown(input.durationSeconds)) parts.push(`⏱ ${input.durationSeconds}s`)
    if (isKnown(input.tokensIn) || isKnown(input.tokensOut)) {
      parts.push(`🔤 ${input.tokensIn ?? 'n/a'} in / ${input.tokensOut ?? 'n/a'} out`)
    }
    if (isKnown(input.costUsd)) parts.push(`💰 $${input.costUsd}`)
    lines.push(`_${parts.join(' · ')}_`, '')
  }

  if (runLink) lines.push(runLink)

  // Check semântico (TWI-350 / E15) — informativo, nunca muda o status/estado, só soma contexto
  // pra revisão humana. Vazio na maioria das runs (só aparece quando há achado real).
  if (input.semanticComment) {
    lines.push('', input.semanticComment)
  }

  // Scan mecânico de sanitização (TWI-882 / E17) — mesmo princípio do E15: informativo,
  // nunca muda status/estado, só soma contexto de segurança pra revisão humana.
  if (input.sanitizeComment) {
    lines.push('', input.sanitizeComment)
  }

  lines.push('', `_Reportado automaticamente pelo GitOps × Claude Agents_`)

  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const issueIdentifier = process.env.ISSUE_ID
  const agentLabel      = process.env.AGENT_LABEL
  const rawStatus       = process.env.AGENT_STATUS ?? 'failure'
  const runUrl          = process.env.RUN_URL ?? null
  const summary         = process.env.AGENT_SUMMARY
    ? process.env.AGENT_SUMMARY.slice(0, 500)
    : null
  const durationSeconds = process.env.AGENT_DURATION_S ?? null
  const tokensIn        = process.env.AGENT_TOKENS_IN ?? null
  const tokensOut       = process.env.AGENT_TOKENS_OUT ?? null
  const costUsd         = process.env.AGENT_COST_USD ?? null
  const semanticComment = process.env.SEMANTIC_COMMENT || null
  const sanitizeComment = process.env.SANITIZE_COMMENT || null

  if (!issueIdentifier) throw new Error('ISSUE_ID env var não definida')
  if (!agentLabel)      throw new Error('AGENT_LABEL env var não definida')

  const status: AgentStatus = rawStatus === 'success' ? 'success' : 'failure'

  const input: ReportInput = {
    issueId: issueIdentifier, agentLabel, status, runUrl, summary,
    durationSeconds, tokensIn, tokensOut, costUsd, semanticComment, sanitizeComment,
  }

  console.log(`[report-result] ${issueIdentifier} | ${agentLabel} | ${status}`)

  const config: SyncConfig = JSON.parse(
    await readFile(join(ROOT, 'sync-config.json'), 'utf8')
  )

  const stateKey  = targetState(agentLabel, status)
  const stateId   = config.linear.states[stateKey]

  if (!stateId) throw new Error(`Estado "${stateKey}" não encontrado em sync-config.json`)

  const internalId = await resolveIssueId(issueIdentifier)
  const comment    = buildComment(input)

  await Promise.all([
    postComment(internalId, comment),
    updateStatus(internalId, stateId),
  ])

  console.log(`[report-result] ✅ Linear atualizado: ${issueIdentifier} → ${stateKey}`)
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[report-result] Erro:', (err as Error).message)
    process.exit(1)
  })
}
/* v8 ignore stop */
