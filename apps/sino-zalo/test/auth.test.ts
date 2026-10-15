import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'

const SECRET = 'k'.repeat(32)

describe('shared secret', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  async function get(headers: Record<string, string>) {
    app = buildApp({ host: '127.0.0.1', port: 0, secret: SECRET })
    return app.inject({ method: 'GET', url: '/accounts/a1/messages', headers })
  }

  it('refuses a request without the key', async () => {
    const response = await get({})

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ code: 'UNAUTHORIZED', message: 'Missing or wrong secret' })
  })

  it('refuses a wrong key of the same length', async () => {
    const response = await get({ authorization: `Bearer ${'x'.repeat(32)}` })

    expect(response.statusCode).toBe(401)
  })

  it('refuses a wrong key of another length without failing', async () => {
    const response = await get({ authorization: 'Bearer short' })

    expect(response.statusCode).toBe(401)
  })

  it('refuses the right key under another scheme', async () => {
    const response = await get({ authorization: `Basic ${SECRET}` })

    expect(response.statusCode).toBe(401)
  })

  it('lets the right key through', async () => {
    const response = await get({ authorization: `Bearer ${SECRET}` })

    // Past the key check; no route serves this path yet, so Fastify answers 404.
    expect(response.statusCode).toBe(404)
  })
})
