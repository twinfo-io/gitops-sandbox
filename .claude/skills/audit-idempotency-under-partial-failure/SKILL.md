---
name: audit-idempotency-under-partial-failure
description: Verifica sistematicamente se cada script (create-demand, slice-epic, sync-project, report-result) é seguro de rodar 2x seguidas após uma falha no meio da execução anterior. Use ao auditar robustez a falha parcial.
---

# Audit: idempotência sob falha parcial (todos os scripts)

## O que checar

Pra cada script em `src/scripts/`, simular mentalmente: "se esse script morrer na metade (timeout, crash, rede caiu) e rodar de novo do zero, ele duplica algo ou é seguro?" Conferir contra os testes existentes (`*.test.ts`) se esse cenário está coberto.

## Por quê (fonte)

Padrão de engenharia distribuída básico (não específico de nenhuma fonte do benchmark) — mas relevante porque já viramos vítima disso nesta sessão: TWI-153–161 ficaram formalmente "perdidos" (linkados mas nunca fechados) por falta de reconciliation, não por falta de idempotência no script em si — sinal de que vale checar TODOS os scripts, não só os que já tiveram bug encontrado.

## Status atual no gitops-sandbox

**Misto — já bom, mas não auditado como conjunto.** `create-demand.ts` e `slice-epic.ts` já são idempotentes por design (checam ID existente antes de criar). `sync-project.ts` (`pull`/`push`) é idempotente por natureza (sobrescreve com o estado atual do Linear). `report-result.ts` **não é obviamente idempotente**: se rodar 2x pra mesma issue (ex: retry manual depois de falha de rede no meio do `Promise.all([postComment, updateStatus])`), o comentário duplica no Linear — não há checagem de "já reportei essa run". Baixo impacto (é só ruído no Linear, não corrompe estado), mas nunca foi verificado explicitamente.
