---
name: audit-reconciliation-drift
description: Verifica se existe um job que detecta e corrige estado divergente entre Linear e GitHub (ex: PR mergeado mas issue não fechada, branch órfã, issue Done sem PR correspondente). Use ao auditar consistência de longo prazo do GitOps.
---

# Audit: reconciliation de drift Linear ↔ GitHub

## O que checar

Procurar por um job/script agendado (`schedule:` cron em `gitops.yml`, ou script standalone) que varre o estado dos dois sistemas e corrige divergência — não só reage a eventos (push/PR/label), mas audita periodicamente.

## Por quê (fonte)

`mksglu/hatice`: "reconciliation" listado como etapa própria do lifecycle, distinta de "dispatch" e "execução" — reconhece que sistemas orientados a evento (webhook) sempre acumulam drift quando um evento é perdido (falha de rede no webhook, GH Actions fora do ar, etc).

## Status atual no gitops-sandbox

**GAP.** Todo o sync é reativo a evento (`push`, `pull_request`, `workflow_dispatch`) — zero job agendado (`schedule:` não existe em nenhum trigger do `gitops.yml`). Se o webhook do Vercel cair por 10 minutos e um PR for mergeado nesse intervalo, a issue Linear correspondente nunca fecha automaticamente — só via `gitops-sync`, que só roda em evento de push subsequente. Achamos esse exato tipo de drift manualmente nesta sessão (Fase 1/Fase 2 do Linear presas em 0% por meses) — a causa raiz é estrutural: nada varre e concilia periodicamente.
