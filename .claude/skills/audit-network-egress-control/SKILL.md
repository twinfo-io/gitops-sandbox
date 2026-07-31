---
name: audit-network-egress-control
description: Verifica se existe algum controle de rede de saída (allowlist de domínios) durante a execução do agente, ou se o runner tem acesso irrestrito à internet. Use ao auditar superfície de exfiltração de dados.
---

# Audit: controle de egress de rede

## O que checar

Confirmar que `run-agent`/`auto-code-review` rodam em `ubuntu-latest` padrão (sem `--network` restrito, sem firewall configurado) — acesso de saída irrestrito à internet pública durante toda a execução do agente.

## Por quê (fonte)

`anthropics/claude-code-action` lista "network restrictions" como feature experimental própria (`docs/experimental.md`) — reconhece que, com o "lethal trifecta" (dado privado + conteúdo não-confiável + comunicação externa) presente, egress irrestrito é o elo que transforma prompt injection em exfiltração de dados de verdade.

## Status atual no gitops-sandbox

**GAP real, maior do que parece à primeira vista.** O agente roda com acesso total à internet durante toda a execução — se um prompt injection conseguir passar pelo `SECURITY_PREAMBLE` + `permissions.deny` + `sanitize-check.ts` (defesa em profundidade já boa, mas não hermética), o próximo passo natural de um ataque bem-sucedido seria fazer o agente rodar `curl` pra um endpoint externo com dado sensível no corpo — e nada na camada de rede impediria isso (só o deny de `curl * | bash`, que bloqueia *executar* payload baixado, não bloqueia *enviar* dado pra fora). Allowlist de domínio (só `api.anthropic.com`, `api.linear.app`, `api.github.com`) fecharia esse último elo, hoje totalmente aberto.
