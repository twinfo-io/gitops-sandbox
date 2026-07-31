import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const FAKE_SYNC_CONFIG = JSON.stringify({ linear: { projectId: 'proj-1' } })

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    appendFile: vi.fn(async () => undefined),
    readFile: vi.fn(async (path: string, ...args: unknown[]) => {
      if (typeof path === 'string' && path.endsWith('sync-config.json')) return FAKE_SYNC_CONFIG
      return actual.readFile(path, ...(args as []))
    }),
  }
})

import { checkMilestoneHealth, buildReconciliationReport, main } from './reconcile-linear'

function mockReconciliationResponse(milestones: Array<{ name: string; description: string; progress: number }>, unassigned: Array<{ identifier: string; title: string }>) {
  return new Response(JSON.stringify({
    data: {
      project: { milestones: { nodes: milestones } },
      issues: { nodes: unassigned },
    },
  }))
}

// ── checkMilestoneHealth ────────────────────────────────────────────────────────

describe('checkMilestoneHealth', () => {
  it('retorna null quando a descrição não alega entrega', () => {
    expect(checkMilestoneHealth({ name: 'Fase 3', description: 'Em andamento', progress: 20 })).toBeNull()
  })

  it('retorna null quando alega entrega e progresso está alto (>= 90%)', () => {
    expect(checkMilestoneHealth({ name: 'Fase 1', description: 'Tudo ✅ Entregue em 2026-06-26', progress: 100 })).toBeNull()
  })

  it('detecta suspeita: alega entrega ("✅") mas progresso baixo', () => {
    const finding = checkMilestoneHealth({ name: 'Fase 1', description: 'sync-config.json ✅. Entregue em 2026-06-26.', progress: 0 })
    expect(finding).not.toBeNull()
    expect(finding?.name).toBe('Fase 1')
    expect(finding?.reason).toContain('0%')
  })

  it('detecta suspeita via frase "Entregue em" mesmo sem emoji', () => {
    const finding = checkMilestoneHealth({ name: 'Fase 2', description: 'Entregue em 2026-06-26.', progress: 30 })
    expect(finding).not.toBeNull()
  })

  it('progresso exatamente no limiar (90%) não é suspeito', () => {
    expect(checkMilestoneHealth({ name: 'Fase X', description: 'Entregue em 2026-01-01', progress: 90 })).toBeNull()
  })

  it('progresso 89% (abaixo do limiar) é suspeito', () => {
    expect(checkMilestoneHealth({ name: 'Fase X', description: 'Entregue em 2026-01-01', progress: 89 })).not.toBeNull()
  })
})

// ── buildReconciliationReport ────────────────────────────────────────────────────

describe('buildReconciliationReport', () => {
  it('retorna null quando não há achados', () => {
    expect(buildReconciliationReport([], [])).toBeNull()
  })

  it('monta relatório com milestones suspeitos', () => {
    const report = buildReconciliationReport(
      [{ name: 'Fase 1', progress: 0, reason: 'descrição indica entrega mas progresso é 0%' }],
      []
    )
    expect(report).toContain('Fase 1')
    expect(report).toContain('progresso inconsistente')
  })

  it('monta relatório com issues sem assignee', () => {
    const report = buildReconciliationReport([], [{ identifier: 'TWI-1', title: 'Sem dono' }])
    expect(report).toContain('TWI-1')
    expect(report).toContain('sem assignee')
  })

  it('trunca lista de issues sem assignee em 20 + contador do resto', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ identifier: `TWI-${i}`, title: `Issue ${i}` }))
    const report = buildReconciliationReport([], many)
    expect(report).toContain('e mais 5')
  })

  it('sempre inclui o disclaimer de não-correção automática', () => {
    const report = buildReconciliationReport([{ name: 'Fase 1', progress: 0, reason: 'x' }], [])
    expect(report).toContain('não corrige sozinho')
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'fake-linear-key'
    delete process.env.GITHUB_STEP_SUMMARY
  })

  afterEach(() => {
    delete process.env.LINEAR_API_KEY
    delete process.env.GITHUB_STEP_SUMMARY
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('lança erro quando LINEAR_API_KEY não está definida', async () => {
    delete process.env.LINEAR_API_KEY
    await expect(main()).rejects.toThrow('LINEAR_API_KEY')
  })

  it('não lança quando não há drift', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockReconciliationResponse([{ name: 'Fase 3', description: 'em andamento', progress: 50 }], [])
    ))
    await expect(main()).resolves.toBeUndefined()
  })

  it('não lança mesmo quando encontra drift — é informativo, não bloqueante', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockReconciliationResponse(
        [{ name: 'Fase 1', description: '✅ Entregue em 2026-06-26', progress: 0 }],
        [{ identifier: 'TWI-1', title: 'Sem dono' }]
      )
    ))
    await expect(main()).resolves.toBeUndefined()
  })

  it('escreve no GITHUB_STEP_SUMMARY quando há drift e a env var está definida', async () => {
    const fsPromises = await import('fs/promises')
    process.env.GITHUB_STEP_SUMMARY = '/tmp/reconcile-test-summary'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockReconciliationResponse([{ name: 'Fase 1', description: 'Entregue em 2026-06-26', progress: 0 }], [])
    ))

    await main()

    expect(fsPromises.appendFile).toHaveBeenCalledWith('/tmp/reconcile-test-summary', expect.stringContaining('Fase 1'))
  })

  it('não escreve no GITHUB_STEP_SUMMARY quando não há drift', async () => {
    const fsPromises = await import('fs/promises')
    process.env.GITHUB_STEP_SUMMARY = '/tmp/reconcile-test-summary'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockReconciliationResponse([{ name: 'Fase 3', description: 'em andamento', progress: 50 }], [])
    ))

    await main()

    expect(fsPromises.appendFile).not.toHaveBeenCalled()
  })

  it('propaga erro quando a API do Linear retorna status não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erro', { status: 500 })))
    await expect(main()).rejects.toThrow('500')
  })

  it('propaga erro quando a API do Linear retorna erros GraphQL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'projeto não encontrado' }] }))
    ))
    await expect(main()).rejects.toThrow('projeto não encontrado')
  })
})
