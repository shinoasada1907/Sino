import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'
import { FakeZaloGateway } from '../src/gateway/FakeZaloGateway.ts'

describe('GET /health', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  it('answers without the key and gives only counts', async () => {
    app = buildApp({ host: '127.0.0.1', port: 0, secret: 'k'.repeat(32), apiUrl: 'http://127.0.0.1:8080' }, new FakeZaloGateway())

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'UP', sessions: { live: 0, ended: 0 } })
  })

  it('still answers without the key when the URL has a query string', async () => {
    app = buildApp({ host: '127.0.0.1', port: 0, secret: 'k'.repeat(32), apiUrl: 'http://127.0.0.1:8080' }, new FakeZaloGateway())

    const response = await app.inject({ method: 'GET', url: '/health?probe=1' })

    expect(response.statusCode).toBe(200)
  })
})
