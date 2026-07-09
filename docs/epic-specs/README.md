# Guia de Specs de Épico

Diferente de `docs/demands/` (uma demanda furtiva = uma issue solta) e de `docs/epics/` (espelho **read-only** gerado a partir do Linear, não editar à mão), este diretório é pra ir do sentido contrário: **você escreve a spec aqui, o sistema fatia em épico + histórias no Linear.**

## Como usar

Crie um arquivo `docs/epic-specs/minha-feature.md`:

```markdown
EPIC_LINEAR_ID:
EPIC_TITLE: Sistema de notificações push
EPIC_TYPE: FEATURE
EPIC_REASON: Retenção caindo, usuário não sabe quando tem sorteio novo

## Story: Configurar provider de push (FCM/APNs)
STORY_LINEAR_ID:
TYPE: FEATURE
REASON: Sem provider configurado não dá pra enviar nada
AGENTS: agent:generate-code

## Story: Endpoint de subscribe/unsubscribe
STORY_LINEAR_ID:
TYPE: FEATURE
REASON: Usuário precisa poder optar
AGENTS: agent:generate-code, agent:suggest-tests
```

Commit e push. O `gitops-sync` detecta o arquivo com algum `*_LINEAR_ID:` vazio, roda `slice-epic.ts`, cria o épico e cada história pendente no Linear, e abre um PR devolvendo o arquivo com os IDs preenchidos.

## Idempotente

Já criou o épico e quer adicionar mais uma história depois? Só adiciona um novo bloco `## Story:` no mesmo arquivo (com `STORY_LINEAR_ID:` vazio) e commita de novo — o script só cria o que for novo, não duplica o que já existe.

## Campos

| Campo | Obrigatório | Padrão |
|---|---|---|
| `EPIC_LINEAR_ID` | não (deixar vazio na primeira vez) | — |
| `EPIC_TITLE` | **sim** | — |
| `EPIC_TYPE` | não | `FEATURE` |
| `EPIC_REASON` | não | — |
| `STORY_LINEAR_ID` (por história) | não (deixar vazio na primeira vez) | — |
| `TYPE` (por história) | não | `FEATURE` |
| `REASON` (por história) | não | — |
| `AGENTS` (por história) | não | nenhum |

## O que acontece depois

1. Épico criado no Linear (se `EPIC_LINEAR_ID` estava vazio)
2. Cada história criada como issue filha do épico (só as que tinham `STORY_LINEAR_ID` vazio)
3. Arquivo atualizado com os IDs gerados
4. PR aberto pelo bot com `skip-review` — aguarda 1 aprovação humana (branch protection) antes de mergear
