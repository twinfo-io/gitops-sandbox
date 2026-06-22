LINEAR_ID:
TYPE: BUG
TITLE: Corrige timeout no WebSocket de sorteios ao vivo
EPIC: gitops-claude-agents-automacao-universal
REASON: Bug urgente detectado em produção — conexão WebSocket cai após 30s de inatividade causando falha nos sorteios ao vivo

## Descrição

Conexões WebSocket de sorteios ao vivo caem com timeout após 30 segundos de inatividade.
Causa: servidor não envia ping/pong frames para manter a conexão viva.

## Solução Aplicada

Adicionado heartbeat de 25s no servidor WebSocket:

```typescript
// src/websocket/server.ts
const heartbeat = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping()
  }
}, 25_000)

ws.on('close', () => clearInterval(heartbeat))
```

## Impacto

- Afetados: todos os sorteios ao vivo com audiência inativa por > 30s
- Severidade: Alta — sorteio falha silenciosamente para o influencer
