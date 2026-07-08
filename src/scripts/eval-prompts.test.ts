import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

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

import { readFile } from 'fs/promises'
import {
  extractPrompts,
  evaluatePrompt,
  evaluateWorkflow,
  PROMPT_CONTRACTS,
  main,
  type PromptRecord,
} from './eval-prompts'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

function fixtureYaml(prompts: Record<string, string>): string {
  const lines: string[] = ['          if [ -n "$AGENT_PROMPT" ]; then', '            CLAUDE_PROMPT="$AGENT_PROMPT"']
  let first = true
  for (const [label, prompt] of Object.entries(prompts)) {
    if (label === 'skill:*') {
      lines.push('          elif [[ "$AGENT_LABEL" == skill:* ]]; then')
    } else if (label === 'default') {
      lines.push('          else')
    } else {
      lines.push(`          elif [ "$AGENT_LABEL" = "${label}" ]; then`)
    }
    lines.push(`            CLAUDE_PROMPT="${prompt}"`)
    first = false
  }
  void first
  lines.push('          fi')
  return lines.join('\n')
}

// ── extractPrompts ────────────────────────────────────────────────────────────

describe('extractPrompts', () => {
  it('extrai label e prompt de cada bloco elif', () => {
    const yaml = fixtureYaml({
      'agent:run-tests': 'Run tests for ${ISSUE_ID}',
      'agent:deploy': 'Deploy for ${ISSUE_ID}',
    })
    const records = extractPrompts(yaml)
    expect(records).toEqual([
      { label: 'agent:run-tests', prompt: 'Run tests for ${ISSUE_ID}' },
      { label: 'agent:deploy', prompt: 'Deploy for ${ISSUE_ID}' },
    ])
  })

  it('ignora a branch de override manual (AGENT_PROMPT explícito)', () => {
    const yaml = fixtureYaml({ 'agent:run-tests': 'Run tests for ${ISSUE_ID}' })
    const records = extractPrompts(yaml)
    expect(records.some(r => r.prompt === '$AGENT_PROMPT')).toBe(false)
  })

  it('reconhece o branch skill:* e o fallback default (else)', () => {
    const yaml = fixtureYaml({
      'skill:*': 'Execute skill for ${ISSUE_ID}',
      default: 'Execute task for ${ISSUE_ID}',
    })
    const records = extractPrompts(yaml)
    expect(records.map(r => r.label)).toEqual(['skill:*', 'default'])
  })

  it('retorna lista vazia quando não há nenhum CLAUDE_PROMPT', () => {
    expect(extractPrompts('nada aqui\nnem aqui')).toEqual([])
  })
})

// ── evaluatePrompt ────────────────────────────────────────────────────────────

describe('evaluatePrompt', () => {
  it('sem findings quando o prompt cumpre o contrato', () => {
    const record: PromptRecord = {
      label: 'agent:generate-code',
      prompt: 'Read ${ISSUE_ID}. Branch agent/x. PR body starts with agent-created: true',
    }
    expect(evaluatePrompt(record)).toEqual([])
  })

  it('finding quando falta referência a ${ISSUE_ID}', () => {
    const record: PromptRecord = { label: 'agent:run-tests', prompt: 'Run the tests, no id here' }
    const findings = evaluatePrompt(record)
    expect(findings.some(f => f.issue.includes('ISSUE_ID'))).toBe(true)
  })

  it('finding quando label requer branch prefix e não menciona agent/', () => {
    const record: PromptRecord = { label: 'agent:generate-code', prompt: 'Read ${ISSUE_ID}. PR body: agent-created: true' }
    const findings = evaluatePrompt(record)
    expect(findings.some(f => f.issue.includes('agent/'))).toBe(true)
  })

  it('finding quando label requer PR marker e não menciona agent-created: true', () => {
    const record: PromptRecord = { label: 'agent:generate-code', prompt: 'Read ${ISSUE_ID}. Branch agent/x.' }
    const findings = evaluatePrompt(record)
    expect(findings.some(f => f.issue.includes('agent-created: true'))).toBe(true)
  })

  it('não exige branch/PR marker para labels read-only (ex: agent:run-tests)', () => {
    const record: PromptRecord = { label: 'agent:run-tests', prompt: 'Run tests for ${ISSUE_ID}, no branch mentioned' }
    expect(evaluatePrompt(record)).toEqual([])
  })

  it('finding quando prompt excede o tamanho máximo do contrato', () => {
    const record: PromptRecord = {
      label: 'agent:run-tests',
      prompt: '${ISSUE_ID} ' + 'x'.repeat(600),
    }
    const findings = evaluatePrompt(record)
    expect(findings.some(f => f.issue.includes('acima do limite'))).toBe(true)
  })

  it('finding único quando o prompt está vazio', () => {
    const findings = evaluatePrompt({ label: 'agent:run-tests', prompt: '' })
    expect(findings).toEqual([{ label: 'agent:run-tests', issue: 'prompt vazio' }])
  })

  it('finding quando o label não tem contrato definido', () => {
    const findings = evaluatePrompt({ label: 'agent:label-novo-sem-contrato', prompt: 'qualquer coisa ${ISSUE_ID}' })
    expect(findings[0].issue).toContain('sem contrato definido')
  })
})

// ── evaluateWorkflow ──────────────────────────────────────────────────────────

describe('evaluateWorkflow', () => {
  it('detecta drift: contrato existe mas o label sumiu do workflow', () => {
    // Fixture só com um label — todos os outros contratos (run-tests, deploy, etc.) ficam "órfãos"
    const yaml = fixtureYaml({
      'agent:generate-code': 'Read ${ISSUE_ID}. Branch agent/x. PR body: agent-created: true',
    })
    const findings = evaluateWorkflow(yaml)
    const missingLabels = Object.keys(PROMPT_CONTRACTS).filter(l => l !== 'agent:generate-code')
    for (const label of missingLabels) {
      expect(findings.some(f => f.label === label && f.issue.includes('drift'))).toBe(true)
    }
  })

  it('sem findings quando todos os labels do contrato estão presentes e válidos', () => {
    const yaml = fixtureYaml({
      'agent:generate-code':   'Read ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
      'agent:create-specs':    'Read ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
      'agent:security-review': 'Review for ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
      'agent:run-tests':       'Run tests for ${ISSUE_ID}',
      'agent:deploy':          'Deploy for ${ISSUE_ID}',
      'agent:code-review':     'Review PR for ${ISSUE_ID}',
      'agent:suggest-tests':   'Suggest tests for ${ISSUE_ID}',
      'agent:generate-tests':  'Write tests for ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
      'skill:*':               'Execute skill for ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
      default:                 'Execute task for ${ISSUE_ID}. Branch agent/x. PR: agent-created: true',
    })
    expect(evaluateWorkflow(yaml)).toEqual([])
  })

  it('passa no contrato para o gitops.yml real do repositório', async () => {
    const realYaml = await readFile(`${ROOT}/.github/workflows/gitops.yml`, 'utf8')
    const findings = evaluateWorkflow(realYaml)
    expect(findings).toEqual([])
  })
})

// ── main() ───────────────────────────────────────────────────────────────────

describe('main()', () => {
  afterEach(() => {
    process.exitCode = undefined
    state.override = null
  })

  it('não seta exitCode quando o gitops.yml real passa no contrato', async () => {
    await main()
    expect(process.exitCode).toBeUndefined()
  })

  it('seta exitCode 1 quando há findings', async () => {
    state.override = 'sem nenhum CLAUDE_PROMPT aqui' // gera N findings de drift (labels ausentes)

    await main()

    expect(process.exitCode).toBe(1)
  })
})
