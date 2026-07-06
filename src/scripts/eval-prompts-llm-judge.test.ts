import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const state = vi.hoisted(() => ({ override: null as string | null }))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown, encoding?: unknown) => {
      if (state.override !== null) return state.override
      return actual.readFile(path as string, encoding as BufferEncoding)
    }),
  }
})

import { judgePrompt, judgeAllPrompts, main, type JudgeVerdict } from './eval-prompts-llm-judge'
import type { PromptRecord } from './eval-prompts'

function mockAnthropicResponse(body: { clarityScore: number; safetyScore: number; concerns: string[] }) {
  return new Response(JSON.stringify({
    content: [{ type: 'text', text: JSON.stringify(body) }],
  }))
}

describe('judgePrompt', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('faz parse do JSON retornado pelo judge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockAnthropicResponse({ clarityScore: 5, safetyScore: 4, concerns: ['nenhuma preocupação real'] })
    ))

    const record: PromptRecord = { label: 'agent:generate-code', prompt: 'Read ${ISSUE_ID}. Branch agent/x.' }
    const verdict = await judgePrompt(record, 'fake-key')

    expect(verdict.label).toBe('agent:generate-code')
    expect(verdict.clarityScore).toBe(5)
    expect(verdict.safetyScore).toBe(4)
    expect(verdict.concerns).toEqual(['nenhuma preocupação real'])
  })

  it('substitui ${ISSUE_ID} por um valor sintético antes de enviar ao judge', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAnthropicResponse({ clarityScore: 5, safetyScore: 5, concerns: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const record: PromptRecord = { label: 'agent:run-tests', prompt: 'Run for ${ISSUE_ID} branch agent/${ISSUE_ID,,}-x' }
    await judgePrompt(record, 'fake-key')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const userMessage = body.messages[0].content as string
    expect(userMessage).toContain('TWI-000')
    expect(userMessage).toContain('twi-000')
    expect(userMessage).not.toContain('${ISSUE_ID}')
  })

  it('lança erro quando a API retorna status não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))

    const record: PromptRecord = { label: 'agent:run-tests', prompt: 'x ${ISSUE_ID}' }
    await expect(judgePrompt(record, 'fake-key')).rejects.toThrow('401')
  })

  it('lança erro quando a resposta do judge não é JSON válido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: 'text', text: 'isso não é json' }],
    }))))

    const record: PromptRecord = { label: 'agent:run-tests', prompt: 'x ${ISSUE_ID}' }
    await expect(judgePrompt(record, 'fake-key')).rejects.toThrow('não é JSON válido')
  })
})

describe('judgeAllPrompts', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('julga cada prompt extraído do workflow, na ordem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(mockAnthropicResponse({ clarityScore: 4, safetyScore: 4, concerns: [] }))
    ))

    const yaml = [
      '          elif [ "$AGENT_LABEL" = "agent:run-tests" ]; then',
      '            CLAUDE_PROMPT="Run for ${ISSUE_ID}"',
      '          elif [ "$AGENT_LABEL" = "agent:deploy" ]; then',
      '            CLAUDE_PROMPT="Deploy for ${ISSUE_ID}"',
    ].join('\n')

    const verdicts = await judgeAllPrompts(yaml, 'fake-key')
    expect(verdicts.map((v: JudgeVerdict) => v.label)).toEqual(['agent:run-tests', 'agent:deploy'])
  })
})

describe('main()', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'fake-key'
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    process.exitCode = undefined
    state.override = null
    vi.unstubAllGlobals()
  })

  it('lança erro quando ANTHROPIC_API_KEY não está definida', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(main()).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('não seta exitCode quando todos os scores são >= 3', async () => {
    state.override = '          elif [ "$AGENT_LABEL" = "agent:run-tests" ]; then\n            CLAUDE_PROMPT="Run for ${ISSUE_ID}"'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAnthropicResponse({ clarityScore: 5, safetyScore: 5, concerns: [] })))

    await main()

    expect(process.exitCode).toBeUndefined()
  })

  it('seta exitCode 1 quando algum score fica abaixo de 3', async () => {
    state.override = '          elif [ "$AGENT_LABEL" = "agent:run-tests" ]; then\n            CLAUDE_PROMPT="Run for ${ISSUE_ID}"'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockAnthropicResponse({ clarityScore: 2, safetyScore: 5, concerns: ['escopo ambíguo'] })))

    await main()

    expect(process.exitCode).toBe(1)
  })
})
