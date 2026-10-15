import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'

const SECRET = 'a'.repeat(32)

describe('loadConfig', () => {
  it('reads the secret and falls back to localhost:8090, with sino-api on localhost:8080', () => {
    const config = loadConfig({ SINO_ZALO_SECRET: SECRET })

    expect(config).toEqual({ host: '127.0.0.1', port: 8090, secret: SECRET, apiUrl: 'http://127.0.0.1:8080' })
  })

  it('reads where sino-api listens, without a trailing slash', () => {
    const config = loadConfig({ SINO_ZALO_SECRET: SECRET, SINO_API_URL: 'http://sino-api:8080/' })

    expect(config.apiUrl).toBe('http://sino-api:8080')
  })

  it('stops when SINO_API_URL is not an http address', () => {
    expect(() => loadConfig({ SINO_ZALO_SECRET: SECRET, SINO_API_URL: 'not a url' })).toThrow('SINO_API_URL')
    expect(() => loadConfig({ SINO_ZALO_SECRET: SECRET, SINO_API_URL: 'sino-api:8080' })).toThrow('SINO_API_URL')
  })

  it('reads host and port when they are set', () => {
    const config = loadConfig({
      SINO_ZALO_SECRET: SECRET,
      SINO_ZALO_HOST: '0.0.0.0',
      SINO_ZALO_PORT: '9000',
    })

    expect(config.host).toBe('0.0.0.0')
    expect(config.port).toBe(9000)
  })

  it('stops when the secret is missing', () => {
    expect(() => loadConfig({})).toThrow('SINO_ZALO_SECRET')
  })

  it('stops when the secret is shorter than 32 bytes', () => {
    expect(() => loadConfig({ SINO_ZALO_SECRET: 'a'.repeat(31) })).toThrow('32 bytes')
  })

  it('counts bytes, not characters', () => {
    // "đ" takes 2 bytes in UTF-8: 16 of them make 32 bytes.
    expect(() => loadConfig({ SINO_ZALO_SECRET: 'đ'.repeat(16) })).not.toThrow()
  })

  it('stops when the port is not a number between 1 and 65535', () => {
    expect(() => loadConfig({ SINO_ZALO_SECRET: SECRET, SINO_ZALO_PORT: 'abc' })).toThrow('SINO_ZALO_PORT')
    expect(() => loadConfig({ SINO_ZALO_SECRET: SECRET, SINO_ZALO_PORT: '70000' })).toThrow('SINO_ZALO_PORT')
  })
})
