---
name: audit-multi-repo-scalability
description: Verifica se a arquitetura atual (1 sync-config.json + 1 gitops.yml por repo, hand-crafted) realmente escala pro objetivo declarado no README de "conectar qualquer projeto da organização", ou se cada onboarding ainda é trabalho manual grande. Use ao auditar a promessa de escala do produto.
---

# Audit: escala real pra múltiplos repositórios

## O que checar

Ler `docs/ONBOARDING.md` (checklist de 7 passos, ~45min) e contar quantos desses passos são automatizáveis hoje vs. exigem cópia manual de arquivo/edição de IDs por repo.

## Por quê (fonte)

O próprio `sync-config.json` já documenta a intenção: "Cada projeto da org tem seu próprio sync-config.json" — mas a proposta de valor do projeto (README: "conectar Git/GitHub ↔ Linear ↔ Claude Agents para qualquer projeto da organização") pressupõe isso ser barato de repetir.

## Status atual no gitops-sandbox

**GAP relativo à ambição declarada.** Hoje existe só 1 instância real (gitops-sandbox) — nunca testado em produção contra um segundo repo. O onboarding de 7 passos é manual (copiar `gitops.yml`, gerar `sync-config.json` com IDs específicos do Linear daquele projeto, configurar secrets no novo repo/Vercel). Não existe `npx gitops init` funcional (mencionado no spec original do TWI-153 como critério de aceite, nunca implementado — só documentado como entregue via `sync-config.json` estático). Se o objetivo real é "qualquer projeto da org", falta a ferramenta de bootstrap automatizado — hoje é copy-paste + edição manual por repo.
