---
name: audit-secret-scrubbing-artifacts
description: Verifica se artifacts/logs publicados (job summary, raw agent output upload) podem vazar secrets lidos por tool calls do agente. Use ao auditar exposição de credenciais em CI.
---

# Audit: scrubbing de secrets em artifacts publicados

## O que checar

Ler o step "Upload raw agent output" em `gitops.yml` — ele sobe `/tmp/claude-output.json` (saída bruta do `--output-format json`) como artifact do GitHub Actions, retenção 90 dias. Verificar se esse arquivo passa por algum scrub antes do upload.

## Por quê (fonte)

`anthropics/claude-code-action` docs/security.md — seção "Full Output Security Warning": "Full outputs from tool executions... may contain tokens or credentials... These logs are publicly visible in GitHub Actions for public repositories!" `show_full_output` vem `false` por padrão exatamente por isso.

## Status atual no gitops-sandbox

**GAP real:** o artifact `agent-output-{issue}-{run}` é o JSON bruto do Claude CLI, sem nenhum scrub. Se o agente rodar um `Bash` que ecoa uma env var sensível (ex: debug acidental de `$ANTHROPIC_API_KEY`), isso fica gravado no artifact por 90 dias. Repo é público (`visibility: public` confirmado via `gh api`) — artifacts de run público são visíveis a qualquer um com acesso de leitura ao repo. Mitigação hoje: nenhuma automática — só a disciplina do prompt de nunca imprimir secrets.
