import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({ diffOutput: '' }))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => state.diffOutput),
  }
})

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, appendFile: vi.fn(async () => undefined) }
})

import { execSync } from 'child_process'
import {
  getDiff,
  judgeSemanticMatch,
  buildSemanticComment,
  main,
  type SemanticVerdict,
} from './semantic-check'

function mockLinearIssueResponse(title: string, description: string | null) {
  return new Response(JSON.stringify({
    data: { issueSearch: { nodes: [{ title, description }] } },
  }))
}

function mockJudgeResponse(verdict: Partial<SemanticVerdict>) {
  return new Response(JSON.stringify({
    content: [{ type: 'text', text: JSON.stringify(verdict) }],
  }))
}

// ── getDiff ───────────────────────────────────────────────────────────────────

describe('getDiff', () => {
  it('roda git diff entre os branches remotos corretos', () => {
    state.diffOutput = 'diff --git a/foo.ts b/foo.ts\n+added line'
    const diff = getDiff('main', 'agent/twi-100-implementation')

    expect(execSync).toHaveBeenCalledWith(
      'git diff origin/main...origin/agent/twi-100-implementation',
      expect.anything()
    )
    expect(diff).toBe(state.diffOutput)
  })

  it('trunca diffs maiores que 40000 chars', () => {
    state.diffOutput = 'x'.repeat(50_000)
    const diff = getDiff('main', 'agent/twi-101-implementation')

    expect(diff.length).toBeLessThan(50_000)
    expect(diff).toContain('truncado')
  })
})

// ── judgeSemanticMatch ────────────────────────────────────────────────────────

describe('judgeSemanticMatch', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('faz parse do veredito JSON retornado pelo judge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJudgeResponse({ matches: true, mismatches: [] })
    ))

    const verdict = await judgeSemanticMatch('spec aqui', 'diff aqui', 'fake-key')

    expect(verdict.matches).toBe(true)
    expect(verdict.mismatches).toEqual([])
  })

  it('retorna mismatches quando o judge encontra divergência', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJudgeResponse({
        matches: false,
        mismatches: [{ claim: 'deve validar email', reality: 'não valida formato de email', severity: 'high' }],
      })
    ))

    const verdict = await judgeSemanticMatch('spec aqui', 'diff aqui', 'fake-key')

    expect(verdict.matches).toBe(false)
    expect(verdict.mismatches).toHaveLength(1)
    expect(verdict.mismatches[0].severity).toBe('high')
  })

  it('lança erro quando a API retorna status não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    await expect(judgeSemanticMatch('spec', 'diff', 'fake-key')).rejects.toThrow('401')
  })

  it('lança erro quando a resposta não é JSON válido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: 'text', text: 'isso não é json' }],
    }))))
    await expect(judgeSemanticMatch('spec', 'diff', 'fake-key')).rejects.toThrow('não é JSON válido')
  })
})

// ── buildSemanticComment ──────────────────────────────────────────────────────

describe('buildSemanticComment', () => {
  it('retorna null quando não há mismatches (sem ruído no Linear)', () => {
    expect(buildSemanticComment({ matches: true, mismatches: [] })).toBeNull()
  })

  it('monta comentário com aviso quando matches=false', () => {
    const comment = buildSemanticComment({
      matches: false,
      mismatches: [{ claim: 'validar email', reality: 'não valida', severity: 'high' }],
    })
    expect(comment).toContain('Possíveis divergências')
    expect(comment).toContain('validar email')
    expect(comment).toContain('[high]')
  })

  it('monta comentário informativo (sem bloquear) quando matches=true mas há mismatches baixos', () => {
    const comment = buildSemanticComment({
      matches: true,
      mismatches: [{ claim: 'nome de variável', reality: 'nome diferente', severity: 'low' }],
    })
    expect(comment).toContain('Nenhuma divergência que bloqueie')
  })

  it('sempre inclui o disclaimer de não-bloqueio', () => {
    const comment = buildSemanticComment({
      matches: false,
      mismatches: [{ claim: 'x', reality: 'y', severity: 'medium' }],
    })
    expect(comment).toContain('Não bloqueia o merge')
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  beforeEach(() => {
    process.env.ISSUE_ID = 'TWI-100'
    process.env.HEAD_BRANCH = 'agent/twi-100-implementation'
    process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key'
    process.env.LINEAR_API_KEY = 'fake-linear-key'
    state.diffOutput = '+ added a real change'
  })

  afterEach(() => {
    delete process.env.ISSUE_ID
    delete process.env.BASE_BRANCH
    delete process.env.HEAD_BRANCH
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.LINEAR_API_KEY
    delete process.env.GITHUB_OUTPUT
    vi.unstubAllGlobals()
  })

  it('lança erro quando ISSUE_ID não está definida', async () => {
    delete process.env.ISSUE_ID
    await expect(main()).rejects.toThrow('ISSUE_ID')
  })

  it('lança erro quando HEAD_BRANCH não está definida', async () => {
    delete process.env.HEAD_BRANCH
    await expect(main()).rejects.toThrow('HEAD_BRANCH')
  })

  it('lança erro quando ANTHROPIC_API_KEY não está definida', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(main()).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('lança erro quando LINEAR_API_KEY não está definida', async () => {
    delete process.env.LINEAR_API_KEY
    await expect(main()).rejects.toThrow('LINEAR_API_KEY')
  })

  it('busca a issue no Linear, roda o diff e chama o judge — fluxo feliz sem divergência', async () => {
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) return Promise.resolve(mockLinearIssueResponse('Feature X', 'Deve fazer Y'))
      return Promise.resolve(mockJudgeResponse({ matches: true, mismatches: [] }))
    }))

    await expect(main()).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('não lança erro mesmo quando há divergência — é informativo, não bloqueante', async () => {
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) return Promise.resolve(mockLinearIssueResponse('Feature X', 'Deve validar email'))
      return Promise.resolve(mockJudgeResponse({
        matches: false,
        mismatches: [{ claim: 'validar email', reality: 'não valida', severity: 'high' }],
      }))
    }))

    await expect(main()).resolves.toBeUndefined()
  })

  it('escreve semantic_comment no GITHUB_OUTPUT quando definido', async () => {
    const fsPromises = await import('fs/promises')
    const tmpFile = '/tmp/semantic-check-test-output'
    process.env.GITHUB_OUTPUT = tmpFile

    vi.stubGlobal('fetch', vi.fn().mockImplementation((..._args: unknown[]) => {
      return Promise.resolve(mockLinearIssueResponse('Feature X', 'Deve fazer Y'))
    }))
    // segunda chamada (judge) reaproveita o mesmo mock por simplicidade — retorna issue shape,
    // mas o que importa aqui é só verificar a escrita do output, não o conteúdo do veredito.
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) return Promise.resolve(mockLinearIssueResponse('Feature X', 'Deve fazer Y'))
      return Promise.resolve(mockJudgeResponse({ matches: true, mismatches: [] }))
    }))

    await main()

    expect(fsPromises.appendFile).toHaveBeenCalledWith(tmpFile, expect.stringContaining('semantic_comment'))
  })

  it('não lança quando a busca da issue falha — comportamento de main() propaga, wrapper no CLI é que não-bloqueia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erro', { status: 500 })))
    await expect(main()).rejects.toThrow()
  })
})
