import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry'

function fakeSleep() {
  const calls: number[] = []
  const sleep = async (ms: number) => { calls.push(ms) }
  return { sleep, calls }
}

describe('withRetry', () => {
  it('retorna o resultado direto quando a primeira tentativa funciona (sem sleep)', async () => {
    const { sleep, calls } = fakeSleep()
    const fn = vi.fn().mockResolvedValue('ok')

    const result = await withRetry(fn, { sleep })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([])
  })

  it('tenta de novo após falha e retorna sucesso na segunda tentativa', async () => {
    const { sleep, calls } = fakeSleep()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ok na segunda')

    const result = await withRetry(fn, { sleep })

    expect(result).toBe('ok na segunda')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(calls).toEqual([1000]) // baseDelayMs default * 2^0
  })

  it('usa backoff exponencial entre tentativas (1s, 2s, 4s...)', async () => {
    const { sleep, calls } = fakeSleep()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValueOnce('ok na terceira')

    const result = await withRetry(fn, { sleep, attempts: 4 })

    expect(result).toBe('ok na terceira')
    expect(calls).toEqual([1000, 2000])
  })

  it('propaga o último erro depois de esgotar as tentativas', async () => {
    const { sleep } = fakeSleep()
    const fn = vi.fn().mockRejectedValue(new Error('sempre falha'))

    await expect(withRetry(fn, { sleep, attempts: 3 })).rejects.toThrow('sempre falha')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respeita attempts customizado', async () => {
    const { sleep } = fakeSleep()
    const fn = vi.fn().mockRejectedValue(new Error('falha'))

    await expect(withRetry(fn, { sleep, attempts: 5 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('respeita baseDelayMs customizado', async () => {
    const { sleep, calls } = fakeSleep()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockResolvedValueOnce('ok')

    await withRetry(fn, { sleep, baseDelayMs: 500 })

    expect(calls).toEqual([500])
  })

  it('não chama sleep depois da última tentativa (evita espera desnecessária antes de desistir)', async () => {
    const { sleep, calls } = fakeSleep()
    const fn = vi.fn().mockRejectedValue(new Error('falha'))

    await expect(withRetry(fn, { sleep, attempts: 2 })).rejects.toThrow()
    expect(calls).toEqual([1000]) // só 1 sleep entre as 2 tentativas, nenhum depois da última
  })
})
