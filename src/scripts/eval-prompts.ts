/**
 * eval-prompts.ts — Eval estático dos prompts dinâmicos do gitops.yml
 *
 * Camada 1 (estática) do framework de certificação de prompts (TWI-300 / E7).
 * Extrai cada CLAUDE_PROMPT do workflow e valida contra um contrato por label:
 * referencia ${ISSUE_ID}, menciona convenção de branch/PR quando aplicável,
 * não está vazio nem gigante demais. Roda em CI, sem custo de token (não
 * chama nenhum modelo) — ver eval-prompts-llm-judge.ts para a camada 2.
 *
 * Uso: npx tsx src/scripts/eval-prompts.ts
 */

import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const WORKFLOW_PATH = '.github/workflows/gitops.yml'

// ── Extração ──────────────────────────────────────────────────────────────────

export interface PromptRecord {
  label: string
  prompt: string
}

const LABEL_LINE_RE = /elif \[ "\$AGENT_LABEL" = "([^"]+)" \]; then/
const SKILL_LINE_RE = /elif \[\[ "\$AGENT_LABEL" == skill:\\?\*/
const ELSE_LINE_RE  = /^\s*else\s*$/
const PROMPT_LINE_RE = /CLAUDE_PROMPT="(.*)"\s*$/

export function extractPrompts(workflowYaml: string): PromptRecord[] {
  const records: PromptRecord[] = []
  let currentLabel: string | null = null

  for (const line of workflowYaml.split('\n')) {
    const labelMatch = LABEL_LINE_RE.exec(line)
    if (labelMatch) {
      currentLabel = labelMatch[1]
      continue
    }
    if (SKILL_LINE_RE.test(line)) {
      currentLabel = 'skill:*'
      continue
    }
    if (ELSE_LINE_RE.test(line)) {
      currentLabel = 'default'
      continue
    }

    const promptMatch = PROMPT_LINE_RE.exec(line)
    // currentLabel é null na branch "if [ -n "$AGENT_PROMPT" ]" (override manual,
    // não é um prompt estático do contrato) — ignorada de propósito.
    if (promptMatch && currentLabel) {
      records.push({ label: currentLabel, prompt: promptMatch[1] })
      currentLabel = null
    }
  }

  return records
}

// ── Contrato por label ────────────────────────────────────────────────────────

export interface PromptContract {
  requiresIssueId: boolean
  requiresBranchPrefix: boolean // deve mencionar "agent/" (convenção obrigatória de branch)
  requiresPrMarker: boolean     // deve mencionar "agent-created: true" (marker obrigatório de PR)
  maxLength: number
}

export const PROMPT_CONTRACTS: Record<string, PromptContract> = {
  'agent:generate-code':   { requiresIssueId: true, requiresBranchPrefix: true,  requiresPrMarker: true,  maxLength: 1000 },
  'agent:create-specs':    { requiresIssueId: true, requiresBranchPrefix: true,  requiresPrMarker: true,  maxLength: 1000 },
  'agent:security-review': { requiresIssueId: true, requiresBranchPrefix: true,  requiresPrMarker: true,  maxLength: 1000 },
  'agent:run-tests':       { requiresIssueId: true, requiresBranchPrefix: false, requiresPrMarker: false, maxLength: 500 },
  'agent:deploy':          { requiresIssueId: true, requiresBranchPrefix: false, requiresPrMarker: false, maxLength: 500 },
  'agent:code-review':     { requiresIssueId: true, requiresBranchPrefix: false, requiresPrMarker: false, maxLength: 500 },
  'agent:suggest-tests':   { requiresIssueId: true, requiresBranchPrefix: false, requiresPrMarker: false, maxLength: 500 },
  'skill:*':               { requiresIssueId: true, requiresBranchPrefix: true,  requiresPrMarker: true,  maxLength: 500 },
  default:                 { requiresIssueId: true, requiresBranchPrefix: true,  requiresPrMarker: true,  maxLength: 500 },
}

// ── Avaliação ─────────────────────────────────────────────────────────────────

export interface EvalFinding {
  label: string
  issue: string
}

export function evaluatePrompt(record: PromptRecord): EvalFinding[] {
  const contract = PROMPT_CONTRACTS[record.label]
  const findings: EvalFinding[] = []

  if (!contract) {
    return [{ label: record.label, issue: 'label sem contrato definido em PROMPT_CONTRACTS — atualize eval-prompts.ts' }]
  }

  if (record.prompt.trim().length === 0) {
    return [{ label: record.label, issue: 'prompt vazio' }]
  }

  if (contract.requiresIssueId && !record.prompt.includes('${ISSUE_ID')) {
    findings.push({ label: record.label, issue: 'não referencia ${ISSUE_ID} — agent pode perder contexto de qual issue processar' })
  }

  if (contract.requiresBranchPrefix && !record.prompt.includes('agent/')) {
    findings.push({ label: record.label, issue: 'não menciona prefixo de branch "agent/" — viola convenção obrigatória do CLAUDE.md' })
  }

  if (contract.requiresPrMarker && !record.prompt.includes('agent-created: true')) {
    findings.push({ label: record.label, issue: 'não menciona o marker "agent-created: true" no body do PR — viola convenção obrigatória' })
  }

  if (record.prompt.length > contract.maxLength) {
    findings.push({ label: record.label, issue: `prompt tem ${record.prompt.length} chars, acima do limite de ${contract.maxLength} — considere decompor em subtarefas` })
  }

  return findings
}

export function evaluateWorkflow(workflowYaml: string): EvalFinding[] {
  const records = extractPrompts(workflowYaml)
  const seenLabels = new Set(records.map(r => r.label))

  const findings = records.flatMap(evaluatePrompt)

  // Detecta drift: contrato definido pra um label que sumiu do workflow (prompt removido/renomeado sem atualizar o eval)
  for (const label of Object.keys(PROMPT_CONTRACTS)) {
    if (!seenLabels.has(label)) {
      findings.push({ label, issue: 'contrato definido em PROMPT_CONTRACTS mas nenhum CLAUDE_PROMPT correspondente encontrado no gitops.yml — drift entre eval e workflow' })
    }
  }

  return findings
}

// ── CLI ────────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const workflowYaml = await readFile(join(ROOT, WORKFLOW_PATH), 'utf8')
  const findings = evaluateWorkflow(workflowYaml)

  if (findings.length === 0) {
    console.log('[eval-prompts] ✅ Todos os prompts passam no contrato estático.')
    return
  }

  console.error(`[eval-prompts] ❌ ${findings.length} finding(s):`)
  for (const f of findings) {
    console.error(`  - [${f.label}] ${f.issue}`)
  }
  process.exitCode = 1
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[eval-prompts] Erro:', (err as Error).message)
    process.exit(1)
  })
}
/* v8 ignore stop */
