import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn(async () => undefined) }
})

import { scrubSecrets, main } from './scrub-artifact'

describe('scrubSecrets', () => {
  it('redige chave da Anthropic', () => {
    const out = scrubSecrets('key: sk-ant-api03-abc123DEF456ghi789jkl012mno345')
    expect(out).not.toContain('sk-ant-')
    expect(out).toContain('***REDACTED***')
  })

  it('redige PAT fine-grained do GitHub', () => {
    const out = scrubSecrets('token=github_pat_11ABCDEFG0123456789abcdefghijklmnopqrstuvwxyz')
    expect(out).not.toContain('github_pat_')
  })

  it('redige PAT clássico do GitHub', () => {
    const out = scrubSecrets('ghp_' + 'a'.repeat(36))
    expect(out).not.toMatch(/ghp_[A-Za-z0-9]{30,}/)
  })

  it('redige token OAuth do GitHub', () => {
    const out = scrubSecrets('gho_' + 'b'.repeat(36))
    expect(out).toContain('***REDACTED***')
  })

  it('redige API key do Linear', () => {
    const out = scrubSecrets('LINEAR_API_KEY=lin_api_abcdefghijklmnopqrstuvwxyz123456')
    expect(out).not.toContain('lin_api_abcdefghijklmnopqrstuvwxyz123456')
  })

  it('redige header Authorization Bearer', () => {
    const out = scrubSecrets('curl -H "Authorization: Bearer abc123def456ghi789jkl012mno345"')
    expect(out).not.toContain('abc123def456ghi789jkl012mno345')
  })

  it('não altera conteúdo sem secrets', () => {
    const clean = 'Implementei o endpoint GET /health conforme a spec da issue.'
    expect(scrubSecrets(clean)).toBe(clean)
  })

  it('redige múltiplos secrets no mesmo conteúdo', () => {
    const out = scrubSecrets('sk-ant-api03-abc123DEF456ghi789jkl012mno345 e também ghp_' + 'c'.repeat(36))
    expect(out.match(/\*\*\*REDACTED\*\*\*/g)?.length).toBe(2)
  })
})

describe('main()', () => {
  beforeEach(() => {
    delete process.env.ARTIFACT_PATH
  })

  afterEach(() => {
    delete process.env.ARTIFACT_PATH
    vi.clearAllMocks()
  })

  it('lança erro quando ARTIFACT_PATH não está definida', async () => {
    await expect(main()).rejects.toThrow('ARTIFACT_PATH')
  })

  it('não faz nada quando o arquivo não existe', async () => {
    const fsPromises = await import('fs/promises')
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'))
    process.env.ARTIFACT_PATH = '/tmp/nao-existe.json'

    await expect(main()).resolves.toBeUndefined()
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })

  it('reescreve o arquivo quando encontra secret', async () => {
    const fsPromises = await import('fs/promises')
    vi.mocked(fsPromises.readFile).mockResolvedValue('token: sk-ant-api03-abc123DEF456ghi789jkl012mno345')
    process.env.ARTIFACT_PATH = '/tmp/claude-output.json'

    await main()

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      '/tmp/claude-output.json',
      expect.stringContaining('***REDACTED***'),
      'utf8'
    )
  })

  it('não reescreve o arquivo quando não há secret', async () => {
    const fsPromises = await import('fs/promises')
    vi.mocked(fsPromises.readFile).mockResolvedValue('{"result": "PR aberto com sucesso"}')
    process.env.ARTIFACT_PATH = '/tmp/claude-output.json'

    await main()

    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })
})
