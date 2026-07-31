---
name: audit-os-level-sandboxing
description: Verifica se o subprocesso do Claude Code CLI roda com isolamento de SO (bubblewrap/PID-namespace) ou só depende do isolamento de VM efêmera do GitHub Actions. Use ao auditar blast radius de um agente comprometido.
---

# Audit: sandboxing de SO do subprocesso

## O que checar

Grep em `.github/workflows/gitops.yml` por qualquer chamada a `bwrap`, `unshare`, `firejail`, `docker run --network=none`, ou `security_opt`. Confirmar que hoje não existe nenhuma — o único isolamento é a VM efêmera padrão do runner `ubuntu-latest`.

## Por quê (fonte)

`anthropics/claude-code-action`: "On Linux runners with bubblewrap available, subprocesses additionally run with PID-namespace isolation" — camada extra de isolamento além da VM do runner. E4 (TWI-297) do nosso próprio roadmap já documenta isso como "parcial — sandboxing de SO não feito".

## Status atual no gitops-sandbox

GAP confirmado e já rastreado (E4, TWI-297, status "Done (parcial)"). Continua real: se o subprocesso Claude for comprometido via prompt injection, ele tem acesso total ao filesystem/rede da VM do runner, sem PID-namespace nem `cap_drop`. Mitigação parcial existente: `permissions.deny` (E17) bloqueia paths/comandos específicos, mas não é isolamento de SO — é allowlist/denylist na camada do Claude Code, não do kernel.
