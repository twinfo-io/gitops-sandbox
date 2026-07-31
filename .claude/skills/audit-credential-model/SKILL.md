---
name: audit-credential-model
description: Verifica se o pipeline usa token de vida curta e escopo mínimo (GitHub App) ou PAT/GITHUB_TOKEN de escopo mais amplo, e se há mistura acidental entre credencial pessoal (interativa) e credencial de runtime do pipeline. Use ao auditar modelo de credenciais.
---

# Audit: modelo de credencial (GitHub App vs PAT vs GITHUB_TOKEN)

## O que checar

Confirmar em `gitops.yml` que todo `GITHUB_TOKEN` usado em steps é `${{ secrets.GITHUB_TOKEN }}` (token automático do Actions, escopado às permissions declaradas no workflow, expira ao fim do job) — nunca um PAT pessoal fixo. Checar também se algum PAT pessoal (usado interativamente via `gh` CLI local) está referenciado em qualquer secret do repo/Vercel por engano.

## Por quê (fonte)

`anthropics/claude-code-action`: "The GitHub app receives only a short-lived token scoped specifically to the repository"; e no aviso sobre `allowed_non_write_users`: "a static token does not rotate between runs and could be partially or fully recovered over time via prompt injection."

## Status atual no gitops-sandbox

**OK no runtime do pipeline** — `gitops.yml` usa exclusivamente `secrets.GITHUB_TOKEN` (token automático, vida curta, escopo por job), nunca um PAT fixo nos steps de CI. **Ponto de atenção separado:** existe um PAT pessoal fine-grained gerado nesta sessão (2026-07-21), guardado no macOS Keychain (`gitops-sandbox-github-pat`) — usado só pra `gh` CLI interativo local, nunca injetado no workflow. Confirmar periodicamente que continua assim (nenhum secret do Vercel/GitHub Actions referencia esse PAT) e que a validade dele está dentro do limite de 366 dias exigido pela política da org `twinfo-io` (já bateu nesse limite uma vez nesta sessão).
