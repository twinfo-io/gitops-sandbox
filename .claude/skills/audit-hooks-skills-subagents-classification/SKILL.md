---
name: audit-hooks-skills-subagents-classification
description: Aplica o framework oficial da Anthropic (Hooks=regra enforced, Skills=conhecimento contextual, Subagents=fronteira de delegação, CLAUDE.md=guidance sempre-ativa curta) contra a arquitetura real do gitops-sandbox, achando lógica mal classificada. Use ao revisar a arquitetura geral do projeto.
---

# Audit: classificação Hooks/Skills/Subagents/CLAUDE.md

## O que checar

Pra cada regra/comportamento do pipeline, perguntar: "isso precisa ser tecnicamente enforced (Hook/permissions), ou é só conhecimento que ajuda a decidir (Skill), ou é uma fronteira de contexto isolado (Subagent), ou é guidance curta sempre presente (CLAUDE.md)?" Comparar contra onde a regra realmente vive hoje.

## Por quê (fonte)

Anthropic, "Equipping agents for the real world with Agent Skills": "If a rule must be enforced, use Hooks or permissions; if it is contextual knowledge, use Skills; if it is a delegation boundary, use Subagents; if it is always-on project guidance, keep it short in CLAUDE.md."

## Status atual no gitops-sandbox

**Misto — parcialmente corrigido pelo E17, ainda tem sobra.** Regras que JÁ migraram pra enforcement técnico corretamente: paths sensíveis e comandos perigosos → `permissions.deny` (Hook-equivalente, TWI-882). Regras que AINDA são só texto de prompt (deveriam ser Hook, mas não são): "branch deve começar com `agent/`" e "PR body deve começar com `<!-- agent-created: true -->`" — hoje só instruções no `CLAUDE_PROMPT`, nunca enforced tecnicamente (um agente que "esquecer" a convenção não é bloqueado por nada, só o `report-result.ts` não teria como linkar a issue depois). Candidato natural a virar Hook: `PreToolUse` hook ou GitHub branch-name-pattern rule.
