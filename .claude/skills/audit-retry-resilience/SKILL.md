---
name: audit-retry-resilience
description: Verifica se chamadas de rede (Linear API, GitHub API, Anthropic API) e a invocação do Claude CLI têm retry com backoff, ou falham na primeira tentativa. Use ao auditar resiliência operacional.
---

# Audit: retry / backoff exponencial

## O que checar

Grep em `src/scripts/*.ts` por `retry`, `backoff`, `setTimeout.*catch`, tentativa de nova chamada após falha de `fetch`. Verificar também o step "Execute Claude Agent" em `gitops.yml` — o que acontece se `claude --print` falhar por erro transitório de rede/API?

## Por quê (fonte)

`mksglu/hatice` (153★, orquestrador de agent Claude Code sobre issue tracker): lista explicitamente "retry with exponential backoff" como parte do lifecycle de dispatch — reconhecido como requisito de produção pra esse tipo de pipeline.

## Status atual no gitops-sandbox

**GAP.** Nenhum script (`report-result.ts`, `semantic-check.ts`, `sanitize-check.ts`, `create-demand.ts`, `slice-epic.ts`) tem retry — toda chamada `fetch` que falhar propaga erro direto. A invocação do `claude --print` no `run-agent` job também é single-shot: se falhar por rate-limit/timeout transitório da API Anthropic, o job falha inteiro, sem segunda tentativa. Mitigação parcial: o ledger de progresso (E9) permite retomar de onde parou numa nova execução manual — mas isso exige reação humana (reaplicar o label), não é retry automático.
