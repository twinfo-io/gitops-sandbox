---
name: audit-prompt-injection-sanitization
description: Compara a cobertura de sanitização de conteúdo untrusted (issue Linear, PR body/diff) contra o que o claude-code-action oficial faz. Use ao auditar segurança de entrada do pipeline.
---

# Audit: cobertura de sanitização anti-prompt-injection

## O que checar

Ler `src/scripts/sanitize-check.ts` (E17/TWI-882) e comparar a lista de padrões escaneados contra o que `anthropics/claude-code-action` documenta em `docs/security.md`: a action deles faz *strip* ativo (não só warn) de HTML comments, caracteres invisíveis, **alt-text de imagem markdown**, atributos HTML ocultos e entidades HTML.

## Por quê (fonte)

`anthropics/claude-code-action` (8.5k★, oficial): "The action sanitizes content by stripping HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities."

## Status atual no gitops-sandbox

`sanitize-check.ts` detecta (regex, não bloqueia): unicode zero-width/bidi, `curl|bash`, override de `ANTHROPIC_BASE_URL`/`enableAllProjectMcpServers`, comentário HTML/base64, frase de jailbreak. **GAP:** não cobre alt-text de imagem markdown (`![x](url "instrução oculta aqui")`) nem atributos HTML ocultos (`<span title="instrução">`) — vetores reais documentados pela Anthropic que não escaneamos. Também: nosso scan **avisa**, não faz strip ativo do conteúdo antes do prompt — a action oficial remove o payload, nós só sinalizamos.
