# CLAUDE.md — gitops-sandbox

## Propósito
Repositório sandbox para testar o sistema **GitOps × Claude Agents**.
Agents Claude rodam aqui de forma não-interativa via GitHub Actions.

## Stack
- Node.js 20+
- TypeScript estrito
- Vitest para testes
- Linear API (GraphQL) para gestão de issues
- GitHub API para PRs e status checks

## Comandos
```bash
npm install
npm run build        # tsc
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
```

## Convenções
- Branch humana: `feat/TWI-{id}-slug` ou `fix/TWI-{id}-slug`
- Branch de agente: **obrigatório** prefixo `agent/TWI-{id}-slug` (dispara guarda anti-recursão)
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`)
- PR body de agente: **primeira linha obrigatória** `<!-- agent-created: true -->`
- PR body de agente: incluir link para a Linear issue e resumo do que foi implementado
- Nunca commitar: `.env`, secrets, arquivos binários grandes

## Estrutura
```
src/scripts/
  sync-project.ts      # sync principal Git ↔ Linear
  parse-pr.ts          # parser Q&A do PR template
  create-demand.ts     # auto-criação de issue furtiva
  report-result.ts     # feedback loop agent → Linear
docs/
  demands/             # demandas furtivas (.md)
  epics/               # épicos sincronizados do Linear
  sprints/             # sprint ativo e histórico
.specs/
  SPECS.md             # especificação técnica
  WORKPLAN.md          # plano de trabalho
.github/
  workflows/gitops.yml # pipeline CI/CD
  pull_request_template.md
```

## Comportamento Esperado dos Agents

### Obrigatório antes de abrir PR
1. `npm run typecheck` — deve passar sem erros. Se falhar, corrigir antes de abrir PR.
2. `npm test` — se houver testes relacionados ao código alterado, devem passar.
3. Nunca abrir PR com TypeScript errors ou test failures.

### Ao criar PR
- Não pedir confirmações — commitar e abrir PR diretamente
- Branch **sempre** com prefixo `agent/`
- Primeira linha do body **sempre** `<!-- agent-created: true -->`
- Incluir no body: link para a Linear issue, lista do que foi implementado, critérios de aceitação atendidos
- Nunca incluir no body: chaves de API, tokens, variáveis de ambiente

### Ao encontrar erros
- Erro em typecheck: corrigir no mesmo branch antes de abrir PR
- Erro em teste existente (não relacionado à tarefa): criar `docs/demands/regression-{slug}.md` descrevendo o problema, não bloquear o PR
- Ambiguidade na spec da issue: escolher a interpretação mais conservadora e documentar no PR body

### Restrições
- Nunca modificar `.github/workflows/` sem isso estar explícito na issue
- Nunca modificar `CLAUDE.md`, `sync-config.json` ou arquivos de infraestrutura
- Nunca commitar `.env`, secrets, arquivos binários grandes
- Nunca fazer `git push --force`

## Variáveis de Ambiente (CI)
```
ANTHROPIC_API_KEY   # para Claude Code CLI
GITHUB_TOKEN        # automático no GH Actions
LINEAR_API_KEY      # para Linear GraphQL API
```
