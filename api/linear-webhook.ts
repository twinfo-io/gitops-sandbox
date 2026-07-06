/**
 * Vercel Edge Function — Linear Webhook Bridge
 * Recebe eventos Linear, verifica HMAC-SHA256, dispara workflow_dispatch no GitHub.
 *
 * Env vars necessárias (Vercel project settings):
 *   LINEAR_WEBHOOK_SECRET  — secret configurado no Linear webhook
 *   GITHUB_TOKEN           — PAT com permissão actions:write no repo
 *   GITHUB_REPO_OWNER      — ex: twinfo-io
 *   GITHUB_REPO_NAME       — ex: gitops-sandbox
 *
 * Env vars opcionais:
 *   LINEAR_TO_GITHUB_MAP   — JSON {"email@linear":"usuario-github"} para o gate de write-access
 *   LINEAR_API_KEY         — se definida, comenta na issue quando agent:generate-code é bloqueado
 *                            por falta da label spec-approved (sem ela, só bloqueia, sem comentar)
 */

export const config = { runtime: 'edge' }

const AGENT_LABELS = new Set([
  'agent:generate-code',
  'agent:run-tests',
  'agent:security-review',
  'agent:deploy',
  'agent:code-review',
  'agent:create-specs',
])

const SKILL_LABEL_PREFIX = 'skill:'

interface LinearLabel {
  id: string
  name: string
}

interface LinearActor {
  id?: string
  name?: string
  email?: string
}

function isDispatchable(name: string): boolean {
  return AGENT_LABELS.has(name) || name.startsWith(SKILL_LABEL_PREFIX)
}

/**
 * Gate de write-access: só permite dispatch se o actor do evento Linear
 * puder ser mapeado a um usuário GitHub com permissão write/admin no repo alvo.
 *
 * Opt-in via LINEAR_TO_GITHUB_MAP (mesmo padrão de fallback do REPO_MAP) —
 * sem essa env var, o gate fica desabilitado (comportamento anterior preservado).
 */
async function checkWriteAccess(
  actor: LinearActor | undefined,
  target: { owner: string; repo: string }
): Promise<{ allowed: boolean; reason: string }> {
  const mapStr = process.env.LINEAR_TO_GITHUB_MAP
  if (!mapStr) {
    return { allowed: true, reason: 'gate desabilitado — LINEAR_TO_GITHUB_MAP não configurado' }
  }

  let identityMap: Record<string, string> = {}
  try {
    identityMap = JSON.parse(mapStr)
  } catch {
    console.error('[webhook] LINEAR_TO_GITHUB_MAP inválido — bloqueando por segurança')
    return { allowed: false, reason: 'LINEAR_TO_GITHUB_MAP mal configurado' }
  }

  const email = actor?.email
  const username = email ? identityMap[email] : undefined
  if (!username) {
    return { allowed: false, reason: `actor (${email ?? 'desconhecido'}) sem identidade GitHub mapeada` }
  }

  const { owner, repo } = target
  const token = process.env.GITHUB_TOKEN
  const url = `https://api.github.com/repos/${owner}/${repo}/collaborators/${username}/permission`

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!resp.ok) {
      return { allowed: false, reason: `GitHub retornou ${resp.status} ao checar permissão de ${username}` }
    }

    const body = (await resp.json()) as { permission?: string }
    const allowed = body.permission === 'admin' || body.permission === 'write'
    return { allowed, reason: allowed ? `${username} tem permissão ${body.permission}` : `${username} tem apenas permissão ${body.permission}` }
  } catch (err) {
    return { allowed: false, reason: `falha ao checar permissão GitHub: ${(err as Error).message}` }
  }
}

const SPEC_APPROVED_LABEL = 'spec-approved'
const SPEC_GATED_LABEL    = 'agent:generate-code'

/**
 * Gate de PRD/spec: agent:generate-code só dispara se a issue já tiver a label
 * spec-approved (aplicada por PM/tech lead após revisar a spec, ex: gerada via
 * agent:create-specs). Evita geração de código sem requisito claro.
 */
function hasApprovedSpec(labels: LinearLabel[]): boolean {
  return labels.some(l => l.name === SPEC_APPROVED_LABEL)
}

async function postSpecRequiredComment(issueInternalId: string): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) return // sem API key configurada — só bloqueia o dispatch, não comenta

  try {
    await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
        variables: {
          input: {
            issueId: issueInternalId,
            body: `⏸️ \`${SPEC_GATED_LABEL}\` bloqueado: adicione a label \`${SPEC_APPROVED_LABEL}\` depois de revisar a spec (ex: gerada via \`agent:create-specs\`) antes de tentar novamente.`,
          },
        },
      }),
    })
  } catch (err) {
    console.error('[webhook] Falha ao comentar pedido de spec:', err)
  }
}

