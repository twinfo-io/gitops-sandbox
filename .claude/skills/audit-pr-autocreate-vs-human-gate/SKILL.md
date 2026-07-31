---
name: audit-pr-autocreate-vs-human-gate
description: Compara a postura de "agente cria o PR sozinho" (nossa) vs "agente só linka a página de criação, humano clica" (padrão oficial da Anthropic) — documenta como tradeoff consciente, não bug. Use ao revisar postura de autonomia do pipeline.
---

# Audit: auto-criação de PR vs. gate humano antes até de existir o PR

## O que checar

Confirmar que `agent:generate-code`/`agent:generate-tests`/`agent:create-specs` de fato chamam `mcp__github__create_pull_request` diretamente (via `AGENT_TOOLS_MAP`), sem passo intermediário de "gerar link, esperar clique humano".

## Por quê (fonte)

`anthropics/claude-code-action` docs/security.md — seção "Pull Request Creation": "Claude does not create pull requests automatically... Claude provides a link to the GitHub PR creation page... The user must click the link and create the PR themselves, ensuring human oversight before any code is proposed for merging."

## Status atual no gitops-sandbox

**TRADEOFF consciente, não gap.** Nós auto-criamos o PR — decisão que faz sentido pro nosso modelo (branch protection do E14 + auto-code-review do E1 já garantem que ninguém mergeia sem CI passar e sem revisão), diferente do modelo da Anthropic (que assume repos com múltiplos contribuidores externos, onde até a *existência* de um PR é um evento que precisa de intenção humana explícita). Registrar isso como decisão documentada — não é uma lacuna que "falta corrigir depois", é uma escolha de design válida pro contexto solo/interno deste repo. Reavaliar só se o repo passar a aceitar PR de terceiros externos.
