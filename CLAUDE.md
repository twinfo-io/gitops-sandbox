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
- Branch: `feat/TWI-{id}-slug` ou `fix/TWI-{id}-slug`
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`)
- PR body: sempre preencher o template com LINEAR_ID
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
- Ao criar PR: **não** pedir confirmações — commitar e abrir PR diretamente
- Ao encontrar erro em teste: criar arquivo `docs/demands/fix-{slug}.md` com o finding
- Nunca modificar `.env.example` sem justificativa explícita na issue
- Sempre rodar `npm run typecheck` antes de abrir PR

## Variáveis de Ambiente (CI)
```
ANTHROPIC_API_KEY   # para Claude Code CLI
GITHUB_TOKEN        # automático no GH Actions
LINEAR_API_KEY      # para Linear GraphQL API
```