async function verifyLinearSignature(
  request: Request,
  body: string
): Promise<boolean> {
  const signature = request.headers.get('linear-signature')
  if (!signature) return false

  const secret = process.env.LINEAR_WEBHOOK_SECRET
  if (!secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return signature === expected
}

function resolveTarget(event: Record<string, unknown>): { owner: string; repo: string } | null {
  const repoMapStr = process.env.REPO_MAP
  if (repoMapStr) {
    let repoMap: Record<string, string> = {}
    try { repoMap = JSON.parse(repoMapStr) } catch {
      console.error('[webhook] REPO_MAP inválido — usando fallback single-repo')
    }
    const issue     = event.data as Record<string, unknown>
    const projectId = issue.projectId as string | undefined
    const teamId    = issue.teamId    as string | undefined
    const slug      = (projectId && repoMap[projectId]) ?? (teamId && repoMap[teamId]) ?? null
    if (slug) {
      const sep = slug.indexOf('/')
      if (sep > 0) return { owner: slug.slice(0, sep), repo: slug.slice(sep + 1) }
    }
    console.error(`[webhook] Projeto/team não mapeado (projectId=${projectId}, teamId=${teamId})`)
  }

  // Fallback: single-repo via env vars (config anterior)
  const owner = process.env.GITHUB_REPO_OWNER
  const repo  = process.env.GITHUB_REPO_NAME
  if (owner && repo) return { owner, repo }

  return null
}

async function dispatchWorkflow(issueId: string, agentLabel: string, target: { owner: string; repo: string }): Promise<void> {
  const { owner, repo } = target
  const token = process.env.GITHUB_TOKEN

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/gitops.yml/dispatches`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { issue_id: issueId, agent_label: agentLabel },
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GitHub dispatch failed ${resp.status}: ${text}`)
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await request.text()

  const valid = await verifyLinearSignature(request, body)
  if (!valid) {
    return new Response('Unauthorized', { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // Só processa eventos de issue com labels
  const type   = event.type as string
  const action = event.action as string

  if (type !== 'Issue' || !['update', 'create'].includes(action)) {
    return new Response(JSON.stringify({ skipped: true, reason: 'not an issue event' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const issue   = event.data as Record<string, unknown>
  const labels  = (issue.labels as LinearLabel[] | undefined) ?? []
  const issueId = issue.identifier as string

  // Filtra labels agent:*/skill:* adicionadas neste evento
  const addedLabels = event.updatedFrom
    ? (() => {
        const prev = ((event.updatedFrom as Record<string, unknown>).labelIds ?? []) as string[]
        const curr = (issue.labelIds ?? []) as string[]
        const addedIds = new Set(curr.filter(id => !prev.includes(id)))
        return labels.filter(l => addedIds.has(l.id)).map(l => l.name)
      })()
    : labels.map(l => l.name)

  const agentLabels = addedLabels.filter(isDispatchable)

  if (agentLabels.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no agent labels added' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const target = resolveTarget(event)
  if (!target) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'no target repo resolved — set REPO_MAP or GITHUB_REPO_OWNER/GITHUB_REPO_NAME' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const actor = event.actor as LinearActor | undefined
  const access = await checkWriteAccess(actor, target)
  if (!access.allowed) {
    console.error(`[webhook] Dispatch bloqueado: ${access.reason}`)
    return new Response(
      JSON.stringify({ skipped: true, reason: `unauthorized: ${access.reason}` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Dispara um workflow por label agent:*/skill:* adicionada
  const dispatched: string[] = []
  const blocked: string[] = []
  const errors: string[] = []
  const specApproved = hasApprovedSpec(labels)
  let needsSpecComment = false

  for (const label of agentLabels) {
    if (label === SPEC_GATED_LABEL && !specApproved) {
      blocked.push(label)
      needsSpecComment = true
      console.warn(`[webhook] ${label} bloqueado para ${issueId}: falta label ${SPEC_APPROVED_LABEL}`)
      continue
    }

    try {
      await dispatchWorkflow(issueId, label, target)
      dispatched.push(label)
      console.log(`[webhook] Dispatched ${label} for ${issueId}`)
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`)
      console.error(`[webhook] Error dispatching ${label}:`, err)
    }
  }

  if (needsSpecComment) {
    await postSpecRequiredComment(issue.id as string)
  }

  const status = errors.length > 0 && dispatched.length === 0 ? 500 : 200

  return new Response(
    JSON.stringify({ issueId, dispatched, blocked, errors }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
