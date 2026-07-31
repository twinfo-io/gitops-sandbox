---
name: audit-cross-model-review
description: Verifica se algum passo de revisão usa um modelo/família diferente do que gerou o trabalho original, para reduzir viés correlacionado (o mesmo modelo não vê seus próprios erros sistemáticos). Use ao auditar qualidade do processo de review.
---

# Audit: revisão por modelo diferente (cross-model)

## O que checar

Ler `semantic-check.ts` (E15) e o step de review em `agent:code-review`/`agent:security-review` — confirmar qual modelo faz a implementação (`agent:generate-code`) e qual modelo faz a checagem semântica/review. Hoje ambos são Claude Sonnet 5.

## Por quê (fonte)

`calltelemetry/openclaw-linear-plugin`: "cross-model review where plans are automatically audited by a different AI model (Claude ↔ Codex ↔ Gemini) before dispatch" — princípio: um modelo tende a não flagar o próprio ponto cego (viés de treinamento, interpretação de spec ambígua) da mesma forma que um modelo de família diferente flagaria.

## Status atual no gitops-sandbox

**GAP consciente, nunca formalizado como tal.** `agent:generate-code` usa Sonnet 5 pra implementar; `semantic-check.ts` (E15) usa Sonnet 5 pra julgar se a implementação bate com a spec — mesma família de modelo em ambas as pontas. Um erro de interpretação sistemático do Sonnet 5 sobre a spec tem chance maior de passar despercebido pelo próprio Sonnet 5 no papel de juiz. Não é um bug do E15 (ele já documenta "LLM-judge pode ter falso positivo") — é uma lacuna estrutural não endereçada: nunca avaliamos usar um modelo de outra família (ex: GPT/Gemini via API) só na camada de julgamento.
