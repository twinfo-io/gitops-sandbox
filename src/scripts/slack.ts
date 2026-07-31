/**
 * slack.ts — Alerta de Slack pra falha real (não smoke test sintético)
 *
 * Achado da comparação com o framework de QA do Acesse (TWI-885, Rômulo Dantas):
 * um nightly smoke test testaria infra que ainda não está em uso real — sinal fraco.
 * O que tem valor de verdade é avisar quando algo que JÁ RODOU de verdade falhou —
 * mesmo padrão do `claude-nightly-qa.yml` deles (curl pro webhook do Slack), só que
 * disparado por falha real (report-result.ts, reconcile-linear.ts), não por cron.
 *
 * Nunca lança erro — Slack fora do ar não pode derrubar o fluxo principal. Sem
 * SLACK_WEBHOOK_URL configurada, vira no-op silencioso (opcional, não obrigatório).
 */

export async function postSlackAlert(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    console.warn('[slack] falha ao postar alerta (não-bloqueante):', (err as Error).message)
  }
}
