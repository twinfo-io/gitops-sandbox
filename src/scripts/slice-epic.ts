/**
 * slice-epic.ts — Fatia uma spec/PRD commitada no Git em épico + histórias no Linear
 *
 * Lê um arquivo .md de docs/epic-specs/, cria o épico (se ainda não existir) e cada
 * história como issue filha (só as que ainda não têm ID) — parser determinístico
 * (regex, sem LLM), mesmo padrão de create-demand.ts/parse-pr.ts. Idempotente:
 * rodar de novo depois de adicionar mais histórias no mesmo arquivo só cria o que falta.
 *
 * Uso:
 *   npx tsx src/scripts/slice-epic.ts docs/epic-specs/notificacoes-push.md
 *   (saída stdout: um ID por linha — épico primeiro, depois histórias, na ordem do arquivo)
 *
 * Formato do arquivo:
 *   EPIC_LINEAR_ID: (vazio — preenchido após criação)
 *   EPIC_TITLE: Sistema de notificações push
 *   EPIC_TYPE: FEATURE
 *   EPIC_REASON: Motivo do épico
 *
 *   ## Story: Configurar provider de push
 *   STORY_LINEAR_ID: (vazio)
 *   TYPE: FEATURE
 *   REASON: Motivo da história
 *   AGENTS: agent:generate-code
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

export interface EpicFields {
  linearId: string | null
  title: string
  type: string
  reason: string | null
}

export interface StoryFields {
  linearId: string | null
  title: string
  type: string
  reason: string | null
  agents: string[]
}

export interface ParsedEpicSpec {
  epic: EpicFields
  stories: StoryFields[]
}

const AGENT_LABELS = new Set([
  'agent:generate-code',
  'agent:run-tests',
  'agent:security-review',
  'agent:deploy',
  'agent:code-review',
  'agent:create-specs',
  'agent:suggest-tests',
  'agent:generate-tests',
])

// ── Parser (determinístico, sem LLM) ──────────────────────────────────────────

function field(key: string, block: string): string | null {
  const m = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(block)
  const v = m?.[1]?.trim()
  return v && v !== '' ? v : null
}

export function parseEpicSpec(content: string): ParsedEpicSpec {
  const storyHeaderRe = /^## Story: (.+)$/m
  const firstStoryMatch = storyHeaderRe.exec(content)
  const epicBlock = firstStoryMatch ? content.slice(0, firstStoryMatch.index) : content

  const epicTitle = field('EPIC_TITLE', epicBlock)
  if (!epicTitle) throw new Error('Campo EPIC_TITLE ausente no arquivo de spec')

  const epic: EpicFields = {
    linearId: field('EPIC_LINEAR_ID', epicBlock),
    title: epicTitle,
    type: field('EPIC_TYPE', epicBlock) ?? 'FEATURE',
    reason: field('EPIC_REASON', epicBlock),
  }

  const stories: StoryFields[] = []
  const sections = content.split(/^## Story: /m).slice(1) // primeiro elemento é o epicBlock, já tratado

  for (const section of sections) {
    const titleEnd = section.indexOf('\n')
    const title = (titleEnd === -1 ? section : section.slice(0, titleEnd)).trim()
    const body = titleEnd === -1 ? '' : section.slice(titleEnd + 1)

    const rawAgents = field('AGENTS', body) ?? ''
    const agents = rawAgents
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => AGENT_LABELS.has(s))

    stories.push({
      linearId: field('STORY_LINEAR_ID', body),
      title,
      type: field('TYPE', body) ?? 'FEATURE',
      reason: field('REASON', body),
      agents,
    })
  }

  return { epic, stories }
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

  const json = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Linear API retornou resposta vazia')
  return json.data
}

interface CreatedIssue {
  id: string
  identifier: string
  url: string
}

export async function createLinearIssue(
  title: string,
  type: string,
  reason: string | null,
  teamId: string,
  projectId: string,
  todoStateId: string,
  parentId: string | null
): Promise<CreatedIssue> {
  const description = [
    `## ${parentId ? 'História' : 'Épico'} — registrado automaticamente via slice-epic.ts`,
    '',
    `**Tipo:** ${type}`,
    `**Motivo:** ${reason ?? 'não informado'}`,
  ].join('\n')

  const input: Record<string, unknown> = {
    teamId,
    projectId,
    stateId: todoStateId,
    title: `[${type}] ${title}`,
    description,
    priority: 2,
  }
  if (parentId) input.parentId = parentId

  const data = await linearQuery<{ issueCreate: { success: boolean; issue: CreatedIssue } }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    { input }
  )

  if (!data.issueCreate.success) throw new Error(`Linear retornou success: false ao criar "${title}"`)
  return data.issueCreate.issue
}

// ── Reescrita do arquivo com IDs preenchidos ─────────────────────────────────

export function backfillIds(
  content: string,
  epicIdentifier: string | null,
  storyIdentifiers: Array<string | null>
): string {
  let updated = content

  if (epicIdentifier) {
    updated = updated.replace(/^EPIC_LINEAR_ID:[^\n]*/m, `EPIC_LINEAR_ID: ${epicIdentifier}`)
  }

  const sections = updated.split(/(^## Story: .+$)/m)
  let storyIdx = 0
  for (let i = 1; i < sections.length; i += 2) {
    const identifier = storyIdentifiers[storyIdx]
    storyIdx++
    if (!identifier) continue
    sections[i + 1] = sections[i + 1].replace(/^STORY_LINEAR_ID:[^\n]*/m, `STORY_LINEAR_ID: ${identifier}`)
  }

  return sections.join('')
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const specFile = process.argv[2]
  if (!specFile) {
    console.error('Uso: npx tsx src/scripts/slice-epic.ts <arquivo.md>')
    process.exitCode = 1
    return
  }

  const config: SyncConfig = JSON.parse(await readFile(join(ROOT, 'sync-config.json'), 'utf8'))
  const { teamId, projectId } = config.linear
  const todoState = config.linear.states.todo
  if (!todoState) throw new Error('Estado "todo" não encontrado em sync-config.json')

  const absPath = resolve(specFile)
  const content = await readFile(absPath, 'utf8')
  const parsed  = parseEpicSpec(content)

  let epicIdentifier = parsed.epic.linearId
  let epicInternalId: string | null = null

  if (!epicIdentifier) {
    const created = await createLinearIssue(parsed.epic.title, parsed.epic.type, parsed.epic.reason, teamId, projectId, todoState, null)
    epicIdentifier = created.identifier
    epicInternalId = created.id
    console.log(epicIdentifier)
    console.error(`[slice-epic] ✅ Épico criado: ${created.identifier} → ${created.url}`)
  } else {
    console.error(`[slice-epic] Épico já existe: ${epicIdentifier} — pulando criação`)
  }

  const storyIdentifiers: Array<string | null> = []
  for (const story of parsed.stories) {
    if (story.linearId) {
      console.error(`[slice-epic] História já existe: ${story.linearId} ("${story.title}") — pulando`)
      storyIdentifiers.push(null) // não precisa reescrever, já tinha ID
      continue
    }

    if (!epicInternalId) {
      // Épico já existia antes desta run (não temos o id interno) — buscar pra linkar parentId
      const found = await linearQuery<{ issueSearch: { nodes: Array<{ id: string }> } }>(
        `query($term: String!) { issueSearch(query: $term, first: 1) { nodes { id } } }`,
        { term: epicIdentifier }
      )
      epicInternalId = found.issueSearch.nodes[0]?.id ?? null
      if (!epicInternalId) throw new Error(`Épico ${epicIdentifier} não encontrado no Linear pra linkar história`)
    }

    const created = await createLinearIssue(story.title, story.type, story.reason, teamId, projectId, todoState, epicInternalId)
    console.log(created.identifier)
    console.error(`[slice-epic] ✅ História criada: ${created.identifier} → ${created.url}`)
    storyIdentifiers.push(created.identifier)
  }

  const updated = backfillIds(content, epicIdentifier === parsed.epic.linearId ? null : epicIdentifier, storyIdentifiers)
  if (updated !== content) {
    await writeFile(absPath, updated, 'utf8')
    console.error(`[slice-epic] Arquivo atualizado com os IDs gerados: ${absPath}`)
  }
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[slice-epic] Erro:', (err as Error).message)
    process.exit(1)
  })
}
/* v8 ignore stop */
