/**
 * scrub-artifact.ts — Scrub de secrets no artifact bruto do agente (TWI-1111 / E19)
 *
 * O step "Upload raw agent output" sobe /tmp/claude-output.json (saída completa do
 * `claude --print --output-format json`) como artifact do GitHub Actions por 90 dias.
 * Repo é público — se o agente ecoar uma env var sensível num Bash acidental, isso
 * fica gravado e visível publicamente. Esse script redige padrões conhecidos de
 * secret antes do upload — não impede o upload em si (E8/observability continua
 * funcionando), só remove o segredo do conteúdo.
 *
 * Uso: ARTIFACT_PATH=/tmp/claude-output.json npx tsx src/scripts/scrub-artifact.ts
 */

const REDACTED = '***REDACTED***'

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,          // Anthropic API key
  /github_pat_[A-Za-z0-9_]{20,}/g,        // GitHub fine-grained PAT
  /ghp_[A-Za-z0-9]{30,}/g,                // GitHub classic PAT
  /gho_[A-Za-z0-9]{30,}/g,                // GitHub OAuth token
  /ghs_[A-Za-z0-9]{30,}/g,                // GitHub Actions installation token
  /lin_api_[A-Za-z0-9]{20,}/g,            // Linear API key
  /lin_oauth_[A-Za-z0-9]{20,}/g,          // Linear OAuth token
  /Bearer\s+[A-Za-z0-9\-_.]{20,}/g,       // header Authorization: Bearer <token>
]

export function scrubSecrets(content: string): string {
  let scrubbed = content
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REDACTED)
  }
  return scrubbed
}

export async function main(): Promise<void> {
  const artifactPath = process.env.ARTIFACT_PATH
  if (!artifactPath) throw new Error('ARTIFACT_PATH env var não definida')

  const fs = await import('fs/promises')

  let raw: string
  try {
    raw = await fs.readFile(artifactPath, 'utf8')
  } catch {
    console.log(`[scrub-artifact] ${artifactPath} não existe — nada a escanear.`)
    return
  }

  const scrubbed = scrubSecrets(raw)
  const found = scrubbed !== raw

  if (found) {
    await fs.writeFile(artifactPath, scrubbed, 'utf8')
    console.log(`::warning::scrub-artifact encontrou e redigiu padrão(ões) de secret em ${artifactPath} antes do upload`)
  } else {
    console.log('[scrub-artifact] ✅ Nenhum padrão de secret encontrado.')
  }
}

/* v8 ignore start -- entrypoint de processo, exercido via execução real da CLI, não em unit test */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(err => {
    console.error('[scrub-artifact] Erro:', (err as Error).message)
    process.exit(1)
  })
}
/* v8 ignore stop */
