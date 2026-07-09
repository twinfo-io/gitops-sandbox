import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({ specContent: '' }))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown, encoding?: unknown) => {
      if (String(path).includes('sync-config.json')) {
        return actual.readFile(path as string, encoding as BufferEncoding)
      }
      return state.specContent
    }),
    writeFile: vi.fn(async () => undefined),
  }
})

import { readFile, writeFile } from 'fs/promises'
import { parseEpicSpec, backfillIds, createLinearIssue, main } from './slice-epic'

const SAMPLE = `EPIC_LINEAR_ID:
EPIC_TITLE: Sistema de notificações push
EPIC_TYPE: FEATURE
EPIC_REASON: Retenção caindo

## Story: Configurar provider de push
STORY_LINEAR_ID:
TYPE: FEATURE
REASON: Sem provider não dá pra enviar nada
AGENTS: agent:generate-code

## Story: Endpoint de subscribe/unsubscribe
STORY_LINEAR_ID:
TYPE: FEATURE
REASON: Usuário precisa poder optar
AGENTS: agent:generate-code, agent:suggest-tests
`

// ── parseEpicSpec ─────────────────────────────────────────────────────────────

describe('parseEpicSpec', () => {
  it('extrai campos do épico e todas as histórias', () => {
    const result = parseEpicSpec(SAMPLE)

    expect(result.epic.title).toBe('Sistema de notificações push')
    expect(result.epic.type).toBe('FEATURE')
    expect(result.epic.reason).toBe('Retenção caindo')
    expect(result.epic.linearId).toBeNull()

    expect(result.stories).toHaveLength(2)
    expect(result.stories[0].title).toBe('Configurar provider de push')
    expect(result.stories[0].agents).toEqual(['agent:generate-code'])
    expect(result.stories[1].title).toBe('Endpoint de subscribe/unsubscribe')
    expect(result.stories[1].agents).toEqual(['agent:generate-code', 'agent:suggest-tests'])
  })

  it('lança erro quando EPIC_TITLE está ausente', () => {
    expect(() => parseEpicSpec('EPIC_TYPE: FEATURE')).toThrow('EPIC_TITLE')
  })

  it('funciona com zero histórias (só o épico)', () => {
    const content = 'EPIC_TITLE: Épico solo\nEPIC_REASON: motivo'
    const result = parseEpicSpec(content)
    expect(result.epic.title).toBe('Épico solo')
    expect(result.stories).toEqual([])
  })

  it('EPIC_TYPE padrão é FEATURE quando ausente', () => {
    const result = parseEpicSpec('EPIC_TITLE: Sem tipo')
    expect(result.epic.type).toBe('FEATURE')
  })

  it('retorna EPIC_LINEAR_ID quando já preenchido', () => {
    const content = 'EPIC_LINEAR_ID: TWI-400\nEPIC_TITLE: Já existe'
    const result = parseEpicSpec(content)
    expect(result.epic.linearId).toBe('TWI-400')
  })

  it('detecta STORY_LINEAR_ID já preenchido numa história', () => {
    const content = `EPIC_TITLE: Épico
## Story: Já criada
STORY_LINEAR_ID: TWI-401
TYPE: FEATURE`
    const result = parseEpicSpec(content)
    expect(result.stories[0].linearId).toBe('TWI-401')
  })

  it('filtra labels de AGENTS que não são agent:* reconhecidas', () => {
    const content = `EPIC_TITLE: Épico
## Story: Uma história
AGENTS: agent:generate-code, bug, random-text`
    const result = parseEpicSpec(content)
    expect(result.stories[0].agents).toEqual(['agent:generate-code'])
  })

  it('REASON e AGENTS ausentes retornam null/vazio, não quebram o parser', () => {
    const content = `EPIC_TITLE: Épico
## Story: Sem reason nem agents
TYPE: BUG`
    const result = parseEpicSpec(content)
    expect(result.stories[0].reason).toBeNull()
    expect(result.stories[0].agents).toEqual([])
  })
})

// ── backfillIds ───────────────────────────────────────────────────────────────

describe('backfillIds', () => {
  it('preenche EPIC_LINEAR_ID e STORY_LINEAR_ID de cada história', () => {
    const updated = backfillIds(SAMPLE, 'TWI-400', ['TWI-401', 'TWI-402'])

    expect(updated).toContain('EPIC_LINEAR_ID: TWI-400')
    expect(updated).toContain('STORY_LINEAR_ID: TWI-401')
    expect(updated).toContain('STORY_LINEAR_ID: TWI-402')
  })

  it('não toca no EPIC_LINEAR_ID quando null é passado (já existia)', () => {
    const updated = backfillIds(SAMPLE, null, ['TWI-401', 'TWI-402'])
    expect(updated).toContain('EPIC_LINEAR_ID:\n') // continua vazio
  })

  it('pula histórias cujo identifier é null (já tinham ID, não precisam de rewrite)', () => {
    const updated = backfillIds(SAMPLE, 'TWI-400', [null, 'TWI-402'])
    expect(updated).toContain('STORY_LINEAR_ID:\n') // primeira história não foi tocada
    expect(updated).toContain('STORY_LINEAR_ID: TWI-402')
  })

  it('preserva o resto do conteúdo intacto', () => {
    const updated = backfillIds(SAMPLE, 'TWI-400', ['TWI-401', 'TWI-402'])
    expect(updated).toContain('Sistema de notificações push')
    expect(updated).toContain('Configurar provider de push')
    expect(updated).toContain('agent:suggest-tests')
  })
})

// ── createLinearIssue ─────────────────────────────────────────────────────────

