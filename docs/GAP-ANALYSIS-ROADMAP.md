# gitops-sandbox — Gap Analysis vs. Benchmark Open-Source & Roadmap Evolutivo

> Documento de produto gerado a partir de benchmark real (dados verificados via GitHub API, 2026-07-06) contra: obra/Superpowers (247k★), anthropics/claude-code-action, wshobson/agents, davila7/claude-code-templates, anthropics/knowledge-work-plugins, gh-aw/ruflo, PR-Agent, Headroom.
>
> Adaptação de framework de produto para contexto de **plataforma interna** (não produto de mercado externo): "clientes" = squads/repos da Twinfo, "mercado" = engenharia interna, "GTM" = rollout entre repos.

---

## 1. VALUE PROPOSITION

**Problema central:** hoje, tarefas de desenvolvimento (specs, código, review, testes, deploy) dependem de trabalho manual do time; não existe camada padronizada que conecte gestão de produto (Linear) a execução de engenharia (Claude Code) com segurança e auditoria adequadas.

**Segmento-alvo primário:** squads de engenharia da Twinfo/Lifters que já usam Linear como sistema de gestão e querem delegar tarefas mecânicas/repetitivas (code review, geração de código a partir de spec aprovada, testes, deploy) a agentes de IA sem perder controle e trilha de auditoria.

**Proposta de valor (1 frase):**
Para squads de engenharia da Twinfo que perdem tempo com tarefas mecânicas de dev (review, testes, PRs de baixo risco), o **gitops-sandbox** é uma plataforma de automação agente-em-CI que conecta Linear e GitHub Actions para executar Claude Code de forma segura e auditável, diferente de ferramentas SaaS fechadas (CodeRabbit, Sweep) porque roda 100% dentro da infraestrutura da empresa, é gratuito (usa créditos Anthropic já existentes) e é customizável por label.

**Top 3 ganhos para o usuário:**
1. Tarefas mecânicas (review, testes, PR de manutenção) saem da fila do time sem sair do Linear — basta adicionar um label.
2. Trilha de auditoria nativa: toda ação do agente vira sub-issue/comentário rastreável no Linear, não um log perdido em algum CI.
3. Reuso direto do investimento já feito em skills de PM/dev da Twinfo (specs, PRD, opportunity trees) dentro do próprio pipeline de CI.

**Top 3 dores eliminadas:**
1. Contexto perdido entre "o que foi pedido no Linear" e "o que foi codado" (hoje depende de disciplina manual de linkar PR↔issue).
2. Falta de padronização em como agentes de IA tocam o repo (branch, PR body, permissões) — hoje cada dev faria diferente.
3. Ausência de gate de qualidade automático antes de abrir PR (typecheck/test hoje são regra de prompt, não framework).

---

## 2. LEAN CANVAS

| Bloco | Conteúdo |
|---|---|
| **Problema (top 3)** | 1) Tarefas mecânicas de dev consomem tempo de engenheiro sênior. 2) Falta de trilha de auditoria entre decisão de produto (Linear) e execução (código). 3) Risco de segurança não endereçado ao dar autonomia de escrita a um agente de IA no repo. |
| **Segmentos de clientes (early adopters)** | Time da plataforma GitOps (self-dogfooding no sandbox); próximo: squad de `bpx-agent-clickhouse`; depois: `gorjeta`. |
| **Proposta de valor única** | Único setup interno que une Linear (produto) + GitHub Actions (execução) + Claude Code (agente) com anti-recursão, trilha de auditoria e regras de segurança nativas de repo. |
| **Solução (top 3 features)** | 1) Dispatch de agent via label Linear (webhook HMAC-validado). 2) 5 comportamentos de agent prontos (generate-code, run-tests, security-review, deploy, code-review) + `skill:*` genérico. 3) Feedback loop determinístico agent→Linear (`report-result.ts`). |
| **Canais** | Interno: Linear (labels), README/ONBOARDING.md do repo, CLAUDE.md como contrato de comportamento. |
| **Fluxo de receita** | N/A (plataforma interna) — "receita" = horas de engenharia economizadas / redução de ciclo issue→PR. |
| **Estrutura de custos** | Créditos API Anthropic (variável por execução), Vercel Edge Function (webhook, free tier suficiente), GitHub Actions minutes (free tier org). |
| **Métricas-chave** | Ver seção 8 (North Star + KPIs). |
| **Vantagem injusta** | Twinfo já tem dezenas de skills de PM/dev prontas (create-prd, code-review, security-review) — nenhum concorrente open-source tem esse catálogo pré-integrado ao domínio do negócio (iGaming/Linear workflow da empresa). |

