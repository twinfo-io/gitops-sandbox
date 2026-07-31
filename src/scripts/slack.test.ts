import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { postSlackAlert } from './slack'

describe('postSlackAlert', () => {
  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL
  })

  afterEach(() => {
    delete process.env.SLACK_WEBHOOK_URL
    vi.unstubAllGlobals()
  })

  it('não faz nada (no-op) quando SLACK_WEBHOOK_URL não está definida', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await postSlackAlert('mensagem qualquer')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('faz POST pro webhook quando a env var está definida', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/fake'
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await postSlackAlert('🔴 agent:generate-code falhou em TWI-200')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/fake',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🔴 agent:generate-code falhou em TWI-200' }),
      })
    )
  })

  it('não lança erro quando o fetch falha (Slack fora do ar não pode derrubar o fluxo principal)', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/fake'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(postSlackAlert('mensagem')).resolves.toBeUndefined()
  })
})
