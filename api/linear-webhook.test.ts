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
} = {}): string {
  const {
    action = 'update',
    labelId = 'label-abc',
    labelName = 'agent:generate-code',
    prevLabelIds = [],
    identifier = 'TWI-100',
  } = overrides

  return JSON.stringify({
    type: 'Issue',
    action,
    data: {
      id: 'issue-id-1',
      identifier,
      labels: [{ id: labelId, name: labelName }],
      labelIds: [labelId],
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
    const body = issuePayload({ labelName: 'agent:generate-code' })
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

    const body = issuePayload()
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
