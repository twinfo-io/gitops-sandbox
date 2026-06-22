# Contributing — GitOps × Claude Agents

Como contribuir para o sistema sem quebrar os ciclos autônomos.

---

## Dois tipos de branch

| Tipo | Prefixo | Criado por | Exemplo |
|---|---|---|---|
| Branch humana | `feat/`, `fix/`, `chore/` | Desenvolvedor | `feat/TWI-173-multi-repo-bridge` |
| Branch de agente | `agent/` | Claude CLI | `agent/twi-171-implementation` |

**O prefixo `agent/` é protegido.** O `auto-code-review` ignora branches com esse prefixo para não entrar em loop. Nunca crie uma branch humana com prefixo `agent/`.

---

## Convenção de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     nova funcionalidade
fix:      correção de bug
chore:    manutenção (deps, config, ci)
docs:     documentação
refactor: sem mudança de comportamento
test:     testes
```

Exemplos:

```
feat(gitops): adiciona suporte a multi-repo no webhook bridge
fix(ci): corrige race condition na guarda anti-recursão
docs: adiciona ROADMAP.md com fases do projeto
chore(gitops): ignora .vercel no gitignore
```

---

## PR template

Todo PR deve preencher o template em `.github/pull_request_template.md`:

```
LINEAR_ID: TWI-XXX    ← obrigatório (ou deixar em branco para demanda furtiva)
TYPE: FEATURE         ← BUG | FEATURE | HOTFIX | REFACTOR
TITLE:                ← só para demanda furtiva (sem LINEAR_ID)
EPIC:                 ← slug do epic no Linear
REASON:               ← motivo / urgência
AGENTS:               ← labels de agente para disparar após merge (opcional)
```

**PRs de agentes** têm regras adicionais:
- Primeira linha do body: `<!-- agent-created: true -->` (obrigatório — anti-recursão)
- Branch deve começar com `agent/`
- Incluir link para a issue Linear e lista de critérios de aceitação atendidos

---

## Checklist antes de abrir PR

```bash
npm run typecheck   # deve passar sem erros — obrigatório
npm test            # deve passar — obrigatório para arquivos modificados
npm run lint        # recomendado
```

Não abra PR com TypeScript errors ou falhas em testes existentes.

---

## Disparando um agente

Para pedir ao sistema que execute uma tarefa:

1. Abra ou localize a issue no Linear com a spec da tarefa
2. Adicione a label `agent:generate-code` (ou outra label `agent:*`)
3. O webhook Linear dispara em < 1s
4. Acompanhe o run em [GitHub Actions](https://github.com/twinfo-io/gitops-sandbox/actions)
5. O agent abre um PR — faça review normalmente

Quem pode adicionar qual label: ver [docs/GOVERNANCE.md](docs/GOVERNANCE.md).

---

## O que nunca fazer

| ❌ Proibido | Motivo |
|---|---|
| Criar branch com prefixo `agent/` manualmente | Confunde a guarda anti-recursão |
| Commitar `.env`, secrets, tokens | Risco de segurança |
| Modificar `.github/workflows/gitops.yml` sem isso estar na spec da issue | Mudança de infra requer revisão de tech lead |
| Modificar `CLAUDE.md` sem intenção explícita | É o contexto dos agents — mudança acidental muda comportamento |
| Fazer merge de PR de agente sem review | Regra fundamental: humano sempre aprova |
| `git push --force` em `main` | Irrecuperável sem backup |

---

## Demanda furtiva intencional

Se você implementou algo sem criar issue no Linear (ex.: hotfix de madrugada), o sistema detecta automaticamente no merge. Para acelerar, crie o arquivo antes do commit:

```bash
cat > docs/demands/slug-da-demanda.md << 'EOF'
LINEAR_ID:
TYPE: HOTFIX
TITLE: Título da demanda
EPIC:
REASON: Motivo que justifica o hotfix
AGENTS:
EOF
```

O `gitops-sync` cria a issue no Linear, atualiza o arquivo com o ID e faz commit automaticamente.

---

## Reportando problemas no sistema

Se o sistema se comportar de forma inesperada (loop de reviews, agent com output incorreto, sync não aconteceu):

1. Siga o [RUNBOOK.md](docs/RUNBOOK.md) para diagnóstico e rollback
2. Abra uma issue no Linear com label `needs-human-review`
3. Descreva: o que aconteceu, qual run do GitHub Actions, qual issue do Linear estava envolvida
