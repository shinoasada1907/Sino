import { http, HttpResponse } from 'msw'
import { DEFAULT_SETTINGS, withChange, type SettingsChange, type UserSettings } from '@/features/settings/settings.api'

/**
 * The settings API of `sino-api` for the tests (settings-backend, D-401…D-403): every signed-in screen reads the
 * saved theme, so these handlers are always on. What a test saves is kept until the next test (`resetSettingsBackend`).
 */
let saved: UserSettings = structuredClone(DEFAULT_SETTINGS)
let patches: SettingsChange[] = []

export function resetSettingsBackend(settings: UserSettings = DEFAULT_SETTINGS) {
  saved = structuredClone(settings)
  patches = []
}

/** The settings as saved now, and every change sent, in order. */
export const settingsBackend = {
  saved: () => saved,
  patches: () => patches,
}

export const settingsHandlers = [
  http.get('/api/settings', () => HttpResponse.json(saved)),
  http.patch('/api/settings', async ({ request }) => {
    const change = (await request.json()) as SettingsChange
    patches.push(change)
    saved = withChange(saved, change)
    return HttpResponse.json(saved)
  }),
  http.get('/api/settings/storage', () => HttpResponse.json({ messages: 3912, bytes: 412 * 1024 * 1024 })),
]
