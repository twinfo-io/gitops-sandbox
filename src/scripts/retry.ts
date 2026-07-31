/**
 * retry.ts — Retry com backoff exponencial (TWI-1115 / E23)
 *
 * Benchmark vs. mksglu/hatice (153★): "retry with exponential backoff" é parte
 * própria do lifecycle de dispatch de um pipeline issue-tracker → Claude Code.
 * Hoje nenhuma chamada de rede do gitops-sandbox tem retry — toda falha transitória
 * (timeout, rate-limit momentâneo) propaga direto e derruba o passo/job inteiro.
 *
 * Aplicado primeiro em report-result.ts (linearQuery — ponto único de toda chamada
 * Linear desse script). Os demais scripts (semantic-check, sanitize-check,
 * create-demand, slice-epic) ficam para uma segunda passada.
 */

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 1000
  const sleep = opts.sleep ?? defaultSleep

  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        await sleep(baseDelayMs * 2 ** i)
      }
    }
  }
  throw lastErr
}
