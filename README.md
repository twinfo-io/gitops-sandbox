# GitOps × Claude Agents

> Uma label no Linear. Um agente Claude abre o PR, roda os testes, faz a revisão de segurança e fecha o card — sem intervenção humana.

**Status:** Sandbox live · Pipeline E2E validado · Aguardando crédito Anthropic para execução completa

---

## O problema

Times de engenharia perdem tempo em três lugares:

1. **Sincronização manual** entre Linear e GitHub — quem fecha o card quando o PR mergeia?
2. **Code review como gargalo** — reviewer humano disponível vs. PR esperando há 2 dias
3. **Tarefas repetitivas** — gerar boilerplate, rodar testes, identificar CVEs conhecidos

Esse repositório resolve os três com um sistema de agentes autônomos acionados por labels do Linear.

---

## Como funciona

```
Humano adiciona label no Linear
         │
         ▼
Linear dispara webhook →  Vercel Edge (HMAC-SHA256)
                                    │
                                    ▼
                         GitHub workflow_dispatch
                                    │
                                    ▼
                    Claude CLI executa no GitHub Actions
                    ├── lê issue no Linear
                    ├── analisa codebase via CLAUDE.md
                    ├── gera implementação / review / teste
                    └── abre PR + atualiza Linear → In Review
                                    │
                          Humano faz review do PR
                                    │
                                    ▼
                              PR mergeado
                                    │
                                    ▼
                    gitops-sync fecha card → Linear Done
```

Ciclo completo: **label adicionada → PR aberto → card fechado**, sem tocar no teclado.

---

## Workflows definidos

| Label Linear | O que dispara | Output esperado | Tempo estimado | Aprovação humana |
|---|---|---|---|---|
| `agent:generate-code` | Metodologia feature-dev adaptada: explora (sub-agents) → decide arquitetura (sub-agents) → implementa → revisa (sub-agents) | PR com implementação completa, arquitetura escolhida documentada, follow-ups conhecidos | < 15 min | Review normal do PR |
| `agent:run-tests` | Executa suite de testes do projeto | Comentário no Linear com resultado (pass/fail por suite) | < 5 min | Nenhuma — read-only |
| `agent:code-review` | Review do último diff do PR | Sub-issues no Linear por finding, com severidade | < 10 min | Nenhuma — read-only |
| `agent:security-review` | Scan de vulnerabilidades e CVEs | Sub-issues com `severity:*` + fixes sugeridos | < 10 min | Nenhuma — read-only |
| `agent:deploy` | Dispara pipeline de deploy | Comentário com URL ou logs de falha | Depende do pipeline | `trigger:production-approved` obrigatório |
| `agent:create-specs` | Gera especificação técnica a partir da issue | Documento em `.specs/` commitado | < 10 min | Nenhuma |
| `agent:suggest-tests` | Lê o diff do PR e identifica lacunas de cobertura | Comentário no Linear com casos de teste sugeridos (describe/it) | < 10 min | Nenhuma — read-only, não commita nem abre PR |
| `agent:generate-tests` | Lê o diff do PR, escreve testes reais cobrindo o gap e roda a suíte | PR com teste(s) novo(s) passando | < 10 min | Review normal do PR |

### Fluxo automático sem label (GitOps passivo)

| Evento GitHub | O que acontece | Onde aparece |
|---|---|---|
| PR mergeado com `LINEAR_ID: TWI-XXX` | Card fechado no Linear (Done) | Linear → card atualizado |
| PR mergeado **sem** `LINEAR_ID` | Demanda furtiva detectada → issue criada retroativamente | Linear → novo card Backlog |
| PR aberto (branch humana) | Code review automático via Claude | PR → review comentado |

---

## Papéis e responsabilidades

| Responsabilidade | Humano | Agente Claude |
|---|---|---|
| Escrever especificação da issue | ✅ | — |
| Adicionar label `agent:*` | ✅ | — |
| Fazer review do PR gerado | ✅ | — |
| Aprovar merge | ✅ | — |
| Escalar incidente (output incorreto) | ✅ | — |
| Implementar código a partir da spec | — | ✅ |
| Rodar testes e reportar resultado | — | ✅ |
| Revisar código e criar findings | — | ✅ |
| Abrir PR com branch `agent/*` | — | ✅ |
| Atualizar status no Linear | — | ✅ |
| Criar sub-issues de findings | — | ✅ |

**Regra de ouro:** agentes nunca fazem merge. Humano sempre aprova a última ação.

---

## Critérios de sucesso

1. PR com `LINEAR_ID: TWI-XXX` → merge → issue **Done** no Linear em < 2 min
2. PR sem `LINEAR_ID` → demanda furtiva detectada → issue criada em < 3 min
3. Label `agent:generate-code` adicionada → PR gerado em < 15 min
4. Code review automático → findings → sub-issues com labels corretas
5. Fix PR mergeado → sub-issue fechada → pai fechado quando todos resolvidos

---

## Estrutura do repositório

