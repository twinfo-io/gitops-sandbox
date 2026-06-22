# Runbook — GitOps × Claude Agents

Procedimentos operacionais para o sistema de automação.

---

## Rollback de commit de agente

Se um PR gerado por agente for mergeado com código incorreto:

```bash
# 1. Identificar o commit do agente (autor: GitOps Bot ou github-actions)
git log --oneline --author="GitOps Bot" -10

# 2. Criar branch de revert
git checkout -b revert/agent-TWI-{id}-{motivo}

# 3. Reverter o commit
git revert {hash} --no-edit

# 4. Abrir PR de revert (sem LINEAR_ID — não é demanda furtiva)
gh pr create \
  --title "revert: desfaz commit de agente {hash}" \
  --body "LINEAR_ID: TWI-{id}
TYPE: REVERT
TITLE: Revert de commit gerado por agente
REASON: {descreva o problema}
AGENTS:" \
  --label "skip-review"
```

> Adicionar label `skip-review` no PR de revert para não disparar outro code-review automático.

---

## Pipeline quebrado silenciosamente

Sintomas: label adicionada no Linear mas nenhum GitHub Actions run aparece.

```bash
# Verificar últimos runs
gh run list --repo twinfo-io/gitops-sandbox --limit 10

# Verificar logs do Vercel
vercel logs https://gitops-sandbox.vercel.app --scope lifters1

# Testar webhook manualmente
curl -s -X POST https://api.github.com/repos/twinfo-io/gitops-sandbox/actions/workflows/gitops.yml/dispatches \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d '{"ref":"main","inputs":{"issue_id":"TWI-XXX","agent_label":"agent:generate-code"}}'
```

Causas comuns:
- `GITHUB_TOKEN` expirado → renovar em github.com/settings/tokens e atualizar no Vercel (`vercel env rm GITHUB_TOKEN production` + `vercel env add`)
- `LINEAR_WEBHOOK_SECRET` rotacionado → atualizar no Vercel e no webhook Linear
- Vercel cold start timeout → Linear retry acontece em ~30s automaticamente

---

## Loop de agents (recursão detectada)

Sintomas: GitHub Actions criando runs em cascata, sub-issues se multiplicando no Linear.

```bash
# 1. Cancelar todos os runs ativos
gh run list --repo twinfo-io/gitops-sandbox --status in_progress --json databaseId --jq '.[].databaseId' \
  | xargs -I{} gh run cancel {} --repo twinfo-io/gitops-sandbox

# 2. Desabilitar o workflow temporariamente
gh workflow disable gitops.yml --repo twinfo-io/gitops-sandbox

# 3. Investigar: qual issue/PR disparou o loop
gh run list --repo twinfo-io/gitops-sandbox --event workflow_dispatch --limit 20

# 4. Reabilitar após corrigir a causa raiz
gh workflow enable gitops.yml --repo twinfo-io/gitops-sandbox
```

---

## Segredos comprometidos

Se `ANTHROPIC_API_KEY`, `LINEAR_API_KEY` ou `GITHUB_TOKEN` aparecerem em logs ou no código:

1. **Revogar imediatamente:**
   - Anthropic: console.anthropic.com → API Keys → Revoke
   - Linear: linear.app/twinfo-lifters/settings/api → Revoke
   - GitHub: github.com/settings/tokens → Delete

2. **Gerar novos e atualizar:**
   ```bash
   # Vercel
   vercel env rm {VAR_NAME} production --scope lifters1
   echo "novo-valor" | vercel env add {VAR_NAME} production --scope lifters1 --yes
   vercel --prod --yes --scope lifters1

   # GitHub Secrets (via gh CLI)
   gh secret set {VAR_NAME} --repo twinfo-io/gitops-sandbox
   ```

3. **Auditar o histórico git** para garantir que o valor não está commitado:
   ```bash
   git log -S "valor-comprometido" --all
   ```

---

## Verificação de saúde do sistema

```bash
# Webhook Linear ativo?
curl -s -H "Authorization: lin_api_..." https://api.linear.app/graphql \
  -d '{"query":"{ webhooks { nodes { id url enabled } } }"}' | jq '.data.webhooks.nodes'

# Vercel respondendo?
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://gitops-sandbox.vercel.app/api/linear-webhook

# GitHub Actions workflow ativo?
gh workflow list --repo twinfo-io/gitops-sandbox
```
