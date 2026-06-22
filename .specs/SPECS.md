# Especificação Técnica — gitops-sandbox

> Arquivo mantido automaticamente pelo sistema GitOps × Claude Agents.
> Última atualização sincronizada com o Linear.

## Objetivo
Repositório sandbox para validar e testar o sistema de integração GitOps × Claude Agents
antes de aplicar em projetos de produção (Gorjeta, bpx-agent-clickhouse, etc).

## Escopo de Testes

- [ ] Fundação GitOps: sync-config.json, PR template, sync Linear on merge
- [ ] Detecção de demandas furtivas: PR sem LINEAR_ID → issue criada no Linear
- [ ] Webhook receiver: label adicionada no Linear → workflow_dispatch no GH Actions
- [ ] Execução autônoma: `agent:generate-code` → PR gerado pelo Claude
- [ ] Ciclo auto-corretivo: code-review → findings → sub-issues → fix agents

## Critérios de Sucesso

1. PR com `LINEAR_ID: TWI-XXX` → merge → issue no Linear marcada **Done** em < 2 min
2. PR sem `LINEAR_ID` → demanda detectada → issue criada no Linear em < 3 min
3. Label `agent:generate-code` adicionada na issue → PR gerado em < 15 min
4. Code review automático → findings → sub-issues no Linear com labels corretas
5. Fix PR mergeado → sub-issue fechada → pai fechado quando todos resolvidos

## Referências
- Projeto Linear: https://linear.app/twinfo-lifters/project/gitops-claude-agents-automacao-universal-e7fd936e4d6d
- Issues: TWI-153 a TWI-185
