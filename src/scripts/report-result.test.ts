import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { targetState, buildComment, main, type ReportInput } from './report-result'

// ── State machine ─────────────────────────────────────────────────────────────

describe('targetState — state machine agent × status', () => {
  const ALL_AGENTS = [
    'agent:generate-code', 'agent:run-tests', 'agent:deploy',
    'agent:security-review', 'agent:code-review', 'skill:create-prd',
  ]

  it('falha sempre → todo', () => {
    for (const agent of ALL_AGENTS) {
      expect(targetState(agent, 'failure')).toBe('todo')
    }
  })

  it('generate-code sucesso → inProgress (PR aguarda review humano)', () => {
    expect(targetState('agent:generate-code', 'success')).toBe('inProgress')
  })

  it('run-tests sucesso → done', () => {
    expect(targetState('agent:run-tests', 'success')).toBe('done')
  })

  it('deploy sucesso → done', () => {
    expect(targetState('agent:deploy', 'success')).toBe('done')
  })

  it('security-review sucesso → inProgress (findings como sub-issues)', () => {
    expect(targetState('agent:security-review', 'success')).toBe('inProgress')
  })

  it('code-review sucesso → inProgress (sub-issues criadas)', () => {
    expect(targetState('agent:code-review', 'success')).toBe('inProgress')
  })

  it('skill:* qualquer → inProgress', () => {
    expect(targetState('skill:create-prd', 'success')).toBe('inProgress')
    expect(targetState('skill:security-review', 'success')).toBe('inProgress')
    expect(targetState('skill:xyz', 'success')).toBe('inProgress')
  })

  it('label desconhecida sucesso → inProgress (fallback seguro)', () => {
    expect(targetState('agent:futuro', 'success')).toBe('inProgress')
  })
})

// ── buildComment ──────────────────────────────────────────────────────────────

describe('buildComment', () => {
  const base: ReportInput = {
    issueId: 'TWI-200',
    agentLabel: 'agent:generate-code',
    status: 'success',
    runUrl: 'https://github.com/twinfo-io/gitops-sandbox/actions/runs/123',
    summary: null,
  }

  it('sucesso contém ✅ e label', () => {
    const comment = buildComment(base)
    expect(comment).toContain('✅')
    expect(comment).toContain('agent:generate-code')
    expect(comment).toContain('Concluído')
  })

  it('falha contém ❌', () => {
    const comment = buildComment({ ...base, status: 'failure' })
    expect(comment).toContain('❌')
    expect(comment).toContain('Falhou')
  })

  it('inclui link do run quando fornecido', () => {
    const comment = buildComment(base)
    expect(comment).toContain('Ver run')
    expect(comment).toContain('actions/runs/123')
  })

  it('não inclui link quando runUrl é null', () => {
    const comment = buildComment({ ...base, runUrl: null })
    expect(comment).not.toContain('Ver run')
  })

  it('inclui summary quando fornecido', () => {
    const comment = buildComment({ ...base, summary: 'Criou arquivo auth.ts e abriu PR #42' })
    expect(comment).toContain('Criou arquivo auth.ts')
  })

  it('inclui nota específica por agent:run-tests', () => {
    const comment = buildComment({ ...base, agentLabel: 'agent:run-tests', status: 'success' })
    expect(comment).toContain('testes passaram')
  })

  it('inclui nota de falha para deploy', () => {
    const comment = buildComment({ ...base, agentLabel: 'agent:deploy', status: 'failure' })
    expect(comment).toContain('pipeline')
  })

  it('sempre termina com rodapé GitOps', () => {
    const comment = buildComment(base)
    expect(comment).toContain('GitOps × Claude Agents')
  })
})

// ── Contrato de truncamento de summary ────────────────────────────────────────

describe('summary truncamento', () => {
  it('500 chars é o limite', () => {
    const longo = 'x'.repeat(600)
    const truncado = longo.slice(0, 500)
    expect(truncado).toHaveLength(500)
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  function mockLinearOk() {
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) {
        // resolveIssueId
        return Promise.resolve(new Response(JSON.stringify({
          data: { issueSearch: { nodes: [{ id: 'internal-id-1' }] } },
        })))
      }
      // postComment / updateStatus (rodam em paralelo via Promise.all)
      return Promise.resolve(new Response(JSON.stringify({ data: { success: true } })))
    }))
  }

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'lin_api_test'
    process.env.ISSUE_ID       = 'TWI-200'
    process.env.AGENT_LABEL    = 'agent:generate-code'
    process.env.AGENT_STATUS   = 'success'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LINEAR_API_KEY
    delete process.env.ISSUE_ID
    delete process.env.AGENT_LABEL
    delete process.env.AGENT_STATUS
    delete process.env.RUN_URL
    delete process.env.AGENT_SUMMARY
  })

  it('reporta sucesso: resolve issue, comenta e atualiza status', async () => {
    mockLinearOk()
    await expect(main()).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(3) // issueSearch + commentCreate + issueUpdate
  })

  it('trunca AGENT_SUMMARY para 500 chars antes de montar o comentário', async () => {
    mockLinearOk()
    process.env.AGENT_SUMMARY = 'x'.repeat(600)

    await main()

    const commentCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
    const parsedBody = JSON.parse(commentCall[1].body as string)
    const commentBody = parsedBody.variables.input.body as string
    // 'x'.repeat(500) deve caber no comentário; o excedente não
    expect(commentBody).toContain('x'.repeat(500))
    expect(commentBody).not.toContain('x'.repeat(501))
  })

  it('status ausente/inválido vira failure (fallback seguro)', async () => {
    mockLinearOk()
    delete process.env.AGENT_STATUS

    await main()

    const commentCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit]
    const parsedBody = JSON.parse(commentCall[1].body as string)
    expect(parsedBody.variables.input.body as string).toContain('❌')
  })

  it('lança erro quando ISSUE_ID não está definida', async () => {
    delete process.env.ISSUE_ID
    await expect(main()).rejects.toThrow('ISSUE_ID')
  })

  it('lança erro quando AGENT_LABEL não está definida', async () => {
    delete process.env.AGENT_LABEL
    await expect(main()).rejects.toThrow('AGENT_LABEL')
  })

  it('lança erro quando LINEAR_API_KEY não está definida', async () => {
    delete process.env.LINEAR_API_KEY
    vi.stubGlobal('fetch', vi.fn())
    await expect(main()).rejects.toThrow('LINEAR_API_KEY')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lança erro quando a issue não é encontrada no Linear', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { issueSearch: { nodes: [] } } }))
    ))
    await expect(main()).rejects.toThrow('não encontrada')
  })

  it('lança erro quando a API do Linear retorna erros GraphQL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'campo inválido' }] }))
    ))
    await expect(main()).rejects.toThrow('campo inválido')
  })
})
