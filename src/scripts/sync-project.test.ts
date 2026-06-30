import { describe, it, expect } from 'vitest'
import {
  generateWorkplan,
  generateEpicDoc,
  generateSprintDoc,
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
