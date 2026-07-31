---
name: audit-performance-outcomes-loop
description: Verifica se existe um loop de "revisar até atingir rubrica" (grader separado reenvia pro subagent revisar) ou se a revisão do E13 é um passe único fixo. Use ao auditar qualidade do processo de review automatizado.
---

# Audit: loop de revisão até rubrica (vs. passe único)

## O que checar

Ler a fase 4 (REVIEW) do prompt de `agent:generate-code` — confirmar que os 3 sub-agents de review rodam UMA vez, corrigem o que tem confiança ≥80%, e listam o resto como "Known follow-ups" no PR — sem ciclo de "corrigiu, revisa de novo, ainda não atingiu o padrão, corrige de novo".

## Por quê (fonte)

Anthropic, atualização de junho/2026 "Performance Outcomes": "a separate grader sends each subagent back to revise until its result meets a rubric" — padrão formal de revisão iterativa contra critério objetivo, não um passe fixo.

## Status atual no gitops-sandbox

**GAP, mas com mitigação real.** Hoje é passe único: review roda 1x, corrige o que pode, documenta o resto e segue pro PR — sem grader formal com rubrica nem repetição. A mitigação que já existe e cobre boa parte do risco: branch protection (E14, humano sempre revisa antes do merge) + check semântico (E15, informativo). Ainda assim, um loop formal de revise-até-rubrica reduziria a carga de review humano em achados que o próprio agente poderia ter resolvido com mais uma iteração — especialmente pra findings de confiança 60-79% (hoje só documentados, nunca re-tentados).
