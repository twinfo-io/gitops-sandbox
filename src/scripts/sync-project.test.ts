import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({ specsContent: '# Specs de teste' }))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown, encoding?: unknown) => {
      if (String(path).includes('sync-config.json')) {
        return actual.readFile(path as string, encoding as BufferEncoding)
      }
      return state.specsContent
    }),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
  }
})

import { readFile, writeFile, mkdir } from 'fs/promises'
import {
  generateWorkplan,
  generateEpicDoc,
  generateSprintDoc,
  pull,
  push,
  main,
  type LinearIssue,
  type SyncConfig,
} from './sync-project'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const config: SyncConfig = {
  projectName: 'GitOps Sandbox',
  linear: { teamId: 't1', projectId: 'p1', states: { done: 's-done', todo: 's-todo', inProgress: 's-prog', backlog: 's-backlog' } },
  git: { botName: 'GitOps Bot', botEmail: 'bot@twinfo.io', mainBranch: 'main' },
  paths: { specs: '.specs/SPECS.md', workplan: '.specs/WORKPLAN.md', demands: 'docs/demands/', epics: 'docs/epics/', sprints: 'docs/sprints/' },
}

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'id-1',
    identifier: 'TWI-100',
    title: 'Issue de teste',
    description: null,
    state: { name: 'Todo', type: 'started' },
    priority: 3,
    parent: null,
    labels: { nodes: [] },
    assignee: null,
    cycle: null,
    dueDate: null,
    ...overrides,
  }
}

// ── generateWorkplan ──────────────────────────────────────────────────────────

describe('generateWorkplan', () => {
  it('contém cabeçalho com nome do projeto', () => {
    const result = generateWorkplan(config, [], null)
    expect(result).toContain('GitOps Sandbox')
  })

  it('lista issues agrupadas por estado', () => {
    const issues = [
      issue({ identifier: 'TWI-1', title: 'Primeira', state: { name: 'In Progress', type: 'started' } }),
      issue({ identifier: 'TWI-2', title: 'Segunda', state: { name: 'Todo', type: 'unstarted' } }),
    ]
    const result = generateWorkplan(config, issues, null)
    expect(result).toContain('In Progress')
    expect(result).toContain('TWI-1')
    expect(result).toContain('Todo')
    expect(result).toContain('TWI-2')
  })

  it('mostra nome do sprint quando fornecido', () => {
    const result = generateWorkplan(config, [], 'Sprint 3')
    expect(result).toContain('Sprint 3')
  })

  it('issue concluída tem [x]', () => {
    const done = issue({ state: { name: 'Done', type: 'completed' } })
    const result = generateWorkplan(config, [done], null)
    expect(result).toContain('[x]')
  })

  it('issue não concluída tem [ ]', () => {
    const todo = issue({ state: { name: 'Todo', type: 'unstarted' } })
    const result = generateWorkplan(config, [todo], null)
    expect(result).toContain('[ ]')
  })

  it('mostra assignee quando presente', () => {
    const assigned = issue({ assignee: { displayName: 'Garibaldi' } })
    const result = generateWorkplan(config, [assigned], null)
    expect(result).toContain('@Garibaldi')
  })

  it('mostra due date quando presente', () => {
    const withDue = issue({ dueDate: '2026-07-18' })
    const result = generateWorkplan(config, [withDue], null)
    expect(result).toContain('2026-07-18')
  })

  it('lista vazia não quebra', () => {
    expect(() => generateWorkplan(config, [], null)).not.toThrow()
  })
})

// ── generateEpicDoc ───────────────────────────────────────────────────────────

