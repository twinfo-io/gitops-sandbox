---
name: audit-skill-marketplace-supply-chain
description: Verifica se a dependência da marketplace externa pm-skills (E12) tem alguma forma de pin de versão ou revisão de diff quando o upstream muda, ou se instalamos sempre HEAD cegamente. Use ao auditar supply chain de skills externas.
---

# Audit: governança de versão da marketplace de skills externa

## O que checar

Ler o step "Install skill plugins (pm-skills)" em `gitops.yml` — confirmar que `claude plugin marketplace add phuryn/pm-skills` e `claude plugin install "$p@pm-skills"` não fixam nenhum commit/tag/versão — sempre pegam o estado atual do upstream no momento do CI run.

## Por quê (fonte)

Extensão direta do E17 (TWI-882) — Snyk ToxicSkills (36% de skills públicas escaneadas com prompt injection) é sobre o conteúdo da skill no momento em que foi auditada; **skill instalada sem pin de versão pode mudar de conteúdo entre uma execução e outra** sem que ninguém tenha revisado o novo conteúdo.

## Status atual no gitops-sandbox

**GAP.** Cada execução de `agent:create-specs`/`skill:*` reinstala a marketplace do zero, sempre pegando o HEAD atual do repo `phuryn/pm-skills` — mesmo que tenha sido auditada como segura numa execução anterior, nada garante que o conteúdo é o mesmo na próxima. O scan mecânico de skills instaladas (E17, step "Scan installed skills for injection patterns") mitiga parcialmente — roda depois de CADA instalação, então pega mudanças maliciosas eventualmente — mas não impede que uma versão comprometida seja usada antes do scan detectar (o scan é informativo/`continue-on-error`, não bloqueia o uso da skill na mesma run). Fixar uma versão/commit conhecido e só atualizar via PR revisado fecharia essa janela.
