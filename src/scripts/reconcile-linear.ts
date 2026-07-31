/**
 * reconcile-linear.ts — Reconciliation de higiene do Linear (TWI-1114 / E22)
 *
 * Previne a recorrência do bug real encontrado em 2026-07-21: Fase 1 e Fase 2 do
 * projeto GitOps ficaram presas em 0% de progresso por semanas porque 9 issues
 * (TWI-153–161) estavam linkadas ao milestone mas nunca foram movidas pra Done,
 * mesmo com a entrega real já no repo. Nada varria e conciliava periodicamente —
 * o problema só foi achado por acaso. Este script roda via cron (gitops.yml) e
 * sinaliza (não corrige sozinho) esse tipo de drift.
 *
 * Uso: LINEAR_API_KEY=... npx tsx src/scripts/reconcile-linear.ts
 * (projectId vem de sync-config.json, mesmo padrão de report-result.ts)
 */

import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { postSlackAlert } from './slack'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

interface SyncConfig {
  linear: { projectId: string }
}

const DELIVERED_LANGUAGE_RE = /✅|entregue em/i
const SUSPICIOUS_PROGRESS_THRESHOLD = 90 // % — abaixo disso com linguagem de "entregue" é suspeito

export interface MilestoneRecord {
  name: string
  description: string
  progress: number
}

export interface UnassignedIssue {
  identifier: string
  title: string
}

export interface MilestoneFinding {
  name: string
  progress: number
  reason: string
}

// ── Linear API ────────────────────────────────────────────────────────────────

async function fetchReconciliationData(
  projectId: string,
  apiKey: string
): Promise<{ milestones: MilestoneRecord[]; unassigned: UnassignedIssue[] }> {
  const resp = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($projectId: String!) {
        project(id: $projectId) {
          milestones { nodes { name description progress } }
        }
        issues(filter: { project: { id: { eq: $projectId } }, assignee: { null: true } }, first: 50) {
          nodes { identifier title }
        }
      }`,
      variables: { projectId },
    }),
  })

  if (!resp.ok) throw new Error(`Linear API retornou ${resp.status}`)

  const json = (await resp.json()) as {
    data?: {
      project: { milestones: { nodes: MilestoneRecord[] } }
      issues: { nodes: UnassignedIssue[] }
    }
    errors?: Array<{ message: string }>
  }

  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Linear API retornou resposta vazia')

  return {
    milestones: json.data.project.milestones.nodes,
    unassigned: json.data.issues.nodes,
  }
}

// ── Análise ───────────────────────────────────────────────────────────────────

export function checkMilestoneHealth(milestone: MilestoneRecord): MilestoneFinding | null {
  const claimsDelivered = DELIVERED_LANGUAGE_RE.test(milestone.description)
  if (!claimsDelivered) return null
  if (milestone.progress >= SUSPICIOUS_PROGRESS_THRESHOLD) return null

  return {
    name: milestone.name,
    progress: milestone.progress,
    reason: `descrição indica entrega ("✅"/"Entregue em") mas progresso é ${milestone.progress}% — issues linkadas provavelmente não foram movidas pra Done`,
  }
}

export function buildReconciliationReport(
  milestoneFindings: MilestoneFinding[],
  unassigned: UnassignedIssue[]
): string | null {
  if (milestoneFindings.length === 0 && unassigned.length === 0) return null

  const lines = ['## 🔄 Reconciliation do Linear — drift encontrado', '']

  if (milestoneFindings.length > 0) {
    lines.push('### Milestones com progresso inconsistente com a descrição', '')
    for (const f of milestoneFindings) {
      lines.push(`- **${f.name}** (${f.progress}%): ${f.reason}`)
    }
    lines.push('')
  }

  if (unassigned.length > 0) {
    lines.push(`### Issues sem assignee (${unassigned.length})`, '')
    for (const i of unassigned.slice(0, 20)) {
      lines.push(`- ${i.identifier} — ${i.title}`)
    }
    if (unassigned.length > 20) lines.push(`- _... e mais ${unassigned.length - 20}_`)
    lines.push('')
  }

  lines.push('_Gerado automaticamente por reconcile-linear.ts (TWI-1114 / E22) — não corrige sozinho, só sinaliza._')
  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) throw new Error('LINEAR_API_KEY env var não definida')

  const config: SyncConfig = JSON.parse(await readFile(join(ROOT, 'sync-config.json'), 'utf8'))
  const projectId = config.linear.projectId

  const { milestones, unassigned } = await fetchReconciliationData(projectId, apiKey)
  const milestoneFindings = milestones
    .map(checkMilestoneHealth)
    .filter((f): f is MilestoneFinding => f !== null)

  const report = buildReconciliationReport(milestoneFindings, unassigned)

  if (report) {
    console.log(report)
    console.log(`::warning::reconcile-linear encontrou drift — ${milestoneFindings.length} milestone(s) suspeito(s), ${unassigned.length} issue(s) sem assignee`)
    await postSlackAlert(`🟡 Reconciliation encontrou drift no Linear — ${milestoneFindings.length} milestone(s) suspeito(s), ${unassigned.length} issue(s) sem assignee. Ver job summary.`)
  } else {
    console.log('[reconcile-linear] ✅ Nenhum drift encontrado.')
  }

  if (process.env.GITHUB_STEP_SUMMARY && report) {
    const fs = await import('fs/promises')
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${report}\n`)
  }
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    // Reconciliation nunca deve derrubar o pipeline principal — é informativo, não um gate.
    console.error('[reconcile-linear] Erro (não-bloqueante):', (err as Error).message)
    console.log('::warning::reconcile-linear falhou, seguindo sem o relatório de drift')
  })
}
/* v8 ignore stop */
