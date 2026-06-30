# Roadmap — GitOps × Claude Agents

Fases de evolução do sistema. Cada fase entrega valor independente — não é necessário completar todas para usar o sistema em produção.

---

## Fase 1 — Fundação GitOps ✅ Concluída

**Objetivo:** pipeline confiável com sincronização bidirecional Linear ↔ Git.

| Entrega | Status |
|---|---|
| `sync-project.ts` — pull Linear → local (WORKPLAN, epics, sprints) | ✅ |
| `sync-project.ts` — push SPECS.md → Linear Documents API | ✅ |
| `sync-config.json` com IDs Linear do workspace | ✅ |
| PR template com campos Q&A (LINEAR_ID, TYPE, EPIC, AGENTS) | ✅ |
| GitHub Actions: `gitops-sync` (merge → Linear Done) | ✅ |

---

## Fase 2 — Detecção de Demandas Furtivas ✅ Concluída

**Objetivo:** commits sem card no Linear são detectados e registrados automaticamente.

| Entrega | Status |
|---|---|
| `parse-pr.ts` — extrai campos Q&A do PR template | ✅ |
| `create-demand.ts` — cria issue no Linear com epic + sprint lookup | ✅ |
| Detecção automática: PR mergeado sem LINEAR_ID → issue criada | ✅ |
| Idempotência: arquivo de demanda atualizado com LINEAR_ID gerado | ✅ |

---

## Fase 3 — Taxonomia de Tags × Claude ✅ Concluída

**Objetivo:** labels no Linear disparam agents Claude automaticamente via webhook.

| Entrega | Status |
|---|---|
| Vercel Edge Function — bridge Linear → GitHub (HMAC-SHA256) | ✅ |
| Suporte a `agent:*` e `skill:*` labels | ✅ |
| Detecção de labels **adicionadas** no evento (não labels existentes) | ✅ |
| Bridge multi-repo via `REPO_MAP` env var (projectId → owner/repo) | ✅ |
| Anti-recursão dual-layer (branch `agent/*` + body marker) | ✅ |
| 14 testes unitários no webhook | ✅ |

---

## Fase 4 — Execução Autônoma de Agents ✅ Infra Completa

**Objetivo:** agents Claude executam tarefas reais e reportam resultado no Linear.

**Bloqueio operacional:** crédito na conta Anthropic (`console.anthropic.com → Billing`). Infra 100% pronta — agents ficam na fila mas não executam sem saldo.

| Entrega | Status |
|---|---|
| GitHub Actions: `run-agent` job com Claude Code CLI não-interativo | ✅ |
| Prompts configurados para: generate-code, run-tests, security-review, deploy, code-review | ✅ |
| Routing `skill:*` → executa `/skill-name` via Claude Code CLI | ✅ |
| `report-result.ts` — feedback loop determinístico agent → Linear | ✅ |
| State machine: agent × sucesso/falha → estado correto no Linear | ✅ |
| 17 testes para report-result | ✅ |
| Teste E2E completo: label → PR gerado → merge → Linear Done | 🔄 Aguarda crédito Anthropic |

**Como desbloquear:** adicionar saldo em [console.anthropic.com → Billing](https://console.anthropic.com/settings/plans).

---

## Fase 5 — Validação & Governança 🔄 Em andamento

**Objetivo:** validar o sistema ponta a ponta e preparar para uso em repos de produto.

| Entrega | Status | Dependência |
|---|---|---|
| Teste E2E: `agent:generate-code` → PR → merge → Linear Done | 🔄 Aguarda crédito | Fase 4 |
| Teste E2E: PR sem LINEAR_ID → demanda furtiva criada | 🔄 A validar | Crédito |
| Guia operacional para devs | 📋 A fazer | — |
| Trilha de auditoria completa para compliance SPA/MF | 📋 A fazer | E2E |
| Revisão de GOVERNANCE.md para repos de produto | 📋 A fazer | E2E |

---

## Fase 6 — Ciclo Auto-Corretivo 📋 Spec Pendente

**Objetivo:** code-review identifica findings → sub-issues criadas → agent corrige automaticamente → loop fecha sem humano.

Issues pendentes: TWI-182 a TWI-185.

| Entrega | Status | Dependência |
|---|---|---|
| Spec do ciclo de auto-correção | 📋 A definir | Fase 5 completa |
| Regra: quando agent corrige vs. escala para humano | 📋 A definir | Spec |
| Loop: finding → label `agent:generate-code` automática | 📋 A definir | Spec |
| Proteção contra loops em cascata (limite de iterações por issue) | 📋 A definir | Spec |
| Critério de closure: pai fechado quando todos os filhos resolvidos | 📋 A definir | Spec |

**Questão aberta:** severidade `low`/`medium` auto-corrige, `high`/`critical` requer aprovação?

---

## Fase 7 — Produção 🔭 Futuro

Ativar em repos de produto (ex: `bpx-agent-clickhouse`, `gorjeta`) após:

- Fase 5 validada E2E no sandbox
- Fase 6 spec aprovada pelo time
- GOVERNANCE.md revisado para repos de produto
- Tech lead sign-off explícito por repo

---

## Princípios

- **Sandbox first:** toda feature vai para `gitops-sandbox` antes de qualquer repo de produto
- **Human in the loop:** nenhuma fase remove a aprovação humana do merge
- **Rollback always:** toda entrega tem procedimento de rollback documentado no RUNBOOK.md antes de ir para produção
