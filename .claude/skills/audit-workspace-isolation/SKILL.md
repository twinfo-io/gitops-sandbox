---
name: audit-workspace-isolation
description: Verifica se cada execução de agent roda num workspace isolado (container/dir dedicado) ou compartilha o mesmo runner/filesystem entre labels concorrentes. Use ao auditar isolamento entre execuções paralelas.
---

# Audit: isolamento de workspace por execução

## O que checar

Confirmar se `run-agent` roda com `concurrency:` no nível do job (limitando runs paralelas na mesma issue/branch) e se cada run usa checkout limpo (não reaproveita `$GITHUB_WORKSPACE` de uma run anterior no mesmo runner self-hosted, caso exista).

## Por quê (fonte)

`mksglu/hatice`: "isolated workspaces" por issue é parte central do design — cada dispatch ganha um ambiente próprio, evitando um agente ler/alterar arquivo de estado de outra execução concorrente.

## Status atual no gitops-sandbox

**OK, com ressalva.** Usamos `runs-on: ubuntu-latest` (runner hospedado do GitHub, não self-hosted) — cada job já ganha VM nova por definição do GitHub Actions, isolamento forte por padrão. **Ressalva:** não há `concurrency:` declarado no `run-agent` job — duas labels `agent:*` na MESMA issue disparadas quase simultaneamente rodam em paralelo sem lock, podendo os dois tentarem criar o mesmo branch `agent/TWI-{id}-*` e colidir no push. Baixo risco na prática (uso solo, um label por vez), mas não é impossível.
