import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({ demandContent: '' }))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown, encoding?: unknown) => {
      if (String(path).includes('sync-config.json')) {
        return actual.readFile(path as string, encoding as BufferEncoding)
      }
      return state.demandContent
    }),
    writeFile: vi.fn(async () => undefined),
  }
})

import { readFile, writeFile } from 'fs/promises'
import { parseDemandFile, main } from './create-demand'

// ── parseDemandFile ───────────────────────────────────────────────────────────

describe('parseDemandFile', () => {
  function make(fields: Partial<Record<string, string>>): string {
    return Object.entries({
      LINEAR_ID: '',
      TITLE: '',
      TYPE: '',
      EPIC: '',
      REASON: '',
      ...fields,
    }).map(([k, v]) => `${k}: ${v}`).join('\n')
  }

  it('extrai todos os campos preenchidos', () => {
    const content = make({
      LINEAR_ID: '',
      TITLE: 'Corrige timeout no WebSocket',
      TYPE: 'BUG',
      EPIC: 'gorjeta-sorteios',
      REASON: 'Usuários perdem conexão após 30s',
    })
    const result = parseDemandFile(content)
    expect(result.title).toBe('Corrige timeout no WebSocket')
    expect(result.type).toBe('BUG')
    expect(result.epic).toBe('gorjeta-sorteios')
    expect(result.reason).toBe('Usuários perdem conexão após 30s')
    expect(result.linearId).toBeNull()
  })

  it('retorna linearId quando preenchido', () => {
    const content = make({ LINEAR_ID: 'TWI-186', TITLE: 'Título qualquer' })
    const result = parseDemandFile(content)
    expect(result.linearId).toBe('TWI-186')
  })

  it('type padrão é TASK quando ausente', () => {
    const content = make({ TITLE: 'Alguma tarefa', TYPE: '' })
    const result = parseDemandFile(content)
    expect(result.type).toBe('TASK')
  })

  it('campos opcionais retornam null quando vazios', () => {
    const content = make({ TITLE: 'Mínimo', EPIC: '', REASON: '' })
    const result = parseDemandFile(content)
    expect(result.epic).toBeNull()
    expect(result.reason).toBeNull()
  })

  it('lança erro quando TITLE ausente', () => {
    const content = make({ TITLE: '' })
    expect(() => parseDemandFile(content)).toThrow('TITLE')
  })

  it('ignora espaços extras ao redor dos valores', () => {
    const content = 'TITLE:   Meu título com espaços   \nTYPE: FEATURE'
    const result = parseDemandFile(content)
    expect(result.title).toBe('Meu título com espaços')
  })

  it('retorna linearId null quando campo está em branco', () => {
    const content = make({ TITLE: 'Qualquer coisa', LINEAR_ID: '' })
    const result = parseDemandFile(content)
    expect(result.linearId).toBeNull()
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  const ORIGINAL_ARGV2 = process.argv[2]

  function mockFetchByQuery(overrides: {
    epicNodes?: Array<{ id: string; identifier: string; title: string }>
    cycleNodes?: Array<{ id: string; name: string; number: number }>
    issueCreate?: { success: boolean; issue?: { id: string; identifier: string; url: string } }
  } = {}) {
    const {
      epicNodes = [{ id: 'epic-1', identifier: 'TWI-1', title: 'Meu Epic Legal' }],
      cycleNodes = [{ id: 'cycle-1', name: 'Sprint 5', number: 5 }],
      issueCreate = { success: true, issue: { id: 'issue-1', identifier: 'TWI-999', url: 'https://linear.app/x/twi-999' } },
    } = overrides

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const query = (JSON.parse(opts.body as string).query as string)
      if (query.includes('issues(filter')) {
        return Promise.resolve(new Response(JSON.stringify({ data: { issues: { nodes: epicNodes } } })))
      }
      if (query.includes('cycles(filter')) {
        return Promise.resolve(new Response(JSON.stringify({ data: { cycles: { nodes: cycleNodes } } })))
      }
      if (query.includes('issueCreate')) {
        return Promise.resolve(new Response(JSON.stringify({ data: { issueCreate } })))
      }
      return Promise.resolve(new Response(JSON.stringify({ data: {} })))
    }))
  }

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'lin_api_test'
    process.argv[2] = '/fake/demands/minha-demanda.md'
    vi.mocked(writeFile).mockClear()
    vi.mocked(readFile).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LINEAR_API_KEY
    process.argv[2] = ORIGINAL_ARGV2
  })

  it('cria a issue, atualiza o arquivo com o LINEAR_ID e escreve no stdout', async () => {
    state.demandContent = 'LINEAR_ID:\nTITLE: Minha demanda\nTYPE: BUG\nEPIC: meu-epic-legal\nREASON: motivo qualquer'
    mockFetchByQuery()

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main()

    expect(writeSpy).toHaveBeenCalledWith('TWI-999\n')
    expect(writeFile).toHaveBeenCalledOnce()
    const [, writtenContent] = vi.mocked(writeFile).mock.calls[0]
    expect(writtenContent as string).toContain('LINEAR_ID: TWI-999')

    writeSpy.mockRestore()
  })

  it('pula criação e retorna o LINEAR_ID existente se já estiver preenchido', async () => {
    state.demandContent = 'TITLE: Já tem card\nLINEAR_ID: TWI-42'
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.stubGlobal('fetch', vi.fn())

    await main()

    expect(writeSpy).toHaveBeenCalledWith('TWI-42\n')
    expect(fetch).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()

    writeSpy.mockRestore()
  })

  it('funciona sem EPIC (epicId null) e sem sprint ativo (cycleId null)', async () => {
    state.demandContent = 'TITLE: Demanda sem epic nem sprint'
    mockFetchByQuery({ cycleNodes: [] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main()

    expect(writeSpy).toHaveBeenCalledWith('TWI-999\n')
    writeSpy.mockRestore()
  })

  it('segue mesmo quando o epic informado não é encontrado', async () => {
    state.demandContent = 'TITLE: Demanda com epic inexistente\nEPIC: epic-que-nao-existe'
    mockFetchByQuery({ epicNodes: [] })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await main()

    expect(writeSpy).toHaveBeenCalledWith('TWI-999\n')
    writeSpy.mockRestore()
  })

  it('lança erro quando issueCreate retorna success: false', async () => {
    state.demandContent = 'TITLE: Vai falhar'
    mockFetchByQuery({ issueCreate: { success: false } })

    await expect(main()).rejects.toThrow('success: false')
  })

  it('encerra com exit code 1 quando nenhum arquivo é passado como argumento', async () => {
    process.argv[2] = ''
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit chamado')
    })

    await expect(main()).rejects.toThrow('process.exit chamado')
    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
  })
})
