/**
 * create-demand.ts — Auto-criação de issue furtiva no Linear
 *
 * Lê um arquivo .md de demanda furtiva, busca epic + sprint no Linear,
 * cria a issue com relacionamentos corretos e retorna o ID gerado.
 *
 * Uso:
 *   npx tsx src/scripts/create-demand.ts docs/demands/minha-demanda.md
 *   (saída stdout: TWI-XXX | saída stderr: logs)
 *
 * Formato do arquivo de demanda:
 *   LINEAR_ID: (vazio — preenchido após criação)
 *   TITLE: Corrige timeout no WebSocket
 *   TYPE: BUG
 *   EPIC: gorjeta-sorteios
 *   REASON: Usuários perdem conexão após 30s
 *
 * Env: LINEAR_API_KEY
 */

import { readFile, writeFile } from 'fs/promises'
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

interface DemandFields {
  linearId: string | null
  title: string
  type: string
  epic: string | null
  reason: string | null
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

// ── Parse do arquivo de demanda ───────────────────────────────────────────────

function parseDemandFile(content: string): DemandFields {
  const field = (key: string): string | null => {
    const m = new RegExp(`^${key}:[\\s]*(.+?)\\s*$`, 'm').exec(content)
    const v = m?.[1]?.trim()
    return v && v !== '' ? v : null
  }

  const title = field('TITLE')
  if (!title) throw new Error('Campo TITLE ausente no arquivo de demanda')

  return {
    linearId: field('LINEAR_ID'),
    title,
    type: field('TYPE') ?? 'TASK',
    epic: field('EPIC'),
    reason: field('REASON'),
  }
}

// ── Lookup: epic pelo slug/título ─────────────────────────────────────────────

async function findEpicId(epicSlug: string, teamId: string): Promise<string | null> {
  if (!epicSlug) return null

  const data = await linearQuery<{
    issues: { nodes: Array<{ id: string; identifier: string; title: string }> }
  }>(
    `query($teamId: String!, $query: String!) {
      issues(filter: {
        team: { id: { eq: $teamId } }
        parent: { null: true }
        title: { containsIgnoreCase: $query }
      }, first: 5) {
        nodes { id identifier title }
      }
    }`,
    { teamId, query: epicSlug.replace(/-/g, ' ') }
  )

  const match = data.issues.nodes.find(i =>
    i.title.toLowerCase().includes(epicSlug.replace(/-/g, ' ').toLowerCase()) ||
    i.identifier.toLowerCase() === epicSlug.toLowerCase()
  )

  if (match) {
    console.error(`[create-demand] Epic encontrado: ${match.identifier} — ${match.title}`)
    return match.id
  }

  console.error(`[create-demand] Epic não encontrado para slug: "${epicSlug}"`)
  return null
}

// ── Lookup: sprint/cycle ativo ────────────────────────────────────────────────

async function findActiveCycleId(teamId: string): Promise<string | null> {
  const data = await linearQuery<{
    cycles: { nodes: Array<{ id: string; name: string; number: number }> }
  }>(
    `query($teamId: String!) {
      cycles(filter: {
        team: { id: { eq: $teamId } }
        isActive: { eq: true }
      }, first: 1) {
        nodes { id name number }
      }
    }`,
    { teamId }
  )

  const cycle = data.cycles.nodes[0] ?? null
  if (cycle) {
    console.error(`[create-demand] Sprint ativo: ${cycle.name ?? `#${cycle.number}`}`)
    return cycle.id
  }

  console.error('[create-demand] Nenhum sprint ativo — issue ficará sem ciclo')
  return null
}

// ── Cria issue no Linear ──────────────────────────────────────────────────────

async function createIssue(
  fields: DemandFields,
  config: SyncConfig,
  epicId: string | null,
  cycleId: string | null
): Promise<string> {
  const issueTitle = `[${fields.type}] ${fields.title}`
  const description = [
    '## Demanda Furtiva — registrada automaticamente pelo GitOps',
    '',
    `**Tipo:** ${fields.type}`,
    `**Motivo:** ${fields.reason ?? 'não informado'}`,
    epicId ? `**Epic:** vinculado automaticamente` : '',
  ].filter(Boolean).join('\n')

  const input: Record<string, unknown> = {
    teamId: config.linear.teamId,
    projectId: config.linear.projectId,
    stateId: config.linear.states.todo,
    title: issueTitle,
    description,
    priority: 2,
  }

  if (epicId) input.parentId = epicId
  if (cycleId) input.cycleId = cycleId

  const data = await linearQuery<{
    issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } }
  }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    { input }
  )

  if (!data.issueCreate.success) throw new Error('Linear retornou success: false')

  const { identifier, url } = data.issueCreate.issue
  console.error(`[create-demand] ✅ ${identifier} criado → ${url}`)
  return identifier
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const demandFile = process.argv[2]
  if (!demandFile) {
    console.error('Uso: npx tsx src/scripts/create-demand.ts <arquivo.md>')
    process.exit(1)
  }

  const absPath = resolve(demandFile)
  const content = await readFile(absPath, 'utf8')
  const fields = parseDemandFile(content)

  if (fields.linearId) {
    console.error(`[create-demand] Já tem LINEAR_ID: ${fields.linearId} — pulando`)
    process.stdout.write(fields.linearId + '\n')
    return
  }

  const config: SyncConfig = JSON.parse(
    await readFile(join(ROOT, 'sync-config.json'), 'utf8')
  )

  const [epicId, cycleId] = await Promise.all([
    fields.epic ? findEpicId(fields.epic, config.linear.teamId) : Promise.resolve(null),
    findActiveCycleId(config.linear.teamId),
  ])

  const linearId = await createIssue(fields, config, epicId, cycleId)

  // Atualiza o arquivo com LINEAR_ID
  const updated = content.replace(
    /^LINEAR_ID:[^\n]*/m,
    `LINEAR_ID: ${linearId}`
  )
  await writeFile(absPath, updated, 'utf8')
  console.error(`[create-demand] Arquivo atualizado com ${linearId}`)

  process.stdout.write(linearId + '\n')
}

main().catch(err => {
  console.error('[create-demand] Erro:', (err as Error).message)
  process.exit(1)
})