```
.github/
  workflows/
    gitops.yml              # pipeline principal: auto-code-review, gitops-sync, run-agent
  ISSUE_TEMPLATE/           # templates para issues GitHub
  pull_request_template.md  # template para PRs (extrai LINEAR_ID)

src/
  scripts/
    sync-project.ts         # sync bidirecional Linear ↔ Git (--pull / --push / --both)
    parse-pr.ts             # parser Q&A do PR template → objeto estruturado
    create-demand.ts        # auto-criação de issue furtiva com epic + sprint lookup
    report-result.ts        # feedback loop determinístico: resultado do agent → Linear

api/
  linear-webhook.ts         # Vercel Edge Function — bridge Linear → GitHub (HMAC-SHA256)

docs/
  RUNBOOK.md                # procedimentos operacionais: rollback, kill-switch, segredos
  ONBOARDING.md             # checklist para conectar novo repo ao sistema
  GOVERNANCE.md             # matriz de permissão de labels por papel/repo
  ROADMAP.md                # fases do projeto: concluído, em andamento, planejado
  demands/                  # demandas furtivas detectadas (gerado automaticamente)

.specs/
  SPECS.md                  # especificação técnica do sistema
  WORKPLAN.md               # plano de trabalho sincronizado com Linear

CLAUDE.md                   # contexto para agents: stack, comandos, convenções, restrições
sync-config.json            # IDs do projeto Linear (teamId, stateIds)
```

---

## Começando

### Usar em outro repositório

Siga o [ONBOARDING.md](docs/ONBOARDING.md) — checklist de 7 passos (~45 min).

### Disparar um agente manualmente

```bash
gh workflow run gitops.yml \
  --repo twinfo-io/gitops-sandbox \
  --ref main \
  --field issue_id=TWI-XXX \
  --field agent_label=agent:generate-code
```

### Criar uma demanda furtiva

```bash
cat > docs/demands/minha-demanda.md << 'EOF'
LINEAR_ID:
TYPE: FEATURE
TITLE: Descrição da demanda
EPIC: nome-do-epic
REASON: Por que é necessário
AGENTS:
EOF
git add docs/demands/minha-demanda.md
git commit -m "feat: adiciona demanda [descrição]"
git push
```

O sistema detecta o arquivo sem `LINEAR_ID` no próximo push e cria a issue no Linear automaticamente.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexto para agents: stack, comandos, qualidade, restrições |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Rollback, kill-switch de loop, rotação de segredos, health check |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Como conectar novo repo ao sistema (7 passos) |
| [docs/GOVERNANCE.md](docs/GOVERNANCE.md) | Quem pode adicionar qual label, restrições por repo, incidentes |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases do projeto: concluído, em andamento, planejado |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Como contribuir, convenções de branch e commit |
| [workspace.dsl](workspace.dsl) | C4 Model (Structurizr DSL) — Contexto, Container e Componente. Regenerar com `docker run --rm -v $PWD:/usr/local/structurizr structurizr/structurizr export -workspace /usr/local/structurizr/workspace.dsl -format plantuml/c4plantuml -output /usr/local/structurizr/diagrams` + `docker run --rm -v $PWD/diagrams:/data plantuml/plantuml -tpng '/data/*.puml'` |
| [.specs/SPECS.md](.specs/SPECS.md) | Especificação técnica completa |

---

## Segurança

