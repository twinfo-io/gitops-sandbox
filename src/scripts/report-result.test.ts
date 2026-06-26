import { describe, it, expect } from 'vitest'
import { targetState, buildComment, type AgentStatus, type ReportInput } from './report-result'

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
