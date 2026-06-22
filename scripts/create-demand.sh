#!/usr/bin/env bash
# create-demand.sh — Cria issue no Linear para demandas furtivas
# Uso: ./scripts/create-demand.sh docs/demands/minha-demanda.md
# Saída stdout: Linear ID criado (ex: TWI-186)
# Saída stderr: logs de progresso
set -euo pipefail

LINEAR_API="https://api.linear.app/graphql"
TEAM_ID="bb2552ad-78a3-4b20-a1d4-ca01aab0a931"
PROJECT_ID="0b836537-0ca6-499d-af9d-7cc9fdaa81c6"
STATE_DONE="06527813-6267-48e1-961a-0548a6781bb7"

DEMAND_FILE="${1:-}"
if [ -z "$DEMAND_FILE" ] || [ ! -f "$DEMAND_FILE" ]; then
  echo "[create-demand] ERROR: arquivo não encontrado: ${DEMAND_FILE:-vazio}" >&2
  exit 1
fi

# ─── Parse dos campos do arquivo ─────────────────────────────────────────────
parse_field() {
  local field="$1"
  grep -oP "^${field}:[[:space:]]*\K.+" "$DEMAND_FILE" 2>/dev/null | head -1 | sed 's/[[:space:]]*$//' || echo ""
}

TITLE=$(parse_field "TITLE")
TYPE=$(parse_field "TYPE")
REASON=$(parse_field "REASON")
EXISTING_ID=$(parse_field "LINEAR_ID")

# Idempotência: já tem ID → não cria duplicata
if [ -n "$EXISTING_ID" ]; then
  echo "[create-demand] Já tem LINEAR_ID: $EXISTING_ID — pulando" >&2
  echo "$EXISTING_ID"
  exit 0
fi

if [ -z "$TITLE" ]; then
  echo "[create-demand] ERROR: TITLE vazio em $DEMAND_FILE" >&2
  exit 1
fi

ISSUE_TITLE="[${TYPE:-TASK}] ${TITLE}"
echo "[create-demand] Criando: $ISSUE_TITLE" >&2

# ─── Helper: chama Linear GraphQL ────────────────────────────────────────────
gql() {
  local payload="$1"
  curl -s -X POST "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# ─── Monta descrição ─────────────────────────────────────────────────────────
BODY_CONTENT=$(cat "$DEMAND_FILE")
DESCRIPTION="## Demanda Furtiva — registrada automaticamente pelo GitOps

**Tipo:** ${TYPE:-desconhecido}
**Motivo:** ${REASON:-não informado}

---

${BODY_CONTENT}"

# ─── Cria issue no Linear ────────────────────────────────────────────────────
CREATE_PAYLOAD=$(jq -n \
  --arg teamId    "$TEAM_ID" \
  --arg projectId "$PROJECT_ID" \
  --arg stateId   "$STATE_DONE" \
  --arg title     "$ISSUE_TITLE" \
  --arg desc      "$DESCRIPTION" \
  '{
    query: "mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
    variables: {
      input: {
        teamId:      $teamId,
        projectId:   $projectId,
        stateId:     $stateId,
        title:       $title,
        description: $desc,
        priority:    2
      }
    }
  }')

CREATE_RESP=$(gql "$CREATE_PAYLOAD")

# Log da resposta completa para debug
echo "[create-demand] Linear response: $(echo "$CREATE_RESP" | jq -c '.')" >&2

SUCCESS=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.success // false')
if [ "$SUCCESS" != "true" ]; then
  echo "[create-demand] ERROR: falha ao criar issue" >&2
  echo "$CREATE_RESP" | jq . >&2
  exit 1
fi

LINEAR_ID=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.issue.identifier')
ISSUE_URL=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.issue.url')
echo "[create-demand] ✅ Criado: $LINEAR_ID → $ISSUE_URL" >&2

# Saída para o caller
echo "$LINEAR_ID"