describe('generateEpicDoc', () => {
  it('contém identifier e título do epic', () => {
    const epic = issue({ identifier: 'TWI-50', title: 'Epic Principal' })
    const result = generateEpicDoc(epic, [])
    expect(result).toContain('TWI-50')
    expect(result).toContain('Epic Principal')
  })

  it('lista sub-issues filhas', () => {
    const epic  = issue({ identifier: 'TWI-50', title: 'Epic' })
    const child = issue({ identifier: 'TWI-51', title: 'Sub-issue', parent: { identifier: 'TWI-50', title: 'Epic' } })
    const result = generateEpicDoc(epic, [epic, child])
    expect(result).toContain('TWI-51')
    expect(result).toContain('Sub-issue')
  })

  it('sem filhos exibe mensagem vazia', () => {
    const epic = issue({ identifier: 'TWI-50', title: 'Epic Vazio' })
    const result = generateEpicDoc(epic, [epic])
    expect(result).toContain('Nenhuma sub-issue')
  })

  it('sub-issue concluída tem [x]', () => {
    const epic  = issue({ identifier: 'TWI-50', title: 'Epic' })
    const child = issue({
      identifier: 'TWI-51',
      title: 'Sub done',
      state: { name: 'Done', type: 'completed' },
      parent: { identifier: 'TWI-50', title: 'Epic' },
    })
    const result = generateEpicDoc(epic, [epic, child])
    expect(result).toContain('[x]')
  })
})

// ── generateSprintDoc ─────────────────────────────────────────────────────────

describe('generateSprintDoc', () => {
  it('contém nome do sprint', () => {
    const result = generateSprintDoc('Sprint 5', [])
    expect(result).toContain('Sprint 5')
  })

  it('lista issues com identifier e título', () => {
    const issues = [
      issue({ identifier: 'TWI-10', title: 'Feature X' }),
      issue({ identifier: 'TWI-11', title: 'Bug Y' }),
    ]
    const result = generateSprintDoc('Sprint 1', issues)
    expect(result).toContain('TWI-10')
    expect(result).toContain('Feature X')
    expect(result).toContain('TWI-11')
  })

  it('mostra contagem de issues', () => {
    const issues = [issue(), issue({ identifier: 'TWI-101' })]
    const result = generateSprintDoc('Sprint X', issues)
    expect(result).toContain('2')
  })

  it('mostra prioridade', () => {
    const urgent = issue({ priority: 1 })
    const result = generateSprintDoc('Sprint', [urgent])
    expect(result).toContain('Urgent')
  })
})

// ── pull() / push() / main() ─────────────────────────────────────────────────

