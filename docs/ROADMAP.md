# Roadmap — GitOps × Claude Agents

Fases de evolução do sistema. Cada fase entrega valor independente — não é necessário completar todas para usar o sistema em produção.

---

## Fase 1 — Fundação ✅ Concluída

**Objetivo:** pipeline confiável com zero automação de execução, só GitOps passivo.

| Entrega | Status | Issue |
|---|---|---|
| Taxonomia de 22 labels (agent:*, skill:*, trigger:*, severity:*, sistema) | ✅ | TWI-162 |
| Vercel Edge Function — bridge Linear → GitHub (HMAC-SHA256) | ✅ | TWI-163 |
| GitHub Actions: `auto-code-review` job | ✅ | TWI-156 |
| GitHub Actions: `gitops-sync` (merge → Linear Done) | ✅ | TWI-156 |
| GitHub Actions: `run-agent` (workflow_dispatch) | ✅ | TWI-156 |
| Detecção de demanda furtiva (PR sem LINEAR_ID → issue no Linear) | ✅ | TWI-164 |
| Anti-recursão dual-layer (branch prefix + body marker) | ✅ | TWI-171 |
| Quality gates no CLAUDE.md (typecheck + tests obrigatórios) | ✅ | — |
| RUNBOOK.md — procedimentos operacionais | ✅ | — |
| ONBOARDING.md — checklist para novo repo | ✅ | — |
| GOVERNANCE.md — matriz de permissão de labels | ✅ | — |
| Pipeline E2E validado (label → HMAC → dispatch → Claude CLI inicia) | ✅ | TWI-171 |

**Limitação conhecida:** Vercel bridge roteia para 1 repo fixo. Resolvido na Fase 4.

---

## Fase 2 — Agents ativos 🔄 Em andamento

**Objetivo:** agentes executam tarefas reais e produzem PR/resultado sem intervenção humana.

**Bloqueio atual:** crédito na API key Anthropic (`sk-ant-api03-...`). Infra 100% pronta.

| Entrega | Status | Issue |
|---|---|---|
| `agent:generate-code` — lê spec, gera implementação, abre PR | 🔄 Infra pronta | TWI-166 |
| `agent:run-tests` — executa suite, posta resultado no Linear | 🔄 Infra pronta | TWI-167 |
| `agent:security-review` — scan CVEs, cria sub-issues severity:* | 🔄 Infra pronta | TWI-168 |
| `agent:deploy` — dispara pipeline, posta resultado | 🔄 Infra pronta | TWI-169 |
| `agent:code-review` — review diff, cria findings como sub-issues | 🔄 Infra pronta | TWI-170 |
| Teste E2E completo: generate-code → PR → merge → Linear Done | 🔄 Aguarda crédito | TWI-171 |

**Como desbloquear:** adicionar saldo em [console.anthropic.com → Billing](https://console.anthropic.com/settings/plans).

---

## Fase 3 — Ciclo auto-corretivo 📋 Spec pendente

**Objetivo:** code-review identifica findings → sub-issues criadas → agente corrigi automaticamente → loop fecha sem humano.

Issues pendentes: TWI-182 a TWI-185.

| Entrega | Status | Dependência |
|---|---|---|
| Spec do ciclo de auto-correção | 📋 A definir | Fase 2 completa |
| Regra: quando agent deve corrigir vs. escalar para humano | 📋 A definir | Spec |
| Implementar loop: finding → `agent:generate-code` label automática | 📋 A definir | Spec |
| Proteção contra loops em cascata (limite de iterações por issue) | 📋 A definir | Spec |
| Critério de closure: pai fechado quando todos os filhos resolvidos | 📋 A definir | Spec |

**Questão aberta:** qual o critério de confiança para o agent auto-corrigir sem review humano? Severidade `low`/`medium` auto-corrigi, `high`/`critical` requer aprovação?

---

## Fase 4 — Bridge multi-repo 📋 Planejada

**Objetivo:** um único webhook Linear roteia para qualquer repo da org sem configuração manual.

| Entrega | Status | Dependência |
|---|---|---|
| Vercel bridge lê repo-alvo da payload do Linear | 📋 A definir | — |
| Campo customizado na issue Linear (ou `sync-config.json` do repo) indica destino | 📋 A definir | Design |
| Zero config manual para adicionar novo repo ao sistema | 📋 A definir | Implementação |
| CLI para gerar `sync-config.json` interativamente | 📋 A definir | — |

**Workaround atual:** `gh workflow run gitops.yml --repo twinfo-io/OUTRO-REPO ...` manual.

---

## Fase 5 — Produção 🔭 Futuro

Ativar o sistema em repos de produto (ex: `bpx-agent-clickhouse`, `gorjeta`) após:

- Fase 2 validada E2E no sandbox
- Fase 3 spec aprovada pelo time
- Revisão do GOVERNANCE.md para repos de produto
- Tech lead sign-off explícito por repo

---

## Princípios do roadmap

- **Sandbox first:** toda feature vai para `gitops-sandbox` antes de qualquer repo de produto
- **Human in the loop:** nenhuma fase remove a aprovação humana do merge
- **Rollback always:** toda entrega deve ter procedimento de rollback documentado no RUNBOOK.md antes de ir para produção
