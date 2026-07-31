---
name: audit-doc-vs-reality-drift
description: Varre README/docs/comentários em busca de afirmações que já não batem com o código real (convenções mudadas, políticas revertidas, contadores desatualizados). Use periodicamente, não só depois de uma mudança grande.
---

# Audit: drift entre documentação e código real

## O que checar

Grep sistemático por frases absolutas em `README.md`, `docs/*.md`, comentários em `gitops.yml` que descrevem política/estado ("sempre exige", "nunca permite", "N de M concluído") e conferir cada uma contra o código/config atual, não contra a memória de quando foi escrita.

## Por quê (fonte)

Padrão descoberto empiricamente nesta própria sessão, mais de uma vez: comentário em `gitops-sync` dizendo "ainda espera 1 aprovação" sobrevivendo à reversão do E14; TWI-349 com texto "repo tem 20 colaboradores (não é solo)" contradizendo a decisão real tomada depois; contador "12/13 épicos" na página de docs sobrevivendo à conclusão de E14-E16. Um padrão recorrente, não um incidente isolado — vale ser uma checagem sistemática, não descoberta por acaso.

## Status atual no gitops-sandbox

**Processo, não gap pontual.** Não há hoje nenhuma automação que detecte esse tipo de drift — toda vez que achamos, foi por leitura manual coincidente durante outra tarefa. Candidato a virar step de CI leve: grep por padrões de "contador N/M" e "política de branch protection" comparado contra o estado real via `gh api`, rodando no mesmo job do `eval-prompts` (E7) — mesma filosofia (checagem estática, sem custo de LLM).