---

## 3. MARKET SIZING (adaptado: adoção interna, não mercado externo)

| Nível | Definição | Estimativa |
|---|---|---|
| **TAM** (universo endereçável) | Todos os repos ativos da Twinfo/Lifters com Linear + GitHub | ~10-20 repos (estimativa baseada em `bpx-agent-clickhouse`, `gorjeta` citados como próximos alvos + gitops-sandbox) |
| **SAM** (endereçável com o setup atual) | Repos que já usam Linear como sistema de issue e têm CI em GitHub Actions | ~5-8 repos |
| **SOM** (obtível em 6 meses pós-validação) | Repos com tech lead sign-off após Fase 5/6 do roadmap atual | 2-3 repos (`bpx-agent-clickhouse`, `gorjeta` conforme já indicado em `docs/ROADMAP.md` Fase 7) |

**Racional:** números extraídos do próprio `docs/ROADMAP.md` (Fase 7 já nomeia os 2 próximos repos-alvo). Sem dado de mercado externo aplicável — é infraestrutura interna, sizing é por repo/squad, não por usuário final.

---

## 4. ANÁLISE COMPETITIVA

### Diretos (fariam o mesmo papel, se adotados)

| Projeto | Licença | Pontos fortes | Por que não substitui gitops-sandbox |
|---|---|---|---|
| **anthropics/claude-code-action** | MIT | Referência oficial em segurança (bubblewrap, scrubbing, gate write-access) | Não tem integração nativa com Linear nem trilha de auditoria por sub-issue |
| **obra/Superpowers** | MIT | Metodologia rigorosa (TDD, verification-before-completion, design-first) | É metodologia de skill, não infraestrutura de CI/dispatch — complementar, não substituto |
| **PR-Agent** | Apache-2.0 | Code review LLM maduro, comunidade grande | Tem CVE conhecido de prompt injection; só cobre review, não geração/deploy/orquestração completa |
| **CodeRabbit** | SaaS fechado | Produto polido, zero manutenção | Pago, fora da infra da empresa, sem customização de skills internas |

### Indiretos

| Projeto | Papel |
|---|---|
| **davila7/claude-code-templates** | Concorreria em "developer experience" (instalador, dashboard) — não em orquestração Linear-CI |
| **wshobson/agents** | Concorreria em "biblioteca de subagents prontos" — poderia ser fonte de prompts, não substitui o pipeline |

### Feature matrix

| Feature | gitops-sandbox | claude-code-action | Superpowers | PR-Agent | CodeRabbit |
|---|---|---|---|---|---|
| Integração nativa Linear | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dispatch por label (self-service) | ✅ | ⚠️ (via comment/mention) | ❌ | ⚠️ | ⚠️ |
| Anti-recursão (loop agente→agente) | ✅ | ⚠️ parcial | N/A | ❌ (CVE) | N/A |
| Sandboxing/scrubbing de secrets | ❌ | ✅ | N/A | ❌ (CVE) | N/A (SaaS) |
| Gate design/PRD antes de codar | ❌ | ❌ | ✅ | N/A | N/A |
| Economia de tokens nativa | ❌ | ⚠️ | ❌ (bug conhecido) | ⚠️ | N/A |
| Gratuito/self-hosted | ✅ | ✅ | ✅ | ✅ | ❌ |

**Gap de mercado identificado:** não existe, no open-source pesquisado, um projeto que combine "dispatch via issue tracker" + "segurança nível claude-code-action" + "metodologia design-first nível Superpowers". gitops-sandbox já tem a primeira peça; as outras duas são os gaps a fechar (seção 5).

**Posicionamento recomendado:** gitops-sandbox não deve competir em ser "mais um framework de subagents genérico" — deve se posicionar como **"a camada de governança Linear↔Claude Code da Twinfo"**, importando práticas de segurança do claude-code-action e de metodologia do Superpowers, mas mantendo a integração Linear como diferencial único.

---

## 5. PRD — PRODUCT REQUIREMENTS DOCUMENT

### Objetivo e visão
Fazer do gitops-sandbox a camada padrão de execução segura de agentes Claude Code para todos os repos da Twinfo que usam Linear, com trilha de auditoria completa e sem risco de exfiltração de dados/permissões.

