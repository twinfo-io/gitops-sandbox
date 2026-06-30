/**
 * Vercel Edge Function — Linear Webhook Bridge
 * Recebe eventos Linear, verifica HMAC-SHA256, dispara workflow_dispatch no GitHub.
 *
 * Env vars necessárias (Vercel project settings):
 *   LINEAR_WEBHOOK_SECRET  — secret configurado no Linear webhook
 *   GITHUB_TOKEN           — PAT com permissão actions:write no repo
 *   GITHUB_REPO_OWNER      — ex: twinfo-io
 *   GITHUB_REPO_NAME       — ex: gitops-sandbox
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

function isDispatchable(name: string): boolean {
  return AGENT_LABELS.has(name) || name.startsWith(SKILL_LABEL_PREFIX)
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

  // Dispara um workflow por label agent:*/skill:* adicionada
  const dispatched: string[] = []
  const errors: string[] = []

  for (const label of agentLabels) {
    try {
      await dispatchWorkflow(issueId, label, target)
      dispatched.push(label)
      console.log(`[webhook] Dispatched ${label} for ${issueId}`)
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`)
      console.error(`[webhook] Error dispatching ${label}:`, err)
    }
  }

  const status = errors.length > 0 && dispatched.length === 0 ? 500 : 200

  return new Response(
    JSON.stringify({ issueId, dispatched, errors }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
