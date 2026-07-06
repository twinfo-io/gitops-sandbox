import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import handler from './linear-webhook'

const SECRET = 'test-webhook-secret'
const OWNER  = 'twinfo-io'
const REPO   = 'gitops-sandbox'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function makeRequest(body: string, opts: { signature?: string; method?: string } = {}): Request {
  return new Request('https://gitops.vercel.app/api/linear-webhook', {
    method: opts.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      'linear-signature': opts.signature ?? sign(body),
    },
    body,
  })
}

function issuePayload(overrides: {
  action?: string
  labelId?: string
  labelName?: string
  prevLabelIds?: string[]
  identifier?: string
  actor?: { id?: string; name?: string; email?: string }
  extraLabels?: { id: string; name: string }[]
} = {}): string {
  const {
    action = 'update',
    labelId = 'label-abc',
    labelName = 'agent:generate-code',
    prevLabelIds = [],
    identifier = 'TWI-100',
    actor,
    extraLabels = [],
  } = overrides

  const labels = [{ id: labelId, name: labelName }, ...extraLabels]

  return JSON.stringify({
    type: 'Issue',
    action,
    actor,
    data: {
      id: 'issue-id-1',
      identifier,
      labels,
      labelIds: labels.map(l => l.id),
    },
    updatedFrom: action === 'update' ? { labelIds: prevLabelIds } : undefined,
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.LINEAR_WEBHOOK_SECRET = SECRET
  process.env.GITHUB_TOKEN          = 'gh-test-token'
  process.env.GITHUB_REPO_OWNER     = OWNER
  process.env.GITHUB_REPO_NAME      = REPO

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.LINEAR_WEBHOOK_SECRET
  delete process.env.GITHUB_TOKEN
  delete process.env.GITHUB_REPO_OWNER
  delete process.env.GITHUB_REPO_NAME
})

// ── Autenticação ──────────────────────────────────────────────────────────────

describe('autenticação HMAC', () => {
  it('rejeita GET com 405', async () => {
    const req = new Request('https://x.com', { method: 'GET' })
    const res = await handler(req)
    expect(res.status).toBe(405)
  })

  it('rejeita assinatura inválida com 401', async () => {
    const body = issuePayload()
    const req  = makeRequest(body, { signature: 'invalida' })
    const res  = await handler(req)
    expect(res.status).toBe(401)
  })

  it('rejeita quando LINEAR_WEBHOOK_SECRET ausente', async () => {
    delete process.env.LINEAR_WEBHOOK_SECRET
    const body = issuePayload()
    const req  = makeRequest(body)
    const res  = await handler(req)
    expect(res.status).toBe(401)
  })

  it('aceita assinatura válida', async () => {
    const body = issuePayload()
    const req  = makeRequest(body)
    const res  = await handler(req)
    expect(res.status).not.toBe(401)
  })
})

// ── Filtragem de eventos ──────────────────────────────────────────────────────

describe('filtragem de eventos', () => {
  it('ignora eventos que não são Issue', async () => {
    const body = JSON.stringify({ type: 'Comment', action: 'create', data: {} })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { skipped: boolean }
    expect(json.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignora evento Issue sem label agent:* ou skill:*', async () => {
    const body = issuePayload({ labelName: 'bug', prevLabelIds: [] })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { skipped: boolean }
    expect(json.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignora label agent:* já presente antes do update', async () => {
    // prevLabelIds inclui o mesmo ID → não foi adicionado agora
    const body = issuePayload({ labelId: 'label-abc', prevLabelIds: ['label-abc'] })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { skipped: boolean }
    expect(json.skipped).toBe(true)
  })
})

// ── Dispatch agent:* ──────────────────────────────────────────────────────────

describe('dispatch agent:*', () => {
  it('dispara workflow para agent:generate-code', async () => {
    const body = issuePayload({
      labelName: 'agent:generate-code',
      extraLabels: [{ id: 'label-spec', name: 'spec-approved' }],
    })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toContain('agent:generate-code')
    expect(fetch).toHaveBeenCalledOnce()

    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${OWNER}/${REPO}`)
    const reqBody = JSON.parse(opts.body as string)
    expect(reqBody.inputs.issue_id).toBe('TWI-100')
    expect(reqBody.inputs.agent_label).toBe('agent:generate-code')
  })

  it('dispara workflow para evento create com agent label', async () => {
    const body = issuePayload({ action: 'create', labelName: 'agent:run-tests' })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toContain('agent:run-tests')
  })
})

// ── Dispatch skill:* ──────────────────────────────────────────────────────────

describe('dispatch skill:*', () => {
  it('dispara workflow para skill:create-prd', async () => {
    const body = issuePayload({ labelName: 'skill:create-prd' })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toContain('skill:create-prd')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('dispara workflow para qualquer prefixo skill:*', async () => {
    const body = issuePayload({ labelName: 'skill:security-review' })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(json.dispatched).toContain('skill:security-review')
  })
})

// ── Múltiplas labels ──────────────────────────────────────────────────────────

describe('múltiplas labels', () => {
  it('dispara um workflow por label adicionada', async () => {
    const body = JSON.stringify({
      type: 'Issue',
      action: 'update',
      data: {
        id: 'issue-id-1',
        identifier: 'TWI-101',
        labels: [
          { id: 'l1', name: 'agent:run-tests' },
          { id: 'l2', name: 'agent:security-review' },
        ],
        labelIds: ['l1', 'l2'],
      },
      updatedFrom: { labelIds: [] },
    })

    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toHaveLength(2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

// ── Falha no GitHub dispatch ──────────────────────────────────────────────────

describe('erro no GitHub dispatch', () => {
  it('retorna 500 quando GitHub rejeita o dispatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
    )

    const body = issuePayload({
      labelName: 'agent:generate-code',
      extraLabels: [{ id: 'label-spec', name: 'spec-approved' }],
    })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { errors: string[] }

    expect(res.status).toBe(500)
    expect(json.errors.length).toBeGreaterThan(0)
  })

  it('retorna 200 parcial quando apenas alguns dispatches falham', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call++
        return Promise.resolve(
          call === 1
            ? new Response(null, { status: 204 })
            : new Response('Error', { status: 500 })
        )
      })
    )

    const body = JSON.stringify({
      type: 'Issue',
      action: 'update',
      data: {
        id: 'issue-id-1',
        identifier: 'TWI-102',
        labels: [
          { id: 'l1', name: 'agent:run-tests' },
          { id: 'l2', name: 'agent:security-review' },
        ],
        labelIds: ['l1', 'l2'],
      },
      updatedFrom: { labelIds: [] },
    })

    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[]; errors: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toHaveLength(1)
    expect(json.errors).toHaveLength(1)
  })
})

// ── Gate de write-access ────────────────────────────────────────────────────

describe('gate de write-access (LINEAR_TO_GITHUB_MAP)', () => {
  afterEach(() => {
    delete process.env.LINEAR_TO_GITHUB_MAP
  })

  it('sem LINEAR_TO_GITHUB_MAP, dispatch procede normalmente (gate desabilitado)', async () => {
    const body = issuePayload({
      actor: { email: 'sem-mapa@twinfo.io' },
      labelName: 'agent:run-tests', // evita o gate de spec-approved, ortogonal a este teste
    })
    const req  = makeRequest(body)
    const res  = await handler(req)

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledOnce() // só o dispatch, sem checagem de permissão
  })

  it('bloqueia com 403 quando actor não está mapeado', async () => {
    process.env.LINEAR_TO_GITHUB_MAP = JSON.stringify({ 'dev@twinfo.io': 'devuser' })

    const body = issuePayload({ actor: { email: 'desconhecido@twinfo.io' } })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { skipped: boolean; reason: string }

    expect(res.status).toBe(403)
    expect(json.skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled() // nem chega a checar GitHub nem a despachar
  })

  it('bloqueia com 403 quando actor ausente no evento', async () => {
    process.env.LINEAR_TO_GITHUB_MAP = JSON.stringify({ 'dev@twinfo.io': 'devuser' })

    const body = issuePayload()
    const req  = makeRequest(body)
    const res  = await handler(req)

    expect(res.status).toBe(403)
  })

  it('bloqueia com 403 quando GitHub reporta permissão read', async () => {
    process.env.LINEAR_TO_GITHUB_MAP = JSON.stringify({ 'dev@twinfo.io': 'devuser' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ permission: 'read' }), { status: 200 })
      )
    )

    const body = issuePayload({ actor: { email: 'dev@twinfo.io' } })
    const req  = makeRequest(body)
    const res  = await handler(req)

    expect(res.status).toBe(403)
  })

  it('permite dispatch quando GitHub reporta permissão write', async () => {
    process.env.LINEAR_TO_GITHUB_MAP = JSON.stringify({ 'dev@twinfo.io': 'devuser' })
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        call++
        return Promise.resolve(
          call === 1
            ? new Response(JSON.stringify({ permission: 'write' }), { status: 200 }) // checagem de permissão
            : new Response(null, { status: 204 }) // dispatch
        )
      })
    )

    const body = issuePayload({
      actor: { email: 'dev@twinfo.io' },
      labelName: 'agent:run-tests', // evita o gate de spec-approved, ortogonal a este teste
    })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toContain('agent:run-tests')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('bloqueia com 403 quando LINEAR_TO_GITHUB_MAP é JSON inválido', async () => {
    process.env.LINEAR_TO_GITHUB_MAP = '{ json invalido'

    const body = issuePayload({ actor: { email: 'dev@twinfo.io' } })
    const req  = makeRequest(body)
    const res  = await handler(req)

    expect(res.status).toBe(403)
  })
})

// ── Gate de spec/PRD aprovada (agent:generate-code) ─────────────────────────

describe('gate de spec-approved para agent:generate-code', () => {
  afterEach(() => {
    delete process.env.LINEAR_API_KEY
  })

  it('bloqueia agent:generate-code sem a label spec-approved', async () => {
    const body = issuePayload({ labelName: 'agent:generate-code' })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[]; blocked: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toHaveLength(0)
    expect(json.blocked).toContain('agent:generate-code')
    expect(fetch).not.toHaveBeenCalled() // nem dispatch nem comment (sem LINEAR_API_KEY)
  })

  it('permite agent:generate-code quando a issue já tem spec-approved', async () => {
    const body = issuePayload({
      labelName: 'agent:generate-code',
      extraLabels: [{ id: 'label-spec', name: 'spec-approved' }],
    })
    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[]; blocked: string[] }

    expect(res.status).toBe(200)
    expect(json.dispatched).toContain('agent:generate-code')
    expect(json.blocked).toHaveLength(0)
  })

  it('não bloqueia outras labels do mesmo evento quando generate-code é bloqueado', async () => {
    const body = JSON.stringify({
      type: 'Issue',
      action: 'update',
      data: {
        id: 'issue-id-1',
        identifier: 'TWI-103',
        labels: [
          { id: 'l1', name: 'agent:generate-code' },
          { id: 'l2', name: 'agent:run-tests' },
        ],
        labelIds: ['l1', 'l2'],
      },
      updatedFrom: { labelIds: [] },
    })

    const req  = makeRequest(body)
    const res  = await handler(req)
    const json = await res.json() as { dispatched: string[]; blocked: string[] }

    expect(json.blocked).toContain('agent:generate-code')
    expect(json.dispatched).toContain('agent:run-tests')
  })

  it('comenta na issue pedindo spec quando LINEAR_API_KEY está configurada', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_test'

    const body = issuePayload({ labelName: 'agent:generate-code' })
    const req  = makeRequest(body)
    const res  = await handler(req)

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledOnce() // só o commentCreate, sem dispatch
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.linear.app/graphql')
    expect(opts.body as string).toContain('spec-approved')
  })
})