describe('createLinearIssue', () => {
  beforeEach(() => { process.env.LINEAR_API_KEY = 'lin_api_test' })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LINEAR_API_KEY
  })

  it('cria issue sem parentId (épico) e retorna identifier/url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { issueCreate: { success: true, issue: { id: 'internal-1', identifier: 'TWI-400', url: 'https://linear.app/x/twi-400' } } },
    }))))

    const created = await createLinearIssue('Meu épico', 'FEATURE', 'motivo', 'team-1', 'proj-1', 'state-todo', null)

    expect(created.identifier).toBe('TWI-400')
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(opts.body as string)
    expect(body.variables.input.parentId).toBeUndefined()
  })

  it('cria issue COM parentId (história)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { issueCreate: { success: true, issue: { id: 'internal-2', identifier: 'TWI-401', url: 'https://linear.app/x/twi-401' } } },
    }))))

    await createLinearIssue('Minha história', 'FEATURE', 'motivo', 'team-1', 'proj-1', 'state-todo', 'internal-1')

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(opts.body as string)
    expect(body.variables.input.parentId).toBe('internal-1')
  })

  it('lança erro quando issueCreate retorna success: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { issueCreate: { success: false } },
    }))))

    await expect(
      createLinearIssue('Vai falhar', 'FEATURE', null, 'team-1', 'proj-1', 'state-todo', null)
    ).rejects.toThrow('success: false')
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  const ORIGINAL_ARGV2 = process.argv[2]

  function mockLinearCreate() {
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      const identifier = call === 1 ? 'TWI-400' : call === 2 ? 'TWI-401' : 'TWI-402'
      const id = `internal-${call}`
      return Promise.resolve(new Response(JSON.stringify({
        data: { issueCreate: { success: true, issue: { id, identifier, url: `https://linear.app/x/${identifier.toLowerCase()}` } } },
      })))
    }))
  }

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'lin_api_test'
    process.argv[2] = '/fake/docs/epic-specs/notificacoes.md'
    vi.mocked(writeFile).mockClear()
    vi.mocked(readFile).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LINEAR_API_KEY
    process.argv[2] = ORIGINAL_ARGV2
  })

  it('cria o épico e todas as histórias, reescreve o arquivo com os IDs', async () => {
    state.specContent = SAMPLE
    mockLinearCreate()

    await main()

    expect(writeFile).toHaveBeenCalledOnce()
    const [, writtenContent] = vi.mocked(writeFile).mock.calls[0]
    expect(writtenContent as string).toContain('EPIC_LINEAR_ID: TWI-400')
    expect(writtenContent as string).toContain('STORY_LINEAR_ID: TWI-401')
    expect(writtenContent as string).toContain('STORY_LINEAR_ID: TWI-402')
    expect(fetch).toHaveBeenCalledTimes(3) // 1 épico + 2 histórias
  })

  it('pula criação do épico quando EPIC_LINEAR_ID já preenchido, cria só histórias novas', async () => {
    state.specContent = SAMPLE.replace('EPIC_LINEAR_ID:', 'EPIC_LINEAR_ID: TWI-400')

    // primeira chamada = issueSearch pra achar o id interno do épico existente, depois 2 criações de história
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) {
        return Promise.resolve(new Response(JSON.stringify({ data: { issueSearch: { nodes: [{ id: 'internal-epic' }] } } })))
      }
      const identifier = call === 2 ? 'TWI-401' : 'TWI-402'
      return Promise.resolve(new Response(JSON.stringify({
        data: { issueCreate: { success: true, issue: { id: `internal-${call}`, identifier, url: 'https://x' } } },
      })))
    }))

    await main()

    expect(fetch).toHaveBeenCalledTimes(3) // 1 busca do épico existente + 2 histórias
    const [, writtenContent] = vi.mocked(writeFile).mock.calls[0]
    expect(writtenContent as string).not.toContain('EPIC_LINEAR_ID: TWI-400\nEPIC_LINEAR_ID')
  })

  it('não recria nada quando épico e todas as histórias já têm ID (idempotente)', async () => {
    state.specContent = SAMPLE
      .replace('EPIC_LINEAR_ID:', 'EPIC_LINEAR_ID: TWI-400')
      .replaceAll('STORY_LINEAR_ID:', 'STORY_LINEAR_ID: TWI-999')

    vi.stubGlobal('fetch', vi.fn())

    await main()

    expect(fetch).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('cria só a história nova quando o arquivo já tem uma história com ID e outra sem', async () => {
    state.specContent = SAMPLE
      .replace('EPIC_LINEAR_ID:', 'EPIC_LINEAR_ID: TWI-400')
      .replace('STORY_LINEAR_ID:\nTYPE: FEATURE\nREASON: Sem provider não dá pra enviar nada', 'STORY_LINEAR_ID: TWI-401\nTYPE: FEATURE\nREASON: Sem provider não dá pra enviar nada')

    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++
      if (call === 1) {
        return Promise.resolve(new Response(JSON.stringify({ data: { issueSearch: { nodes: [{ id: 'internal-epic' }] } } })))
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: { issueCreate: { success: true, issue: { id: 'internal-x', identifier: 'TWI-402', url: 'https://x' } } },
      })))
    }))

    await main()

    expect(fetch).toHaveBeenCalledTimes(2) // busca do épico + 1 história nova só
  })

  it('encerra com exitCode 1 quando nenhum arquivo é passado como argumento', async () => {
    process.argv[2] = ''
    await main()
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  it('lança erro quando LINEAR_API_KEY não está definida (config lida, mas API bloqueia)', async () => {
    delete process.env.LINEAR_API_KEY
    state.specContent = SAMPLE
    mockLinearCreate()
    await expect(main()).rejects.toThrow('LINEAR_API_KEY')
  })
})
