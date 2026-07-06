/**
 * sync-project.ts — Sync bidirecional Linear ↔ Git
 *
 * Modos:
 *   --pull   Linear → arquivos locais (default)
 *   --push   SPECS.md local → Linear Documents
 *   --both   pull + push
 *
 * Uso: npx tsx src/scripts/sync-project.ts [--pull|--push|--both]
 * Env: LINEAR_API_KEY
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SyncConfig {
  projectName: string
  linear: {
    teamId: string
    projectId: string
    states: Record<string, string>
  }
  git: { botName: string; botEmail: string; mainBranch: string }
  paths: {
    specs: string
    workplan: string
    demands: string
    epics: string
    sprints: string
  }
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  state: { name: string; type: string }
  priority: number
  parent: { identifier: string; title: string } | null
  labels: { nodes: Array<{ name: string }> }
  assignee: { displayName: string } | null
  cycle: { name: string; number: number } | null
  dueDate: string | null
}

interface LinearDocument {
  id: string
  title: string
  content: string
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

// ── Pull: Linear → local ──────────────────────────────────────────────────────

export async function pull(config: SyncConfig): Promise<void> {
  console.log('[sync:pull] Buscando dados do Linear...')

  const data = await linearQuery<{
    project: {
      name: string
      issues: { nodes: LinearIssue[] }
      documents: { nodes: LinearDocument[] }
    }
  }>(
    `query($projectId: String!) {
      project(id: $projectId) {
        name
        issues {
          nodes {
            id identifier title description
            state { name type }
            priority
            parent { identifier title }
            labels { nodes { name } }
            assignee { displayName }
            cycle { name number }
            dueDate
          }
        }
        documents { nodes { id title content } }
      }
    }`,
    { projectId: config.linear.projectId }
  )

  const allIssues = data.project.issues.nodes
  const activeIssues = allIssues.filter(
    i => i.state.type !== 'completed' && i.state.type !== 'cancelled'
  )
  const currentCycle = allIssues.find(i => i.cycle)?.cycle ?? null
  const topLevelIssues = allIssues.filter(i => !i.parent)

  // 1. WORKPLAN.md
  const workplanPath = join(ROOT, config.paths.workplan)
  await writeFile(workplanPath, generateWorkplan(config, activeIssues, currentCycle?.name ?? null), 'utf8')
  console.log(`[sync:pull] ${config.paths.workplan} atualizado (${activeIssues.length} issues ativas)`)

  // 2. docs/epics/
  const epicsDir = join(ROOT, config.paths.epics)
  await mkdir(epicsDir, { recursive: true })
  for (const epic of topLevelIssues) {
    const slug = toSlug(`${epic.identifier}-${epic.title}`)
    await writeFile(join(epicsDir, `${slug}.md`), generateEpicDoc(epic, allIssues), 'utf8')
  }
  console.log(`[sync:pull] ${topLevelIssues.length} epic(s) em ${config.paths.epics}`)

  // 3. docs/sprints/active.md
  const sprintsDir = join(ROOT, config.paths.sprints)
  await mkdir(sprintsDir, { recursive: true })
  const sprintIssues = currentCycle
    ? allIssues.filter(i => i.cycle?.name === currentCycle.name)
    : activeIssues.slice(0, 20)
  await writeFile(
    join(sprintsDir, 'active.md'),
    generateSprintDoc(currentCycle?.name ?? 'Backlog', sprintIssues),
    'utf8'
  )
  console.log(`[sync:pull] docs/sprints/active.md atualizado`)

  // 4. Se SPECS existe no Linear, atualiza local
  const specsDoc = data.project.documents.nodes.find(
    d => d.title === 'Especificação Técnica' || d.title === 'SPECS'
  )
  if (specsDoc) {
    await writeFile(join(ROOT, config.paths.specs), specsDoc.content, 'utf8')
    console.log(`[sync:pull] ${config.paths.specs} sincronizado do Linear`)
  }

  console.log('[sync:pull] Concluído.')
}

// ── Push: local → Linear Documents ───────────────────────────────────────────

export async function push(config: SyncConfig): Promise<void> {
  console.log('[sync:push] Enviando SPECS.md para Linear...')

  const specsContent = await readFile(join(ROOT, config.paths.specs), 'utf8')

  const existing = await linearQuery<{
    project: { documents: { nodes: LinearDocument[] } }
  }>(
    `query($projectId: String!) {
      project(id: $projectId) {
        documents { nodes { id title } }
      }
    }`,
    { projectId: config.linear.projectId }
  )

  const existingDoc = existing.project.documents.nodes.find(
    d => d.title === 'Especificação Técnica' || d.title === 'SPECS'
  )

  if (existingDoc) {
    await linearQuery(
      `mutation($id: String!, $input: DocumentUpdateInput!) {
        documentUpdate(id: $id, input: $input) { success }
      }`,
      { id: existingDoc.id, input: { content: specsContent } }
    )
    console.log(`[sync:push] Documento "${existingDoc.title}" atualizado no Linear`)
  } else {
    await linearQuery(
      `mutation($input: DocumentCreateInput!) {
        documentCreate(input: $input) { success document { id title } }
      }`,
      {
        input: {
          title: 'Especificação Técnica',
          content: specsContent,
          projectId: config.linear.projectId,
        },
      }
    )
    console.log('[sync:push] Documento "Especificação Técnica" criado no Linear')
  }

  console.log('[sync:push] Concluído.')
}

// ── Markdown generators ────────────────────────────────────────────────────────

export function generateWorkplan(
  config: SyncConfig,
  issues: LinearIssue[],
  sprint: string | null
): string {
  const today = new Date().toISOString().split('T')[0]
  const grouped = groupByState(issues)

  const lines: string[] = [
    `# Plano de Trabalho — ${config.projectName}`,
    '',
    `> Sincronizado com Linear em ${today}. Edições manuais serão sobrescritas.`,
    `> Rodar \`npx tsx src/scripts/sync-project.ts\` para atualizar.`,
    '',
  ]

  if (sprint) lines.push(`## Sprint Ativo: ${sprint}`, '')

  for (const [stateName, stateIssues] of Object.entries(grouped)) {
    if (!stateIssues.length) continue
    lines.push(`## ${stateName}`, '')
    for (const issue of stateIssues) {
      const done = issue.state.type === 'completed' ? 'x' : ' '
      const assignee = issue.assignee ? ` @${issue.assignee.displayName}` : ''
      const due = issue.dueDate ? ` (due: ${issue.dueDate})` : ''
      lines.push(`- [${done}] ${issue.identifier} — ${issue.title}${assignee}${due}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function generateEpicDoc(epic: LinearIssue, allIssues: LinearIssue[]): string {
  const children = allIssues.filter(i => i.parent?.identifier === epic.identifier)
  const lines: string[] = [
    `# ${epic.identifier} — ${epic.title}`,
    '',
    `**Estado:** ${epic.state.name}  `,
    `**Prioridade:** ${priorityLabel(epic.priority)}`,
    '',
  ]
  if (epic.description) lines.push(epic.description, '')
  lines.push('## Issues', '')
  if (children.length) {
    for (const child of children) {
      const done = child.state.type === 'completed' ? 'x' : ' '
      lines.push(`- [${done}] ${child.identifier} — ${child.title} (${child.state.name})`)
    }
  } else {
    lines.push('_Nenhuma sub-issue registrada._')
  }
  return lines.join('\n')
}

export function generateSprintDoc(sprintName: string, issues: LinearIssue[]): string {
  const today = new Date().toISOString().split('T')[0]
  const lines: string[] = [
    `# Sprint: ${sprintName}`,
    '',
    `> Atualizado em ${today} | ${issues.length} issue(s)`,
    '',
  ]
  for (const issue of issues) {
    const done = issue.state.type === 'completed' ? 'x' : ' '
    const assignee = issue.assignee ? ` — @${issue.assignee.displayName}` : ''
    lines.push(
      `- [${done}] **${issue.identifier}** ${issue.title}${assignee}`,
      `  Estado: ${issue.state.name} | Prioridade: ${priorityLabel(issue.priority)}`,
      ''
    )
  }
  return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByState(issues: LinearIssue[]): Record<string, LinearIssue[]> {
  const map: Record<string, LinearIssue[]> = {}
  for (const issue of issues) {
    ;(map[issue.state.name] ??= []).push(issue)
  }
  return map
}

function priorityLabel(p: number): string {
  return (['None', 'Urgent', 'High', 'Medium', 'Low'] as const)[p] ?? 'Unknown'
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const config: SyncConfig = JSON.parse(
    await readFile(join(ROOT, 'sync-config.json'), 'utf8')
  )

  const mode = process.argv[2] ?? '--pull'

  if (mode === '--pull')  { await pull(config); return }
  if (mode === '--push')  { await push(config); return }
  if (mode === '--both')  { await pull(config); await push(config); return }

  console.error(`Modo inválido: "${mode}". Use --pull, --push ou --both.`)
  process.exit(1)
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[sync] Erro:', (err as Error).message)
    process.exit(1)
  })
}
/* v8 ignore stop */