- Webhook Linear verificado via **HMAC-SHA256** — payloads sem assinatura válida são rejeitados com 401
- **Gate de write-access:** se `LINEAR_TO_GITHUB_MAP` estiver configurado (JSON `{"email@linear":"usuario-github"}`), o webhook só dispara o agent se o autor do label tiver permissão `write`/`admin` no repo alvo (checado via GitHub API). Sem a env var, o gate fica desabilitado — comportamento documentado em [GOVERNANCE.md](docs/GOVERNANCE.md)
- **Gate de spec/PRD:** `agent:generate-code` só dispara se a issue já tiver a label `spec-approved` (aplicada por PM/tech lead após revisar a spec — ex: gerada via `agent:create-specs`). Sem a label, o webhook bloqueia o dispatch e comenta pedindo a spec (se `LINEAR_API_KEY` estiver configurada)
- **Anti-prompt-injection:** todo prompt enviado ao Claude (via `run-agent` e `auto-code-review`) recebe, via `--append-system-prompt`, instrução fixa tratando conteúdo de issue/PR/diff como dado, nunca instrução — mitigação para o vetor de ataque conhecido em ferramentas de code-review por LLM (ex: CVE-2024-51355/51356 do PR-Agent)
- **Economia de tokens:** `--exclude-dynamic-system-prompt-sections` mantém o system prompt estável entre runs de CI (cada run é uma máquina nova), maximizando reuso de prompt cache; `--model` roteia por label (Haiku para tarefas simples/read-only como `agent:run-tests`/`agent:deploy`, Sonnet para as demais) em vez de um modelo único hardcoded
- Agents operam com escopo mínimo — `ANTHROPIC_API_KEY`, `LINEAR_API_KEY`, `GITHUB_TOKEN` (sem admin), escopados por label: `agent:run-tests` não recebe `GITHUB_TOKEN` (read-only, sem interação com GitHub); `allowedTools` do Claude é resolvido por label (ex: `agent:run-tests` não recebe tools de Edit/Write/PR)
- **Verification-before-completion:** para `agent:generate-code` e `agent:create-specs`, o CI re-roda `typecheck`+`test` de verdade no branch gerado antes de reportar sucesso ao Linear — o exit code do `claude --print` sozinho não é confiável o bastante (só diz que a CLI não crashou, não que o código funciona)
- **Ledger de progresso com resumabilidade:** `agent:generate-code`, `agent:create-specs` e `agent:generate-tests` mantêm `.gitops/ledger/{ISSUE_ID}.md`, com uma linha por etapa concluída, commitada e pusheada imediatamente (não só no final). Antes de começar, o agent checa se o branch já existe de uma execução anterior interrompida — se sim, lê o ledger e **retoma da próxima etapa pendente** em vez de recomeçar do zero
- **Instalação de skill plugins:** `agent:create-specs` e `skill:*` instalam a marketplace `pm-skills` (9 plugins) antes de rodar — skills como `/create-prd` não vêm com o binário do Claude Code, são plugins que precisam ser instalados explicitamente no runner (senão falhariam silenciosamente). Não-bloqueante: falha de instalação vira warning, não derruba o job
- **Metodologia estruturada de dev:** `agent:generate-code` segue uma adaptação headless do plugin oficial `feature-dev` (Anthropic) — explora o codebase, compara arquiteturas candidatas e revisa o próprio diff usando sub-agents paralelos (tool `Task`, liberada só para esse label — exceção deliberada ao least-privilege do E4, já que é o único que precisa lançar sub-agents). Pontos que no plugin original esperam aprovação humana ("wait for user", "DO NOT START WITHOUT USER APPROVAL") foram adaptados para decisão autônoma documentada no PR body, já que a spec chega pré-aprovada pelo gate de `spec-approved`
- **Eval de prompts:** `npm run eval:prompts` valida estaticamente (sem custo de token, roda em todo push/PR) se cada `CLAUDE_PROMPT` do `gitops.yml` cumpre seu contrato (referencia `${ISSUE_ID}`, menciona convenção de branch/PR quando aplicável, não excede tamanho razoável). `npm run eval:prompts:llm` é a camada com LLM-judge (custa token) — rodar manualmente ao editar prompts de forma substancial, não integrado ao pipeline automático
- **Observability por execução:** `run-agent` roda com `--output-format json`, captura duração/tokens/custo e publica um job summary no GitHub Actions + artifact bruto (`agent-output-{issue}-{run}`, 90 dias de retenção) — trilha de auditoria que sobrevive mesmo se a API do Linear cair. Os mesmos números aparecem no comentário que o agent posta na issue
- **PRs de agents nunca são auto-mergeados** — sempre requerem aprovação humana, **enforced de verdade** por branch protection em `main` (1 aprovação obrigatória + status check `Eval Prompts (static)` + `enforce_admins`, sem bypass mesmo pra owner do repo)
- **Anti-recursão dual-layer:** branch `agent/*` + marker `<!-- agent-created: true -->` no body impedem loop de reviews
- Agents não modificam `.github/workflows/`, `CLAUDE.md`, segredos ou migrations de banco

Incidente? Ver [RUNBOOK.md](docs/RUNBOOK.md). Dúvida de permissão? Ver [GOVERNANCE.md](docs/GOVERNANCE.md).

---

## Roadmap resumido

| Fase | Status |
|---|---|
| Fase 1 — Fundação GitOps (sync-project.ts, PR template, CI/CD pipeline, Linear Documents API) | ✅ Concluída |
| Fase 2 — Detecção de demandas furtivas (parse-pr.ts, create-demand.ts, epic + sprint lookup) | ✅ Concluída |
| Fase 3 — Taxonomia Tags × Claude (skill:*, webhook HMAC, 14 testes) | ✅ Concluída |
| Fase 4 — Execução autônoma (report-result.ts, feedback loop, 31 testes) | ✅ Infra completa — aguarda crédito Anthropic para E2E |
| Fase 5 — Validação & Governança (testes E2E ponta a ponta, guia operacional) | 🔄 Em andamento |
| Fase 6 — Ciclo auto-corretivo (review → findings → fix loop autônomo) | 📋 Spec pendente (TWI-182–185) |

Ver [ROADMAP.md](docs/ROADMAP.md) para detalhes e próximos passos por fase.

---

## Projeto Linear

[Twinfo Lifters / GitOps × Claude Agents](https://linear.app/twinfo-lifters/project/gitops-claude-agents-automacao-universal-e7fd936e4d6d) · Issues TWI-153 a TWI-185
