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

---

## Restrições por tipo de repo

| Repo | Agents permitidos | Observação |
|---|---|---|
| `gitops-sandbox` | Todos | Repo de teste — sem restrição |
| Repos de produto (ex: `bpx-agent-clickhouse`) | `generate-code`, `run-tests`, `code-review`, `security-review` | `agent:deploy` bloqueado até definição explícita |
| Repos de infraestrutura | Nenhum por enquanto | Requer aprovação de tech lead e revisão desta policy |

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
