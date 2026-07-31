---
name: audit-commit-signing
description: Verifica se os commits feitos pelo GitOps Bot (agentes, sync automático) são assinados (GPG/SSH) ou passam como não-verificados no GitHub. Use ao auditar trilha de proveniência de commits automatizados.
---

# Audit: assinatura de commit do bot

## O que checar

Olhar histórico de commits do "GitOps Bot" no GitHub — checar se aparecem com badge "Verified". Grep em `gitops.yml` por `gpg`, `ssh-signing-key`, `use_commit_signing` — nenhum encontrado hoje.

## Por quê (fonte)

`anthropics/claude-code-action` docs/security.md — "Commit Signing": duas opções built-in (`use_commit_signing` via API do GitHub, ou `ssh_signing_key`) — reconhecem que commit de agente sem assinatura é indistinguível de um commit forjado com o mesmo `user.name`/`user.email`.

## Status atual no gitops-sandbox

**GAP, prioridade baixa.** Commits do GitOps Bot (`git config user.name "GitOps Bot"`) não são assinados — qualquer um com acesso de escrita ao runner (ou um agente comprometido) poderia, teoricamente, forjar a identidade do bot num commit manual sem que o Git detecte diferença. Mitigação existente que reduz o risco: branch protection (E14) exige status check antes do merge, então um commit forjado sozinho não basta pra entrar em `main` sem passar pelo CI. Mesmo padrão default do próprio claude-code-action (eles também vêm unsigned por padrão) — não é urgência, mas vale registrar como pendência de hardening.
