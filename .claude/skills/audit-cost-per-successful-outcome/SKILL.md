---
name: audit-cost-per-successful-outcome
description: Verifica se a observability (E8) mede custo/tokens em relação ao resultado (PR aceito vs. descartado), ou só registra números brutos sem contexto de sucesso. Use ao auditar métricas de ROI da automação.
---

# Audit: custo por resultado bem-sucedido (não só custo bruto)

## O que checar

Ler `report-result.ts` e o job summary do `run-agent` — confirmar quais campos são registrados (duração, tokens in/out, custo USD) e se algum deles é cruzado com "esse PR foi mergeado?" ou "esse PR foi descartado/teve retrabalho?".

## Por quê (fonte)

North Star Metric do próprio `docs/GAP-ANALYSIS-ROADMAP.md` já cita "custo médio de token por execução, por label" como KPI — mas a métrica declarada é sobre a *execução*, não sobre o *resultado*. Padrão de mercado (ex: métricas de produto de dev tools) sempre correlaciona custo com outcome, não só com atividade.

## Status atual no gitops-sandbox

**GAP.** Hoje registramos custo/tokens/duração por execução (E8, TWI-301) mas nada liga isso a "esse PR foi aceito sem alteração" vs "esse PR foi rejeitado e reescrito manualmente" vs "essa execução falhou e teve retry manual". Sem isso, "custo médio por label" é uma métrica de atividade, não de eficácia — um label caro que sempre acerta de primeira e um label barato que sempre precisa de retrabalho humano aparecem como números soltos, sem se saber qual é realmente mais eficiente. Não medível ainda de qualquer forma, dado que o pipeline nunca rodou de verdade em produção (bloqueio de crédito Anthropic) — mas o *campo* pra essa correlação devia existir desde já no schema do `report-result.ts`.