describe('pull() / push() / main()', () => {
  function mockFetchByQuery(overrides: {
    issues?: LinearIssue[]
    pullDocuments?: Array<{ id: string; title: string; content: string }>
    pushExistingDocs?: Array<{ id: string; title: string }>
  } = {}) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const query = JSON.parse(opts.body as string).query as string

      if (query.includes('issues {')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: {
            project: {
              name: 'GitOps Sandbox',
              issues: { nodes: overrides.issues ?? [] },
              documents: { nodes: overrides.pullDocuments ?? [] },
            },
          },
        })))
      }
      if (query.includes('documentUpdate')) {
        return Promise.resolve(new Response(JSON.stringify({ data: { documentUpdate: { success: true } } })))
      }
      if (query.includes('documentCreate')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: { documentCreate: { success: true, document: { id: 'doc-1', title: 'Especificação Técnica' } } },
        })))
      }
      if (query.includes('documents { nodes { id title } }')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: { project: { documents: { nodes: overrides.pushExistingDocs ?? [] } } },
        })))
      }
      return Promise.resolve(new Response(JSON.stringify({ data: {} })))
    }))
  }

  const ORIGINAL_ARGV2 = process.argv[2]

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'lin_api_test'
    vi.mocked(writeFile).mockClear()
    vi.mocked(mkdir).mockClear()
    vi.mocked(readFile).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.LINEAR_API_KEY
    process.argv[2] = ORIGINAL_ARGV2
  })

  describe('pull()', () => {
    it('escreve WORKPLAN.md, docs de epic e sprint ativo', async () => {
      const epic  = issue({ identifier: 'TWI-50', title: 'Epic Principal', parent: null })
      const child = issue({ identifier: 'TWI-51', title: 'Sub-issue', parent: { identifier: 'TWI-50', title: 'Epic Principal' } })
      mockFetchByQuery({ issues: [epic, child] })

      await pull(config)

      expect(mkdir).toHaveBeenCalledTimes(2) // epics dir + sprints dir
      const paths = vi.mocked(writeFile).mock.calls.map(c => String(c[0]))
      expect(paths.some(p => p.includes('WORKPLAN.md'))).toBe(true)
      expect(paths.some(p => p.includes('twi-50'))).toBe(true)
      expect(paths.some(p => p.includes('active.md'))).toBe(true)
    })

    it('sincroniza SPECS.md quando o documento existe no Linear', async () => {
      mockFetchByQuery({
        issues: [],
        pullDocuments: [{ id: 'doc-1', title: 'SPECS', content: '# Spec do Linear' }],
      })

      await pull(config)

      const specsCall = vi.mocked(writeFile).mock.calls.find(c => String(c[0]).includes('SPECS.md'))
      expect(specsCall?.[1]).toBe('# Spec do Linear')
    })

    it('não escreve SPECS.md quando não há documento correspondente no Linear', async () => {
      mockFetchByQuery({ issues: [], pullDocuments: [] })

      await pull(config)

      const specsCall = vi.mocked(writeFile).mock.calls.find(c => String(c[0]).includes('SPECS.md'))
      expect(specsCall).toBeUndefined()
    })

    it('usa cycle ativo para filtrar issues do sprint quando existe', async () => {
      const inCycle    = issue({ identifier: 'TWI-1', cycle: { name: 'Sprint 7', number: 7 } })
      const otherCycle = issue({ identifier: 'TWI-2', cycle: { name: 'Sprint 6', number: 6 } })
      mockFetchByQuery({ issues: [inCycle, otherCycle] })

      await pull(config)

      const sprintCall = vi.mocked(writeFile).mock.calls.find(c => String(c[0]).includes('active.md'))
      expect(sprintCall?.[1] as string).toContain('TWI-1')
      expect(sprintCall?.[1] as string).not.toContain('TWI-2')
      expect(sprintCall?.[1] as string).toContain('Sprint 7')
    })
  })

  describe('push()', () => {
    it('atualiza documento existente quando já há SPECS/Especificação Técnica no Linear', async () => {
      state.specsContent = '# Conteúdo local'
      mockFetchByQuery({ pushExistingDocs: [{ id: 'doc-existing', title: 'SPECS' }] })

      await push(config)

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some(c => (JSON.parse((c[1] as RequestInit).body as string).query as string).includes('documentUpdate'))).toBe(true)
      expect(calls.some(c => (JSON.parse((c[1] as RequestInit).body as string).query as string).includes('documentCreate'))).toBe(false)
    })

    it('cria documento novo quando não existe SPECS no Linear', async () => {
      state.specsContent = '# Conteúdo local'
      mockFetchByQuery({ pushExistingDocs: [] })

      await push(config)

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some(c => (JSON.parse((c[1] as RequestInit).body as string).query as string).includes('documentCreate'))).toBe(true)
    })
  })

  describe('main()', () => {
    it('modo --pull roda só o pull', async () => {
      process.argv[2] = '--pull'
      mockFetchByQuery({ issues: [] })

      await main()

      expect(vi.mocked(writeFile).mock.calls.some(c => String(c[0]).includes('WORKPLAN.md'))).toBe(true)
    })

    it('modo --push roda só o push', async () => {
      process.argv[2] = '--push'
      state.specsContent = '# Specs'
      mockFetchByQuery({ pushExistingDocs: [{ id: 'doc-1', title: 'SPECS' }] })

      await main()

      expect(vi.mocked(writeFile).mock.calls.some(c => String(c[0]).includes('WORKPLAN.md'))).toBe(false)
    })

    it('modo --both roda pull e push', async () => {
      process.argv[2] = '--both'
      state.specsContent = '# Specs'
      mockFetchByQuery({ issues: [], pushExistingDocs: [] })

      await main()

      expect(vi.mocked(writeFile).mock.calls.some(c => String(c[0]).includes('WORKPLAN.md'))).toBe(true)
    })

    it('sem argumento usa --pull como default', async () => {
      process.argv.splice(2) // remove todos os args a partir do índice 2 → process.argv[2] === undefined
      mockFetchByQuery({ issues: [] })

      await main()

      expect(vi.mocked(writeFile).mock.calls.some(c => String(c[0]).includes('WORKPLAN.md'))).toBe(true)
    })

    it('modo inválido encerra com exit code 1', async () => {
      process.argv[2] = '--invalido'
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit chamado')
      })

      await expect(main()).rejects.toThrow('process.exit chamado')
      expect(exitSpy).toHaveBeenCalledWith(1)

      exitSpy.mockRestore()
    })
  })
})
