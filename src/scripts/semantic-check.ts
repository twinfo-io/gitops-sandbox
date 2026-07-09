/**
 * semantic-check.ts — Check semântico anti-alucinação (TWI-350 / E15)
 *
 * Complementa a verificação sintática do E5 (verify-branch: compila? passa teste?)
 * com uma verificação semântica: o diff do branch realmente satisfaz o que a issue
 * do Linear pediu? Usa o método intended-vs-implemented — intenção documentada
 * (spec da issue) vs. realidade implementada (diff) — via um julgamento de LLM.
 *
 * NÃO bloqueia o pipeline: é informativo. O resultado entra como comentário extra
 * pro humano ver antes de aprovar o PR (branch protection do E14 já garante que
 * alguém revisa) — LLM-judge pode ter falso positivo, bloquear geraria atrito.
 *
 * Uso: ANTHROPIC_API_KEY=... LINEAR_API_KEY=... ISSUE_ID=TWI-123 BASE_BRANCH=main
 *      HEAD_BRANCH=agent/twi-123-implementation npx tsx src/scripts/semantic-check.ts
 */

import { execSync } from 'child_process'

const JUDGE_MODEL = 'claude-sonnet-5'
const MAX_DIFF_CHARS = 40_000 // evita explodir o prompt em diffs gigantes

export interface Mismatch {
  claim: string
  reality: string
  severity: 'high' | 'medium' | 'low'
}

export interface SemanticVerdict {
  matches: boolean
  mismatches: Mismatch[]
}

// ── Linear ────────────────────────────────────────────────────────────────────

async function fetchIssueSpec(issueIdentifier: string, apiKey: string): Promise<string> {
  const resp = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($term: String!) {
        issueSearch(query: $term, first: 1) {
          nodes { title description }
        }
      }`,
      variables: { term: issueIdentifier },
    }),
  })

  if (!resp.ok) throw new Error(`Linear API retornou ${resp.status} ao buscar ${issueIdentifier}`)

  const json = (await resp.json()) as { data?: { issueSearch: { nodes: Array<{ title: string; description: string | null }> } } }
  const issue = json.data?.issueSearch.nodes[0]
  if (!issue) throw new Error(`Issue ${issueIdentifier} não encontrada no Linear`)

  return `${issue.title}\n\n${issue.description ?? '(sem descrição)'}`
}

// ── Git ───────────────────────────────────────────────────────────────────────

export function getDiff(baseBranch: string, headBranch: string): string {
  const raw = execSync(`git diff origin/${baseBranch}...origin/${headBranch}`, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })
  return raw.length > MAX_DIFF_CHARS
    ? `${raw.slice(0, MAX_DIFF_CHARS)}\n\n[... diff truncado em ${MAX_DIFF_CHARS} chars ...]`
    : raw
}

// ── Anthropic (LLM-judge) ──────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `Você aplica o método "intended vs implemented": compara a intenção documentada (spec de uma issue) contra a implementação real (diff de código) pra achar divergências que importam.

Responda ESTRITAMENTE em JSON (sem markdown, sem texto fora do JSON):
{"matches": true|false, "mismatches": [{"claim": "...", "reality": "...", "severity": "high"|"medium"|"low"}]}

Regras:
- Cite a claim específica da spec e o que o diff realmente faz — nunca um achado vago.
- Só reporte divergências que importam (um requisito não implementado, ou implementado de forma que contradiz a spec). Ignore diferenças cosméticas (nomes de variável, formatação, ordem de imports).
- Se a implementação cobre a spec razoavelmente bem, matches=true e mismatches=[].`

export async function judgeSemanticMatch(spec: string, diff: string, apiKey: string): Promise<SemanticVerdict> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Spec (intenção documentada):\n${spec}\n\nDiff (implementação real):\n${diff}` }],
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Anthropic API retornou ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as { content: Array<{ type: string; text?: string }> }
  const raw = data.content.find(c => c.type === 'text')?.text ?? '{}'

  let parsed: Partial<SemanticVerdict>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Resposta do judge não é JSON válido: ${raw}`)
  }

  return { matches: parsed.matches ?? true, mismatches: parsed.mismatches ?? [] }
}

// ── Comentário ────────────────────────────────────────────────────────────────

export function buildSemanticComment(verdict: SemanticVerdict): string | null {
  if (verdict.matches && verdict.mismatches.length === 0) return null // sem achado, sem ruído no Linear

  const lines = ['### 🔍 Check semântico (intended vs implemented)', '']
  if (verdict.matches) {
    lines.push('Nenhuma divergência que bloqueie — achados abaixo são de severidade baixa/informativa.', '')
  } else {
    lines.push('⚠️ **Possíveis divergências entre a spec e o diff — revisar antes de aprovar:**', '')
  }
  for (const m of verdict.mismatches) {
    lines.push(`- **[${m.severity}]** Spec diz: _${m.claim}_ — Diff faz: _${m.reality}_`)
  }
  lines.push('', '_Gerado por LLM-judge — pode ter falso positivo. Não bloqueia o merge, só informa a revisão._')
  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const issueId     = process.env.ISSUE_ID
  const baseBranch   = process.env.BASE_BRANCH ?? 'main'
  const headBranch   = process.env.HEAD_BRANCH
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const linearKey    = process.env.LINEAR_API_KEY

  if (!issueId)       throw new Error('ISSUE_ID env var não definida')
  if (!headBranch)    throw new Error('HEAD_BRANCH env var não definida')
  if (!anthropicKey)  throw new Error('ANTHROPIC_API_KEY env var não definida')
  if (!linearKey)     throw new Error('LINEAR_API_KEY env var não definida')

  console.log(`[semantic-check] ${issueId} | ${baseBranch}...${headBranch}`)

  const [spec, diff] = await Promise.all([
    fetchIssueSpec(issueId, linearKey),
    Promise.resolve(getDiff(baseBranch, headBranch)),
  ])

  const verdict = await judgeSemanticMatch(spec, diff, anthropicKey)
  const comment = buildSemanticComment(verdict)

  if (comment) {
    console.log(comment)
    console.log(`::warning::semantic-check encontrou ${verdict.mismatches.length} possível(is) divergência(s) — ver comentário no Linear`)
  } else {
    console.log('[semantic-check] ✅ Sem divergências relevantes entre spec e diff.')
  }

  // Sempre disponível pro step seguinte via GITHUB_OUTPUT, nunca bloqueia (process.exitCode fica undefined)
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('fs/promises')
    await fs.appendFile(process.env.GITHUB_OUTPUT, `semantic_comment<<SEMANTIC_EOF\n${comment ?? ''}\nSEMANTIC_EOF\n`)
  }
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    // Falha do semantic-check nunca deve derrubar o job — é informativo, não um gate.
    console.error('[semantic-check] Erro (não-bloqueante):', (err as Error).message)
    console.log('::warning::semantic-check falhou, seguindo sem o achado semântico')
  })
}
/* v8 ignore stop */
