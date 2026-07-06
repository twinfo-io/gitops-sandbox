import { describe, it, expect } from 'vitest'
import { parsePRBody } from './parse-pr'

describe('parsePRBody', () => {
  it('extrai todos os campos de um PR completo', () => {
    const body = `LINEAR_ID: TWI-123
TYPE: feature
TITLE: Minha feature
EPIC: meu-epic
REASON: Porque precisa
AGENTS: agent:generate-code, agent:run-tests

<!-- agent-created: true -->`

    const result = parsePRBody(body)

    expect(result.linearId).toBe('TWI-123')
    expect(result.type).toBe('FEATURE')
    expect(result.title).toBe('Minha feature')
    expect(result.epic).toBe('meu-epic')
    expect(result.reason).toBe('Porque precisa')
    expect(result.agents).toEqual(['agent:generate-code', 'agent:run-tests'])
    expect(result.isAgentCreated).toBe(true)
    expect(result.isStealth).toBe(false)
  })

  it('retorna null para campos ausentes', () => {
    const result = parsePRBody('')

    expect(result.linearId).toBeNull()
    expect(result.type).toBeNull()
    expect(result.title).toBeNull()
    expect(result.epic).toBeNull()
    expect(result.reason).toBeNull()
    expect(result.agents).toEqual([])
    expect(result.isAgentCreated).toBe(false)
    expect(result.isStealth).toBe(false)
  })

  it('trata campo vazio (só espaços) como null', () => {
    const body = 'LINEAR_ID:   \nTYPE: bug'
    const result = parsePRBody(body)

    expect(result.linearId).toBeNull()
    expect(result.type).toBe('BUG')
  })

  it('campo vazio sem nenhum espaço não rouba o valor do campo seguinte', () => {
    // Regressão: [\s]* no lugar de [ \t]* cruzava a quebra de linha e o LINEAR_ID
    // vazio "roubava" o valor de TYPE.
    const body = 'LINEAR_ID:\nTYPE: bug'
    const result = parsePRBody(body)

    expect(result.linearId).toBeNull()
    expect(result.type).toBe('BUG')
  })

  it('ignora TYPE inválido (não está no enum)', () => {
    const body = 'TYPE: not-a-real-type'
    const result = parsePRBody(body)

    expect(result.type).toBeNull()
  })

  it('normaliza TYPE para uppercase', () => {
    expect(parsePRBody('TYPE: hotfix').type).toBe('HOTFIX')
    expect(parsePRBody('TYPE: Refactor').type).toBe('REFACTOR')
    expect(parsePRBody('TYPE: TASK').type).toBe('TASK')
  })

  it('filtra labels de AGENTS que não são agent:* reconhecidas', () => {
    const body = 'AGENTS: agent:generate-code, bug, random-text, agent:deploy'
    const result = parsePRBody(body)

    expect(result.agents).toEqual(['agent:generate-code', 'agent:deploy'])
  })

  it('aceita AGENTS separados só por espaço ou só por vírgula', () => {
    expect(parsePRBody('AGENTS: agent:run-tests agent:code-review').agents).toEqual([
      'agent:run-tests',
      'agent:code-review',
    ])
    expect(parsePRBody('AGENTS: agent:run-tests,agent:code-review').agents).toEqual([
      'agent:run-tests',
      'agent:code-review',
    ])
  })

  it('detecta isAgentCreated pelo marker no body', () => {
    expect(parsePRBody('<!-- agent-created: true -->\nresto do body').isAgentCreated).toBe(true)
    expect(parsePRBody('sem marker aqui').isAgentCreated).toBe(false)
  })

  it('detecta isStealth quando há title mas não há linearId', () => {
    expect(parsePRBody('TITLE: Demanda sem card').isStealth).toBe(true)
    expect(parsePRBody('LINEAR_ID: TWI-1\nTITLE: Tem card').isStealth).toBe(false)
    expect(parsePRBody('LINEAR_ID: TWI-1').isStealth).toBe(false) // sem title também não é stealth
  })

  it('não confunde valor de um campo com o de outro em linhas adjacentes', () => {
    const body = 'TITLE: Uma linha\nEPIC: outra-linha\nREASON: mais uma'
    const result = parsePRBody(body)

    expect(result.title).toBe('Uma linha')
    expect(result.epic).toBe('outra-linha')
    expect(result.reason).toBe('mais uma')
  })
})