### Personas

| Persona | Papel | Necessidade principal |
|---|---|---|
| **Dev responsável pelo repo** | Aciona/revisa PRs de agente | Confiança de que o agente não vai quebrar CI nem vazar secrets |
| **PM/Tech Lead** | Cria specs, decide o que vira issue com label `agent:*` | Trilha clara de decisão→execução, sem precisar acompanhar CI manualmente |
| **Plataforma/GitOps owner** (você) | Mantém o sandbox, expande pra novos repos | Framework replicável, sem reescrever workflow por repo |

### Jobs-to-be-done principais
1. Quando adiciono um label numa issue Linear, quero que o agente correto execute com o mínimo de permissão necessária, para não precisar revisar manualmente cada ação.
2. Quando um agente gera código, quero verificação real (não alucinada) de que passou nos testes, para confiar no PR sem reexecutar tudo manualmente.
3. Quando decido expandir o sistema pra outro repo, quero que a config seja portável (sync-config.json + CLAUDE.md), para não recriar a infra do zero.

### Épicos e features (priorizado por impacto/esforço/risco de segurança)

| # | Épico | Impacto | Esforço | Risco se não fizer | Prioridade | Status | Linear | Commit |
|---|---|---|---|---|---|---|---|---|
| E1 | **Gate de segurança crítico**: write-access gating + sanitização anti-prompt-injection de conteúdo Linear | Alto | Baixo-Médio | **Crítico** (CVE análogo já existe no PR-Agent) | **P0** | ✅ Done | [TWI-294](https://linear.app/twinfo-lifters/issue/TWI-294) | `0abde47` |
| E2 | **Economia de tokens**: prompt caching Anthropic + roteamento de modelo por label | Médio-Alto | Baixo (config) | Custo crescente sem controle | **P0** | ✅ Done | [TWI-295](https://linear.app/twinfo-lifters/issue/TWI-295) | `1f400bb` |
| E3 | Corrigir gap `agent:create-specs`: label existe no webhook (`AGENT_LABELS`) mas não tem branch de prompt implementada no `gitops.yml` | Médio | Baixo | Label "morta" gera confusão/erro silencioso | **P0** | ✅ Done | [TWI-296](https://linear.app/twinfo-lifters/issue/TWI-296) | `86a4dff` |
| E4 | Sandboxing de subprocesso + scrubbing de secrets do ambiente do agente | Alto | Médio | Vazamento de credencial em execução comprometida | **P1** | ✅ Done (parcial — escopo de secrets/tools; sandboxing de SO não feito) | [TWI-297](https://linear.app/twinfo-lifters/issue/TWI-297) | `5eb08b6` |
| E5 | Gate `verification-before-completion`: agente só reporta sucesso ao Linear após ler output real de teste/build | Alto | Baixo-Médio | Falso positivo de sucesso no Linear | **P1** | ✅ Done (parcial — só generate-code/create-specs, branch previsível) | [TWI-298](https://linear.app/twinfo-lifters/issue/TWI-298) | `d5d08f8` |
| E6 | Gate de PRD/spec aprovada antes de `agent:generate-code` (conectar skills PM já existentes como estágio formal) | Alto | Médio | Código gerado sem spec clara, retrabalho | **P1** | ✅ Done | [TWI-299](https://linear.app/twinfo-lifters/issue/TWI-299) | `7fd8b49` |
| E7 | Framework de eval/certificação dos prompts dinâmicos por label (estático + LLM-judge) | Médio | Médio | Degradação silenciosa de qualidade dos prompts ao longo do tempo | **P2** | ✅ Done (2 de 3 camadas — Monte Carlo adiado por decisão) | [TWI-300](https://linear.app/twinfo-lifters/issue/TWI-300) | `462ab17` |
| E8 | Dashboard/observability agregada (taxa de sucesso por label, custo de token, tempo médio) fora do Linear | Médio | Médio-Alto | Sem visibilidade se Linear cair ou para decisões de expansão | **P2** | ✅ Done (job summary + artifact; dashboard visual fica pra v2) | [TWI-301](https://linear.app/twinfo-lifters/issue/TWI-301) | `0369f6c` |
| E9 | Isolamento de subtarefa com ledger de progresso em arquivo (subagent-driven-development) | Médio | Alto | Tarefas grandes falham monoliticamente sem checkpoint | **P3** | ✅ Done completo — ledger commitado a cada etapa (não só no final) + resume real: agent detecta branch de execução interrompida, lê o ledger e continua da próxima etapa em vez de recomeçar. Não reestrutura em jobs/processos separados (isso seria uma re-arquitetura maior, fora de escopo) | [TWI-302](https://linear.app/twinfo-lifters/issue/TWI-302) | `dc575aa` |
| E10 | Geração automática de testes a partir do diff (padrão Keploy) | Médio | Médio | Cobertura de teste não cresce junto com código gerado por agente | **P3** | ✅ Done completo — novo label `agent:generate-tests` escreve teste real, roda a suíte, commita e abre PR (mantém `agent:suggest-tests` como opção mais barata/só-comentário para quem preferir manter humano 100% no loop) | [TWI-303](https://linear.app/twinfo-lifters/issue/TWI-303) | `dc575aa` |
| E11 | Framework de auto-fix/self-healing de CI | Baixo (mercado imaturo) | Alto | Nenhum — categoria sem solução madura em lugar nenhum | **Backlog / não priorizar agora** | 📋 Backlog — decisão explícita do usuário de manter parado | [TWI-304](https://linear.app/twinfo-lifters/issue/TWI-304) | — |
| E12 | Skills de plugin (pm-skills) nunca instaladas no ambiente de CI — `/create-prd`, `skill:*` falhariam silenciosamente | Alto | Baixo | Agent roda mas ignora a skill, produz output degradado sem avisar | **P1** | ✅ Done | [TWI-323](https://linear.app/twinfo-lifters/issue/TWI-323) | `ad2b0fc` |
| E13 | Metodologia estruturada de dev (feature-dev adaptado, headless) em `agent:generate-code` — explore/design/review via sub-agents paralelos | Alto | Alto | Código gerado sem exploração de padrões existentes nem comparação de arquiteturas | **P2** | ✅ Done — custo bem mais alto assumido conscientemente (até 8 sub-agents/execução) | [TWI-337](https://linear.app/twinfo-lifters/issue/TWI-337) | — |
| E15 | Check semântico anti-alucinação (intended-vs-implemented) — E5 só verifica sintaxe/teste, não se o diff implementa o que a spec pediu | Alto | Médio | Código passa em teste mas implementa a coisa errada, ninguém percebe até o humano ler linha a linha | **P2** | ✅ Done — não bloqueia (informativo), LLM-judge pode ter falso positivo | [TWI-350](https://linear.app/twinfo-lifters/issue/TWI-350) | — |

**Extra não previsto no plano original:** cobertura de testes do repo elevada de 56.33% para 99.55% (statements/lines), incluindo suite nova para `parse-pr.ts` (0%→100%) e correção de bug real (`FIELD_RE` cruzando linha) encontrado no processo. Commit `fed7384`.

### Critérios de sucesso / métricas de produto
Ver seção 8.

### Fora de escopo (v1 deste roadmap incremental)
- Dashboard visual completo (tipo davila7) — só métricas cruas primeiro (E8 é "medir", não "visualizar bonito").
- Suporte multi-provider de LLM (roteamento fica só dentro do catálogo Anthropic: Haiku/Sonnet/Opus).
- Self-healing de CI (E11) — mercado ainda não resolveu isso bem, não vale investir agora.
- Migração de repos de produção (`bpx-agent-clickhouse`, `gorjeta`) — só depois de E1-E6 completos no sandbox.

---

## 6. USER STORIES (MVP — foco em E1, E2, E3, E5, E6)

1. **Como** dev responsável pelo repo, **quero** que só usuários com permissão de escrita possam disparar um agent via label, **para** que ninguém externo consiga executar código no meu repo via issue pública.
   *Critério de aceite:* webhook rejeita dispatch se o autor do label não tiver `write` no repo alvo (verificação via GitHub API antes do `workflow_dispatch`).

2. **Como** plataforma/GitOps owner, **quero** que conteúdo vindo de título/descrição/comentário de issue Linear seja tratado como não-confiável antes de entrar no prompt do agente, **para** evitar prompt injection que leve a exfiltração de token (cenário do CVE-2024-51355/51356).
   *Critério de aceite:* existe uma etapa de sanitização/delimitação explícita (ex: bloco marcado como "untrusted content") entre o texto da issue e a instrução do sistema.

3. **Como** dev, **quero** que o agente use prompt caching da Anthropic no prefixo fixo de cada label, **para** reduzir custo de execução sem mudar o comportamento.
   *Critério de aceite:* chamadas `claude --print` do mesmo label reutilizam cache (validável via header/metadata de uso de tokens cacheados no log do run).

4. **Como** plataforma owner, **quero** que tarefas simples (ex: `agent:run-tests`) usem um modelo mais barato (Haiku) e tarefas complexas (ex: `agent:generate-code`) usem Sonnet/Opus, **para** não pagar o mesmo custo em todas as execuções.
   *Critério de aceite:* variável de modelo é resolvida por label num mapa de config, não hardcoded.

5. **Como** dev, **quero** que o label `agent:create-specs` (já presente no `AGENT_LABELS` do webhook) tenha um comportamento real implementado no `gitops.yml`, **para** que não falhe silenciosamente ou caia no prompt genérico errado.
   *Critério de aceite:* existe branch `elif [ "$AGENT_LABEL" = "agent:create-specs" ]` com prompt dedicado (gera spec/PRD usando as skills PM do repo).

6. **Como** dev, **quero** que o agente só marque a issue como concluída no Linear depois de ler o exit code real do `npm run typecheck`/`npm test`, **para** eliminar falso positivo de sucesso.
   *Critério de aceite:* `report-result.ts` recebe status derivado de exit code capturado no step anterior, não de heurística do texto de saída do Claude.

7. **Como** PM, **quero** que uma issue só possa receber o label `agent:generate-code` depois de ter uma spec/PRD anexada (via skill `write-spec` ou equivalente), **para** evitar geração de código sem requisito claro.
   *Critério de aceite:* workflow valida presença de campo/anexo de spec antes de prosseguir; se ausente, comenta na issue pedindo spec e não dispara geração.

8. **Como** dev, **quero** que o ambiente do subprocesso Claude não tenha acesso a secrets além do estritamente necessário para aquele label, **para** limitar o raio de dano em caso de comportamento inesperado do agente.
   *Critério de aceite:* `run-agent` job usa `allowedTools` + env scoping por label (ex: `agent:deploy` só recebe secret de deploy, não `LINEAR_API_KEY` de escrita ampla).

9. **Como** plataforma owner, **quero** um log estruturado (fora do Linear) por execução de agente, **para** ter trilha de auditoria mesmo se a API do Linear cair.
   *Critério de aceite:* cada execução grava um artifact/summary no GitHub Actions (job summary) com label, issue, status, tokens usados, duração.

10. **Como** dev, **quero** que branches e PRs de agente sigam a convenção existente (`agent/TWI-{id}`, marcador `<!-- agent-created: true -->`) mesmo nos novos fluxos (spec-gate, eval), **para** manter consistência com o que já funciona.
    *Critério de aceite:* nenhuma nova feature quebra a convenção documentada em `CLAUDE.md`.

---

## 7. SPRINT PLAN (Sprint 1 — 2 semanas)

**Goal da sprint:** fechar os 3 gaps de segurança/custo mais baratos e críticos (E1 parcial, E2, E3) sem tocar em arquitetura de orquestração.

| Story | Story Points | Responsável sugerido |
|---|---|---|
| #5 — implementar branch `agent:create-specs` no `gitops.yml` | 2 | Dev backend |
| #3 — prompt caching Anthropic no `run-agent` | 3 | Dev backend |
| #4 — roteamento de modelo por label (mapa label→modelo) | 3 | Dev backend |
| #1 — write-access gate no webhook (`api/linear-webhook.ts`) | 5 | Dev backend/segurança |
| #2 — sanitização de conteúdo untrusted no prompt (delimitação básica) | 5 | Dev backend/segurança |

**Total:** 18 pontos.

**Definition of Done:**
- Typecheck + testes passam (`npm run typecheck && npm test`).
- Nenhuma mudança em `.github/workflows/` sem revisão explícita de segurança (regra já existente no `CLAUDE.md`, reforçada aqui por ser justamente a área tocada).
- PR revisado por humano antes de merge (não é PR de agente nesta sprint — mudança de infraestrutura crítica).
- README/CLAUDE.md atualizados se comportamento de label mudar.

**Riscos e dependências:**
- Write-access gate depende de permissão da GitHub API para checar `collaborators/{user}/permission` — validar se o token atual (`GITHUB_TOKEN` do Vercel) tem esse escopo.
- Sanitização de prompt injection é mitigação, não solução completa — registrar como risco residual aceito, não "resolvido 100%".
- Prompt caching só reduz custo em chamadas com prefixo idêntico — validar que os prompts por label realmente compartilham prefixo estável hoje.

---

## 8. NORTH STAR METRIC + KPIs

**North Star Metric:** **Taxa de execuções de agente concluídas com sucesso verificado, sem intervenção manual de correção** (%).
*Racional:* captura simultaneamente confiabilidade técnica (não quebra) e confiança do time (não precisa checar toda execução) — é a métrica que, se subir, justifica expandir para mais repos (Fase 7 do roadmap).

**KPIs de produto:**
1. **Custo médio de token por execução, por label** (USD) — mede efeito direto de E2 (caching/roteamento).
2. **Tempo médio issue→PR aberto** (minutos) — já tem meta declarada no `SPECS.md` (< 15 min para `agent:generate-code`).
3. **Taxa de findings de segurança/QA pós-merge originados de PR de agente** — mede se os gates (E1, E5, E6) estão funcionando.
4. **% de labels `agent:*`/`skill:*` com comportamento implementado vs. declarado no webhook** — hoje é <100% por causa do gap E3; meta é 100%.
5. **Número de repos ativos usando o pipeline** — mede adoção real (SOM da seção 3).

**Métricas de vaidade a evitar:**
- Número total de execuções de agente disparadas (não diz nada sobre qualidade).
- Número de sub-issues criadas por code-review automático (mais não é melhor — pode ser ruído).
- Velocidade de resposta do webhook isolada (irrelevante se o resultado final falha).

**Framework de medição:**
- Fonte primária: job summary do GitHub Actions por execução (a implementar via E8) + comentários/estado no Linear (já existente via `report-result.ts`).
- Frequência: revisão semanal manual até existir dashboard agregado; automatizar extração após E8.

---

## 9. ROLLOUT PLAN (adaptado de GTM — expansão interna, não lançamento de mercado)

**Canal de "aquisição" primário:** dogfooding contínuo no próprio `gitops-sandbox` — nenhuma expansão para repo de produto antes de E1-E6 validados end-to-end (consistente com o princípio "Sandbox first" já documentado em `docs/ROADMAP.md`).

**Estratégia de expansão (3 fases):**
1. **Hardening** (Sprint 1-2): fechar E1, E2, E3, E5 no sandbox.
2. **Governança de produto** (Sprint 3-4): E6 (gate de PRD) + E7 (eval de prompts) — só depois disso o sistema está "confiável o suficiente" pra sair do sandbox.
3. **Expansão controlada**: ativar em 1 repo real por vez, começando pelo indicado no roadmap atual (`bpx-agent-clickhouse` antes de `gorjeta`, por critério de risco/criticidade a definir com tech lead).

**Beachhead (primeiro repo a conquistar):** o próprio squad de plataforma/GitOps, usando o sandbox como prova real antes de pedir adoção de outro time — evita o erro clássico de vender internamente algo que o próprio time não usa.

**Mensagem core:** "Labels no Linear que você já usa agora também executam trabalho — com a mesma trilha de auditoria que você já confia."

**Cronograma sugerido:**

| Semana | Marco |
|---|---|
| 1-2 | Sprint 1: E1 (parcial), E2, E3 |
| 3-4 | E1 completo (sandboxing/scrubbing) + E5 (verification-before-completion) |
| 5-6 | E6 (gate PRD) — conectar skills PM existentes ao fluxo Linear→CI |
| 7-8 | E7 (eval de prompts) + validação E2E completa (Fase 5 do `docs/ROADMAP.md`) → sign-off pra Fase 7 (produção) |

---

## Apêndice — Mapeamento com `docs/ROADMAP.md` existente

Este documento **não substitui** o roadmap de fases já existente — complementa como **Fase 5.5 / pré-requisito de Fase 7**. Recomenda-se inserir os épicos E1-E7 como itens explícitos dentro da já existente "Fase 5 — Validação & Governança" antes de declarar sign-off para "Fase 7 — Produção", e usar E9-E11 como conteúdo candidato para a já existente "Fase 6 — Ciclo Auto-Corretivo" (que hoje está com spec pendente, TWI-182 a TWI-185).
