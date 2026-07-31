---
name: audit-orchestrator-workers-fit
description: Verifica se a metodologia fixa de 4 fases do agent:generate-code (explore/design/implement/review, E13) é flexível o bastante pra tarefas que não cabem nesse molde, comparado ao padrão orchestrator-workers dinâmico da Anthropic. Use ao revisar a metodologia de geração de código.
---

# Audit: rigidez da metodologia de 4 fases vs. orchestrator dinâmico

## O que checar

Ler o prompt de `agent:generate-code` em `gitops.yml` (E13/TWI-337) — confirmar que as 4 fases (explore/design/implement/review) e o número de sub-agents por fase (2-3) são fixos no texto do prompt, não decididos dinamicamente pela complexidade real da tarefa.

## Por quê (fonte)

Anthropic, "Building Effective Agents": no padrão orchestrator-workers, "a central LLM dynamically breaks down tasks, delegates them to worker LLMs... subtasks aren't pre-defined, but determined by the orchestrator based on the specific input" — o oposto de um número fixo de fases/sub-agents.

## Status atual no gitops-sandbox

**TRADEOFF, mas vale reavaliar.** E13 escolheu deliberadamente um número fixo de sub-agents (até 8) por execução, aceitando o custo maior conscientemente. Isso funciona bem pra tarefas de porte médio (a maioria das issues reais) mas é ineficiente nos dois extremos: uma tarefa trivial ("corrige typo no log") ainda dispara 2-3 sub-agents de exploração desnecessários; uma tarefa muito grande pode precisar de mais do que 3 abordagens de design pra decidir bem. Nunca medido em produção (pipeline ainda não rodou com crédito Anthropic real) — recomendação: só otimizar depois de ter dado real de quantas execuções são pequenas/médias/grandes.
