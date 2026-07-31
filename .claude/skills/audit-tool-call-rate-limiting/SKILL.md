---
name: audit-tool-call-rate-limiting
description: Verifica se existe algum limite de quantas vezes o agente pode chamar uma tool/script sensível dentro de uma única execução. Use ao auditar controles de "least agency".
---

# Audit: rate limit de tool call por execução

## O que checar

Procurar em `.claude/settings.json` e em `gitops.yml` por qualquer mecanismo de cap de chamadas (ex: "no máximo N vezes por run"). Hoje só existe `permissions.deny` (allow/deny binário) — não há contagem.

## Por quê (fonte)

`anthropics/claude-code-action`: `CLAUDE_CODE_SCRIPT_CAPS` — JSON `{"script-name.sh": maxCalls}` — limita quantas vezes um script write-capable pode ser chamado no mesmo run. Útil contra um agente em loop chamando repetidamente uma ação sensível (ex: `gh pr create` várias vezes, ou tentativas repetidas de bypass de um deny).

## Status atual no gitops-sandbox

**GAP.** `permissions.deny` (E17) é binário: permite ou bloqueia, sem contagem. Um agente que N vezes tenta (e falha) uma ação negada gera N tentativas logadas, mas nada interrompe a run por excesso de tentativas. Baixo risco hoje (deny já bloqueia o efeito), mas seria defesa em profundidade barata: cap em `mcp__github__create_pull_request` (evita spam de PR) e em `Bash` genérico por sessão.
