# Governança — Labels de Agent no Linear

Define quem pode adicionar labels `agent:*` em issues, em quais contextos, e quais aprovações são necessárias.

**Status:** Rascunho — requer alinhamento do time antes de ativação em repos de produção.

---

## Princípio geral

Labels `agent:*` disparam execução autônoma de código em repositórios reais. O risco é proporcional ao repo e ao tipo de agente. A governança escala conforme o impacto.

---

## Quem pode adicionar cada label

| Label | Quem pode adicionar | Aprovação necessária |
|---|---|---|
| `agent:generate-code` | Qualquer dev do time | Requer label `spec-approved` na issue (gate técnico no webhook) — PR gerado ainda requer review humano normal |
| `agent:run-tests` | Qualquer dev do time | Nenhuma — read-only, sem commits |
| `agent:code-review` | Qualquer dev do time | Nenhuma — read-only, cria sub-issues |
| `agent:security-review` | Qualquer dev do time | Nenhuma — read-only |
| `agent:deploy` | Tech lead ou acima | Requer `trigger:production-approved` na mesma issue |
| `agent:create-specs` | PM ou tech lead | Nenhuma — apenas cria documentos |
| `agent:suggest-tests` | Qualquer dev do time | Nenhuma — read-only, só comenta sugestões |
| `agent:generate-tests` | Qualquer dev do time | Nenhuma — PR gerado requer review humano normal |

---

## Restrições por tipo de repo

| Repo | Agents permitidos | Observação |
|---|---|---|
| `gitops-sandbox` | Todos | Repo de teste — sem restrição |
| Repos de produto (ex: `bpx-agent-clickhouse`) | `generate-code`, `run-tests`, `code-review`, `security-review` | `agent:deploy` bloqueado até definição explícita |
| Repos de infraestrutura | Nenhum por enquanto | Requer aprovação de tech lead e revisão desta policy |

---

## Branch protection — checar antes de replicar em outro repo

`gitops-sandbox` tem branch protection em `main` exigindo 1 aprovação humana (TWI-349/E14) — só funciona porque o repo tem **20 colaboradores** com acesso. **GitHub nunca permite auto-aprovação, sem exceção, sem bypass** — não existe config ou API que resolva isso.

**Antes de aplicar a mesma config em outro repo**, checar quantas pessoas têm write access:

```bash
gh api repos/{owner}/{repo}/collaborators --jq '.[].login' | wc -l
```

- **Time com 2+ pessoas com write access:** aplicar igual ao gitops-sandbox (1 aprovação + status check obrigatório).
- **Repo solo ou dupla sem revisor disponível:** **não** exigir `required_pull_request_reviews` — só exigir status checks (typecheck/test/eval-prompts). Sem isso, o repo trava permanentemente (nenhum PR consegue ser mergeado, nem pelo owner).

Ver `docs/RUNBOOK.md` § Emergência para o procedimento de desabilitar/reabilitar branch protection caso precise ajustar depois de já aplicada.

---

## O que nunca deve ser feito via agent

- Modificar segredos, variáveis de ambiente ou arquivos `.env`
- Alterar pipelines de CI/CD (`.github/workflows/`)
- Fazer merge de PRs automaticamente sem review humano
- Executar migrations de banco de dados em produção
- Modificar configurações de acesso ou permissões

---

## Processo de incidente

Se um agente produzir saída incorreta ou causar dano:

1. Cancelar runs ativos: `gh run cancel` (ver RUNBOOK.md)
2. Reverter commits se necessário (ver RUNBOOK.md — Rollback)
3. Registrar o incidente como issue no Linear com label `needs-human-review`
4. Discutir na próxima retrospectiva do time antes de reativar o agente

---

## Revisão desta policy

Esta policy deve ser revisada quando:
- Um novo repo for adicionado ao sistema
- Um novo tipo de agent (`agent:*`) for criado
- Ocorrer um incidente com output incorreto
- O time crescer ou mudar estrutura

**Próxima revisão planejada:** antes de ativar em repos de produto além do sandbox.
