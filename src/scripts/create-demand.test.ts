import { describe, it, expect } from 'vitest'
import { parseDemandFile, type DemandFields } from './create-demand'

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
