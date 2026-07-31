---
name: audit-strategic-build-vs-wait-risk
description: Verifica sinais públicos de que a própria Anthropic/Linear pode nativamente resolver parte do que este pipeline constrói do zero, tornando parte do investimento redundante. Use ao revisar prioridade de investimento contínuo no projeto.
---

# Audit: risco estratégico de "construir vs. esperar o mercado nativo"

## O que checar

Rodar uma busca periódica (a cada trimestre, por exemplo) por: "Linear Agent Claude Code native integration", "anthropics/claude-code-action Linear support", changelog do Linear sobre "Coding Sessions"/"Agent-assisted".

## Por quê (fonte)

Encontrado durante a pesquisa deste audit: issue pública `anthropics/claude-code-action#12925` — "Linear Integration: Assign issues to Claude Code to trigger cloud agent sessions" — sinal de que a própria Anthropic está considerando/construindo integração nativa Linear → Claude Code cloud agent. Achado relacionado, já registrado em TWI-331 (Linear Agent nativo, "Coding Sessions", ~30% dos bug fixes internos da própria Linear resolvidos assim).

## Status atual no gitops-sandbox

**Risco real, já parcialmente rastreado (TWI-331), mas não como risco estratégico de todo o projeto.** TWI-331 avalia o Linear Agent nativo só pro caso de uso de "bugs simples" — mas o issue #12925 sugere algo mais amplo: se a Anthropic native-integrar Linear↔Claude Code cloud sessions, boa parte do que construímos manualmente (webhook bridge, `workflow_dispatch`, roteamento de label→prompt) pode virar redundante ou precisar de retrofit pra usar a integração oficial em vez da caseira. Não é motivo pra parar de investir agora (nada native shipado ainda, e nosso valor diferencial — trilha de auditoria pra compliance iGaming, épicos E1-E17 de hardening — não é trivialmente substituído), mas vale reavaliar esse radar a cada poucos meses antes de investir em features grandes novas.
