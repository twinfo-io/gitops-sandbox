# Guia de Demandas Furtivas

Quando precisar subir código urgente que **não está no backlog planejado**, siga este processo:

## Opção 1: Via PR template (recomendado)

Abra um PR normalmente. No template, deixe `LINEAR_ID:` **em branco** e preencha:
- `TYPE:` BUG ou FEATURE
- `TITLE:` título do card que será criado no Linear
- `EPIC:` slug do épico relacionado (ex: `gorjeta-sorteios`)
- `REASON:` motivo da urgência

Após o merge, o sistema cria o card no Linear automaticamente.

## Opção 2: Via arquivo neste diretório

Crie um arquivo `docs/demands/minha-demanda.md`:

```markdown
LINEAR_ID:
TYPE: BUG
TITLE: Descreva o que foi feito
EPIC: slug-do-epic
REASON: Por que era urgente

## Descrição
Detalhe técnico do que foi implementado.
```

O CI detecta o arquivo sem `LINEAR_ID` e cria a issue no Linear.

## O que acontece depois

1. Issue criada no Linear no epic e sprint corretos
2. Estado setado como `Done` (já foi mergeado)
3. Documento criado no Linear com a descrição
4. Arquivo renomeado: `TWI-{id}-minha-demanda.md`
5. Commit de feedback no repo com `[skip ci]`

## Nunca mais trabalho invisível.
