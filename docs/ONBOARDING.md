# Onboarding — Novo repositório no GitOps × Claude Agents

Checklist para conectar um novo repo da Twinfo ao sistema de automação.

Tempo estimado: **~45 minutos** (primeira vez), **~20 minutos** (repos subsequentes).

---

## Pré-requisitos

- [ ] Acesso admin ao repo no GitHub
- [ ] Acesso ao workspace `Twinfo Lifters` no Linear
- [ ] `ANTHROPIC_API_KEY` com saldo disponível
- [ ] `vercel` CLI instalado e autenticado (`vercel whoami`)
- [ ] `gh` CLI instalado e autenticado (`gh auth status`)

---

## Passo 1 — Configurar secrets no GitHub

```bash
REPO="twinfo-io/nome-do-repo"

gh secret set ANTHROPIC_API_KEY --repo $REPO
gh secret set LINEAR_API_KEY    --repo $REPO
# GITHUB_TOKEN é automático no GH Actions — não precisa configurar
```

---

## Passo 2 — Copiar arquivos de infraestrutura

```bash
# Clone o sandbox como referência
git clone https://github.com/twinfo-io/gitops-sandbox /tmp/gitops-ref

# No repo alvo, copiar:
cp /tmp/gitops-ref/.github/workflows/gitops.yml    .github/workflows/
cp /tmp/gitops-ref/.github/pull_request_template.md .github/
cp /tmp/gitops-ref/scripts/create-demand.sh         scripts/
chmod +x scripts/create-demand.sh
mkdir -p docs/demands docs/epics docs/sprints
```

---

## Passo 3 — Criar sync-config.json

Copiar o template e preencher com os IDs do projeto Linear correto:

```bash
cp /tmp/gitops-ref/sync-config.json .
```

Editar os campos:
```json
{
  "projectName": "Nome do Projeto",
  "linear": {
    "teamId":    "bb2552ad-78a3-4b20-a1d4-ca01aab0a931",
    "teamName":  "Twinfo Lifters",
    "projectId": "ID-DO-PROJETO-LINEAR",
    "states": {
      "backlog":    "ID-STATE-BACKLOG",
      "todo":       "ID-STATE-TODO",
      "inProgress": "ID-STATE-IN-PROGRESS",
      "done":       "ID-STATE-DONE"
    }
  }
}
```

Para obter os IDs de state do Linear:
```bash
curl -s -H "Authorization: lin_api_..." https://api.linear.app/graphql \
  -d '{"query":"{ workflowStates(filter:{team:{id:{eq:\"bb2552ad-...\"}}}) { nodes { id name } } }"}' \
  | jq '.data.workflowStates.nodes'
```

---

## Passo 4 — Escrever CLAUDE.md do repo

O `CLAUDE.md` é o contexto que o agente lê antes de qualquer tarefa. **É o item mais importante para qualidade do output.**

Deve conter:
- Stack e versões (linguagem, framework, ORM, etc.)
- Comandos de build, test, typecheck, lint
- Convenções de branch e commit
- Estrutura do projeto (quais pastas têm qual função)
- Restrições críticas (arquivos que nunca devem ser editados, variáveis de env)
- Comportamento esperado ao abrir PR (obrigatório: `agent/` prefix, marker no body)

Copiar o template:
```bash
cp /tmp/gitops-ref/CLAUDE.md .
# Editar para refletir a stack real do projeto
```

---

## Passo 5 — Registrar webhook no Linear

```bash
LINEAR_API_KEY="lin_api_..."

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg url "https://gitops-sandbox.vercel.app/api/linear-webhook" \
    --arg teamId "bb2552ad-78a3-4b20-a1d4-ca01aab0a931" \
    '{query: "mutation($input: WebhookCreateInput!) { webhookCreate(input: $input) { success webhook { id secret } } }",
      variables: {input: {url: $url, teamId: $teamId, resourceTypes: ["Issue"], label: "GitOps Bridge", enabled: true}}}')" \
  | jq '{success: .data.webhookCreate.success, secret: .data.webhookCreate.webhook.secret}'
```

Guardar o `secret` retornado — ele é exibido **apenas uma vez**.

---

## Passo 6 — Atualizar variáveis de ambiente no Vercel

O Vercel precisa saber para qual repo direcionar o `workflow_dispatch`.

Hoje a Vercel Edge Function usa `GITHUB_REPO_OWNER` e `GITHUB_REPO_NAME` como variáveis estáticas.

> **Limitação atual:** a Edge Function roteia para um único repo fixo. Para múltiplos repos, é necessário evoluir o webhook bridge para ler o repo alvo da payload do Linear (via `sync-config.json` do repo ou campo customizado na issue).

Workaround até a evolução: usar `workflow_dispatch` manual via `gh` CLI para repos secundários.

---

## Passo 7 — Verificação final

```bash
# Testar dispatch manual
gh workflow run gitops.yml \
  --repo twinfo-io/nome-do-repo \
  --ref main \
  --field issue_id=TWI-XXX \
  --field agent_label=agent:run-tests

# Aguardar e verificar
gh run list --repo twinfo-io/nome-do-repo --limit 3
```

---

## Limitações conhecidas

| Limitação | Impacto | Workaround |
|---|---|---|
| Vercel bridge rota para 1 repo fixo | Outros repos precisam de dispatch manual | Evoluir o bridge para multi-repo (TWI pendente) |
| `sync-config.json` não tem CLI de geração | IDs preenchidos manualmente | Usar `gh api` para buscar IDs |
| Labels criadas no nível do time Linear | Compartilhadas entre todos os projetos | OK para Twinfo — 1 team, múltiplos projetos |
