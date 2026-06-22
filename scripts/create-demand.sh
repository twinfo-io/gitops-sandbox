#!/usr/bin/env bash
# create-demand.sh — Cria issue no Linear para demandas furtivas
# Uso: ./scripts/create-demand.sh docs/demands/minha-demanda.md
# Saída: ID Linear criado (ex: TWI-186)
set -euo pipefail

LINEAR_API="https://api.linear.app/graphql"
TEAM_ID="bb2552ad-78a3-4b20-a1d4-ca01aab0a931"
PROJECT_ID="0b836537-0ca6-499d-af9d-7cc9fdaa81c6"
STATE_DONE="06527813-6267-48e1-961a-0548a6781bb7"

DEMAND_FILE="${1:-}"
if [ -z "$DEMAND_FILE" ] || [ ! -f "$DEMAND_FILE" ]; then
  echo "[create-demand] ERROR: arquivo não encontrado: $DEMAND_FILE" >&2
  exit 1
fi

# ─── Parse do arquivo de demanda ─────────────────────────────────────────────
parse_field() {
  grep -oP "^${1}:\\s*\\K.+" "$DEMAND_FILE" | head -1 | sed 's/[[:space:]]*$//' || true
}

TITLE=$(parse_field "TITLE")
TYPE=$(parse_field "TYPE")
REASON=$(parse_field "REASON")
EPIC_SLUG=$(parse_field "EPIC")
EXISTING_ID=$(parse_field "LINEAR_ID")

# Idempotência: se já tem ID, não cria duplicata
if [ -n "$EXISTING_ID" ]; then
  echo "[create-demand] Já tem LINEAR_ID: $EXISTING_ID — pulando" >&2
  echo "$EXISTING_ID"
  exit 0
fi

if [ -z "$TITLE" ]; then
  echo "[create-demand] ERROR: TITLE vazio em $DEMAND_FILE" >&2
  exit 1
fi

echo "[create-demand] Criando issue: [$TYPE] $TITLE" >&2
echo "[create-demand] Epic slug: ${EPIC_SLUG:-nenhum} | Reason: ${REASON:-não informado}" >&2

# ─── Helper GraphQL ───────────────────────────────────────────────────────────
gql() {
  curl -sf -X POST "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# ─── 1. Busca ciclo ativo ─────────────────────────────────────────────────────
CYCLE_RESP=$(gql "$(jq -n \
  --arg teamId "$TEAM_ID" \
  '{query: "query($teamId: String!) { cycles(filter: { isActive: { eq: true }, team: { id: { eq: $teamId } } }) { nodes { id name } } }", variables: {teamId: $teamId}}')")

CYCLE_ID=$(echo "$CYCLE_RESP" | jq -r '.data.cycles.nodes[0].id // empty')
echo "[create-demand] Ciclo ativo: ${CYCLE_ID:-nenhum}" >&2

# ─── 2. Monta descrição ───────────────────────────────────────────────────────
BODY=$(cat "$DEMAND_FILE")
DESCRIPTION="## 🚨 Demanda Furtiva — detectada automaticamente pelo GitOps

**Tipo:** ${TYPE:-desconhecido}
**Épico:** ${EPIC_SLUG:-não informado}
**Motivo / Urgência:** ${REASON:-não informado}

---

${BODY}"

# ─── 3. Cria issue no Linear ──────────────────────────────────────────────────
ISSUE_TITLE="[${TYPE:-TASK}] ${TITLE}"

CREATE_PAYLOAD=$(jq -n \
  --arg teamId "$TEAM_ID" \
  --arg projectId "$PROJECT_ID" \
  --arg stateId "$STATE_DONE" \
  --arg title "$ISSUE_TITLE" \
  --arg description "$DESCRIPTION" \
  '{
    query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }",
    variables: {
      input: {
        teamId: $teamId,
        projectId: $projectId,
        stateId: $stateId,
        title: $title,
        description: $description,
        priority: 2
      }
    }
  }')

CREATE_RESP=$(gql "$CREATE_PAYLOAD")
SUCCESS=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.success')

if [ "$SUCCESS" != "true" ]; then
  echo "[create-demand] ERROR: falha ao criar issue no Linear" >&2
  echo "$CREATE_RESP" | jq . >&2
  exit 1
fi

LINEAR_ID=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.issue.identifier')
INTERNAL_ID=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.issue.id')
ISSUE_URL=$(echo "$CREATE_RESP" | jq -r '.data.issueCreate.issue.url')

echo "[create-demand] ✅ Issue criada: $LINEAR_ID → $ISSUE_URL" >&2

# ─── 4. Adiciona ao ciclo ativo ───────────────────────────────────────────────
if [ -n "$CYCLE_ID" ]; then
  gql "$(jq -n \
    --arg cycleId "$CYCLE_ID" \
    --arg issueId "$INTERNAL_ID" \
    '{query: "mutation($input: CycleIssueCreateInput!) { cycleIssueCreate(input: $input) { success } }", variables: {input: {cycleId: $cycleId, issueId: $issueId}}}')" \
    > /dev/null
  echo "[create-demand] Issue adicionada ao ciclo $CYCLE_ID" >&2
fi

# ─── 5. Saída: Linear ID para o caller ───────────────────────────────────────
echo "$LINEAR_ID"
