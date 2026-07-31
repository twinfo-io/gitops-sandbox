---
name: audit-linear-milestone-hygiene
description: Verifica se existe algum issue Linear linkado a um milestone cujo progresso não bate com a realidade (entrega feita mas issue nunca movida pra Done, ou vice-versa). Use periodicamente como checagem de higiene do board.
---

# Audit: higiene de milestone no Linear (issue linkada, nunca fechada)

## O que checar

Via `mcp__claude_ai_Linear__list_issues` filtrado por `project`, cruzar `projectMilestone` × `status` de cada issue — qualquer milestone com descrição contendo "✅"/"Entregue em" mas `progress` baixo é sinal de issue linkada e esquecida em Backlog.

## Por quê (fonte)

Bug real encontrado e corrigido nesta sessão (2026-07-21): Fase 1 e Fase 2 do projeto GitOps × Claude Agents mostravam 0% de progresso havia semanas, apesar da entrega real estar no repo desde 2026-06-26 — 9 issues (TWI-153–161) ficaram linkadas ao milestone mas nunca transicionadas pra Done. Sem assignee em nenhuma das 59 issues do projeto — sinal relacionado do mesmo problema de higiene (ninguém "dono" formal pra fechar o ciclo).

## Status atual no gitops-sandbox

**Corrigido pontualmente, sem prevenção sistemática.** Os 9 issues foram fechados manualmente nesta sessão, com comentário de evidência cada um, e todas as 59 issues do projeto ganharam assignee. Mas nada impede o mesmo padrão se repetir pra futuros épicos (E18+) — não existe hoje nenhuma checagem periódica automatizada (nem manual agendada) que rode esse cruzamento milestone×status regularmente. Candidato a rodar como parte da mesma reconciliation job proposta em `audit-reconciliation-drift`.
