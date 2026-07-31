---
name: audit-path-specific-triggers
description: Verifica se existe gate extra de revisão para paths sensíveis específicos (ex: arquivos de pagamento, autenticação, config de produção) além do gate genérico por label. Use ao auditar granularidade dos gates de segurança.
---

# Audit: trigger por path sensível

## O que checar

Grep em `gitops.yml` por `paths:` dentro de `on: pull_request` — confirmar se existe algum trigger condicionado a caminho de arquivo específico, além dos triggers genéricos (`opened`, `synchronize`, label).

## Por quê (fonte)

`anthropics/claude-code-action` — "Path-Specific Reviews: Trigger on critical file changes" listado como solution pattern oficial (ex: forçar `agent:security-review` obrigatório sempre que `payments/**` ou `auth/**` mudar, independente de label manual).

## Status atual no gitops-sandbox

**GAP, relevante pro contexto real de uso.** Hoje todo trigger é por label ou evento genérico de PR — nenhum path é tratado como automaticamente mais sensível. Isso é aceitável no próprio gitops-sandbox (repo de infraestrutura de automação, não tem "arquivo de pagamento"), mas é uma lacuna de **template**: quando este sistema for replicado pra um repo de produto real (ex: repo com endpoint de sorteio/pagamento iGaming, dado o contexto regulatório SPA/MF citado no README), a ausência de path-trigger significa que `agent:security-review` só roda se alguém lembrar de aplicar o label — não é automático pra código crítico.
